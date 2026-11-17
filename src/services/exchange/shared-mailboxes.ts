import { bridgeFetch } from "./client";
import type { SharedMailboxIndexStatus, UserMailboxAccess } from "@/lib/mailbox-access";

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

/**
 * Boîtes partagées sur lesquelles chaque utilisateur (UPN) détient une délégation directe.
 *
 * Le pont s'appuie sur un index des délégations construit par tranches (~8 s par appel) : tant que
 * `ready` est faux, `access` est absent et il faut rappeler (chaque appel fait avancer l'index).
 * Une fois prêt, l'index est servi instantanément et reconstruit en tâche de fond après 30 min
 * (`building` = vrai pendant la reconstruction, les données précédentes restent servies).
 * Clé de `access` : l'UPN tel que transmis.
 */
export async function getUsersSharedMailboxAccess(
  users: string[],
  refresh = false
): Promise<SharedMailboxIndexStatus & { access?: Record<string, UserMailboxAccess[]> }> {
  const qs = new URLSearchParams({ users: users.join(",") });
  if (refresh) qs.set("refresh", "1");
  const data = await bridgeFetch<
    Partial<SharedMailboxIndexStatus> & { access?: Record<string, UserMailboxAccess[]>; [key: string]: unknown }
  >(`/mailbox/user-access?${qs}`);
  const status: SharedMailboxIndexStatus = {
    ready: !!data.ready,
    building: !!data.building,
    done: data.done ?? 0,
    total: data.total ?? 0,
    builtAt: data.builtAt ?? null,
    failed: data.failed ?? 0,
  };
  if (!data.access) return status;
  const access: Record<string, UserMailboxAccess[]> = {};
  for (const u of users) {
    access[u] = [...(data.access[u] ?? [])].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return { ...status, access };
}

/**
 * Variante bloquante (usage serveur, ex. copie) : rappelle le pont jusqu'à ce que l'index soit prêt.
 * Lève une erreur si l'index n'est pas prêt après `maxMs`.
 */
export async function waitForUsersSharedMailboxAccess(
  users: string[],
  maxMs = 240_000
): Promise<Record<string, UserMailboxAccess[]>> {
  const deadline = Date.now() + maxMs;
  for (;;) {
    const res = await getUsersSharedMailboxAccess(users);
    if (res.ready && res.access) return res.access;
    if (Date.now() > deadline) {
      throw new Error(
        `Analyse des boîtes partagées en cours (${res.done}/${res.total}) — réessayez dans quelques instants.`
      );
    }
  }
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
