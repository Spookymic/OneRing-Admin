import type { M365UserGroup } from "@/services/graph/users";

/**
 * Copie des appartenances aux groupes d'un utilisateur vers un autre.
 * Module partagé client/serveur (aucun import serveur).
 */

export type GroupCopyStatus = "added" | "already" | "skipped" | "error";

export interface GroupCopyResult {
  groupId: string;
  groupName: string;
  status: GroupCopyStatus;
  /** Motif (ignoré / erreur) */
  reason?: string;
}

export interface GroupCopyReport {
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  results: GroupCopyResult[];
}

export const GROUP_COPY_STATUS_LABELS: Record<GroupCopyStatus, string> = {
  added: "Ajouté",
  already: "Déjà membre",
  skipped: "Ignoré",
  error: "Erreur",
};

/** Même règle que `isExchangeManagedGroup` (services/graph/groups.ts), sans dépendance serveur. */
export function isExchangeManaged(group: Pick<M365UserGroup, "mailEnabled" | "groupTypes">): boolean {
  return group.mailEnabled && !(group.groupTypes ?? []).includes("Unified");
}

/**
 * Motif pour lequel l'appartenance ne peut pas être copiée, ou null si copiable.
 * - Groupes dynamiques : membres calculés par règle, ajout manuel impossible.
 * - Groupes synchronisés depuis l'AD : membres gérés on-premise.
 */
export function getNonCopyableReason(
  group: Pick<M365UserGroup, "groupTypes" | "onPremisesSyncEnabled">
): string | null {
  if ((group.groupTypes ?? []).includes("DynamicMembership")) {
    return "Groupe dynamique (appartenance calculée par règle)";
  }
  if (group.onPremisesSyncEnabled === true) {
    return "Groupe synchronisé depuis l'AD on-premise";
  }
  return null;
}
