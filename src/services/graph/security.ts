import { graphFetch, graphFetchAll, graphBatch } from "@/lib/graph";
import { listSubscribedSkus } from "@/services/graph/licenses";
import { getSkuFriendlyName } from "@/lib/license-names";

export interface EntraIdP2Status {
  hasP2: boolean;
  licenses: string[];
}

/**
 * Vérifie si une licence du tenant inclut le service plan Entra ID P2 (Identity Protection),
 * qu'elle soit vendue seule (AAD_PREMIUM_P2) ou intégrée à un bundle (EMS E5, Microsoft 365 E5…).
 * Utile pour orienter le diagnostic quand `/identityProtection/*` est indisponible : licence
 * manquante, ou simplement permission/consentement non accordé alors que la licence est bien là.
 */
export async function getEntraIdP2Status(accessToken: string): Promise<EntraIdP2Status> {
  const skus = await listSubscribedSkus(accessToken);
  const active = skus.filter((s) => s.consumedUnits > 0 || s.prepaidUnits.enabled > 0);
  const hasP2 = active.some((s) =>
    s.servicePlans?.some(
      (p) => p.servicePlanName === "AAD_PREMIUM_P2" && p.provisioningStatus === "Success"
    )
  );
  const licenses = Array.from(new Set(active.map((s) => getSkuFriendlyName(s.skuPartNumber))));
  return { hasP2, licenses };
}

// ── Libellés FR pour les énumérations Conditional Access ──────────────────

const PLATFORM_LABELS: Record<string, string> = {
  android: "Android", iOS: "iOS", windows: "Windows", windowsPhone: "Windows Phone",
  macOS: "macOS", linux: "Linux", all: "Toutes plateformes", unknownFutureValue: "Autre",
};

const CLIENT_APP_LABELS: Record<string, string> = {
  browser: "Navigateur", mobileAppsAndDesktopClients: "Applications mobiles/bureau",
  exchangeActiveSync: "Exchange ActiveSync", easSupported: "Exchange ActiveSync",
  other: "Autre client", all: "Tous les clients",
};

const CA_RISK_LABELS: Record<string, string> = {
  low: "Faible", medium: "Moyen", high: "Élevé", none: "Aucun", unknownFutureValue: "Autre",
};

const LOCATION_SPECIAL: Record<string, string> = { All: "Tous les emplacements", AllTrusted: "Emplacements de confiance" };
const APP_SPECIAL: Record<string, string> = { All: "Toutes les applications", None: "Aucune application", Office365: "Office 365" };
const USER_SPECIAL: Record<string, string> = { All: "Tous les utilisateurs", None: "Aucun utilisateur", GuestsOrExternalUsers: "Invités/utilisateurs externes" };

function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

/** Résout par lot (via /$batch) les noms d'un ensemble d'entités Graph référencées par leur id. */
async function batchResolveNames(
  accessToken: string,
  ids: string[],
  urlBuilder: (id: string) => string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return map;
  const requests = unique.map((id) => ({ id, url: urlBuilder(id) }));
  const results = await graphBatch<{ displayName?: string; userPrincipalName?: string }>(accessToken, requests);
  for (const id of unique) {
    const entry = results[id];
    if (entry?.status === 200 && entry.body) {
      map.set(id, entry.body.displayName || entry.body.userPrincipalName || id);
    }
  }
  return map;
}

export interface ConditionalAccessPolicy {
  id: string;
  displayName: string;
  state: "enabled" | "disabled" | "enabledForReportingButNotEnforced" | string;
  createdDateTime: string | null;
  modifiedDateTime: string | null;
  grantOperator: string | null;
  grantControls: string[];
  includedUsers: string[];
  excludedUsers: string[];
  includedRolesCount: number;
  includedApplications: string[];
  excludedApplications: string[];
  platforms: { include: string[]; exclude: string[] };
  clientAppTypes: string[];
  locations: { include: string[]; exclude: string[] };
  signInRiskLevels: string[];
  userRiskLevels: string[];
  sessionControls: string[];
}

interface RawCaPolicy {
  id?: string;
  displayName?: string;
  state?: string;
  createdDateTime?: string;
  modifiedDateTime?: string;
  grantControls?: { builtInControls?: string[]; operator?: string } | null;
  conditions?: {
    users?: {
      includeUsers?: string[]; excludeUsers?: string[];
      includeGroups?: string[]; excludeGroups?: string[];
      includeRoles?: string[]; excludeRoles?: string[];
    };
    applications?: { includeApplications?: string[]; excludeApplications?: string[] };
    platforms?: { includePlatforms?: string[]; excludePlatforms?: string[] } | null;
    clientAppTypes?: string[];
    locations?: { includeLocations?: string[]; excludeLocations?: string[] } | null;
    signInRiskLevels?: string[];
    userRiskLevels?: string[];
  };
  sessionControls?: {
    signInFrequency?: { isEnabled?: boolean; value?: number; type?: string; frequencyInterval?: string } | null;
    persistentBrowser?: { isEnabled?: boolean; mode?: string } | null;
    applicationEnforcedRestrictions?: { isEnabled?: boolean } | null;
    cloudAppSecurity?: { isEnabled?: boolean; cloudAppSecurityType?: string } | null;
  } | null;
}

