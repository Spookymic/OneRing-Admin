import { prisma } from "@/lib/prisma";

export type AuditAction =
  | "GROUP_MEMBER_ADD"
  | "GROUP_MEMBER_REMOVE"
  | "GROUP_OWNER_ADD"
  | "GROUP_OWNER_REMOVE"
  | "GROUP_CREATE"
  | "DL_MEMBER_ADD"
  | "DL_MEMBER_REMOVE"
  | "DL_OWNER_ADD"
  | "DL_OWNER_REMOVE"
  | "DL_CREATE"
  | "SHARED_MAILBOX_CREATE"
  | "MAILBOX_PERMISSION_ADD"
  | "MAILBOX_PERMISSION_REMOVE"
  | "USER_OFFBOARD"
  | "LICENSE_ASSIGN"
  | "LICENSE_REMOVE"
  | "PASSWORD_RESET"
  | "ACCOUNT_DISABLE"
  | "ACCOUNT_ENABLE"
  | "ROLE_ASSIGN"
  | "ROLE_REMOVE"
  | "OOO_UPDATE"
  | "TEAMS_STATUS_UPDATE"
  | "ADMIN_SETTINGS_UPDATE";

interface AuditParams {
  userId: string;
  userUpn: string;
  action: AuditAction;
  targetId: string;
  targetName: string;
  targetType: string;
  payloadBefore?: object;
  payloadAfter?: object;
}

export async function logAudit(params: AuditParams) {
  return prisma.auditLog.create({
    data: {
      userId: params.userId,
      userUpn: params.userUpn,
      action: params.action,
      targetId: params.targetId,
      targetName: params.targetName,
      targetType: params.targetType,
      payloadBefore: params.payloadBefore ?? undefined,
      payloadAfter: params.payloadAfter ?? undefined,
    },
  });
}

export async function getAuditLog(id: string) {
  return prisma.auditLog.findUnique({ where: { id } });
}

export async function getAuditLogs(limit = 100, days?: number) {
  const since =
    days && days > 0
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      : undefined;
  return prisma.auditLog.findMany({
    where: since ? { createdAt: { gte: since } } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
