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
