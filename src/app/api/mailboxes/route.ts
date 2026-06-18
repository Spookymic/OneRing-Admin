import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { isExchangeAdmin } from "@/lib/exchange-guard";
import { listSharedMailboxes, createSharedMailbox } from "@/services/exchange/shared-mailboxes";
import { logAudit } from "@/services/audit";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const mailboxes = await listSharedMailboxes();
    return NextResponse.json(mailboxes);
  } catch (error: any) {
    console.error("[/api/mailboxes GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

const createSchema = z.object({
  displayName: z.string().min(1).max(256),
  alias: z.string().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.email) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    // Canal app-only : on réimpose les droits du compte connecté (cf. ADR-001 §4)
    if (!(await isExchangeAdmin(session.accessToken))) {
      return NextResponse.json({ error: "exchange_forbidden" }, { status: 403 });
    }
    const mailbox = await createSharedMailbox(parsed.data);
    await logAudit({
      userId: session.user.email,
      userUpn: session.user.email,
      action: "SHARED_MAILBOX_CREATE",
      targetId: mailbox.id,
      targetName: mailbox.displayName,
      targetType: "Mailbox",
      payloadBefore: {},
      payloadAfter: { mail: mailbox.mail, alias: parsed.data.alias },
    });
    return NextResponse.json(mailbox, { status: 201 });
  } catch (error: any) {
    console.error("[/api/mailboxes POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
