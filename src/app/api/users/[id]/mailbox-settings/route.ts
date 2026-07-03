import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getMailboxSettings, updateMailboxSettings } from "@/services/graph/users";
import { logAudit } from "@/services/audit";
import { NextResponse } from "next/server";

const oooSchema = z.object({
  targetName: z.string().max(256).optional(),
  automaticRepliesSetting: z.object({
    status: z.enum(["disabled", "alwaysEnabled", "scheduledStartAndEnd"]),
    internalReplyMessage: z.string().max(10000).optional(),
    externalReplyMessage: z.string().max(10000).optional(),
    externalAudienceScope: z.enum(["none", "contactsOnly", "all"]).optional(),
    scheduledStartDateTime: z.object({ dateTime: z.string(), timeZone: z.string() }).optional(),
    scheduledEndDateTime: z.object({ dateTime: z.string(), timeZone: z.string() }).optional(),
  }),
});

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
  const parsed = oooSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "automaticRepliesSetting invalide" }, { status: 400 });
  }
  const { automaticRepliesSetting, targetName } = parsed.data;

  try {
    await updateMailboxSettings(session.accessToken, id, { automaticRepliesSetting });

    await logAudit({
      userId: session.user?.email ?? "unknown",
      userUpn: session.user?.email ?? "unknown",
      action: "OOO_UPDATE",
      targetId: id,
      targetName: targetName ?? id,
      targetType: "user",
      payloadAfter: { status: automaticRepliesSetting.status },
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
