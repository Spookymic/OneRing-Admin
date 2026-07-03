import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listOrphanDelegations, type DelegationType } from "@/services/exchange/shared-mailboxes";
import { getDeletedUserSidMap } from "@/services/graph/directory";

export interface OrphanDelegation {
  mailbox: string;
  mailboxMail: string;
  type: DelegationType;
  sid: string;
  deletedName: string | null;
  deletedDate: string | null;
}

/**
 * Rapport global des délégations orphelines : parcourt toutes les boîtes partagées et liste
 * les permissions (Accès complet / Envoyer en tant que / de la part de) dont le titulaire est
 * un compte supprimé (SID non résolu). Best-effort : tente de retrouver le nom via la corbeille.
 *
 * Coûteux (un appel pont par boîte) → à charger à la demande.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    // Un seul appel pont (scan côté PowerShell) + une lecture de la corbeille Azure.
    const [raw, deleted] = await Promise.all([
      listOrphanDelegations(),
      getDeletedUserSidMap(session.accessToken),
    ]);

    const out: OrphanDelegation[] = raw.map((o) => {
      const rec = deleted.get(o.sid.toLowerCase());
      return {
        mailbox: o.mailbox,
        mailboxMail: o.mailboxMail,
        type: o.type,
        sid: o.sid,
        deletedName: rec?.displayName ?? null,
        deletedDate: rec?.deletedDateTime ?? null,
      };
    });
    return NextResponse.json({ supported: true, orphans: out });
  } catch (error: any) {
    if (String(error?.message ?? "").includes("Pont Exchange non configuré")) {
      return NextResponse.json({ supported: false, orphans: [] });
    }
    console.error("[/api/anomalies/orphan-delegations GET]", error?.message);
    return NextResponse.json({ error: "Erreur lors de l'analyse des délégations." }, { status: 500 });
  }
}
