/**
 * Utilisation des applications et de leurs secrets / certificats (rapports Entra
 * appCredentialSignInActivities et servicePrincipalSignInActivities).
 * Types partagés client/serveur + règles de classement (testées).
 */

/** Au-delà, un identifiant ou une application est considéré comme plus utilisé. */
export const STALE_DAYS = 90;
/** Expiration proche : un identifiant encore utilisé est alors à renouveler en priorité. */
export const RENEW_WITHIN_DAYS = 30;

export type UsageStatus =
  /** Utilisé dans les STALE_DAYS derniers jours. */
  | "recent"
  /** Dernière utilisation plus ancienne que STALE_DAYS. */
  | "stale"
  /** Aucune utilisation enregistrée par Microsoft depuis le début du suivi. */
  | "unused"
  /** Rapport d'activité illisible (droits) : statut inconnu. */
  | "unknown";

export const USAGE_STATUS_LABELS: Record<UsageStatus, string> = {
  recent: "Utilisé",
  stale: `Inutilisé depuis ${STALE_DAYS} j+`,
  unused: "Aucune utilisation enregistrée",
  unknown: "Inconnu",
};

export function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.floor((now - t) / 86_400_000);
}

/** Statut d'utilisation à partir de la date de dernière utilisation. */
export function usageStatus(lastUsed: string | null, now: number, supported: boolean): UsageStatus {
  if (!supported) return "unknown";
  const d = daysSince(lastUsed, now);
  if (d == null) return "unused";
  return d <= STALE_DAYS ? "recent" : "stale";
}

/** Expire bientôt (ou déjà expiré) ET encore utilisé : risque de panne, renouveler en priorité. */
export function isRenewPriority(c: { daysLeft: number; usage: UsageStatus }): boolean {
  return c.daysLeft <= RENEW_WITHIN_DAYS && c.usage === "recent";
}

/** Plus utilisé (ou jamais) : candidat à la suppression après vérification avec le propriétaire. */
export function isRemovalCandidate(c: { usage: UsageStatus }): boolean {
  return c.usage === "stale" || c.usage === "unused";
}

/** Activité de connexion d'une application (principal de service). */
export interface AppSignInActivity {
  /** Toutes connexions confondues. */
  lastSignIn: string | null;
  /** Connexions au nom d'un utilisateur (l'application est le client). */
  lastDelegated: string | null;
  /** Connexions de l'application seule, avec secret ou certificat (client credentials). */
  lastAppOnly: string | null;
}

/** Retient la date la plus récente (ISO) parmi plusieurs. */
export function latest(...dates: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestT = -Infinity;
  for (const d of dates) {
    if (!d) continue;
    const t = new Date(d).getTime();
    if (!Number.isNaN(t) && t > bestT) {
      best = d;
      bestT = t;
    }
  }
  return best;
}
