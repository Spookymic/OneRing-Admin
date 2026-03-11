import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getGraphClient } from "@/lib/graph";
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
    const client = getGraphClient(session.accessToken);
    const members = await listGroupMembers(client, id);
    return NextResponse.json(members);
  } catch (error: any) {
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
    const client = getGraphClient(session.accessToken);
    const [group, user] = await Promise.all([
      getGroup(client, id),
      getUser(client, parsed.data.userId),
    ]);

    if (parsed.data.action === "add") {
      await addGroupMember(client, id, parsed.data.userId);
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
      await removeGroupMember(client, id, parsed.data.userId);
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
