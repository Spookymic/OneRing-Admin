/**
 * Sécurité des applications Entra : niveau de risque des permissions, durée de validité des
 * identifiants, adresses de redirection, activité, origine (éditeur).
 * Types partagés client/serveur + règles de classement (testées).
 */

import { STALE_DAYS, daysSince, type AppSignInActivity } from "@/lib/credential-usage";

// ── Niveau de risque des permissions ────────────────────────────────

export type PermissionRisk = "critical" | "high" | "normal";

export const RISK_LABELS: Record<PermissionRisk, string> = {
  critical: "Critique",
  high: "Élevé",
  normal: "Standard",
};

export const RISK_RANK: Record<PermissionRisk, number> = { critical: 2, high: 1, normal: 0 };

/**
 * Permissions qui permettent de prendre le contrôle du tenant (élévation jusqu'à
 * Administrateur général, modification de la sécurité, exécution sur les postes…).
 */
const CRITICAL_PERMISSIONS = new Set(
  [
    "RoleManagement.ReadWrite.Directory",
    "RoleManagementPolicy.ReadWrite.Directory",
    "RoleAssignmentSchedule.ReadWrite.Directory",
    "RoleEligibilitySchedule.ReadWrite.Directory",
    "AppRoleAssignment.ReadWrite.All",
    "Application.ReadWrite.All",
    "Directory.ReadWrite.All",
    "Directory.AccessAsUser.All",
    "Domain.ReadWrite.All",
    "Organization.ReadWrite.All",
    "Policy.ReadWrite.ConditionalAccess",
    "Policy.ReadWrite.AuthenticationMethod",
    "Policy.ReadWrite.PermissionGrant",
    "UserAuthenticationMethod.ReadWrite.All",
    "User-PasswordProfile.ReadWrite.All",
    "PrivilegedAccess.ReadWrite.AzureADGroup",
    "PrivilegedAssignmentSchedule.ReadWrite.AzureADGroup",
    "EntitlementManagement.ReadWrite.All",
    "DeviceManagementConfiguration.ReadWrite.All",
    "DeviceManagementRBAC.ReadWrite.All",
    "Sites.FullControl.All",
    "full_access_as_app",
    "Exchange.ManageAsApp",
  ].map((p) => p.toLowerCase())
);

/** Permissions donnant un accès massif aux données (messagerie, fichiers, conversations…). */
const HIGH_PERMISSIONS = new Set(
  [
    "Application.ReadWrite.OwnedBy",
    "Mail.Read",
    "Mail.ReadBasic.All",
    "Mail.ReadWrite",
    "Mail.Send",
    "MailboxSettings.ReadWrite",
    "EWS.AccessAsUser.All",
    "EWS.full_access_as_app",
    "Files.Read.All",
    "Files.ReadWrite.All",
    "Sites.Read.All",
    "Sites.ReadWrite.All",
    "Sites.Manage.All",
    "Notes.Read.All",
    "Notes.ReadWrite.All",
    "Calendars.Read",
    "Calendars.ReadWrite",
    "Contacts.Read",
    "Contacts.ReadWrite",
    "Chat.Read.All",
    "Chat.ReadWrite.All",
    "ChannelMessage.Read.All",
    "User.ReadWrite.All",
    "User.ManageIdentities.All",
    "User.EnableDisableAccount.All",
    "Group.ReadWrite.All",
    "GroupMember.ReadWrite.All",
    "Device.ReadWrite.All",
    "DeviceManagementManagedDevices.ReadWrite.All",
    "DeviceManagementManagedDevices.PrivilegedOperations.All",
    "IdentityRiskyUser.ReadWrite.All",
    "SecurityEvents.ReadWrite.All",
    "Mail.ReadWrite.Shared",
    "Mail.Send.Shared",
  ].map((p) => p.toLowerCase())
);

/** Niveau de risque d'une permission (valeur, ex. « Mail.ReadWrite »), quelle que soit la ressource. */
export function permissionRisk(value: string): PermissionRisk {
  const v = value.trim().toLowerCase();
  if (CRITICAL_PERMISSIONS.has(v)) return "critical";
  if (HIGH_PERMISSIONS.has(v)) return "high";
  return "normal";
}

/** Risque le plus élevé d'une liste. */
export function maxRisk(risks: Iterable<PermissionRisk>): PermissionRisk {
  let best: PermissionRisk = "normal";
  for (const r of risks) if (RISK_RANK[r] > RISK_RANK[best]) best = r;
  return best;
}

// ── Durée de validité des secrets / certificats ─────────────────────

