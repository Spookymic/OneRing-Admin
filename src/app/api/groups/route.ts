import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { listGroups, createGroup } from "@/services/graph/groups";
import { logAudit } from "@/services/audit";
import { isExchangeAdmin } from "@/lib/exchange-guard";
import { createDistributionGroup } from "@/services/exchange/distribution-groups";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const groups = await listGroups(session.accessToken);
    return NextResponse.json(groups);
  } catch (error: any) {
    console.error("[/api/groups GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

const createSchema = z.object({
  displayName: z.string().min(1).max(256),
  description: z.string().max(1024).optional(),
  groupType: z.enum(["unified", "security", "distribution"]),
  mailNickname: z.string().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/),
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
    // Listes de distribution : vraie DL via pont Exchange (Graph ne crée pas de DL classique).
    if (parsed.data.groupType === "distribution") {
      if (!(await isExchangeAdmin(session.accessToken))) {
        return NextResponse.json({ error: "exchange_forbidden" }, { status: 403 });
      }
      const dl = await createDistributionGroup({
        displayName: parsed.data.displayName,
        alias: parsed.data.mailNickname,
      });
      await logAudit({
        userId: session.user.email,
        userUpn: session.user.email,
        action: "DL_CREATE",
        targetId: dl.id,
        targetName: dl.displayName,
        targetType: "Group",
        payloadBefore: {},
        payloadAfter: { mail: dl.mail, alias: parsed.data.mailNickname },
      });
      return NextResponse.json(dl, { status: 201 });
    }

    const group = await createGroup(session.accessToken, parsed.data);
    await logAudit({
      userId: session.user.email,
      userUpn: session.user.email,
      action: "GROUP_CREATE",
      targetId: group.id,
      targetName: group.displayName,
      targetType: "Group",
      payloadBefore: {},
      payloadAfter: { groupType: parsed.data.groupType, mailNickname: parsed.data.mailNickname },
    });
    return NextResponse.json(group, { status: 201 });
  } catch (error: any) {
    console.error("[/api/groups POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
