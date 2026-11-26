import { graphFetch, graphFetchAll, graphBatch } from "@/lib/graph";
import { listUsers, type M365User } from "@/services/graph/users";
import {
  isMfaMethodType,
  type AdminAssignment,
  type AdminPrincipalType,
  type AdminReportResponse,
  type MfaReportResponse,
  type MfaUserRow,
} from "@/lib/identity-reports";

/** Code HTTP d'une erreur levée par graphFetch (« [403] message »), sinon null. */
function httpStatus(error: unknown): number | null {
  const m = /^\[(\d{3})\]/.exec(error instanceof Error ? error.message : String(error));
  return m ? Number(m[1]) : null;
}

// ── MFA ──────────────────────────────────────────────────────────────

function normalizeUserType(t: string | null | undefined): string | null {
  if (!t) return null;
  const lower = t.toLowerCase();
  return lower === "guest" ? "Guest" : lower === "member" ? "Member" : t;
}

/** Ligne de /reports/authenticationMethods/userRegistrationDetails (champs utilisés). */
interface RegistrationDetail {
  id: string;
  userPrincipalName: string;
  userDisplayName: string;
  userType?: string | null;
  isMfaRegistered: boolean;
  isMfaCapable: boolean;
  isPasswordlessCapable: boolean;
  methodsRegistered: string[];
  userPreferredMethodForSecondaryAuthentication?: string | null;
  lastUpdatedDateTime?: string | null;
}

/**
 * État MFA de tous les comptes.
 *
 * 1. Source principale : rapport Entra « User registration details » (un seul appel paginé).
 *    Requiert AuditLog.Read.All + UserAuthenticationMethod.Read.All, une licence Entra ID P1
 *    et un rôle de lecture des rapports (Lecteur général, Lecteur de rapports, Lecteur sécurité…).
 * 2. Repli (403/400, typiquement tenant sans P1) : méthodes d'authentification lues compte par
 *    compte via $batch, limité aux comptes activés (membres et invités).
 */
export async function getMfaReport(accessToken: string): Promise<MfaReportResponse> {
  const generatedAt = new Date().toISOString();
  const users = await listUsers(accessToken);
  const byId = new Map(users.map((u) => [u.id, u]));

  try {
    const details = await graphFetchAll<RegistrationDetail>(
      accessToken,
      "/reports/authenticationMethods/userRegistrationDetails"
    );
    const rows: MfaUserRow[] = details.map((d) => {
      const u = byId.get(d.id);
      return {
        id: d.id,
        displayName: d.userDisplayName || u?.displayName || d.userPrincipalName,
        userPrincipalName: d.userPrincipalName,
        // Le rapport renvoie « member » / « guest » en minuscules, la liste des comptes « Member » / « Guest » :
        // on aligne sur la liste (valeur de référence pour detectAccountType).
        userType: u?.userType ?? normalizeUserType(d.userType),
        accountEnabled: u ? u.accountEnabled : null,
        mfaRegistered: !!d.isMfaRegistered,
        mfaCapable: !!d.isMfaCapable,
        passwordlessCapable: !!d.isPasswordlessCapable,
        methods: d.methodsRegistered ?? [],
        defaultMethod: d.userPreferredMethodForSecondaryAuthentication ?? null,
        lastUpdated: d.lastUpdatedDateTime ?? null,
      };
    });
    return { supported: true, source: "registrationDetails", users: rows, generatedAt };
  } catch (error) {
    const status = httpStatus(error);
    if (status !== 403 && status !== 400) throw error;
    console.error("[identity-reports] userRegistrationDetails indisponible, repli méthode par méthode");
  }

  return getMfaFromMethods(accessToken, users, generatedAt);
}