/** Microsoft recommande des secrets courts (6 mois) ; au-delà de 12 mois, on alerte. */
export const SECRET_MAX_VALIDITY_DAYS = 365;
/** Les certificats vivent plus longtemps ; au-delà de 24 mois, on alerte. */
export const CERT_MAX_VALIDITY_DAYS = 730;

export function validityDays(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  return Math.round((e - s) / 86_400_000);
}

/** Durée de validité excessive pour ce type d'identifiant. */
export function isLongLived(type: "secret" | "certificate", days: number | null): boolean {
  if (days == null) return false;
  return days > (type === "secret" ? SECRET_MAX_VALIDITY_DAYS : CERT_MAX_VALIDITY_DAYS);
}

/** Libellé lisible d'une durée (« 2 ans », « 18 mois », « 90 j »). */
export function formatValidity(days: number | null): string {
  if (days == null) return "";
  if (days >= 3650) return "illimitée (10 ans +)";
  if (days >= 365 && days % 365 < 31) return `${Math.round(days / 365)} an${days >= 730 ? "s" : ""}`;
  if (days >= 60) return `${Math.round(days / 30.4)} mois`;
  return `${days} j`;
}

// ── Adresses de redirection (reply URLs) ────────────────────────────

export type RedirectIssue = "insecure-http" | "wildcard" | "tunnel" | "shared-host";

export const REDIRECT_ISSUE_LABELS: Record<RedirectIssue, string> = {
  "insecure-http": "HTTP non chiffré",
  wildcard: "Joker (*)",
  tunnel: "Tunnel de développement",
  "shared-host": "Hébergement mutualisé",
};