function summarizeSessionControls(sc: RawCaPolicy["sessionControls"]): string[] {
  if (!sc) return [];
  const out: string[] = [];
  if (sc.signInFrequency?.isEnabled) {
    out.push(
      sc.signInFrequency.frequencyInterval === "everyTime"
        ? "Fréquence de connexion : à chaque connexion"
        : `Fréquence de connexion : toutes les ${sc.signInFrequency.value ?? "?"} ${sc.signInFrequency.type === "days" ? "jour(s)" : "heure(s)"}`
    );
  }
  if (sc.persistentBrowser?.isEnabled) {
    out.push(`Navigateur persistant : ${sc.persistentBrowser.mode === "always" ? "toujours" : "jamais"}`);
  }
  if (sc.applicationEnforcedRestrictions?.isEnabled) {
    out.push("Restrictions imposées par l'application");
  }
  if (sc.cloudAppSecurity?.isEnabled) {
    out.push(`Cloud App Security : ${sc.cloudAppSecurity.cloudAppSecurityType ?? "activé"}`);
  }
  return out;
}

/**
 * Politiques d'accès conditionnel du tenant. Nécessite le scope `Policy.Read.All`
 * (consentement admin). Résout les noms des utilisateurs/groupes/applications/emplacements
 * référencés (best-effort, par lot via /$batch) — les rôles d'annuaire ciblés sont comptés
 * mais pas résolus par nom (nécessiterait un aller-retour supplémentaire sur les templates de rôle).
 */
export async function listConditionalAccessPolicies(
  accessToken: string
): Promise<ConditionalAccessPolicy[]> {
  const rows = await graphFetchAll<RawCaPolicy>(accessToken, "/identity/conditionalAccess/policies");

  const isSpecial = (v: string, dict: Record<string, string>) => Object.prototype.hasOwnProperty.call(dict, v);

  const userIds = new Set<string>();
  const groupIds = new Set<string>();
  const appIds = new Set<string>();
  const locationIds = new Set<string>();

  for (const p of rows) {
    const u = p.conditions?.users;
    for (const id of [...(u?.includeUsers ?? []), ...(u?.excludeUsers ?? [])]) {
      if (!isSpecial(id, USER_SPECIAL)) userIds.add(id);
    }
    for (const id of [...(u?.includeGroups ?? []), ...(u?.excludeGroups ?? [])]) groupIds.add(id);
    const apps = p.conditions?.applications;
    for (const id of [...(apps?.includeApplications ?? []), ...(apps?.excludeApplications ?? [])]) {
      if (!isSpecial(id, APP_SPECIAL)) appIds.add(id);
    }
    const locs = p.conditions?.locations;
    for (const id of [...(locs?.includeLocations ?? []), ...(locs?.excludeLocations ?? [])]) {
      if (!isSpecial(id, LOCATION_SPECIAL)) locationIds.add(id);
    }
  }

  const [userNames, groupNames, appNames, locationNames] = await Promise.all([
    batchResolveNames(accessToken, [...userIds], (id) => `/users/${id}?$select=displayName,userPrincipalName`),
    batchResolveNames(accessToken, [...groupIds], (id) => `/groups/${id}?$select=displayName`),
    batchResolveNames(accessToken, [...appIds], (id) => `/servicePrincipals(appId='${id}')?$select=displayName`),
    batchResolveNames(accessToken, [...locationIds], (id) => `/identity/conditionalAccess/namedLocations/${id}?$select=displayName`),
  ]);

  const resolveUsers = (ids: string[] = []) =>
    ids.map((id) => USER_SPECIAL[id] ?? userNames.get(id) ?? `Utilisateur (${id.slice(0, 8)}…)`);
  const resolveGroups = (ids: string[] = []) =>
    ids.map((id) => groupNames.get(id) ?? `Groupe (${id.slice(0, 8)}…)`);
  const resolveApps = (ids: string[] = []) =>
    ids.map((id) => APP_SPECIAL[id] ?? appNames.get(id) ?? `Application (${id.slice(0, 8)}…)`);
  const resolveLocations = (ids: string[] = []) =>
    ids.map((id) => LOCATION_SPECIAL[id] ?? locationNames.get(id) ?? `Emplacement (${id.slice(0, 8)}…)`);

  return rows.map((p) => {
    const u = p.conditions?.users;
    return {
      id: p.id ?? "",
      displayName: p.displayName ?? "(sans nom)",
      state: p.state ?? "unknown",
      createdDateTime: p.createdDateTime ?? null,
      modifiedDateTime: p.modifiedDateTime ?? null,
      grantOperator: p.grantControls?.operator ?? null,
      grantControls: p.grantControls?.builtInControls ?? [],
      includedUsers: [...resolveUsers(u?.includeUsers), ...resolveGroups(u?.includeGroups)],
      excludedUsers: [...resolveUsers(u?.excludeUsers), ...resolveGroups(u?.excludeGroups)],
      includedRolesCount: u?.includeRoles?.length ?? 0,
      includedApplications: resolveApps(p.conditions?.applications?.includeApplications),
      excludedApplications: resolveApps(p.conditions?.applications?.excludeApplications),
      platforms: {
        include: (p.conditions?.platforms?.includePlatforms ?? []).map((v) => label(PLATFORM_LABELS, v)),
        exclude: (p.conditions?.platforms?.excludePlatforms ?? []).map((v) => label(PLATFORM_LABELS, v)),
      },
      clientAppTypes: (p.conditions?.clientAppTypes ?? []).map((v) => label(CLIENT_APP_LABELS, v)),
      locations: {
        include: resolveLocations(p.conditions?.locations?.includeLocations),
        exclude: resolveLocations(p.conditions?.locations?.excludeLocations),
      },
      signInRiskLevels: (p.conditions?.signInRiskLevels ?? []).map((v) => label(CA_RISK_LABELS, v)),
      userRiskLevels: (p.conditions?.userRiskLevels ?? []).map((v) => label(CA_RISK_LABELS, v)),
      sessionControls: summarizeSessionControls(p.sessionControls),
    };
  });
}

