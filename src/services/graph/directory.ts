import { graphFetch, graphFetchAll, escapeODataString } from "@/lib/graph";

export interface DeletedAccount {
  displayName: string;
  userPrincipalName: string | null;
  deletedDateTime: string | null;
}

export interface DeletedUserEntry {
  id: string;
  displayName: string;
  userPrincipalName: string | null;
  sid: string | null;         // securityIdentifier (SID cloud)
  onPremSid: string | null;   // onPremisesSecurityIdentifier (SID on-premise)
  deletedDateTime: string | null;
}

/**
 * Liste la corbeille Azure AD (comptes supprimés, conservés ~30 j avant purge).
 * Best-effort : renvoie [] si la lecture échoue (permission Directory.Read manquante).
 */
export async function listDeletedUsers(accessToken: string): Promise<DeletedUserEntry[]> {
  try {
    const rows = await graphFetchAll<{
      id?: string;
      displayName?: string;
      userPrincipalName?: string;
      deletedDateTime?: string;
      securityIdentifier?: string;
      onPremisesSecurityIdentifier?: string;
    }>(
      accessToken,
      "/directory/deletedItems/microsoft.graph.user?$select=id,displayName,userPrincipalName,deletedDateTime,securityIdentifier,onPremisesSecurityIdentifier&$top=999"
    );
    return rows.map((r) => ({
      id: r.id ?? "",
      displayName: r.displayName || r.userPrincipalName || "Compte supprimé",
      userPrincipalName: r.userPrincipalName ?? null,
      sid: r.securityIdentifier ?? null,
      onPremSid: r.onPremisesSecurityIdentifier ?? null,
      deletedDateTime: r.deletedDateTime ?? null,
    }));
  } catch (e: any) {
    console.error("[directory] corbeille (deletedItems) indisponible:", e?.message);
    throw e;
  }
}

/**
 * Construit une map (SID → compte supprimé) depuis la corbeille Azure AD, pour retrouver le nom
 * d'un compte supprimé encore référencé dans des permissions Exchange (SID orphelin).
 * Best-effort : couvre les comptes supprimés depuis < 30 j (au-delà, purgés).
 */
export async function getDeletedUserSidMap(accessToken: string): Promise<Map<string, DeletedAccount>> {
  const map = new Map<string, DeletedAccount>();
  try {
    const users = await listDeletedUsers(accessToken);
    for (const u of users) {
      const acct: DeletedAccount = {
        displayName: u.displayName,
        userPrincipalName: u.userPrincipalName,
        deletedDateTime: u.deletedDateTime,
      };
      for (const sid of [u.sid, u.onPremSid]) {
        if (sid) map.set(sid.toLowerCase(), acct);
      }
    }
  } catch {
    // best-effort : map vide
  }
  return map;
}

export interface CreatorInfo {
  by: string | null; // UPN ou nom de l'app à l'origine de la création
  at: string | null; // date de l'événement de création
  supported: boolean; // false = permission AuditLog.Read.All manquante (à distinguer d'un objet trop ancien)
}

/**
 * Qui a créé un objet (utilisateur ou groupe), via les journaux d'audit Entra.
 * Best-effort : ces journaux sont conservés ~7 à 30 jours → vide pour les objets anciens.
 * Nécessite le scope AuditLog.Read.All.
 */
export async function getObjectCreator(
  accessToken: string,
  id: string,
  type: "user" | "group"
): Promise<CreatorInfo> {
  const activity = type === "user" ? "Add user" : "Add group";
  const params = new URLSearchParams({
    $filter: `targetResources/any(t:t/id eq '${escapeODataString(id)}') and activityDisplayName eq '${activity}'`,
    $top: "1",
  });
  try {
    const data = await graphFetch<{ value: any[] }>(
      accessToken,
      `/auditLogs/directoryAudits?${params}`
    );
    const event = data.value?.[0];
    // Appel réussi mais aucun événement → objet trop ancien (journaux ~30 j), pas un défaut de permission
    if (!event) return { by: null, at: null, supported: true };
    const by =
      event.initiatedBy?.user?.userPrincipalName ??
      event.initiatedBy?.user?.displayName ??
      event.initiatedBy?.app?.displayName ??
      null;
    return { by, at: event.activityDateTime ?? null, supported: true };
  } catch (error: any) {
    // 403 = permission AuditLog.Read.All manquante → on le signale explicitement à l'UI
    if (String(error?.message ?? "").startsWith("[403]")) {
      return { by: null, at: null, supported: false };
    }
    // Autre erreur (réseau…) → best-effort, on reste discret
    return { by: null, at: null, supported: true };
  }
}
