import { graphBatch, graphFetchAll } from "@/lib/graph";
import {
  RISK_RANK, appActivityStatus, isLongLived, maxRisk, permissionRisk, publisherKind, redirectUriIssues, validityDays,
  type AppCreator, type AppInventoryItem, type ApplicationsReport, type DelegatedConsent,
  type GrantedPermission, type PermissionRisk, type ServicePrincipalAccess,
} from "@/lib/app-security";
import { toOwner, type CredentialUsageIndex, type RawCredential, type RawOwner } from "@/services/graph/applications";

interface RawRedirects {
  redirectUris?: string[];
}

interface RawApp {
  id: string;
  appId: string;
  displayName: string;
  signInAudience?: string | null;
  createdDateTime?: string | null;
  web?: RawRedirects | null;
  spa?: RawRedirects | null;
  publicClient?: RawRedirects | null;
  passwordCredentials?: RawCredential[];
  keyCredentials?: RawCredential[];
  owners?: RawOwner[];
}

interface RawFederated {
  id: string;
  federatedIdentityCredentials?: { name?: string | null; issuer?: string | null; subject?: string | null }[];
}

interface RawAppRoleAssignment {
  appRoleId: string;
  resourceId: string;
  resourceDisplayName?: string | null;
}

interface RawServicePrincipal {
  id: string;
  appId: string;
  displayName?: string | null;
  appOwnerOrganizationId?: string | null;
  servicePrincipalType?: string | null;
  publisherName?: string | null;
  verifiedPublisher?: { displayName?: string | null } | null;
  accountEnabled?: boolean | null;
  appRoleAssignments?: RawAppRoleAssignment[];
}

interface RawGrant {
  clientId: string;
  consentType: "AllPrincipals" | "Principal";
  principalId?: string | null;
  resourceId: string;
  scope?: string | null;
}

interface RawResource {
  id: string;
  appRoles?: { id: string; value?: string | null }[];
}

const DEFAULT_ROLE_ID = "00000000-0000-0000-0000-000000000000";

const risksOf = (sp: Pick<ServicePrincipalAccess, "appPermissions" | "delegated">): PermissionRisk[] => [
  ...sp.appPermissions.map((p) => p.risk),
  ...sp.delegated.flatMap((d) => d.scopes.map((s) => s.risk)),
];

/**
 * Inventaire de sécurité des applications : inscriptions du tenant (propriétaires, identifiants,
 * identifiants fédérés, adresses de redirection, activité) et accès accordés à toutes les
 * applications d'entreprise (permissions applicatives, consentements délégués).
 * Lecture seule — Application.Read.All + Directory.Read.All.
 */
