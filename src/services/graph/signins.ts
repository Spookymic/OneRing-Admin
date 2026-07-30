import { graphFetch } from "@/lib/graph";

export interface TenantSignIn {
  id: string;
  userDisplayName: string | null;
  userPrincipalName: string | null;
  appDisplayName: string;
  ipAddress: string | null;
  clientAppUsed: string | null;
  authenticationRequirement: string | null;
  isInteractive: boolean;
  createdDateTime: string;
  status: { errorCode: number; failureReason: string | null };
  location: { city: string | null; state: string | null; countryOrRegion: string | null } | null;
}

interface RawSignIn {
  id?: string;
  userDisplayName?: string;
  userPrincipalName?: string;
  appDisplayName?: string;
  ipAddress?: string;
  clientAppUsed?: string;
  authenticationRequirement?: string;
  isInteractive?: boolean;
  createdDateTime?: string;
  status?: { errorCode?: number; failureReason?: string };
  location?: { city?: string; state?: string; countryOrRegion?: string } | null;
}

/**
 * Récupère les connexions du tenant sur les `hours` dernières heures, jusqu'à `cap` événements.
 * Contrairement à `graphFetchAll` (src/lib/graph.ts), s'arrête volontairement au plafond plutôt
 * que de tout paginer — un tenant actif peut produire des dizaines de milliers d'événements par
 * semaine, et `/auditLogs/signIns` ne permet pas d'agréger côté serveur. `truncated` indique si
 * le plafond a été atteint avant la fin de la fenêtre demandée (jamais de troncature silencieuse).
 */
export async function listTenantSignIns(
  accessToken: string,
  hours: number,
  cap = 2000
): Promise<{ signIns: TenantSignIn[]; truncated: boolean }> {
  const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
  // Pas de $select explicite : `authenticationRequirement` (utilisé pour le taux de MFA) n'est
  // pas reconnu par Graph sur certains tenants pour cette collection ($select stricte renvoie
  // alors 400 BadRequest sur toute la requête) — on récupère les propriétés par défaut et on lit
  // les champs voulus s'ils sont présents dans la réponse, sans dépendre de leur validation.
  const params = new URLSearchParams({
    $filter: `createdDateTime ge ${cutoff}`,
    $orderby: "createdDateTime desc",
    $top: "999",
  });

  const all: RawSignIn[] = [];
  let url: string | undefined = `/auditLogs/signIns?${params}`;
  let truncated = false;
  while (url && all.length < cap) {
    const data: { value?: RawSignIn[]; "@odata.nextLink"?: string } = await graphFetch(accessToken, url);
    if (data.value) all.push(...data.value);
    url = data["@odata.nextLink"];
    if (url && all.length >= cap) truncated = true;
  }

  const signIns = all.slice(0, cap).map((s) => ({
    id: s.id ?? "",
    userDisplayName: s.userDisplayName ?? null,
    userPrincipalName: s.userPrincipalName ?? null,
    appDisplayName: s.appDisplayName || "(application inconnue)",
    ipAddress: s.ipAddress ?? null,
    clientAppUsed: s.clientAppUsed ?? null,
    authenticationRequirement: s.authenticationRequirement ?? null,
    isInteractive: s.isInteractive ?? true,
    createdDateTime: s.createdDateTime ?? "",
    status: { errorCode: s.status?.errorCode ?? 0, failureReason: s.status?.failureReason ?? null },
    location: s.location
      ? { city: s.location.city ?? null, state: s.location.state ?? null, countryOrRegion: s.location.countryOrRegion ?? null }
      : null,
  }));

  return { signIns, truncated };
}

const LEGACY_CLIENT_APPS = new Set([
  "Exchange ActiveSync", "IMAP4", "POP3", "MAPI Over HTTP", "Autodiscover",
  "Authenticated SMTP", "Offline Address Book", "Other clients", "Reporting Web Services",
]);

export interface SignInBucket {
  label: string;
  success: number;
  failure: number;
}

export interface SignInStats {
  total: number;
  successCount: number;
  failureCount: number;
  mfaCount: number;
  mfaPct: number;
  legacyAuthCount: number;
  legacyAuthPct: number;
  topApps: { name: string; count: number }[];
  topCountries: { name: string; count: number }[];
  topIps: { name: string; count: number }[];
  topFailureReasons: { name: string; count: number }[];
  timeline: SignInBucket[];
}

function topN(counts: Map<string, number>, n: number): { name: string; count: number }[] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

function increment(map: Map<string, number>, key: string | null | undefined) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Agrégation pure (aucun appel réseau) des connexions déjà récupérées. */
export function computeSignInStats(signIns: TenantSignIn[], hours: number): SignInStats {
  const apps = new Map<string, number>();
  const countries = new Map<string, number>();
  const ips = new Map<string, number>();
  const failureReasons = new Map<string, number>();
  const byBucket = new Map<string, { success: number; failure: number }>();

  let successCount = 0, mfaCount = 0, legacyAuthCount = 0;
  const perDay = hours > 24;

  for (const s of signIns) {
    const isSuccess = s.status.errorCode === 0;
    if (isSuccess) successCount++;
    if (s.authenticationRequirement === "multiFactorAuthentication") mfaCount++;
    if (s.clientAppUsed && LEGACY_CLIENT_APPS.has(s.clientAppUsed)) legacyAuthCount++;

    increment(apps, s.appDisplayName);
    increment(countries, s.location?.countryOrRegion);
    increment(ips, s.ipAddress);
    if (!isSuccess) increment(failureReasons, s.status.failureReason || `Code ${s.status.errorCode}`);

    if (s.createdDateTime) {
      const d = new Date(s.createdDateTime);
      const bucket = perDay
        ? d.toISOString().slice(0, 10)
        : `${d.toISOString().slice(0, 13)}:00`;
      const entry = byBucket.get(bucket) ?? { success: 0, failure: 0 };
      if (isSuccess) entry.success++; else entry.failure++;
      byBucket.set(bucket, entry);
    }
  }

  const timeline = Array.from(byBucket.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, v]) => ({ label, success: v.success, failure: v.failure }));

  const total = signIns.length;
  return {
    total,
    successCount,
    failureCount: total - successCount,
    mfaCount,
    mfaPct: total > 0 ? Math.round((mfaCount / total) * 100) : 0,
    legacyAuthCount,
    legacyAuthPct: total > 0 ? Math.round((legacyAuthCount / total) * 100) : 0,
    topApps: topN(apps, 8),
    topCountries: topN(countries, 8),
    topIps: topN(ips, 8),
    topFailureReasons: topN(failureReasons, 5),
    timeline,
  };
}
