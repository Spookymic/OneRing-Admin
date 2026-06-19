import { bridgeFetch } from "./client";

/**
 * Ajoute ou retire un membre d'une liste de distribution / groupe à extension de
 * messagerie via le pont Exchange Online (cmdlets non couvertes par Microsoft Graph).
 *
 * @param groupSmtp  Adresse SMTP principale de la liste (identité Exchange)
 * @param member     UPN ou adresse SMTP du membre
 */
export async function setDistributionGroupMember(params: {
  groupSmtp: string;
  member: string;
  action: "add" | "remove";
}): Promise<void> {
  await bridgeFetch("/dl/members", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface ExoMember {
  id: string | null;
  displayName: string;
  mail: string;
  recipientTypeDetails: string;
  isGroup: boolean;
}

/** Liste typée des membres d'une DL (utilisée pour l'imbrication de l'arborescence). */
export async function listDistributionGroupMembers(groupSmtp: string): Promise<ExoMember[]> {
  const data = await bridgeFetch<{ members?: ExoMember[] }>(
    `/dl/members?group=${encodeURIComponent(groupSmtp)}`
  );
  return data.members ?? [];
}

export interface ExoOwner {
  id: string;
  displayName: string;
  mail: string;
}

/** Lit les propriétaires (ManagedBy) d'une liste de distribution. */
export async function listDistributionGroupOwners(groupSmtp: string): Promise<ExoOwner[]> {
  const data = await bridgeFetch<{ owners?: ExoOwner[] }>(
    `/dl/owners?group=${encodeURIComponent(groupSmtp)}`
  );
  return data.owners ?? [];
}

/** Ajoute ou retire un propriétaire (ManagedBy) d'une liste de distribution. */
export async function setDistributionGroupOwner(params: {
  groupSmtp: string;
  member: string;
  action: "add" | "remove";
}): Promise<void> {
  await bridgeFetch("/dl/owners", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface CreatedDistributionGroup {
  id: string;
  displayName: string;
  mail: string;
}

/** Crée une vraie liste de distribution (New-DistributionGroup). */
export async function createDistributionGroup(params: {
  displayName: string;
  alias: string;
}): Promise<CreatedDistributionGroup> {
  const data = await bridgeFetch<{ group: CreatedDistributionGroup }>("/dl", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return data.group;
}
