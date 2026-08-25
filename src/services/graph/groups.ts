import { graphFetch, graphFetchAll } from "@/lib/graph";

export type GroupType = "unified" | "distribution" | "security" | "sharedMailbox";

export interface M365Group {
  id: string;
  displayName: string;
  description: string | null;
  mail: string | null;
  groupTypes: string[];
  mailEnabled: boolean;
  securityEnabled: boolean;
  membershipRule: string | null;
  /** Propriétaire Exchange pour les listes de distribution classiques */
  managedBy?: Array<{ id: string; displayName: string; userPrincipalName?: string }> | null;
  /** Modération : seuls les expéditeurs authentifiés peuvent écrire */
  requireSenderAuthenticationEnabled?: boolean | null;
  /** M365 groups : empêcher les membres externes d'envoyer */
  allowExternalSenders?: boolean | null;
  /** Contient "Team" si le groupe M365 est aussi une équipe Teams */
  resourceProvisioningOptions?: string[];
  /** Date de création du groupe */
  createdDateTime?: string | null;
  /** Vrai si le groupe est synchronisé depuis l'AD on-premise */
  onPremisesSyncEnabled?: boolean | null;
}

function detectGroupType(group: M365Group): GroupType {
  if (group.groupTypes?.includes("Unified")) return "unified";
  if (group.mailEnabled && !group.securityEnabled) return "distribution";
  if (group.mailEnabled && group.securityEnabled) return "security";
  return "security";
}

/**
 * Vrai si la gestion des membres relève d'Exchange (et non de Graph) : listes de
 * distribution classiques et groupes de sécurité à extension de messagerie.
 * Les groupes Microsoft 365 (Unified) et les groupes de sécurité purs restent sur Graph.
 */
export function isExchangeManagedGroup(group: Pick<M365Group, "mailEnabled" | "groupTypes">): boolean {
  return group.mailEnabled && !(group.groupTypes ?? []).includes("Unified");
}

// SELECT réduit pour la liste (certains champs ne sont pas supportés en OData $filter sur tous les groupes)
const LIST_SELECT =
  "id,displayName,description,mail,groupTypes,mailEnabled,securityEnabled,membershipRule,resourceProvisioningOptions,createdDateTime,onPremisesSyncEnabled";

// SELECT complet pour le détail d'un groupe
const DETAIL_SELECT =
  "id,displayName,description,mail,groupTypes,mailEnabled,securityEnabled," +
  "membershipRule,requireSenderAuthenticationEnabled,allowExternalSenders";

