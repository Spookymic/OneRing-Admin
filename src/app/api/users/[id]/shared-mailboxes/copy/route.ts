import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { isExchangeAdmin } from "@/lib/exchange-guard";
import { getUser } from "@/services/graph/users";
import { setMailboxPermission, waitForUsersSharedMailboxAccess } from "@/services/exchange/shared-mailboxes";
import { logAudit } from "@/services/audit";
import {
  delegationsOf,
  type MailboxCopyReport,
  type MailboxCopyResult,
} from "@/lib/mailbox-access";

const schema = z.object({
  targetUserId: z.string().min(1),
  /** Sous-ensemble des boîtes source (adresse SMTP) à copier (défaut : toutes). */
  mailboxes: z.array(z.string().min(1)).optional(),
});

function isAlreadyGrantedError(message: string): boolean {
  return /already (has|exist)|already been granted|déjà/i.test(message);
}

/**
 * POST /api/users/[id]/shared-mailboxes/copy
 * Copie les délégations directes de l'utilisateur [id] sur les boîtes partagées vers `targetUserId`,
 * type par type. Une délégation déjà détenue par la cible n'est pas modifiée et figure au rapport.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.email) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id: sourceId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { targetUserId, mailboxes } = parsed.data;
  if (targetUserId === sourceId) {
    return NextResponse.json({ error: "La source et la cible doivent être différentes." }, { status: 400 });
  }

  const token = session.accessToken;
  const actor = session.user.email;

  try {
    if (!(await isExchangeAdmin(token))) {
      return NextResponse.json({ error: "exchange_forbidden" }, { status: 403 });
    }

    const [source, target] = await Promise.all([getUser(token, sourceId), getUser(token, targetUserId)]);
    const sourceUpn = source.userPrincipalName;
    const targetUpn = target.userPrincipalName;
    // Attend que l'index des délégations du pont soit prêt (instantané s'il l'est déjà).
    const access = await waitForUsersSharedMailboxAccess([sourceUpn, targetUpn]);

    const wanted = mailboxes ? new Set(mailboxes.map((m) => m.toLowerCase())) : null;
    const sourceAccess = (access[sourceUpn] ?? []).filter((a) => !wanted || wanted.has(a.mail.toLowerCase()));
    const targetByMail = new Map((access[targetUpn] ?? []).map((a) => [a.mail.toLowerCase(), a]));

    const results: MailboxCopyResult[] = [];

    for (const mbx of sourceAccess) {
      const existing = targetByMail.get(mbx.mail.toLowerCase());
      for (const type of delegationsOf(mbx)) {
        const base = { mailbox: mbx.mail, mailboxName: mbx.displayName, type };

        if (existing?.[type]) {
          results.push({ ...base, status: "already" });
          continue;
        }
        try {
          await setMailboxPermission({ mailbox: mbx.mail, member: targetUpn, type, action: "add" });
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          results.push(
            isAlreadyGrantedError(message)
              ? { ...base, status: "already" }
              : { ...base, status: "error", reason: message }
          );
          continue;
        }
        results.push({ ...base, status: "added" });
        // Même forme que /api/mailboxes/[id]/permissions : annulable depuis le journal d'audit.
        await logAudit({
          userId: actor,
          userUpn: actor,
          action: "MAILBOX_PERMISSION_ADD",
          targetId: mbx.mail,
          targetName: mbx.mail,
          targetType: "Mailbox",
          payloadBefore: {},
          payloadAfter: {
            member: targetUpn,
            type,
            copiedFromId: sourceId,
            copiedFromName: source.displayName,
          },
        });
      }
    }

    const count = (s: MailboxCopyResult["status"]) => results.filter((r) => r.status === s).length;
    await logAudit({
      userId: actor,
      userUpn: actor,
      action: "USER_MAILBOX_ACCESS_COPY",
      targetId: targetUserId,
      targetName: target.displayName,
      targetType: "User",
      payloadBefore: { sourceId, sourceName: source.displayName },
      payloadAfter: {
        added: count("added"),
        already: count("already"),
        errors: count("error"),
        addedDelegations: results
          .filter((r) => r.status === "added")
          .map((r) => `${r.mailboxName} (${r.type})`),
      },
    });

    const report: MailboxCopyReport = { targetId: targetUserId, targetName: target.displayName, results };
    return NextResponse.json(report);
  } catch (error: unknown) {
    console.error("[/api/users/[id]/shared-mailboxes/copy POST]", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
