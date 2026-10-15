"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Search, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader } from "@/components/ui/loader";
import { ExportButton } from "@/components/ui/export-button";
import { apiFetch } from "@/lib/api";
import type { M365User } from "@/services/graph/users";
import type {
  InboxRuleForwardKind,
  MailForwardingReport,
} from "@/services/exchange/forwarding";

const RULE_KIND_LABELS: Record<InboxRuleForwardKind, string> = {
  ForwardTo: "Transférer à",
  ForwardAsAttachmentTo: "Transférer en pièce jointe",
  RedirectTo: "Rediriger vers",
};

const TRANSPORT_ACTION_LABELS: Record<string, string> = {
  RedirectMessageTo: "Rediriger vers",
  BlindCopyTo: "Copie cachée à",
  CopyTo: "Copie à",
  AddToRecipients: "Ajouter le destinataire",
};

/** Ligne à plat pour l'export Excel. */
type ExportRow = {
  sens: string;
  mecanisme: string;
  source: string;
  cible: string;
  regle: string;
  etat: string;
  copie: string;
};

function toExportRows(r: MailForwardingReport): ExportRow[] {
  const acc = r.account.mail;
  const rows: ExportRow[] = [];
  const fwd = r.outgoing.mailbox;
  if (fwd?.forwardingAddress) {
    rows.push({ sens: "Sortant", mecanisme: "Transfert boîte (ForwardingAddress)", source: acc, cible: fwd.forwardingAddress.mail, regle: "", etat: "Actif", copie: fwd.deliverToMailboxAndForward ? "Oui" : "Non" });
  }
  if (fwd?.forwardingSmtpAddress) {
    rows.push({ sens: "Sortant", mecanisme: "Transfert boîte (ForwardingSmtpAddress)", source: acc, cible: fwd.forwardingSmtpAddress, regle: "", etat: "Actif", copie: fwd.deliverToMailboxAndForward ? "Oui" : "Non" });
  }
  for (const x of r.outgoing.rules) {
    rows.push({ sens: "Sortant", mecanisme: `Règle de boîte — ${RULE_KIND_LABELS[x.kind]}`, source: acc, cible: x.target.mail, regle: x.ruleName, etat: x.enabled ? "Active" : "Désactivée", copie: x.kind === "RedirectTo" ? "Non" : "Oui" });
  }
  for (const x of r.incoming.mailbox) {
    rows.push({ sens: "Entrant", mecanisme: `Transfert boîte (${x.via === "forwardingAddress" ? "ForwardingAddress" : "ForwardingSmtpAddress"})`, source: x.source.mail, cible: acc, regle: "", etat: "Actif", copie: x.deliverToMailboxAndForward ? "Oui" : "Non" });
  }
  for (const x of r.incoming.rules) {
    rows.push({ sens: "Entrant", mecanisme: `Règle de boîte — ${RULE_KIND_LABELS[x.kind]}`, source: x.source.mail, cible: acc, regle: x.ruleName, etat: x.enabled ? "Active" : "Désactivée", copie: x.kind === "RedirectTo" ? "Non" : "Oui" });
  }
  for (const t of r.transportRules) {
    for (const tg of t.targets) {
      rows.push({
        sens: t.direction === "incoming" ? "Entrant" : "Sortant",
        mecanisme: `Règle de flux — ${TRANSPORT_ACTION_LABELS[tg.action] ?? tg.action}`,
        source: [...t.from, ...t.sentTo].join(", ") || "(conditions diverses)",
        cible: tg.mail,
        regle: t.name,
        etat: t.state === "Enabled" ? `Active (${t.mode})` : "Désactivée",
        copie: tg.action === "RedirectMessageTo" ? "Non" : "Oui",
      });
    }
  }
  return rows;
}

function StateBadge({ enabled }: { enabled: boolean }) {
  return enabled
    ? <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">Active</Badge>
    : <Badge variant="outline" className="text-foreground/50">Désactivée</Badge>;
}

function CopyBadge({ keep }: { keep: boolean }) {
  return keep
    ? <Badge variant="outline">Copie conservée</Badge>
    : <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">Sans copie locale</Badge>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-foreground/50 py-2">{children}</p>;
}

