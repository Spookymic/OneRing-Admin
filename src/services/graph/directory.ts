import { graphFetch, graphFetchAll, escapeODataString } from "@/lib/graph";

export interface DeletedAccount {
  displayName: string;
  userPrincipalName: string | null;
  deletedDateTime: string | null;
}

/**
 * Construit une map (SID → compte supprimé) depuis la corbeille Azure AD (deletedItems).
 * Permet de retrouver le nom d'un compte supprimé encore référencé dans des permissions
 * Exchange (SID orphelin). Best-effort : ne couvre que les comptes supprimés depuis < 30 j
 * (au-delà ils sont purgés). Indexé par `securityIdentifier` et `onPremisesSecurityIdentifier`.
 */
export async function getDeletedUserSidMap(accessToken: string): Promise<Map<string, DeletedAccount>> {
  const map = new Map<string, DeletedAccount>();
  try {
    const rows = await graphFetchAll<{
      displayName?: string;
      userPrincipalName?: string;
      deletedDateTime?: string;
      securityIdentifier?: string;
      onPremisesSecurityIdentifier?: string;
    }>(
      accessToken,
      "/directory/deletedItems/microsoft.graph.user?$select=displayName,userPrincipalName,deletedDateTime,securityIdentifier,onPremisesSecurityIdentifier&$top=999"
    );
    for (const r of rows) {
      const acct: DeletedAccount = {
        displayName: r.displayName || r.userPrincipalName || "Compte supprimé",
        userPrincipalName: r.userPrincipalName ?? null,
        deletedDateTime: r.deletedDateTime ?? null,
      };
      for (const sid of [r.securityIdentifier, r.onPremisesSecurityIdentifier]) {
        if (sid) map.set(sid.toLowerCase(), acct);
      }
    }
  } catch (e: any) {
    console.error("[directory] corbeille (deletedItems) indisponible:", e?.message);
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
