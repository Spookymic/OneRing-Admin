import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { isAppAdmin } from "@/lib/app-admin-guard";
import { SECRET_REMOVE_CONFIRMATION } from "@/lib/app-security";
import { logAudit } from "@/services/audit";
import { getApplicationBasic, removeApplicationSecret } from "@/services/graph/applications";


const schema = z.object({
  keyId: z.string().uuid(),
  confirmation: z.literal(SECRET_REMOVE_CONFIRMATION),
});

// DELETE /api/applications/{objectId}/secrets — supprime un secret client.
// IRRÉVERSIBLE : la valeur d'un secret ne peut pas être recréée (aucun rollback possible).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.email) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Paramètres invalides ou confirmation manquante" }, { status: 400 });
  }
  const token = session.accessToken;
  if (!(await isAppAdmin(token))) {
    return NextResponse.json({ error: "app_forbidden" }, { status: 403 });
  }
  const { keyId } = parsed.data;
  try {
    const app = await getApplicationBasic(token, id);
    const secret = app.passwordCredentials.find((c) => c.keyId?.toLowerCase() === keyId.toLowerCase());
    if (!secret) {
      return NextResponse.json({ error: "Secret introuvable sur cette application." }, { status: 404 });
    }
    await removeApplicationSecret(token, id, keyId);
    await logAudit({
      userId: session.user.email,
      userUpn: session.user.email,
      action: "APP_SECRET_REMOVE",
      targetId: id,
      targetName: app.displayName,
      targetType: "Application",
      payloadBefore: {
        appId: app.appId,
        keyId,
        secretName: secret.displayName ?? null,
        startDateTime: secret.startDateTime ?? null,
        endDateTime: secret.endDateTime ?? null,
      },
      payloadAfter: {},
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[/api/applications/[id]/secrets]", msg.slice(0, 200));
    if (msg.startsWith("[403]")) return NextResponse.json({ error: "app_forbidden" }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
