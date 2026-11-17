import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getUser, listUserMemberOf } from "@/services/graph/users";
import { addGroupMember, isExchangeManagedGroup } from "@/services/graph/groups";
import { setDistributionGroupMember } from "@/services/exchange/distribution-groups";
import { isExchangeAdmin } from "@/lib/exchange-guard";
import { logAudit } from "@/services/audit";
import { getNonCopyableReason, type GroupCopyReport, type GroupCopyResult } from "@/lib/group-copy";

const schema = z.object({
  targetUserId: z.string().min(1),
  /** Sous-ensemble des groupes source à copier (défaut : tous). */
  groupIds: z.array(z.string().min(1)).optional(),
});

/** Graph / Exchange renvoient une erreur si l'objet est déjà membre (cas de concurrence). */
function isAlreadyMemberError(message: string): boolean {
  return /already exist|already a member|est déjà membre/i.test(message);
}

/**
 * POST /api/users/[id]/groups/copy
 * Copie les appartenances directes aux groupes de l'utilisateur [id] vers `targetUserId`.
 * Les groupes déjà attribués à la cible ne sont pas modifiés et figurent dans le rapport final.
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
  const { targetUserId, groupIds } = parsed.data;
  if (targetUserId === sourceId) {
    return NextResponse.json({ error: "La source et la cible doivent être différentes." }, { status: 400 });
  }

  const token = session.accessToken;
  const actor = session.user.email;

  try {
    const [source, target, sourceGroups, targetGroups] = await Promise.all([
      getUser(token, sourceId),
      getUser(token, targetUserId),
      listUserMemberOf(token, sourceId),
      listUserMemberOf(token, targetUserId),
    ]);

    const wanted = groupIds ? new Set(groupIds) : null;
    const toProcess = wanted ? sourceGroups.filter((g) => wanted.has(g.id)) : sourceGroups;
    const targetGroupIds = new Set(targetGroups.map((g) => g.id));
    const targetMember = target.userPrincipalName ?? target.mail ?? targetUserId;

    // Rôle Exchange vérifié une seule fois, uniquement si des listes Exchange sont à ajouter.
    const needsExchange = toProcess.some(
      (g) => !targetGroupIds.has(g.id) && !getNonCopyableReason(g) && isExchangeManagedGroup(g)
    );
    const exchangeAllowed = needsExchange ? await isExchangeAdmin(token) : false;

    const results: GroupCopyResult[] = [];

    for (const g of toProcess) {
      const base = { groupId: g.id, groupName: g.displayName };

      if (targetGroupIds.has(g.id)) {
        results.push({ ...base, status: "already" });
        continue;
      }
      const nonCopyable = getNonCopyableReason(g);
      if (nonCopyable) {
        results.push({ ...base, status: "skipped", reason: nonCopyable });
        continue;
      }

      const exchange = isExchangeManagedGroup(g);
      if (exchange && !exchangeAllowed) {
        results.push({ ...base, status: "skipped", reason: "Rôle Exchange Administrator requis (liste de distribution)" });
        continue;
      }

      try {
        if (exchange) {
          await setDistributionGroupMember({ groupSmtp: g.mail ?? g.id, member: targetMember, action: "add" });
        } else {
          await addGroupMember(token, g.id, targetUserId);
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        results.push(
          isAlreadyMemberError(message)
            ? { ...base, status: "already" }
            : { ...base, status: "error", reason: message }
        );
        continue;
      }

      results.push({ ...base, status: "added" });
      // Une entrée par ajout : annulable individuellement depuis le journal d'audit.
      await logAudit({
        userId: actor,
        userUpn: actor,
        action: exchange ? "DL_MEMBER_ADD" : "GROUP_MEMBER_ADD",
        targetId: targetUserId,
        targetName: target.displayName,
        targetType: "User",
        payloadBefore: {},
        payloadAfter: {
          groupId: g.id,
          groupName: g.displayName,
          role: "member",
          copiedFromId: sourceId,
          copiedFromName: source.displayName,
        },
      });
    }

    const count = (s: GroupCopyResult["status"]) => results.filter((r) => r.status === s).length;
    await logAudit({
      userId: actor,
      userUpn: actor,
      action: "USER_GROUPS_COPY",
      targetId: targetUserId,
      targetName: target.displayName,
      targetType: "User",
      payloadBefore: { sourceId, sourceName: source.displayName },
      payloadAfter: {
        added: count("added"),
        already: count("already"),
        skipped: count("skipped"),
        errors: count("error"),
        addedGroups: results.filter((r) => r.status === "added").map((r) => r.groupName),
      },
    });

    const report: GroupCopyReport = {
      sourceId,
      sourceName: source.displayName,
      targetId: targetUserId,
      targetName: target.displayName,
      results,
    };
    return NextResponse.json(report);
  } catch (error: unknown) {
    console.error("[/api/users/[id]/groups/copy POST]", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
