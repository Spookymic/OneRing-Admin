import { bridgeFetch } from "./client";

export interface ForwardRecipient {
  id?: string | null;
  displayName: string;
  mail: string;
  recipientType?: string;
}

/** Type d'action d'une règle de boîte de réception qui fait sortir le message. */
export type InboxRuleForwardKind = "ForwardTo" | "ForwardAsAttachmentTo" | "RedirectTo";

export interface MailboxForward {
  forwardingAddress: ForwardRecipient | null; // destinataire de l'annuaire (ForwardingAddress)
  forwardingSmtpAddress: string | null;       // adresse SMTP libre, souvent externe (ForwardingSmtpAddress)
  deliverToMailboxAndForward: boolean;        // conserve une copie dans la boîte
}

export interface OutgoingRuleForward {
  ruleName: string;
  enabled: boolean;
  kind: InboxRuleForwardKind;
  target: ForwardRecipient;
}

export interface IncomingMailboxForward {
  source: ForwardRecipient;
  via: "forwardingAddress" | "forwardingSmtpAddress";
  deliverToMailboxAndForward: boolean;
}

export interface IncomingRuleForward {
  source: ForwardRecipient;
  ruleName: string;
  enabled: boolean;
  kind: InboxRuleForwardKind;
}

export interface TransportRuleForward {
  name: string;
  state: string; // Enabled | Disabled
  mode: string;  // Enforce | Audit | AuditAndNotify
  direction: "incoming" | "outgoing";
  sentTo: string[];
  from: string[];
  targets: { action: string; displayName: string; mail: string }[];
}

export interface MailForwardingReport {
  account: ForwardRecipient & { hasMailbox: boolean };
  outgoing: { mailbox: MailboxForward | null; rules: OutgoingRuleForward[] };
  incoming: {
    mailbox: IncomingMailboxForward[];
    rules: IncomingRuleForward[];
    rulesScanned: boolean;
    scannedMailboxes: number;
  };
  transportRules: TransportRuleForward[];
}

/**
 * Redirections de messagerie configurées depuis et vers un compte.
 * scanRules = parcourt les règles de boîte de TOUTES les boîtes du tenant (lent).
 */
export async function getMailForwarding(account: string, scanRules: boolean): Promise<MailForwardingReport> {
  const qs = new URLSearchParams({ mailbox: account });
  if (scanRules) qs.set("scanRules", "1");
  const data = await bridgeFetch<Partial<MailForwardingReport> & { ok?: boolean }>(`/mailbox/forwarding?${qs}`);
  return {
    account: data.account ?? { displayName: account, mail: account, hasMailbox: false },
    outgoing: {
      mailbox: data.outgoing?.mailbox ?? null,
      rules: data.outgoing?.rules ?? [],
    },
    incoming: {
      mailbox: data.incoming?.mailbox ?? [],
      rules: data.incoming?.rules ?? [],
      rulesScanned: data.incoming?.rulesScanned ?? false,
      scannedMailboxes: data.incoming?.scannedMailboxes ?? 0,
    },
    transportRules: data.transportRules ?? [],
  };
}
