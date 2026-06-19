import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getGroupBasic,
  isExchangeManagedGroup,
  listSubgroups,
  listParentGroups,
  type GroupType,
} from "@/services/graph/groups";
import { listDistributionGroupMembers } from "@/services/exchange/distribution-groups";

export interface GroupNode {
  id: string;
  displayName: string;
  type: GroupType;
  isTeam: boolean;
  mail: string | null;
}

/** Déduit le type de groupe depuis le RecipientTypeDetails Exchange (membres d'une DL). */
function typeFromRecipient(rtd: string): GroupType {
  if (/GroupMailbox/i.test(rtd)) return "unified";
  if (/SecurityGroup/i.test(rtd)) return "security";
  return "distribution";
}

/**
 * Relations d'imbrication d'un groupe.
 * - direction=children : groupes membres de ce groupe (descendance)
 * - direction=parents  : groupes dont ce groupe est membre (vue inversée « membre de »)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await params;
  const direction = req.nextUrl.searchParams.get("direction") === "parents" ? "parents" : "children";
  const token = session.accessToken;

  try {
    let nodes: GroupNode[];

    if (direction === "parents") {
      // « Membre de » : Graph couvre l'imbrication de sécurité/M365.
      const parents = await listParentGroups(token, id);
      nodes = parents.map((g) => ({
        id: g.id,
        displayName: g.displayName,
        type: g.type,
        isTeam: (g.resourceProvisioningOptions ?? []).includes("Team"),
        mail: g.mail,
      }));
    } else {
      const group = await getGroupBasic(token, id);
      if (isExchangeManagedGroup(group)) {
        // Listes de distribution / groupes mail-enabled : imbrication via le pont Exchange.
        const members = await listDistributionGroupMembers(group.mail ?? id);
        nodes = members
          .filter((m) => m.isGroup)
          .map((m) => ({
            id: m.id ?? m.mail,
            displayName: m.displayName,
            type: typeFromRecipient(m.recipientTypeDetails),
            isTeam: false,
            mail: m.mail,
          }));
      } else {
        const subs = await listSubgroups(token, id);
        nodes = subs.map((g) => ({
          id: g.id,
          displayName: g.displayName,
          type: g.type,
          isTeam: (g.resourceProvisioningOptions ?? []).includes("Team"),
          mail: g.mail,
        }));
      }
    }

    nodes.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return NextResponse.json(nodes);
  } catch (error: any) {
    console.error("[/api/groups/[id]/relations GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
