import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listGroups, listGroupOwners, isExchangeManagedGroup, type GroupType } from "@/services/graph/groups";

/**
 * Groupes sans propriétaire (M365 et Sécurité).
 * Les groupes Exchange-managed (DL, sécurité mail-enabled) sont exclus : leurs propriétaires
 * (managedBy) ne sont pas exposés par Graph, ce qui les ferait tous remonter à tort.
 * Un appel /owners par groupe → calcul par lots.
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

    const CHUNK = 10;
    const ownerless: { id: string; displayName: string; type: GroupType }[] = [];
    for (let i = 0; i < candidates.length; i += CHUNK) {
      const chunk = candidates.slice(i, i + CHUNK);
      const settled = await Promise.all(
        chunk.map(async (g) => {
          try {
            const owners = await listGroupOwners(token, g.id);
            return { g, count: owners.length };
          } catch {
            // En cas d'erreur de lecture, on ne signale pas (évite les faux positifs).
            return { g, count: -1 };
          }
        })
      );
      for (const r of settled) {
        if (r.count === 0) {
          ownerless.push({ id: r.g.id, displayName: r.g.displayName, type: r.g.type });
        }
      }
    }

    ownerless.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return NextResponse.json(ownerless);
  } catch (error: any) {
    console.error("[/api/anomalies/ownerless GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