const RISK_DETAIL_LABELS: Record<string, string> = {
  none: "—",
  adminGeneratedTemporaryPassword: "Mot de passe temporaire généré par un admin",
  userPerformedSecuredPasswordChange: "Changement de mot de passe sécurisé effectué par l'utilisateur",
  userPerformedSecuredPasswordReset: "Réinitialisation de mot de passe sécurisée effectuée par l'utilisateur",
  adminConfirmedSigninSafe: "Connexion confirmée sûre par un admin",
  aiConfirmedSigninSafe: "Connexion confirmée sûre par le moteur de risque",
  userPassedMFADrivenByRiskBasedPolicy: "MFA validée suite à une stratégie basée sur le risque",
  adminDismissedAllRiskForUser: "Tous les risques de l'utilisateur ignorés par un admin",
  adminConfirmedSigninCompromised: "Connexion confirmée compromise par un admin",
  adminConfirmedUserCompromised: "Utilisateur confirmé compromis par un admin",
  hidden: "Détail masqué (licence insuffisante)",
  m365DAdminDismissedDetection: "Détection ignorée par un admin Microsoft 365 Defender",
  unknownFutureValue: "Autre",
};

export interface RiskyDetection {
  id: string;
  userDisplayName: string | null;
  userPrincipalName: string | null;
  riskLevel: string;
  riskState: string;
  riskEventType: string;
  riskDetail: string;
  ipAddress: string | null;
  location: string | null;
  detectedDateTime: string | null;
  activity: string;
}

/**
 * Détections de risque Identity Protection (dont les connexions à risque).
 * Nécessite le scope `IdentityRiskEvent.Read.All` + une licence Microsoft Entra ID P2
 * sur le tenant — sans quoi Graph refuse l'appel (code d'erreur variable selon le cas,
 * géré par la route API appelante plutôt qu'ici).
 */
export async function listRiskyDetections(accessToken: string): Promise<RiskyDetection[]> {
  const data = await graphFetch<{
    value: {
      id?: string;
      userDisplayName?: string;
      userPrincipalName?: string;
      riskLevel?: string;
      riskState?: string;
      riskEventType?: string;
      riskDetail?: string;
      ipAddress?: string;
      location?: { city?: string; state?: string; countryOrRegion?: string } | null;
      detectedDateTime?: string;
      activity?: string;
    }[];
  }>(accessToken, "/identityProtection/riskDetections?$top=999&$orderby=detectedDateTime desc");

  return (data.value ?? []).map((d) => ({
    id: d.id ?? "",
    userDisplayName: d.userDisplayName ?? null,
    userPrincipalName: d.userPrincipalName ?? null,
    riskLevel: d.riskLevel ?? "unknown",
    riskState: d.riskState ?? "unknown",
    riskEventType: d.riskEventType ?? "unknown",
    riskDetail: RISK_DETAIL_LABELS[d.riskDetail ?? "none"] ?? (d.riskDetail || "—"),
    ipAddress: d.ipAddress ?? null,
    location: [d.location?.city, d.location?.state, d.location?.countryOrRegion].filter(Boolean).join(", ") || null,
    detectedDateTime: d.detectedDateTime ?? null,
    activity: d.activity ?? "unknown",
  }));
}
