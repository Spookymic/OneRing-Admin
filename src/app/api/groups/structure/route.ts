import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listGroups, type GroupType } from "@/services/graph/groups";
import { graphBatch } from "@/lib/graph";

interface StructureNode {
  id: string;
  displayName: string;
  type: GroupType;
  isTeam: boolean;
  mail: string | null;
}

/**
 * Graphe d'imbrication des groupes, précalculé en une passe (via Graph $batch).
 * Permet à l'arborescence d'être instantanée (expansion, compteurs, chevrons conditionnels,
 * filtre racines) sans appel par nœud.
 *
 * Limite : basé sur memberOf Graph → couvre l'imbrication Sécurité/M365/Teams.
 * L'imbrication DL-dans-DL (gérée par Exchange) n'y figure pas.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const token = session.accessToken;
  try {
    const groups = await listGroups(token);
    const idSet = new Set(groups.map((g) => g.id));

    const batch = await graphBatch<{ value?: { id: string }[] }>(
      token,
      groups.map((g) => ({
        id: g.id,
        url: `/groups/${g.id}/memberOf/microsoft.graph.group?$select=id`,
      }))
    );

    const parentsOf: Record<string, string[]> = {};
    const childrenOf: Record<string, string[]> = {};
    for (const g of groups) {
      const resp = batch[g.id];
      const parents =
        resp?.status === 200
          ? (resp.body?.value ?? []).map((p) => p.id).filter((id) => idSet.has(id))
          : [];
      parentsOf[g.id] = parents;
      for (const p of parents) {
        (childrenOf[p] ??= []).push(g.id);
      }
    }

    const nodes: StructureNode[] = groups.map((g) => ({
      id: g.id,
      displayName: g.displayName,
      type: g.type,
      isTeam: (g.resourceProvisioningOptions ?? []).includes("Team"),
      mail: g.mail,
    }));

    return NextResponse.json({ nodes, childrenOf, parentsOf });
  } catch (error: any) {
    console.error("[/api/groups/structure GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