export const REDIRECT_ISSUE_HINTS: Record<RedirectIssue, string> = {
  "insecure-http": "Le jeton transite en clair : utiliser HTTPS.",
  wildcard: "Toute adresse correspondante reçoit les jetons : lister les adresses exactes.",
  tunnel: "Adresse de tunnel temporaire (ngrok…) : réattribuable à n'importe qui une fois libérée.",
  "shared-host":
    "Sous-domaine d'une plateforme mutualisée : si la ressource est supprimée, un tiers peut le réclamer et recevoir les jetons.",
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const TUNNEL_SUFFIXES = [
  "ngrok.io", "ngrok-free.app", "ngrok.app", "loca.lt", "localtunnel.me", "trycloudflare.com",
  "serveo.net", "localhost.run", "devtunnels.ms",
];
const SHARED_HOST_SUFFIXES = [
  "azurewebsites.net", "cloudapp.net", "cloudapp.azure.com", "trafficmanager.net", "azurestaticapps.net",
  "blob.core.windows.net", "azureedge.net", "herokuapp.com", "github.io", "netlify.app", "vercel.app",
  "firebaseapp.com", "web.app", "appspot.com", "pages.dev", "onrender.com",
];

const endsWithDomain = (host: string, suffix: string) => host === suffix || host.endsWith(`.${suffix}`);

/** Faiblesses d'une adresse de redirection (vide = rien à signaler). */
export function redirectUriIssues(uri: string): RedirectIssue[] {
  const issues: RedirectIssue[] = [];
  if (uri.includes("*")) issues.push("wildcard");
  // Schémas personnalisés (msal…://, ms-appx-web://) : applications natives, non concernées.
  const m = /^(https?):\/\/([^/:?#]+)/i.exec(uri.replace("*.", "x."));
  if (!m) return issues;
  const scheme = m[1].toLowerCase();
  const host = m[2].toLowerCase();
  if (LOCAL_HOSTS.has(host)) return issues;
  if (scheme === "http") issues.push("insecure-http");
  if (TUNNEL_SUFFIXES.some((s) => endsWithDomain(host, s))) issues.push("tunnel");
  else if (SHARED_HOST_SUFFIXES.some((s) => endsWithDomain(host, s))) issues.push("shared-host");
  return issues;
}

// ── Activité d'une application ──────────────────────────────────────

export type AppActivityStatus = "active" | "dormant" | "never" | "new" | "unknown";

export const APP_ACTIVITY_LABELS: Record<AppActivityStatus, string> = {
  active: "Active",
  dormant: `Dormante (${STALE_DAYS} j+)`,
  never: "Jamais utilisée",
  new: "Récente",
  unknown: "Inconnue",
};

/**
 * Statut d'activité : une application créée il y a moins de STALE_DAYS jours n'est
 * jamais déclarée dormante (elle n'a pas encore eu le temps d'être utilisée).
 */
export function appActivityStatus(
  activity: AppSignInActivity | null | undefined,
  createdDateTime: string | null,
  now: number,
  supported: boolean
): AppActivityStatus {
  if (!supported) return "unknown";
  const since = daysSince(activity?.lastSignIn ?? null, now);
  if (since != null && since <= STALE_DAYS) return "active";
  const age = daysSince(createdDateTime, now);
  if (age != null && age <= STALE_DAYS) return "new";
  return since == null ? "never" : "dormant";
}

/** Plus utilisée depuis STALE_DAYS jours, ou jamais : candidate au ménage. */
export const isDormant = (s: AppActivityStatus) => s === "dormant" || s === "never";

// ── Origine (éditeur) d'un principal de service ─────────────────────

export type PublisherKind = "internal" | "microsoft" | "third-party" | "managed-identity" | "unknown";

export const PUBLISHER_LABELS: Record<PublisherKind, string> = {
  internal: "Interne",
  microsoft: "Microsoft",
  "third-party": "Tierce",
  "managed-identity": "Identité managée",
  unknown: "Inconnue",
};

/** Tenants Microsoft propriétaires des applications first-party. */
const MICROSOFT_TENANTS = new Set([
  "f8cdef31-a31e-4b4a-93e4-5f571e91255a", // Microsoft Services
  "72f988bf-86f1-41af-91ab-2d7cd011db47", // Microsoft
  "cdc5aeea-15c5-4db6-b079-fcadd2505dc2",
]);

export function publisherKind(
  sp: { appOwnerOrganizationId?: string | null; servicePrincipalType?: string | null },
  tenantId: string
): PublisherKind {
  if (sp.servicePrincipalType === "ManagedIdentity" || sp.servicePrincipalType === "ServiceIdentity") {
    return "managed-identity";
  }
  const owner = sp.appOwnerOrganizationId?.toLowerCase();
  if (!owner) return "unknown";
  if (owner === tenantId.toLowerCase()) return "internal";
  if (MICROSOFT_TENANTS.has(owner)) return "microsoft";
  return "third-party";
}

// ── Types de l'inventaire (réponse de /api/applications) ─────────────

export interface AppOwner {
  displayName: string;
  userPrincipalName: string | null;
  /** Identifiant d'objet (utilisateur ou principal de service), pour le retrait. */
  id: string | null;
  /** Utilisateur ou application (principal de service). */
  kind: "user" | "servicePrincipal" | "other";
}

export interface AppCreator {
  by: string;
  at: string;
}

export interface GrantedPermission {
  /** Ressource exposant la permission (Microsoft Graph, SharePoint…). */
  resource: string;
  value: string;
  risk: PermissionRisk;
}

export interface DelegatedConsent {
  resource: string;
  scopes: { value: string; risk: PermissionRisk }[];
  /** Consentement administrateur pour toute l'organisation. */
  adminConsent: boolean;
  /** Nombre d'utilisateurs ayant consenti individuellement. */
  userCount: number;
}

/** Accès d'un principal de service (application d'entreprise) : permissions applicatives et déléguées. */
export interface ServicePrincipalAccess {
  id: string;
  appId: string;
  displayName: string;
  publisher: PublisherKind;
  publisherName: string | null;
  /** Nom de l'éditeur vérifié (Microsoft Partner Network), null si non vérifié. */
  verifiedPublisher: string | null;
  enabled: boolean;
  appPermissions: GrantedPermission[];
  delegated: DelegatedConsent[];
  risk: PermissionRisk;
  lastSignIn: string | null;
}

export interface FederatedCredential {
  name: string;
  issuer: string;
  subject: string;
}

export interface RedirectFinding {
  uri: string;
  issues: RedirectIssue[];
}

/** Inscription d'application du tenant. */
export interface AppInventoryItem {
  id: string;
  appId: string;
  displayName: string;
  signInAudience: string | null;
  createdDateTime: string | null;
  creator: AppCreator | null;
  owners: AppOwner[];
  secrets: number;
  certificates: number;
  expiredCredentials: number;
  longLivedCredentials: number;
  federated: FederatedCredential[];
  redirectFindings: RedirectFinding[];
  activity: AppSignInActivity | null;
  status: AppActivityStatus;
  /** Risque le plus élevé des permissions accordées à l'application (applicatives et déléguées). */
  risk: PermissionRisk;
  /** Permissions critiques ou élevées accordées (valeurs, sans doublon). */
  sensitivePermissions: string[];
}

export interface ApplicationsReport {
  usageSupported: boolean;
  generatedAt: string;
  apps: AppInventoryItem[];
  servicePrincipals: ServicePrincipalAccess[];
}

/** Mot à saisir pour confirmer la suppression d'un secret (irréversible). */
export const SECRET_REMOVE_CONFIRMATION = "SUPPRIMER";
