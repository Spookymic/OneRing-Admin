import { bridgeFetch } from "./client";

export interface SharedMailbox {
  id: string;
  displayName: string;
  mail: string;
}

export interface MailboxDelegate {
  id: string | null;
  displayName: string;
  mail: string;
  orphan?: boolean;            // true = compte supprimé encore référencé (SID non résolu)
  deletedName?: string | null; // nom retrouvé dans la corbeille Azure (best-effort)
  deletedDate?: string | null; // date de suppression (corbeille)
}

export type DelegationType = "fullAccess" | "sendAs" | "sendOnBehalf";

export interface MailboxPermissions {
  fullAccess: MailboxDelegate[];
  sendAs: MailboxDelegate[];
  sendOnBehalf: MailboxDelegate[];
}

/** Liste les boîtes aux lettres partagées. */
export async function listSharedMailboxes(): Promise<SharedMailbox[]> {
  const data = await bridgeFetch<{ mailboxes?: SharedMailbox[] }>("/mailbox/shared");
  return data.mailboxes ?? [];
}

/** Crée une boîte aux lettres partagée (New-Mailbox -Shared). */
export async function createSharedMailbox(params: {
  displayName: string;
  alias: string;
}): Promise<SharedMailbox> {
  const data = await bridgeFetch<{ mailbox: SharedMailbox }>("/mailbox/shared", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return data.mailbox;
}

/** Convertit une boîte utilisateur en boîte partagée (offboarding). */
export async function convertToSharedMailbox(mailbox: string): Promise<void> {
  await bridgeFetch("/mailbox/convert-to-shared", {
    method: "POST",
    body: JSON.stringify({ mailbox }),
  });
}

/** Lit les délégations (Accès complet, Envoyer en tant que, Envoyer de la part de). */
export async function listMailboxPermissions(mailbox: string): Promise<MailboxPermissions> {
  const data = await bridgeFetch<{ fullAccess?: MailboxDelegate[]; sendAs?: MailboxDelegate[]; sendOnBehalf?: MailboxDelegate[] }>(
    `/mailbox/permissions?mailbox=${encodeURIComponent(mailbox)}`
  );
  return {
    fullAccess: data.fullAccess ?? [],
    sendAs: data.sendAs ?? [],
    sendOnBehalf: data.sendOnBehalf ?? [],
  };
}

export interface RawOrphanDelegation {
  mailbox: string;
  mailboxMail: string;
  type: DelegationType;
  sid: string;
}

/** Scan global (un seul appel pont) des délégations orphelines sur toutes les boîtes partagées. */
export async function listOrphanDelegations(): Promise<RawOrphanDelegation[]> {
  const data = await bridgeFetch<{ orphans?: RawOrphanDelegation[] }>("/mailbox/orphan-delegations");
  return data.orphans ?? [];
}

/** Ajoute ou retire une délégation d'un type donné. */
export async function setMailboxPermission(params: {
  mailbox: string;
  member: string;
  type: DelegationType;
  action: "add" | "remove";
}): Promise<void> {
  await bridgeFetch("/mailbox/permissions", {
    method: "POST",
    body: JSON.stringify(params),
  });
}
