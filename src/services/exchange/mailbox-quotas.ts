import { bridgeFetch } from "./client";

export interface MailboxQuota {
  upn: string;
  smtp: string;
  bytes: number; // ProhibitSendReceiveQuota en octets (0 = illimité/inconnu)
}

/**
 * Récupère le quota réel (ProhibitSendReceiveQuota) de toutes les boîtes en un seul
 * appel au pont Exchange. À utiliser pour corriger le quota du rapport Graph (souvent 50 Go).
 */
export async function getMailboxQuotas(): Promise<MailboxQuota[]> {
  const data = await bridgeFetch<{ ok: boolean; quotas: MailboxQuota[] }>("/mailbox-quotas");
  return data.quotas ?? [];
}
