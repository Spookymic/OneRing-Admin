import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getUser, listUserMemberOf, updateUserEnabled } from "@/services/graph/users";
import { removeGroupMember, isExchangeManagedGroup } from "@/services/graph/groups";
import { removeLicense } from "@/services/graph/licenses";
import { isExchangeAdmin } from "@/lib/exchange-guard";
import { setDistributionGroupMember } from "@/services/exchange/distribution-groups";
import { convertToSharedMailbox } from "@/services/exchange/shared-mailboxes";
import { logAudit } from "@/services/audit";

const schema = z.object({ convertToShared: z.boolean().default(false) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.email) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { convertToShared } = parsed.data;
  const token = session.accessToken;

  try {
    const [user, groups] = await Promise.all([getUser(token, id), listUserMemberOf(token, id)]);
    const member = user.userPrincipalName ?? user.mail ?? id;

    const needsExchange = convertToShared || groups.some((g) => isExchangeManagedGroup(g));
    if (needsExchange && !(await isExchangeAdmin(token))) {
      return NextResponse.json({ error: "exchange_forbidden" }, { status: 403 });
    }

    const errors: string[] = [];
    let converted = false;
    let licensesRemoved = 0;
    let groupsRemoved = 0;

    // 1. Conversion en boîte partagée (avant retrait de licence)
    if (convertToShared) {
      try {
        await convertToSharedMailbox(member);
        converted = true;
      } catch (e: any) {
        errors.push(`Conversion en boîte partagée : ${e.message}`);
      }
    }

    // 2. Retrait des licences
    for (const lic of user.assignedLicenses) {
      try {
        await removeLicense(token, id, lic.skuId);
        licensesRemoved++;
      } catch (e: any) {
        errors.push(`Licence ${lic.skuId} : ${e.message}`);
      }
    }

    // 3. Retrait de tous les groupes (Graph ou pont selon le type)
    for (const g of groups) {
      try {
        if (isExchangeManagedGroup(g)) {
          await setDistributionGroupMember({ groupSmtp: g.mail ?? g.id, member, action: "remove" });
        } else {
          await removeGroupMember(token, g.id, id);
        }
        groupsRemoved++;
      } catch (e: any) {
        errors.push(`Groupe ${g.displayName} : ${e.message}`);
      }
    }

    // 4. Désactivation du compte
    try {
      await updateUserEnabled(token, id, false);
    } catch (e: any) {
      errors.push(`Désactivation : ${e.message}`);
    }

    await logAudit({
      userId: session.user.email,
      userUpn: session.user.email,
      action: "USER_OFFBOARD",
      targetId: id,
      targetName: user.displayName,
      targetType: "User",
      payloadBefore: { licenses: user.assignedLicenses.length, groups: groups.length },
      payloadAfter: { converted, licensesRemoved, groupsRemoved, convertRequested: convertToShared },
    });

    return NextResponse.json({ success: true, converted, licensesRemoved, groupsRemoved, errors });
  } catch (error: any) {
    console.error("[/api/users/[id]/offboard]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
