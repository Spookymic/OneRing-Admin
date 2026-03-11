import { prisma } from "@/lib/prisma";

export type AuditAction =
  | "GROUP_MEMBER_ADD"
  | "GROUP_MEMBER_REMOVE"
  | "LICENSE_ASSIGN"
  | "LICENSE_REMOVE"
  | "PASSWORD_RESET";

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

export async function getAuditLogs(limit = 100) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
