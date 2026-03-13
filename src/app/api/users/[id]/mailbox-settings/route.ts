import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMailboxSettings, updateMailboxSettings } from "@/services/graph/users";
import { logAudit } from "@/services/audit";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const settings = await getMailboxSettings(session.accessToken, id);
    return NextResponse.json(settings);
  } catch (err: any) {
    const msg: string = err.message ?? "";
    if (msg.includes("[403]") || msg.includes("[401]") || msg.includes("MailboxNotEnabledForRESTAPI")) {
      return NextResponse.json({ error: "permission_denied" }, { status: 403 });
    }
    // Retourner le message Graph brut pour diagnostic
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  try {
    await updateMailboxSettings(session.accessToken, id, {
      automaticRepliesSetting: body.automaticRepliesSetting,
    });

    await logAudit({
      userId: session.user?.email ?? "unknown",
      userUpn: session.user?.email ?? "unknown",
      action: "OOO_UPDATE",
      targetId: id,
      targetName: body.targetName ?? id,
      targetType: "user",
      payloadAfter: { status: body.automaticRepliesSetting?.status },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const msg: string = err.message ?? "";
    if (msg.includes("[403]") || msg.includes("[401]")) {
      return NextResponse.json({ error: "permission_denied" }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
