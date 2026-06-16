import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { listUserMemberOf } from "@/services/graph/users";
import { addGroupMember, removeGroupMember, addGroupOwner, removeGroupOwner, getGroupBasic, isExchangeManagedGroup } from "@/services/graph/groups";
import { getUser } from "@/services/graph/users";
import { logAudit } from "@/services/audit";
import { isExchangeAdmin } from "@/lib/exchange-guard";
import { setDistributionGroupMember } from "@/services/exchange/distribution-groups";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const groups = await listUserMemberOf(session.accessToken, id);
    return NextResponse.json(groups);
  } catch (error: any) {
    console.error("[/api/users/[id]/groups GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

const schema = z.object({
  groupId: z.string().min(1),
  action: z.enum(["add", "remove"]),
  role: z.enum(["member", "owner"]).default("member"),
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
    const { groupId, action, role } = parsed.data;
    const [group, user] = await Promise.all([
      getGroupBasic(token, groupId),
      getUser(token, id),
    ]);

    // Listes de distribution / groupes mail-enabled : membres via pont Exchange (pas Graph).
    if (isExchangeManagedGroup(group)) {
      if (!(await isExchangeAdmin(token))) {
        return NextResponse.json({ error: "exchange_forbidden" }, { status: 403 });
      }
      if (role === "owner") {
        // Propriétaires de DL = managedBy (étape 3 de l'ADR), pas encore implémenté.
        return NextResponse.json(
          { error: "Les propriétaires de listes de distribution ne sont pas encore gérés." },
          { status: 422 }
        );
      }
      const groupSmtp = group.mail ?? groupId;
      const member = user.userPrincipalName ?? user.mail ?? id;
      await setDistributionGroupMember({ groupSmtp, member, action });
      await logAudit({
        userId: session.user.email,
        userUpn: session.user.email,
        action: action === "add" ? "DL_MEMBER_ADD" : "DL_MEMBER_REMOVE",
        targetId: id,
        targetName: user.displayName,
        targetType: "User",
        payloadBefore: action === "remove" ? { groupId, groupName: group.displayName, role } : {},
        payloadAfter: action === "add" ? { groupId, groupName: group.displayName, role } : {},
      });
      return NextResponse.json({ success: true });
    }

    if (action === "add") {
      if (role === "owner") {
        await addGroupOwner(token, groupId, id);
      } else {
        await addGroupMember(token, groupId, id);
      }
      await logAudit({
        userId: session.user.email,
        userUpn: session.user.email,
        action: role === "owner" ? "GROUP_OWNER_ADD" : "GROUP_MEMBER_ADD",
        targetId: id,
        targetName: user.displayName,
        targetType: "User",
        payloadBefore: {},
        payloadAfter: { groupId, groupName: group.displayName, role },
      });
    } else {
      if (role === "owner") {
        await removeGroupOwner(token, groupId, id);
      } else {
        await removeGroupMember(token, groupId, id);
      }
      await logAudit({
        userId: session.user.email,
        userUpn: session.user.email,
        action: role === "owner" ? "GROUP_OWNER_REMOVE" : "GROUP_MEMBER_REMOVE",
        targetId: id,
        targetName: user.displayName,
        targetType: "User",
        payloadBefore: { groupId, groupName: group.displayName, role },
        payloadAfter: {},
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[/api/users/[id]/groups POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
