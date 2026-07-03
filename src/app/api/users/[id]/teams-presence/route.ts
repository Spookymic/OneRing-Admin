import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { setTeamsStatusMessage } from "@/services/graph/users";
import { logAudit } from "@/services/audit";
import { NextResponse } from "next/server";

const teamsSchema = z.object({
  message: z.string().max(280),
  targetName: z.string().max(256).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = teamsSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "message (≤ 280 caractères) requis" }, { status: 400 });
  }
  const { message, targetName } = parsed.data;

  try {
    await setTeamsStatusMessage(session.accessToken, id, message);

    await logAudit({
      userId: session.user?.email ?? "unknown",
      userUpn: session.user?.email ?? "unknown",
      action: "TEAMS_STATUS_UPDATE",
      targetId: id,
      targetName: targetName ?? id,
      targetType: "user",
      payloadAfter: { message },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const msg: string = err.message ?? "";
    if (msg.includes("403") || msg.includes("Forbidden") || msg.includes("Presence")) {
      return NextResponse.json(
        { error: "permission_denied", message: "Définir le statut Teams d'un autre utilisateur n'est pas supporté par Microsoft Graph avec une permission déléguée (aucune permission « Presence » applicable à un tiers)." },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