export async function listGroups(accessToken: string): Promise<(M365Group & { type: GroupType })[]> {
  const params = new URLSearchParams({
    $select: LIST_SELECT,
    $top: "999",
  });
  const value = await graphFetchAll<M365Group>(accessToken, `/groups?${params}`);
  return value
    .map((g) => ({ ...g, type: detectGroupType(g) }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getGroup(
  accessToken: string,
  groupId: string
): Promise<M365Group & { type: GroupType }> {
  const group = await graphFetch<M365Group>(
    accessToken,
    `/groups/${encodeURIComponent(groupId)}?$select=${DETAIL_SELECT}`
  );
  return { ...group, type: detectGroupType(group) };
}

/**
 * Variante légère pour les mutations : `$select` sans propriétés Exchange
 * (`allowExternalSenders`, `requireSenderAuthenticationEnabled`) qui déclenchent une
 * erreur « mailbox hosted on-premise » sur les listes de distribution.
 */
// Champs nécessaires pour qualifier un groupe dans l'arborescence (type + flag Teams)
const RELATION_SELECT =
  "id,displayName,mail,groupTypes,mailEnabled,securityEnabled,resourceProvisioningOptions";

/** Groupes membres de ce groupe (imbrication descendante), via Graph. */
export async function listSubgroups(
  accessToken: string,
  groupId: string
): Promise<(M365Group & { type: GroupType })[]> {
  const value = await graphFetchAll<M365Group>(
    accessToken,
    `/groups/${encodeURIComponent(groupId)}/members/microsoft.graph.group?$select=${RELATION_SELECT}&$top=999`
  );
  return value.map((g) => ({ ...g, type: detectGroupType(g) }));
}

/** Groupes dont ce groupe est membre (vue inversée « membre de »), via Graph. */
export async function listParentGroups(
  accessToken: string,
  groupId: string
): Promise<(M365Group & { type: GroupType })[]> {
  const value = await graphFetchAll<M365Group>(
    accessToken,
    `/groups/${encodeURIComponent(groupId)}/memberOf/microsoft.graph.group?$select=${RELATION_SELECT}&$top=999`
  );
  return value.map((g) => ({ ...g, type: detectGroupType(g) }));
}

export async function getGroupBasic(
  accessToken: string,
  groupId: string
): Promise<M365Group & { type: GroupType }> {
  const group = await graphFetch<M365Group>(
    accessToken,
    `/groups/${encodeURIComponent(groupId)}?$select=${LIST_SELECT}`
  );
  return { ...group, type: detectGroupType(group) };
}

const MEMBER_SELECT = "id,displayName,userPrincipalName,mail,jobTitle";
// Select minimal valide pour tous les types d'objets annuaire (user, contact, servicePrincipal)
const OWNER_SELECT = "id,displayName,mail";

export async function listGroupMembers(accessToken: string, groupId: string): Promise<any[]> {
  // graphFetchAll suit @odata.nextLink : sinon Graph plafonne à ~100 membres par page.
  return graphFetchAll<any>(
    accessToken,
    `/groups/${encodeURIComponent(groupId)}/members/microsoft.graph.user?$select=${MEMBER_SELECT}&$top=999`
  );
}

export interface ReportMember {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string | null;
  /** Utilisateur / Contact / Groupe / … (dérivé de @odata.type) */
  kind: string;
}

function kindFromODataType(t: string | undefined): string {
  switch (t) {
    case "#microsoft.graph.user": return "Utilisateur";
    case "#microsoft.graph.group": return "Groupe";
    case "#microsoft.graph.orgContact": return "Contact";
    case "#microsoft.graph.device": return "Appareil";
    case "#microsoft.graph.servicePrincipal": return "Principal de service";
    default: return t?.replace("#microsoft.graph.", "") ?? "Objet";
  }
}

/**
 * Membres d'un groupe/DL, tous types confondus (utilisateurs, contacts de messagerie,
 * groupes imbriqués). Enrichit l'UPN pour les utilisateurs. Pensé pour les rapports.
 */
export async function listGroupMembersDetailed(accessToken: string, groupId: string): Promise<ReportMember[]> {
  const id = encodeURIComponent(groupId);
  let all: any[];
  try {
    // Sélection minimale valable pour tous les types d'objets annuaire.
    all = await graphFetchAll<any>(accessToken, `/groups/${id}/members?$select=id,displayName,mail&$top=999`);
  } catch {
    // Repli : au moins les utilisateurs (cast) si la requête mixte échoue sur le tenant.
    all = await graphFetchAll<any>(
      accessToken,
      `/groups/${id}/members/microsoft.graph.user?$select=${MEMBER_SELECT}&$top=999`
    );
  }
  // UPN des membres de type utilisateur (le cast permet de sélectionner userPrincipalName).
  const upnById = new Map<string, string>();
  try {
    const users = await graphFetchAll<any>(
      accessToken,
      `/groups/${id}/members/microsoft.graph.user?$select=id,userPrincipalName&$top=999`
    );
    for (const u of users) if (u.userPrincipalName) upnById.set(u.id, u.userPrincipalName);
  } catch { /* pas d'UPN si indisponible */ }

  return all.map((m) => ({
    id: m.id,
    displayName: m.displayName ?? "",
    mail: m.mail ?? null,
    userPrincipalName: upnById.get(m.id) ?? m.userPrincipalName ?? null,
    kind: kindFromODataType(m["@odata.type"]),
  }));
}

export async function listGroupOwners(accessToken: string, groupId: string): Promise<any[]> {
  try {
    // Utilise /owners sans cast microsoft.graph.user pour inclure DL et groupes de sécurité.
    // Select réduit à id,displayName,mail car userPrincipalName/jobTitle n'existent pas sur les non-utilisateurs.
    return await graphFetchAll<any>(
      accessToken,
      `/groups/${encodeURIComponent(groupId)}/owners?$select=${OWNER_SELECT}&$top=999`
    );
  } catch {
    return [];
  }
}

export async function addGroupMember(
  accessToken: string,
  groupId: string,
  userId: string
): Promise<void> {
  await graphFetch(accessToken, `/groups/${encodeURIComponent(groupId)}/members/$ref`, {
    method: "POST",
    body: JSON.stringify({
      "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${userId}`,
    }),
  });
}

export async function addGroupOwner(
  accessToken: string,
  groupId: string,
  userId: string
): Promise<void> {
  await graphFetch(accessToken, `/groups/${encodeURIComponent(groupId)}/owners/$ref`, {
    method: "POST",
    body: JSON.stringify({
      "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${userId}`,
    }),
  });
}

export async function removeGroupMember(
  accessToken: string,
  groupId: string,
  userId: string
): Promise<void> {
  await graphFetch(accessToken, `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}/$ref`, {
    method: "DELETE",
  });
}

export async function removeGroupOwner(
  accessToken: string,
  groupId: string,
  userId: string
): Promise<void> {
  await graphFetch(accessToken, `/groups/${encodeURIComponent(groupId)}/owners/${encodeURIComponent(userId)}/$ref`, {
    method: "DELETE",
  });
}

/** Récupère le nombre de membres et d'owners pour chaque groupe via l'API $batch de Graph. */
export async function listGroupCounts(
  accessToken: string,
  groupIds: string[]
): Promise<Record<string, { memberCount: number; ownerCount: number }>> {
  const results: Record<string, { memberCount: number; ownerCount: number }> = {};
  if (groupIds.length === 0) return results;

  // $batch : max 20 requêtes. Chaque groupe = 2 requêtes (membres + owners). Taille de chunk = 10.
  const chunkSize = 10;
  for (let i = 0; i < groupIds.length; i += chunkSize) {
    const chunk = groupIds.slice(i, i + chunkSize);
    const requests = chunk.flatMap((id, j) => [
      {
        id: `m${i + j}`,
        method: "GET",
        url: `/groups/${encodeURIComponent(id)}/members/$count`,
        headers: { ConsistencyLevel: "eventual" },
      },
      {
        id: `o${i + j}`,
        method: "GET",
        url: `/groups/${encodeURIComponent(id)}/owners/$count`,
        headers: { ConsistencyLevel: "eventual" },
      },
    ]);

    try {
      const data = await graphFetch<{ responses: Array<{ id: string; status: number; body: unknown }> }>(
        accessToken,
        "/$batch",
        { method: "POST", body: JSON.stringify({ requests }) }
      );
      chunk.forEach((id, j) => {
        const memberResp = data.responses.find((r) => r.id === `m${i + j}`);
        const ownerResp = data.responses.find((r) => r.id === `o${i + j}`);
        results[id] = {
          memberCount: memberResp?.status === 200 ? Number(memberResp.body) : 0,
          ownerCount: ownerResp?.status === 200 ? Number(ownerResp.body) : 0,
        };
      });
    } catch {
      chunk.forEach((id) => { results[id] = { memberCount: 0, ownerCount: 0 }; });
    }
  }
  return results;
}

export async function createGroup(
  accessToken: string,
  data: {
    displayName: string;
    description?: string;
    groupType: "unified" | "security" | "distribution";
    mailNickname: string;
  }
): Promise<M365Group> {
  const isUnified = data.groupType === "unified";
  const isDistribution = data.groupType === "distribution";
  const body = {
    displayName: data.displayName,
    description: data.description ?? "",
    mailNickname: data.mailNickname,
    groupTypes: isUnified ? ["Unified"] : [],
    mailEnabled: isUnified || isDistribution,
    securityEnabled: !isDistribution,
  };
  return graphFetch<M365Group>(accessToken, "/groups", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
