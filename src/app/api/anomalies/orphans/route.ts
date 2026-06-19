import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listUsers, listUserMemberOf } from "@/services/graph/users";
import { detectAccountType } from "@/lib/account-types";

// Groupes par défaut (tout le monde en est membre) : ne comptent pas comme anomalie.
const EXCLUDED_GROUP_NAMES = new Set([
  "tous les utilisateurs",
  "all users",
  "all company",
  "everyone",
]);

/**
 * Anomalies "orphelins" : comptes désactivés ou boîtes partagées/salles/équipements
 * encore membres d'au moins un groupe. La donnée d'appartenance (memberOf) n'étant pas
 * dans la liste des utilisateurs, on la récupère ici par compte candidat (concurrence limitée).
 *
 * Réponse : [{ id, groupCount, groups: string[] }] pour les seuls comptes ayant ≥ 1 groupe.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const token = session.accessToken;
  try {
    const users = await listUsers(token);

    // Candidats : désactivés OU types non-utilisateur à durée de vie longue.
    const candidates = users.filter((u) => {
      const t = detectAccountType(u);
      return !u.accountEnabled || t === "shared" || t === "room" || t === "equipment";
    });

    // Récupère memberOf par lots pour éviter le throttling Graph.
    const CHUNK = 8;
    const orphans: { id: string; groupCount: number; groups: string[] }[] = [];
    for (let i = 0; i < candidates.length; i += CHUNK) {
      const chunk = candidates.slice(i, i + CHUNK);
      const settled = await Promise.all(
        chunk.map(async (u) => {
          try {
            const groups = await listUserMemberOf(token, u.id);
            const names = groups
              .map((g) => g.displayName)
              .filter((n) => !EXCLUDED_GROUP_NAMES.has((n ?? "").trim().toLowerCase()));
            return { id: u.id, groups: names };
          } catch {
            return { id: u.id, groups: [] as string[] };
          }
        })
      );
      for (const r of settled) {
        if (r.groups.length > 0) {
          orphans.push({ id: r.id, groupCount: r.groups.length, groups: r.groups });
        }
      }
    }

    return NextResponse.json(orphans);
  } catch (error: any) {
    console.error("[/api/anomalies/orphans GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
