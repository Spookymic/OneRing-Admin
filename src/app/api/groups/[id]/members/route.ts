import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { listGroupMembers, addGroupMember, removeGroupMember, getGroup } from "@/services/graph/groups";
import { getUser } from "@/services/graph/users";
import { logAudit } from "@/services/audit";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const members = await listGroupMembers(session.accessToken, id);
    return NextResponse.json(members);
  } catch (error: any) {
    console.error("[/api/groups/[id]/members GET]", error);
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
      getGroup(token, id),
      getUser(token, parsed.data.userId),
    ]);

    if (parsed.data.action === "add") {
      await addGroupMember(token, id, parsed.data.userId);
      await logAudit({
        userId: session.user.email,
        userUpn: session.user.email,
        action: "GROUP_MEMBER_ADD",
        targetId: id,
        targetName: group.displayName,
        targetType: "Group",
        payloadBefore: {},
        payloadAfter: { addedUserId: parsed.data.userId, addedUserName: user.displayName },
      });
    } else {
      await removeGroupMember(token, id, parsed.data.userId);
      await logAudit({
        userId: session.user.email,
        userUpn: session.user.email,
        action: "GROUP_MEMBER_REMOVE",
        targetId: id,
        targetName: group.displayName,
        targetType: "Group",
        payloadBefore: { removedUserId: parsed.data.userId, removedUserName: user.displayName },
        payloadAfter: {},
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[/api/groups/[id]/members POST]", error);
    const msg: string = error.message ?? "";
    if (msg.includes("on-premise") || msg.includes("hosted on") || msg.includes("inactive") || msg.includes("MailboxNotEnabled")) {
      return NextResponse.json({ error: "exchange_managed" }, { status: 422 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
