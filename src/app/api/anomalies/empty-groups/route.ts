import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listGroups, isExchangeManagedGroup, type GroupType } from "@/services/graph/groups";
import { graphBatch } from "@/lib/graph";

/**
 * Groupes sans aucun membre (M365 / Sécurité).
 * DL / mail-enabled exclus (membres non fiables via Graph). Détection via $batch
 * (`/members?$top=1`) : un seul membre suffit à écarter un groupe.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const token = session.accessToken;
  try {
    const groups = await listGroups(token);
    const candidates = groups.filter((g) => !isExchangeManagedGroup(g));

    const batch = await graphBatch<{ value?: unknown[] }>(
      token,
      candidates.map((g) => ({ id: g.id, url: `/groups/${g.id}/members?$top=1&$select=id` }))
    );

    const empty: { id: string; displayName: string; type: GroupType }[] = [];
    for (const g of candidates) {
      const resp = batch[g.id];
      if (resp?.status === 200 && (resp.body?.value?.length ?? 0) === 0) {
        empty.push({ id: g.id, displayName: g.displayName, type: g.type });
      }
    }

    empty.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return NextResponse.json(empty);
  } catch (error: any) {
    console.error("[/api/anomalies/empty-groups GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
