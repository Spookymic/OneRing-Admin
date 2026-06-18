import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { isExchangeAdmin } from "@/lib/exchange-guard";
import { listMailboxPermissions, setMailboxPermission } from "@/services/exchange/shared-mailboxes";
import { logAudit } from "@/services/audit";

// [id] = adresse SMTP de la boîte (encodée côté client)

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const permissions = await listMailboxPermissions(id);
    return NextResponse.json(permissions);
  } catch (error: any) {
    console.error("[/api/mailboxes/[id]/permissions GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

const schema = z.object({
  member: z.string().min(1),
  type: z.enum(["fullAccess", "sendAs", "sendOnBehalf"]),
  action: z.enum(["add", "remove"]),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.email) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    if (!(await isExchangeAdmin(session.accessToken))) {
      return NextResponse.json({ error: "exchange_forbidden" }, { status: 403 });
    }
    const { member, type, action } = parsed.data;
    await setMailboxPermission({ mailbox: id, member, type, action });
    await logAudit({
      userId: session.user.email,
      userUpn: session.user.email,
      action: action === "add" ? "MAILBOX_PERMISSION_ADD" : "MAILBOX_PERMISSION_REMOVE",
      targetId: id,
      targetName: id,
      targetType: "Mailbox",
      payloadBefore: action === "remove" ? { member, type } : {},
      payloadAfter: action === "add" ? { member, type } : {},
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[/api/mailboxes/[id]/permissions POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