async function getMfaFromMethods(
  accessToken: string,
  users: M365User[],
  generatedAt: string
): Promise<MfaReportResponse> {
  // Invités inclus pour le différentiel internes / invités : on lit les méthodes enregistrées
  // DANS CE TENANT (un invité fait souvent son MFA dans son tenant d'origine, voir README).
  const targets = users.filter((u) => u.accountEnabled);
  const responses = await graphBatch<{ value?: Array<Record<string, unknown>> }>(
    accessToken,
    targets.map((u) => ({ id: u.id, url: `/users/${u.id}/authentication/methods` }))
  );

  const statuses = Object.values(responses).map((r) => r.status);
  if (statuses.length > 0 && statuses.every((s) => s === 403)) {
    return {
      supported: false,
      source: null,
      reason:
        "Lecture des méthodes d'authentification refusée : permission UserAuthenticationMethod.Read.All " +
        "(consentement administrateur) ou rôle de lecture (Lecteur général, Administrateur d'authentification) manquant.",
      users: [],
      generatedAt,
    };
  }

  const rows: MfaUserRow[] = [];
  for (const u of targets) {
    const r = responses[u.id];
    if (!r || r.status !== 200) continue; // compte illisible : exclu plutôt que compté sans MFA
    const types = (r.body.value ?? []).map((m) =>
      String(m["@odata.type"] ?? "").replace("#microsoft.graph.", "")
    );
    const methods = types.filter((t) => t !== "passwordAuthenticationMethod");
    rows.push({
      id: u.id,
      displayName: u.displayName,
      userPrincipalName: u.userPrincipalName,
      userType: u.userType,
      accountEnabled: u.accountEnabled,
      mfaRegistered: types.some(isMfaMethodType),
      mfaCapable: null,
      passwordlessCapable: null,
      methods,
      defaultMethod: null,
      lastUpdated: null,
    });
  }
  return { supported: true, source: "methods", users: rows, generatedAt };
}

// ── Comptes administrateurs ─────────────────────────────────────────

interface DirectoryObject {
  "@odata.type"?: string;
  id: string;
  displayName?: string | null;
  userPrincipalName?: string | null;
  accountEnabled?: boolean | null;
}

const MEMBER_SELECT = "$select=id,displayName,userPrincipalName,accountEnabled";

function principalType(o: DirectoryObject): AdminPrincipalType {
  const t = (o["@odata.type"] ?? "").replace("#microsoft.graph.", "");
  if (t === "user" || t === "group" || t === "servicePrincipal") return t;
  return "other";
}

/**
 * Comptes détenant un rôle Entra.
 *
 * - Attributions actives : membres des rôles activés (/directoryRoles), les groupes attribuables
 *   à un rôle étant développés en leurs utilisateurs (colonne « via groupe »).
 * - Attributions éligibles (PIM, Entra ID P2) : best-effort. Sans licence ou sans permission,
 *   `eligibleSupported` vaut false et seules les attributions actives sont listées.
 */
export async function getAdminReport(accessToken: string): Promise<AdminReportResponse> {
  const roles = await graphFetchAll<{ id: string; displayName: string; roleTemplateId: string }>(
    accessToken,
    "/directoryRoles?$select=id,displayName,roleTemplateId"
  );

  // Membres (transitifs, utilisateurs) d'un groupe, mis en cache : un même groupe peut porter plusieurs rôles.
  const groupCache = new Map<string, Promise<DirectoryObject[]>>();
  const groupUsers = (groupId: string) => {
    let p = groupCache.get(groupId);
    if (!p) {
      p = graphFetchAll<DirectoryObject>(
        accessToken,
        `/groups/${encodeURIComponent(groupId)}/transitiveMembers/microsoft.graph.user?${MEMBER_SELECT}`
      ).catch(() => []);
      groupCache.set(groupId, p);
    }
    return p;
  };

  const expand = async (
    o: DirectoryObject,
    role: { displayName: string; roleTemplateId: string },
    kind: AdminAssignment["kind"]
  ): Promise<AdminAssignment[]> => {
    const type = principalType(o);
    const base = {
      roleName: role.displayName,
      roleTemplateId: role.roleTemplateId.toLowerCase(),
      kind,
    };
    const self: AdminAssignment = {
      ...base,
      principalId: o.id,
      principalType: type,
      displayName: o.displayName ?? o.id,
      userPrincipalName: o.userPrincipalName ?? null,
      accountEnabled: type === "user" ? (o.accountEnabled ?? null) : null,
      viaGroup: null,
    };
    if (type !== "group") return [self];
    const members = await groupUsers(o.id);
    return [
      self,
      ...members.map((m) => ({
        ...base,
        principalId: m.id,
        principalType: "user" as const,
        displayName: m.displayName ?? m.id,
        userPrincipalName: m.userPrincipalName ?? null,
        accountEnabled: m.accountEnabled ?? null,
        viaGroup: o.displayName ?? o.id,
      })),
    ];
  };

  const active = (
    await Promise.all(
      roles.map(async (role) => {
        const members = await graphFetchAll<DirectoryObject>(
          accessToken,
          `/directoryRoles/${encodeURIComponent(role.id)}/members?${MEMBER_SELECT}`
        );
        return (await Promise.all(members.map((m) => expand(m, role, "active")))).flat();
      })
    )
  ).flat();

  const { assignments: eligible, supported: eligibleSupported } = await getEligibleAssignments(
    accessToken,
    roles,
    expand
  );

  // Statut du compte depuis la liste des utilisateurs : getByIds ne renvoie pas accountEnabled,
  // et la liste fait foi pour tous les cas.
  const enabledById = new Map((await listUsers(accessToken)).map((u) => [u.id, u.accountEnabled]));
  for (const a of [...active, ...eligible]) {
    if (a.principalType === "user" && enabledById.has(a.principalId)) {
      a.accountEnabled = enabledById.get(a.principalId) ?? null;
    }
  }

  const assignments = [...active, ...eligible].sort(
    (a, b) => a.displayName.localeCompare(b.displayName, "fr") || a.roleName.localeCompare(b.roleName, "fr")
  );
  return { assignments, eligibleSupported, generatedAt: new Date().toISOString() };
}

