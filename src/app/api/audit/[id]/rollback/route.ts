import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAuditLog, logAudit, type AuditAction } from "@/services/audit";
import {
  getGroupBasic,
  addGroupMember,
  removeGroupMember,
  addGroupOwner,
  removeGroupOwner,
} from "@/services/graph/groups";
import { getUser, updateUserEnabled } from "@/services/graph/users";
import { assignLicense, removeLicense } from "@/services/graph/licenses";
import { isExchangeAdmin } from "@/lib/exchange-guard";
import {
  setDistributionGroupMember,
  setDistributionGroupOwner,
} from "@/services/exchange/distribution-groups";
import { setMailboxPermission, type DelegationType } from "@/services/exchange/shared-mailboxes";

export const ROLLBACKABLE: AuditAction[] = [
  "LICENSE_ASSIGN", "LICENSE_REMOVE",
  "GROUP_MEMBER_ADD", "GROUP_MEMBER_REMOVE",
  "GROUP_OWNER_ADD", "GROUP_OWNER_REMOVE",
  "DL_MEMBER_ADD", "DL_MEMBER_REMOVE",
  "DL_OWNER_ADD", "DL_OWNER_REMOVE",
  "MAILBOX_PERMISSION_ADD", "MAILBOX_PERMISSION_REMOVE",
  "ACCOUNT_DISABLE", "ACCOUNT_ENABLE",
];

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.email) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await params;
  const token = session.accessToken;

  const log = await getAuditLog(id);
  if (!log) return NextResponse.json({ error: "Entrée introuvable" }, { status: 404 });

  const action = log.action as AuditAction;
  const before = (log.payloadBefore ?? {}) as Record<string, any>;
  const after = (log.payloadAfter ?? {}) as Record<string, any>;
  const onGroup = log.targetType === "Group"; // sinon "User" / "Mailbox"

  // Résout (groupId, userId) selon la forme du payload (route groupe vs route utilisateur)
  const graphGroupTarget = () =>
    onGroup
      ? { groupId: log.targetId, userId: after.addedUserId ?? before.removedUserId }
      : { groupId: after.groupId ?? before.groupId, userId: log.targetId };

  try {
    let inverse: AuditAction;
    let summary: string;

    switch (action) {
      case "LICENSE_ASSIGN":
        await removeLicense(token, log.targetId, after.addedSkuId);
        inverse = "LICENSE_REMOVE";
        summary = `Licence « ${after.skuName ?? after.addedSkuId} » retirée (rollback)`;
        await logAudit({
          userId: session.user.email, userUpn: session.user.email, action: inverse,
          targetId: log.targetId, targetName: log.targetName, targetType: "User",
          payloadBefore: { removedSkuId: after.addedSkuId, skuName: after.skuName, rollbackOf: id }, payloadAfter: {},
        });
        break;

      case "LICENSE_REMOVE":
        await assignLicense(token, log.targetId, before.removedSkuId);
        inverse = "LICENSE_ASSIGN";
        summary = `Licence « ${before.skuName ?? before.removedSkuId} » réassignée (rollback)`;
        await logAudit({
          userId: session.user.email, userUpn: session.user.email, action: inverse,
          targetId: log.targetId, targetName: log.targetName, targetType: "User",
          payloadBefore: {}, payloadAfter: { addedSkuId: before.removedSkuId, skuName: before.skuName, rollbackOf: id },
        });
        break;

      case "ACCOUNT_DISABLE":
      case "ACCOUNT_ENABLE": {
        const enable = action === "ACCOUNT_DISABLE";
        await updateUserEnabled(token, log.targetId, enable);
        inverse = enable ? "ACCOUNT_ENABLE" : "ACCOUNT_DISABLE";
        summary = `Compte ${enable ? "réactivé" : "désactivé"} (rollback)`;
        await logAudit({
          userId: session.user.email, userUpn: session.user.email, action: inverse,
          targetId: log.targetId, targetName: log.targetName, targetType: "User",
          payloadBefore: {}, payloadAfter: { rollbackOf: id },
        });
        break;
      }

      case "GROUP_MEMBER_ADD":
      case "GROUP_MEMBER_REMOVE":
      case "GROUP_OWNER_ADD":
      case "GROUP_OWNER_REMOVE": {
        const { groupId, userId } = graphGroupTarget();
        if (!groupId || !userId) return NextResponse.json({ error: "Données insuffisantes" }, { status: 422 });
        const isOwner = action.includes("OWNER");
        const wasAdd = action.includes("ADD");
        if (isOwner) {
          if (wasAdd) await removeGroupOwner(token, groupId, userId);
          else await addGroupOwner(token, groupId, userId);
        } else {
          if (wasAdd) await removeGroupMember(token, groupId, userId);
          else await addGroupMember(token, groupId, userId);
        }
        inverse = `GROUP_${isOwner ? "OWNER" : "MEMBER"}_${wasAdd ? "REMOVE" : "ADD"}` as AuditAction;
        summary = "Appartenance/propriété de groupe annulée (rollback)";
        await logAudit({
          userId: session.user.email, userUpn: session.user.email, action: inverse,
          targetId: groupId, targetName: log.targetName, targetType: "Group",
          payloadBefore: wasAdd ? { removedUserId: userId, rollbackOf: id } : {},
          payloadAfter: wasAdd ? {} : { addedUserId: userId, rollbackOf: id },
        });
        break;
      }

      case "DL_MEMBER_ADD":
      case "DL_MEMBER_REMOVE":
      case "DL_OWNER_ADD":
      case "DL_OWNER_REMOVE": {
        if (!(await isExchangeAdmin(token))) {
          return NextResponse.json({ error: "exchange_forbidden" }, { status: 403 });
        }
        const isOwner = action.includes("OWNER");
        const wasAdd = action.includes("ADD");
        // Résout le groupe (smtp) et le membre selon la forme du payload
        const groupId = onGroup ? log.targetId : (after.groupId ?? before.groupId);
        const group = await getGroupBasic(token, groupId);
        const groupSmtp = group.mail ?? groupId;
        let member: string;
        if (onGroup) {
          member = after.addedMember ?? before.removedMember;
        } else {
          const u = await getUser(token, log.targetId);
          member = u.userPrincipalName ?? u.mail ?? log.targetId;
        }
        const act = wasAdd ? "remove" : "add";
        if (isOwner) await setDistributionGroupOwner({ groupSmtp, member, action: act });
        else await setDistributionGroupMember({ groupSmtp, member, action: act });
        inverse = `DL_${isOwner ? "OWNER" : "MEMBER"}_${wasAdd ? "REMOVE" : "ADD"}` as AuditAction;
        summary = "Appartenance/propriété de liste de distribution annulée (rollback)";
        await logAudit({
          userId: session.user.email, userUpn: session.user.email, action: inverse,
          targetId: group.id, targetName: log.targetName, targetType: "Group",
          payloadBefore: wasAdd ? { removedMember: member, rollbackOf: id } : {},
          payloadAfter: wasAdd ? {} : { addedMember: member, rollbackOf: id },
        });
        break;
      }

      case "MAILBOX_PERMISSION_ADD":
      case "MAILBOX_PERMISSION_REMOVE": {
        if (!(await isExchangeAdmin(token))) {
          return NextResponse.json({ error: "exchange_forbidden" }, { status: 403 });
        }
        const wasAdd = action.endsWith("ADD");
        const payload = wasAdd ? after : before;
        const member = payload.member as string;
        const type = payload.type as DelegationType;
        await setMailboxPermission({ mailbox: log.targetId, member, type, action: wasAdd ? "remove" : "add" });
        inverse = wasAdd ? "MAILBOX_PERMISSION_REMOVE" : "MAILBOX_PERMISSION_ADD";
        summary = "Délégation annulée (rollback)";
        await logAudit({
          userId: session.user.email, userUpn: session.user.email, action: inverse,
          targetId: log.targetId, targetName: log.targetName, targetType: "Mailbox",
          payloadBefore: wasAdd ? { member, type, rollbackOf: id } : {},
          payloadAfter: wasAdd ? {} : { member, type, rollbackOf: id },
        });
        break;
      }

      default:
        return NextResponse.json({ error: "Action non annulable" }, { status: 422 });
    }

    return NextResponse.json({ success: true, summary });
  } catch (error: any) {
    console.error("[/api/audit/[id]/rollback]", error);
    const msg: string = error.message ?? "";
    if (msg === "exchange_forbidden") {
      return NextResponse.json({ error: "exchange_forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
