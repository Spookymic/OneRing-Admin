import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { listGroupOwners, addGroupOwner, removeGroupOwner, getGroupBasic, isExchangeManagedGroup } from "@/services/graph/groups";
import { getUser } from "@/services/graph/users";
import { logAudit } from "@/services/audit";
import { isExchangeAdmin } from "@/lib/exchange-guard";
import { listDistributionGroupOwners, setDistributionGroupOwner } from "@/services/exchange/distribution-groups";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const group = await getGroupBasic(session.accessToken, id);
    // Listes de distribution : owners = ManagedBy, non exposé par Graph → pont Exchange.
    if (isExchangeManagedGroup(group)) {
      const owners = await listDistributionGroupOwners(group.mail ?? id);
      return NextResponse.json(owners);
    }
    const owners = await listGroupOwners(session.accessToken, id);
    return NextResponse.json(owners);
  } catch (error: any) {
    console.error("[/api/groups/[id]/owners GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

const schema = z.object({
  userId: z.string().min(1),
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
    const token = session.accessToken;
    const [group, user] = await Promise.all([
      getGroupBasic(token, id),
      getUser(token, parsed.data.userId),
    ]);

    // Listes de distribution : propriétaires gérés via ManagedBy (pont Exchange).
    if (isExchangeManagedGroup(group)) {
      if (!(await isExchangeAdmin(token))) {
        return NextResponse.json({ error: "exchange_forbidden" }, { status: 403 });
      }
      const groupSmtp = group.mail ?? id;
      const member = user.userPrincipalName ?? user.mail ?? parsed.data.userId;
      await setDistributionGroupOwner({ groupSmtp, member, action: parsed.data.action });
      await logAudit({
        userId: session.user.email,
        userUpn: session.user.email,
        action: parsed.data.action === "add" ? "DL_OWNER_ADD" : "DL_OWNER_REMOVE",
        targetId: id,
        targetName: group.displayName,
        targetType: "Group",
        payloadBefore:
          parsed.data.action === "remove" ? { removedMember: member, removedUserName: user.displayName } : {},
        payloadAfter:
          parsed.data.action === "add" ? { addedMember: member, addedUserName: user.displayName } : {},
      });
      return NextResponse.json({ success: true });
    }

    if (parsed.data.action === "add") {
      await addGroupOwner(token, id, parsed.data.userId);
      await logAudit({
        userId: session.user.email,
        userUpn: session.user.email,
        action: "GROUP_OWNER_ADD",
        targetId: id,
        targetName: group.displayName,
        targetType: "Group",
        payloadBefore: {},
        payloadAfter: { addedUserId: parsed.data.userId, addedUserName: user.displayName },
      });
    } else {
      await removeGroupOwner(token, id, parsed.data.userId);
      await logAudit({
        userId: session.user.email,
        userUpn: session.user.email,
        action: "GROUP_OWNER_REMOVE",
        targetId: id,
        targetName: group.displayName,
        targetType: "Group",
        payloadBefore: { removedUserId: parsed.data.userId, removedUserName: user.displayName },
        payloadAfter: {},
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[/api/groups/[id]/owners POST]", error);
    const msg: string = error.message ?? "";
    if (msg.includes("on-premise") || msg.includes("hosted on") || msg.includes("inactive") || msg.includes("MailboxNotEnabled")) {
      return NextResponse.json({ error: "exchange_managed" }, { status: 422 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
