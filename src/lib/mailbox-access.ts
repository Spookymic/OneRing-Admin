/**
 * Accès d'un utilisateur aux boîtes partagées (délégations directes) et copie vers un autre utilisateur.
 * Module partagé client/serveur (aucun import serveur).
 */

import type { GroupCopyStatus } from "@/lib/group-copy";

export type MailboxDelegationType = "fullAccess" | "sendAs" | "sendOnBehalf";

export const DELEGATION_TYPES: MailboxDelegationType[] = ["fullAccess", "sendAs", "sendOnBehalf"];

export const DELEGATION_LABELS: Record<MailboxDelegationType, string> = {
  fullAccess: "Accès complet",
  sendAs: "Envoyer en tant que",
  sendOnBehalf: "Envoyer de la part de",
};

/** Une boîte partagée sur laquelle l'utilisateur dispose d'au moins une délégation. */
export interface UserMailboxAccess {
  id: string;
  displayName: string;
  mail: string;
  fullAccess: boolean;
  sendAs: boolean;
  sendOnBehalf: boolean;
}

/** État de l'index des délégations côté pont Exchange (construit par tranches, mis en cache 30 min). */
export interface SharedMailboxIndexStatus {
  /** Données disponibles (index complet au moins une fois) */
  ready: boolean;
  /** (Re)construction en cours — `done`/`total` donnent la progression */
  building: boolean;
  done: number;
  total: number;
  /** Date (ISO) de l'index servi */
  builtAt: string | null;
  /** Boîtes dont les permissions n'ont pas pu être lues */
  failed: number;
}

/** Réponse de GET /api/users/[id]/shared-mailboxes : `mailboxes` absent tant que l'index n'est pas prêt. */
export interface UserSharedMailboxesResponse extends SharedMailboxIndexStatus {
  mailboxes?: UserMailboxAccess[];
}

export interface MailboxCopyResult {
  mailbox: string;
  mailboxName: string;
  type: MailboxDelegationType;
  status: GroupCopyStatus;
  reason?: string;
}

export interface MailboxCopyReport {
  targetId: string;
  targetName: string;
  results: MailboxCopyResult[];
}

/** Délégations détenues sur une boîte. */
export function delegationsOf(access: UserMailboxAccess): MailboxDelegationType[] {
  return DELEGATION_TYPES.filter((t) => access[t]);
}