async function getEligibleAssignments(
  accessToken: string,
  activatedRoles: { displayName: string; roleTemplateId: string }[],
  expand: (
    o: DirectoryObject,
    role: { displayName: string; roleTemplateId: string },
    kind: AdminAssignment["kind"]
  ) => Promise<AdminAssignment[]>
): Promise<{ assignments: AdminAssignment[]; supported: boolean }> {
  let instances: { principalId: string; roleDefinitionId: string }[];
  try {
    // Accept-Language explicite : fetch (Node) envoie « * », que le service PIM rejette
    // (400 CultureNotFoundException).
    instances = await graphFetchAll(
      accessToken,
      "/roleManagement/directory/roleEligibilityScheduleInstances?$select=principalId,roleDefinitionId",
      { headers: { "Accept-Language": "en-US" } }
    );
  } catch (error) {
    const status = httpStatus(error);
    if (status === 403 || status === 400) return { assignments: [], supported: false };
    throw error;
  }
  if (instances.length === 0) return { assignments: [], supported: true };

  // Nom des rôles : les rôles intégrés ont roleDefinitionId = roleTemplateId.
  const roleNames = new Map(activatedRoles.map((r) => [r.roleTemplateId.toLowerCase(), r.displayName]));
  try {
    const defs = await graphFetchAll<{ id: string; displayName: string }>(
      accessToken,
      "/roleManagement/directory/roleDefinitions?$select=id,displayName"
    );
    for (const d of defs) roleNames.set(d.id.toLowerCase(), d.displayName);
  } catch {
    /* noms des rôles non activés indisponibles : l'identifiant est affiché */
  }

  // Résolution des principaux (utilisateurs, groupes, applications) par lots.
  const ids = [...new Set(instances.map((i) => i.principalId))];
  const resolved = new Map<string, DirectoryObject>();
  for (let i = 0; i < ids.length; i += 1000) {
    const data = await graphFetch<{ value: DirectoryObject[] }>(accessToken, "/directoryObjects/getByIds", {
      method: "POST",
      body: JSON.stringify({ ids: ids.slice(i, i + 1000), types: ["user", "group", "servicePrincipal"] }),
    });
    for (const o of data.value ?? []) resolved.set(o.id, o);
  }

  const assignments = (
    await Promise.all(
      instances.map((inst) => {
        const o = resolved.get(inst.principalId) ?? { id: inst.principalId };
        const roleTemplateId = inst.roleDefinitionId.toLowerCase();
        const role = { displayName: roleNames.get(roleTemplateId) ?? roleTemplateId, roleTemplateId };
        return expand(o, role, "eligible");
      })
    )
  ).flat();
  return { assignments, supported: true };
}
