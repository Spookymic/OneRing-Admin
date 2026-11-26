import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { isAppAdmin } from "@/lib/app-admin-guard";
import { logAudit } from "@/services/audit";
import { addApplicationOwner, getApplicationBasic, removeApplicationOwner } from "@/services/graph/applications";
import { getUser } from "@/services/graph/users";

const schema = z.object({
  userId: z.string().uuid(),
  action: z.enum(["add", "remove"]),
});

/** Traduit les refus Graph en codes compris par l'interface. */
function errorResponse(msg: string) {
  if (msg.startsWith("[403]")) return NextResponse.json({ error: "app_forbidden" }, { status: 403 });
  if (msg.startsWith("[400]") && /already exist/i.test(msg)) {
    return NextResponse.json({ error: "Cet utilisateur est déjà propriétaire de l'application." }, { status: 409 });
  }
  if (msg.startsWith("[404]")) return NextResponse.json({ error: "Application ou utilisateur introuvable." }, { status: 404 });
  return NextResponse.json({ error: msg }, { status: 500 });
}

// POST /api/applications/{objectId}/owners — ajoute ou retire un propriétaire (annulable via l'historique).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.email) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }
  const token = session.accessToken;
  if (!(await isAppAdmin(token))) {
    return NextResponse.json({ error: "app_forbidden" }, { status: 403 });
  }
  const { userId, action } = parsed.data;
  try {
    const [app, user] = await Promise.all([getApplicationBasic(token, id), getUser(token, userId)]);
    if (action === "add") await addApplicationOwner(token, id, userId);
    else await removeApplicationOwner(token, id, userId);
    const owner = { userId, userName: user.displayName, userPrincipalName: user.userPrincipalName, appId: app.appId };
    await logAudit({
      userId: session.user.email,
      userUpn: session.user.email,
      action: action === "add" ? "APP_OWNER_ADD" : "APP_OWNER_REMOVE",
      targetId: id,
      targetName: app.displayName,
      targetType: "Application",
      payloadBefore: action === "remove" ? owner : {},
      payloadAfter: action === "add" ? owner : {},
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[/api/applications/[id]/owners]", msg.slice(0, 200));
    return errorResponse(msg);
  }
}
