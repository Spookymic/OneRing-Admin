import { graphFetch } from "@/lib/graph";

export interface CreatorInfo {
  by: string | null; // UPN ou nom de l'app à l'origine de la création
  at: string | null; // date de l'événement de création
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
    $filter: `targetResources/any(t:t/id eq '${id}') and activityDisplayName eq '${activity}'`,
    $top: "1",
  });
  try {
    const data = await graphFetch<{ value: any[] }>(
      accessToken,
      `/auditLogs/directoryAudits?${params}`
    );
    const event = data.value?.[0];
    if (!event) return { by: null, at: null };
    const by =
      event.initiatedBy?.user?.userPrincipalName ??
      event.initiatedBy?.user?.displayName ??
      event.initiatedBy?.app?.displayName ??
      null;
    return { by, at: event.activityDateTime ?? null };
  } catch {
    // Pas de droit d'audit ou objet trop ancien → information indisponible
    return { by: null, at: null };
  }
}
