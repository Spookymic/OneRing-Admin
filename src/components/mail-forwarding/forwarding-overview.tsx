"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Globe, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader } from "@/components/ui/loader";
import { ExportButton } from "@/components/ui/export-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import type { ForwardingSummaryItem } from "@/services/exchange/forwarding";

interface ForwardingSummaryResponse {
  supported: boolean;
  reason?: string;
  forwards: ForwardingSummaryItem[];
}

const RECIPIENT_TYPE_LABELS: Record<string, string> = {
  UserMailbox: "Utilisateur",
  SharedMailbox: "Boîte partagée",
  SchedulingMailbox: "Planification",
  RoomMailbox: "Salle",
  EquipmentMailbox: "Équipement",
};

/**
 * Vue d'ensemble des transferts au niveau boîte sur tout le tenant (même cache que la tuile
 * « Redirections externes » du tableau de bord). Affichée tant qu'aucun compte n'est analysé.
 */
export function ForwardingOverview({
  initialExternalOnly,
  onAnalyze,
}: {
  initialExternalOnly: boolean;
  onAnalyze: (account: string) => void;
}) {
  const [externalOnly, setExternalOnly] = useState(initialExternalOnly);
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery<ForwardingSummaryResponse>({
    queryKey: ["forwarding-summary"],
    queryFn: () => apiFetch<ForwardingSummaryResponse>("/api/mailboxes/forwarding/summary"),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const all = useMemo(() => data?.forwards ?? [], [data]);
  const externalCount = all.filter((f) => f.external).length;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((f) => !externalOnly || f.external)
      .filter((f) =>
        !q ||
        f.source.displayName.toLowerCase().includes(q) ||
        f.source.mail.toLowerCase().includes(q) ||
        f.target.toLowerCase().includes(q)
      )
      .sort((a, b) => Number(b.external) - Number(a.external) || a.source.displayName.localeCompare(b.source.displayName, "fr"));
  }, [all, externalOnly, search]);

  if (isLoading) {
    return <div className="py-16"><Loader label="Lecture des transferts de toutes les boîtes… (jusqu'à 30 s)" /></div>;
  }
  if (error || !data?.supported) {
    return (
      <div className="rounded-md border bg-card p-6 text-sm text-foreground/60">
        Vue d&apos;ensemble indisponible :{" "}
        {data?.reason === "exchange_forbidden"
          ? "un rôle Exchange Administrator (ou Global Administrator) est requis."
          : "le pont Exchange ne répond pas."}{" "}
        Vous pouvez toujours analyser un compte précis ci-dessus.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          Transferts de boîte sur tout le tenant
        </h3>
        <Badge variant="secondary">{all.length} au total</Badge>
        <Badge variant="outline" className={externalCount > 0 ? "border-amber-400 text-amber-700 dark:text-amber-300" : ""}>
          {externalCount} vers l&apos;extérieur
        </Badge>
        <div className="ml-auto">
          <ExportButton
            fileBase="onering-transferts-tenant"
            disabled={rows.length === 0}
            sheets={() => [{
              name: "Transferts",
              columns: [
                { header: "Boîte source", key: "source", width: 30 },
                { header: "Adresse source", key: "mail", width: 34 },
                { header: "Type", key: "type", width: 16 },
                { header: "Destination", key: "target", width: 36 },
                { header: "Externe", key: "external", width: 10 },
                { header: "Mécanisme", key: "via", width: 24 },
                { header: "Copie conservée", key: "copy", width: 16 },
              ],
              rows: rows.map((f) => ({
                source: f.source.displayName,
                mail: f.source.mail,
                type: RECIPIENT_TYPE_LABELS[f.source.recipientType ?? ""] ?? f.source.recipientType ?? "",
                target: f.target,
                external: f.external ? "Oui" : "Non",
                via: f.via === "forwardingSmtpAddress" ? "ForwardingSmtpAddress" : "ForwardingAddress",
                copy: f.deliverToMailboxAndForward ? "Oui" : "Non",
              })),
            }]}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/30" />
          <Input placeholder="Filtrer…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground/70 cursor-pointer">
          <input
            type="checkbox"
            checked={externalOnly}
            onChange={(e) => setExternalOnly(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Vers l&apos;extérieur uniquement
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-foreground/50 py-6 text-center rounded-md border bg-card">
          {externalOnly ? "Aucun transfert vers l'extérieur." : "Aucun transfert de boîte configuré."}
        </p>
      ) : (
        <div className="rounded-md border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Boîte source</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Copie</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((f) => (
                <TableRow key={`${f.source.mail}-${f.target}`}>
                  <TableCell>
                    <div className="font-medium text-sm">{f.source.displayName}</div>
                    <div className="text-xs text-foreground/50">
                      {f.source.mail}
                      {f.source.recipientType && ` · ${RECIPIENT_TYPE_LABELS[f.source.recipientType] ?? f.source.recipientType}`}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="break-all">{f.target}</span>
                      {f.external && (
                        <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300 shrink-0">Externe</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-foreground/60 whitespace-nowrap">
                    {f.deliverToMailboxAndForward ? "Conservée" : "Sans copie locale"}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => onAnalyze(f.source.mail)}>
                      Analyser
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-foreground/40">
        Transferts configurés au niveau de la boîte (ForwardingAddress / ForwardingSmtpAddress). Les règles de boîte de
        réception n&apos;apparaissent pas ici : analysez un compte (case « Inclure les règles… ») pour les voir.
      </p>
    </div>
  );
}
