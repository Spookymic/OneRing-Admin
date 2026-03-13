import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { setTeamsStatusMessage } from "@/services/graph/users";
import { logAudit } from "@/services/audit";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  if (typeof body.message !== "string") {
    return NextResponse.json({ error: "message (string) requis" }, { status: 400 });
  }

  try {
    await setTeamsStatusMessage(session.accessToken, id, body.message);

    await logAudit({
      userId: session.user?.email ?? "unknown",
      userUpn: session.user?.email ?? "unknown",
      action: "TEAMS_STATUS_UPDATE",
      targetId: id,
      targetName: body.targetName ?? id,
      targetType: "user",
      payloadAfter: { message: body.message },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const msg: string = err.message ?? "";
    if (msg.includes("403") || msg.includes("Forbidden") || msg.includes("Presence")) {
      return NextResponse.json(
        { error: "permission_denied", message: "La permission Presence.ReadWrite.All est requise dans l'enregistrement Azure AD." },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
