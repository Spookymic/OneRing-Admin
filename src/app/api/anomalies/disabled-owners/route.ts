import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listGroups, listGroupOwners, isExchangeManagedGroup, type GroupType } from "@/services/graph/groups";
import { listUsers } from "@/services/graph/users";

interface DisabledOwner {
  id: string;
  displayName: string;
  userPrincipalName: string | null;
}

interface GroupWithDisabledOwner {
  id: string;
  displayName: string;
  type: GroupType;
  mail: string | null;
  owners: DisabledOwner[];
}

/**
 * Groupes dont au moins un propriétaire est un compte utilisateur DÉSACTIVÉ.
 * Un propriétaire désactivé ne peut plus gérer le groupe → gouvernance à corriger
 * (réattribuer la propriété). Vue group-centric.
 *
 * - Les groupes Exchange-managed (DL, sécurité mail-enabled) sont exclus : leurs
 *   propriétaires ne sont pas exposés de façon fiable par Graph.
 * - On ne signale que les propriétaires de type utilisateur (les propriétaires
 *   groupes / service principals sont ignorés — non concernés par accountEnabled).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const token = session.accessToken;
  try {
    const [groups, users] = await Promise.all([listGroups(token), listUsers(token)]);

    // Map des comptes désactivés (id → infos) pour qualifier les propriétaires.
    const disabledById = new Map(
      users.filter((u) => !u.accountEnabled).map((u) => [u.id, u])
    );

    const candidates = groups.filter((g) => !isExchangeManagedGroup(g));

    const CHUNK = 10;
    const result: GroupWithDisabledOwner[] = [];
    for (let i = 0; i < candidates.length; i += CHUNK) {
      const chunk = candidates.slice(i, i + CHUNK);
      const settled = await Promise.all(
        chunk.map(async (g) => {
          try {
            const owners = await listGroupOwners(token, g.id);
            const disabledOwners: DisabledOwner[] = owners
              .filter((o) => disabledById.has(o.id))
              .map((o) => {
                const u = disabledById.get(o.id)!;
                return {
                  id: u.id,
                  displayName: u.displayName,
                  userPrincipalName: u.userPrincipalName ?? null,
                };
              });
            return { g, disabledOwners };
          } catch {
            // Erreur de lecture des propriétaires → on ne signale pas (évite les faux positifs).
            return { g, disabledOwners: [] as DisabledOwner[] };
          }
        })
      );
      for (const r of settled) {
        if (r.disabledOwners.length > 0) {
          result.push({
            id: r.g.id,
            displayName: r.g.displayName,
            type: r.g.type,
            mail: r.g.mail ?? null,
            owners: r.disabledOwners,
          });
        }
      }
    }

    result.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[/api/anomalies/disabled-owners GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