export async function getApplicationsReport(
  accessToken: string,
  tenantId: string,
  now: number,
  usage: CredentialUsageIndex,
  creators: Map<string, AppCreator>
): Promise<ApplicationsReport> {
  const [apps, federated, sps, grants] = await Promise.all([
    graphFetchAll<RawApp>(
      accessToken,
      "/applications?$select=id,appId,displayName,signInAudience,createdDateTime,web,spa,publicClient," +
        "passwordCredentials,keyCredentials&$expand=owners($select=id,displayName,userPrincipalName)&$top=999"
    ),
    // Un seul $expand par requête sur les objets d'annuaire : identifiants fédérés à part.
    graphFetchAll<RawFederated>(
      accessToken,
      "/applications?$select=id&$expand=federatedIdentityCredentials&$top=999"
    ),
    graphFetchAll<RawServicePrincipal>(
      accessToken,
      "/servicePrincipals?$select=id,appId,displayName,appOwnerOrganizationId,servicePrincipalType,publisherName," +
        "verifiedPublisher,accountEnabled&$expand=appRoleAssignments&$top=999"
    ),
    graphFetchAll<RawGrant>(accessToken, "/oauth2PermissionGrants?$top=999"),
  ]);

  const spById = new Map(sps.map((s) => [s.id, s]));

  // Noms des rôles applicatifs des ressources (Microsoft Graph, SharePoint, Exchange…).
  const resourceIds = [...new Set(sps.flatMap((s) => (s.appRoleAssignments ?? []).map((a) => a.resourceId)))].filter(Boolean);
  const resources = await graphBatch<RawResource>(
    accessToken,
    resourceIds.map((id) => ({ id, url: `/servicePrincipals/${id}?$select=id,appRoles` }))
  );
  const roleValue = (resourceId: string, roleId: string): string | null => {
    const r = resources[resourceId];
    if (r?.status !== 200) return null;
    return r.body.appRoles?.find((x) => x.id === roleId)?.value ?? null;
  };
  const resourceName = (id: string, fallback?: string | null) => spById.get(id)?.displayName ?? fallback ?? id;

  // Consentements délégués regroupés par (client, ressource).
  const delegatedByClient = new Map<string, Map<string, { scopes: Set<string>; admin: boolean; users: Set<string> }>>();
  for (const g of grants) {
    const byResource = delegatedByClient.get(g.clientId) ?? new Map();
    delegatedByClient.set(g.clientId, byResource);
    const entry = byResource.get(g.resourceId) ?? { scopes: new Set<string>(), admin: false, users: new Set<string>() };
    byResource.set(g.resourceId, entry);
    (g.scope ?? "").split(" ").filter(Boolean).forEach((s) => entry.scopes.add(s));
    if (g.consentType === "AllPrincipals") entry.admin = true;
    else if (g.principalId) entry.users.add(g.principalId);
  }

  const servicePrincipals: ServicePrincipalAccess[] = [];
  const accessByAppId = new Map<string, ServicePrincipalAccess>();
  for (const sp of sps) {
    const appPermissions: GrantedPermission[] = (sp.appRoleAssignments ?? [])
      .filter((a) => a.appRoleId !== DEFAULT_ROLE_ID)
      .map((a) => {
        const value = roleValue(a.resourceId, a.appRoleId) ?? a.appRoleId;
        return { resource: resourceName(a.resourceId, a.resourceDisplayName), value, risk: permissionRisk(value) };
      });
    const delegated: DelegatedConsent[] = [...(delegatedByClient.get(sp.id) ?? new Map()).entries()].map(
      ([resourceId, e]) => ({
        resource: resourceName(resourceId),
        scopes: [...e.scopes].map((value) => ({ value, risk: permissionRisk(value) })),
        adminConsent: e.admin,
        userCount: e.users.size,
      })
    );
    if (appPermissions.length === 0 && delegated.length === 0) continue;
    const access: ServicePrincipalAccess = {
      id: sp.id,
      appId: sp.appId,
      displayName: sp.displayName ?? sp.appId,
      publisher: publisherKind(sp, tenantId),
      publisherName: sp.publisherName ?? null,
      verifiedPublisher: sp.verifiedPublisher?.displayName ?? null,
      enabled: sp.accountEnabled !== false,
      appPermissions,
      delegated,
      risk: "normal",
      lastSignIn: usage.byAppId.get(sp.appId)?.lastSignIn ?? null,
    };
    access.risk = maxRisk(risksOf(access));
    servicePrincipals.push(access);
    accessByAppId.set(sp.appId, access);
  }

  const federatedById = new Map(federated.map((f) => [f.id, f.federatedIdentityCredentials ?? []]));

  const inventory: AppInventoryItem[] = apps.map((app) => {
    const secrets = app.passwordCredentials ?? [];
    const certs = app.keyCredentials ?? [];
    const all = [
      ...secrets.map((c) => ({ c, type: "secret" as const })),
      ...certs.map((c) => ({ c, type: "certificate" as const })),
    ];
    const uris = [
      ...(app.web?.redirectUris ?? []),
      ...(app.spa?.redirectUris ?? []),
      ...(app.publicClient?.redirectUris ?? []),
    ];
    const access = accessByAppId.get(app.appId);
    const sensitive = access
      ? [...new Set([
          ...access.appPermissions.filter((p) => p.risk !== "normal").map((p) => p.value),
          ...access.delegated.flatMap((d) => d.scopes.filter((s) => s.risk !== "normal").map((s) => s.value)),
        ])]
      : [];
    const activity = usage.supported ? (usage.byAppId.get(app.appId) ?? null) : null;
    const created = app.createdDateTime ?? null;
    return {
      id: app.id,
      appId: app.appId,
      displayName: app.displayName,
      signInAudience: app.signInAudience ?? null,
      createdDateTime: created,
      creator: creators.get(app.id) ?? null,
      owners: (app.owners ?? []).map(toOwner),
      secrets: secrets.length,
      certificates: certs.length,
      expiredCredentials: all.filter(({ c }) => c.endDateTime && new Date(c.endDateTime).getTime() < now).length,
      longLivedCredentials: all.filter(({ c, type }) => isLongLived(type, validityDays(c.startDateTime, c.endDateTime))).length,
      federated: (federatedById.get(app.id) ?? []).map((f) => ({
        name: f.name ?? "",
        issuer: f.issuer ?? "",
        subject: f.subject ?? "",
      })),
      redirectFindings: [...new Set(uris)]
        .map((uri) => ({ uri, issues: redirectUriIssues(uri) }))
        .filter((f) => f.issues.length > 0),
      activity,
      status: appActivityStatus(activity, created, now, usage.supported),
      risk: access?.risk ?? "normal",
      sensitivePermissions: sensitive,
    };
  });

  return {
    usageSupported: usage.supported,
    generatedAt: new Date(now).toISOString(),
    apps: inventory.sort((a, b) => a.displayName.localeCompare(b.displayName, "fr")),
    servicePrincipals: servicePrincipals.sort(
      (a, b) => (b.risk === a.risk ? a.displayName.localeCompare(b.displayName, "fr") : RISK_RANK[b.risk] - RISK_RANK[a.risk])
    ),
  };
}