export default function MailForwardingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initial = searchParams.get("account") ?? "";

  const [input, setInput] = useState(initial);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [scanRules, setScanRules] = useState(false);
  const [query, setQuery] = useState<{ account: string; scanRules: boolean } | null>(
    initial ? { account: initial, scanRules: false } : null
  );

  const { data: users } = useQuery<M365User[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<M365User[]>("/api/users"),
  });

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!users || q.length < 2) return [];
    return users
      .filter((u) => u.mail && (
        u.displayName.toLowerCase().includes(q) ||
        u.userPrincipalName.toLowerCase().includes(q) ||
        u.mail.toLowerCase().includes(q)
      ))
      .slice(0, 8);
  }, [users, input]);

  const { data: report, isFetching, error } = useQuery<MailForwardingReport>({
    queryKey: ["mail-forwarding", query?.account, query?.scanRules],
    queryFn: () => {
      const qs = new URLSearchParams({ account: query!.account, scanRules: query!.scanRules ? "1" : "0" });
      return apiFetch<MailForwardingReport>(`/api/mailboxes/forwarding?${qs}`);
    },
    enabled: query !== null,
    retry: false,
    staleTime: 60_000,
  });

  function run(account: string) {
    const a = account.trim();
    if (!a) return;
    setInput(a);
    setSuggestOpen(false);
    setQuery({ account: a, scanRules });
    router.replace(`/dashboard/mail-forwarding?account=${encodeURIComponent(a)}`);
  }

  const errorMessage = error
    ? (error as Error).message === "exchange_forbidden"
      ? "Un rôle Exchange Administrator (ou Global Administrator) est requis pour lire les redirections."
      : (error as Error).message
    : null;

  const outgoingCount = report
    ? (report.outgoing.mailbox?.forwardingAddress ? 1 : 0) +
      (report.outgoing.mailbox?.forwardingSmtpAddress ? 1 : 0) +
      report.outgoing.rules.length
    : 0;
  const incomingCount = report ? report.incoming.mailbox.length + report.incoming.rules.length : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Redirections mail</h2>
        <ExportButton
          fileBase={`onering-redirections-${report?.account.mail ?? "compte"}`}
          disabled={!report}
          sheets={() => [{
            name: "Redirections",
            columns: [
              { header: "Sens", key: "sens", width: 10 },
              { header: "Mécanisme", key: "mecanisme", width: 42 },
              { header: "Source", key: "source", width: 36 },
              { header: "Cible", key: "cible", width: 36 },
              { header: "Règle", key: "regle", width: 30 },
              { header: "État", key: "etat", width: 18 },
              { header: "Copie conservée", key: "copie", width: 16 },
            ],
            rows: report ? toExportRows(report) : [],
          }]}
        />
      </div>

      <form
        className="flex flex-wrap items-center gap-3 mb-6"
        onSubmit={(e) => { e.preventDefault(); run(input); }}
      >
        <div className="relative w-full max-w-md">
          <Input
            placeholder="Nom, UPN ou adresse mail du compte..."
            value={input}
            onChange={(e) => { setInput(e.target.value); setSuggestOpen(true); }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
          />
          {suggestOpen && suggestions.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md max-h-72 overflow-auto">
              {suggestions.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-foreground/5"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => run(u.mail ?? u.userPrincipalName)}
                  >
                    <div className="text-sm font-medium">{u.displayName}</div>
                    <div className="text-xs text-foreground/50">{u.mail}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground/70 cursor-pointer">
          <input
            type="checkbox"
            checked={scanRules}
            onChange={(e) => setScanRules(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Inclure les règles de boîte de tout le tenant (lent)
        </label>
        <Button type="submit" size="sm" disabled={!input.trim() || isFetching}>
          <Search className="h-4 w-4 mr-1" />Analyser
        </Button>
      </form>

      {!query && (
        <div className="rounded-md border bg-card p-6 text-sm text-foreground/60">
          Choisissez un compte pour afficher les redirections configurées <strong>depuis</strong> sa boîte
          (transfert de boîte, règles de boîte de réception) et <strong>vers</strong> ce compte
          (autres boîtes qui lui transfèrent leurs messages), ainsi que les règles de flux Exchange concernées.
        </div>
      )}

      {isFetching && (
        <div className="py-16">
          <Loader label={query?.scanRules ? "Analyse des règles de toutes les boîtes… (plusieurs minutes possibles)" : "Lecture des redirections…"} />
        </div>
      )}

      {errorMessage && !isFetching && (
        <div className="rounded-md border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 p-4 text-red-700 dark:text-red-300 text-sm">
          Erreur : {errorMessage}
        </div>
      )}

      {report && !isFetching && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{report.account.displayName}</span>
            <span className="text-foreground/50 text-sm">{report.account.mail}</span>
            {report.account.recipientType && <Badge variant="outline">{report.account.recipientType}</Badge>}
            {!report.account.hasMailbox && (
              <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">Pas de boîte aux lettres</Badge>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* ---------- Depuis ce compte ---------- */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4" />Depuis ce compte
                  <Badge variant="secondary">{outgoingCount}</Badge>
                </CardTitle>
                <CardDescription>Les messages reçus par ce compte sont envoyés ailleurs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <section>
                  <h3 className="text-sm font-semibold mb-2">Transfert de boîte</h3>
                  {!report.account.hasMailbox ? (
                    <Empty>Ce compte n&apos;a pas de boîte aux lettres.</Empty>
                  ) : !report.outgoing.mailbox ? (
                    <Empty>Aucun transfert configuré.</Empty>
                  ) : (
                    <div className="space-y-2">
                      {report.outgoing.mailbox.forwardingAddress && (
                        <div className="rounded-md border p-3 text-sm">
                          <div className="font-medium">{report.outgoing.mailbox.forwardingAddress.displayName}</div>
                          <div className="text-foreground/50">{report.outgoing.mailbox.forwardingAddress.mail}</div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge variant="outline">Destinataire de l&apos;annuaire</Badge>
                            <CopyBadge keep={report.outgoing.mailbox.deliverToMailboxAndForward} />
                          </div>
                        </div>
                      )}
                      {report.outgoing.mailbox.forwardingSmtpAddress && (
                        <div className="rounded-md border p-3 text-sm">
                          <div className="font-medium">{report.outgoing.mailbox.forwardingSmtpAddress}</div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge variant="outline">Adresse SMTP (potentiellement externe)</Badge>
                            <CopyBadge keep={report.outgoing.mailbox.deliverToMailboxAndForward} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="text-sm font-semibold mb-2">Règles de boîte de réception</h3>
                  {report.outgoing.rules.length === 0 ? (
                    <Empty>Aucune règle de transfert ou de redirection.</Empty>
                  ) : (
                    <div className="space-y-2">
                      {report.outgoing.rules.map((r, i) => (
                        <div key={`${r.ruleName}-${i}`} className="rounded-md border p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">{r.ruleName}</span>
                            <StateBadge enabled={r.enabled} />
                          </div>
                          <div className="text-foreground/70 mt-1">
                            {RULE_KIND_LABELS[r.kind]} <span className="font-medium">{r.target.displayName}</span>
                            {r.target.mail !== r.target.displayName && <span className="text-foreground/50"> — {r.target.mail}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </CardContent>
            </Card>

            {/* ---------- Vers ce compte ---------- */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowDownLeft className="h-4 w-4" />Vers ce compte
                  <Badge variant="secondary">{incomingCount}</Badge>
                </CardTitle>
                <CardDescription>D&apos;autres boîtes envoient leurs messages à ce compte.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <section>
                  <h3 className="text-sm font-semibold mb-2">Transferts de boîte</h3>
                  {report.incoming.mailbox.length === 0 ? (
                    <Empty>Aucune boîte ne transfère vers ce compte.</Empty>
                  ) : (
                    <div className="space-y-2">
                      {report.incoming.mailbox.map((x) => (
                        <div key={x.source.mail} className="rounded-md border p-3 text-sm">
                          <div className="font-medium">{x.source.displayName}</div>
                          <div className="text-foreground/50">{x.source.mail}</div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {x.source.recipientType && <Badge variant="outline">{x.source.recipientType}</Badge>}
                            <CopyBadge keep={x.deliverToMailboxAndForward} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="text-sm font-semibold mb-2">Règles de boîte d&apos;autres comptes</h3>
                  {!report.incoming.rulesScanned ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <Empty>Non analysé (nécessite de parcourir toutes les boîtes).</Empty>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setScanRules(true); setQuery({ account: query!.account, scanRules: true }); }}
                      >
                        Lancer l&apos;analyse complète
                      </Button>
                    </div>
                  ) : report.incoming.rules.length === 0 ? (
                    <Empty>Aucune règle ne cible ce compte ({report.incoming.scannedMailboxes} boîtes analysées).</Empty>
                  ) : (
                    <div className="space-y-2">
                      {report.incoming.rules.map((r, i) => (
                        <div key={`${r.source.mail}-${r.ruleName}-${i}`} className="rounded-md border p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">{r.source.displayName}</span>
                            <StateBadge enabled={r.enabled} />
                          </div>
                          <div className="text-foreground/50">{r.source.mail}</div>
                          <div className="text-foreground/70 mt-1">
                            Règle « {r.ruleName} » — {RULE_KIND_LABELS[r.kind]}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </CardContent>
            </Card>
          </div>

          {/* ---------- Règles de flux ---------- */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="h-4 w-4" />Règles de flux Exchange
                <Badge variant="secondary">{report.transportRules.length}</Badge>
              </CardTitle>
              <CardDescription>
                Règles de transport qui redirigent ou copient des messages vers ce compte, ou qui portent sur les messages adressés à / envoyés par ce compte.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.transportRules.length === 0 ? (
                <Empty>Aucune règle de flux ne concerne ce compte.</Empty>
              ) : (
                <div className="space-y-2">
                  {report.transportRules.map((t) => (
                    <div key={t.name} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{t.name}</span>
                        <div className="flex gap-2">
                          <Badge variant="outline">{t.direction === "incoming" ? "Vers ce compte" : "Depuis ce compte"}</Badge>
                          <StateBadge enabled={t.state === "Enabled"} />
                          {t.mode !== "Enforce" && <Badge variant="outline">{t.mode}</Badge>}
                        </div>
                      </div>
                      {(t.from.length > 0 || t.sentTo.length > 0) && (
                        <div className="text-foreground/50 mt-1">
                          {t.from.length > 0 && <>Expéditeur : {t.from.join(", ")} </>}
                          {t.sentTo.length > 0 && <>Destinataire : {t.sentTo.join(", ")}</>}
                        </div>
                      )}
                      <ul className="mt-1 text-foreground/70">
                        {t.targets.map((tg, i) => (
                          <li key={`${tg.action}-${tg.mail}-${i}`}>
                            {TRANSPORT_ACTION_LABELS[tg.action] ?? tg.action} <span className="font-medium">{tg.displayName}</span>
                            {tg.mail !== tg.displayName && <span className="text-foreground/50"> — {tg.mail}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
