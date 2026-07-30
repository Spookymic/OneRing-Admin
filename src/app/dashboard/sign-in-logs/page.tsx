"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Loader } from "@/components/ui/loader";
import { ExportButton } from "@/components/ui/export-button";
import { usePagination } from "@/lib/use-pagination";
import { Pagination } from "@/components/ui/pagination";
import { apiFetch } from "@/lib/api";
import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import type { TenantSignIn, SignInStats } from "@/services/graph/signins";

interface SignInsResponse {
  supported: boolean;
  hours: number;
  examined: number;
  truncated: boolean;
  stats: SignInStats | null;
  recent: TenantSignIn[];
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <p className="text-xs text-foreground/50">{label}</p>
      <p className="text-2xl font-semibold mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-foreground/40 mt-0.5">{sub}</p>}
    </div>
  );
}

function BarList({ items }: { items: { name: string; count: number }[] }) {
  if (items.length === 0) return <p className="text-sm text-foreground/40">Aucune donnée sur la période.</p>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div key={it.name}>
          <div className="flex items-center justify-between gap-2 text-sm mb-1" title={it.name}>
            <span className="text-foreground/70 truncate">{it.name}</span>
            <span className="text-foreground/50 tabular-nums shrink-0">{it.count}</span>
          </div>
          <div className="h-1.5 bg-foreground/8 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${(it.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Timeline({ stats, hours }: { stats: SignInStats; hours: number }) {
  const buckets = stats.timeline;
  if (buckets.length === 0) return <p className="text-sm text-foreground/40">Aucune donnée sur la période.</p>;
  const max = Math.max(...buckets.map((b) => b.success + b.failure), 1);
  const bucketLabel = (label: string) =>
    hours > 24 ? format(new Date(label), "dd/MM") : format(new Date(label), "HH'h'");

  return (
    <div>
      <div className="flex items-center gap-4 text-xs text-foreground/50 mb-3">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-green-600 dark:bg-green-500" />
          Succès
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-500 dark:bg-red-500" />
          Échec
        </span>
      </div>
      <div className="flex items-end gap-1 h-32">
        {buckets.map((b) => (
          <div
            key={b.label}
            className="flex-1 h-full flex flex-col justify-end gap-0.5 min-w-[4px]"
            title={`${bucketLabel(b.label)} — ${b.success} succès, ${b.failure} échec(s)`}
          >
            {b.failure > 0 && (
              <div className="w-full bg-red-500 rounded-t-sm" style={{ height: `${(b.failure / max) * 100}%` }} />
            )}
            {b.success > 0 && (
              <div className="w-full bg-green-600 dark:bg-green-500 rounded-b-sm" style={{ height: `${(b.success / max) * 100}%` }} />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-foreground/40 mt-1">
        <span>{bucketLabel(buckets[0].label)}</span>
        <span>{bucketLabel(buckets[buckets.length - 1].label)}</span>
      </div>
    </div>
  );
}

export default function SignInLogsPage() {
  const [hours, setHours] = useState(24);
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery<SignInsResponse>({
    queryKey: ["sign-in-logs", hours],
    queryFn: () => apiFetch(`/api/security/sign-ins?hours=${hours}`),
    staleTime: 5 * 60 * 1000,
  });

  const recent = (data?.recent ?? []).filter(
    (s) =>
      (s.userDisplayName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (s.userPrincipalName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      s.appDisplayName.toLowerCase().includes(search.toLowerCase())
  );
  const pagination = usePagination(recent, 50);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-bold">Journaux de connexion</h2>
          <p className="text-sm text-foreground/50 mt-0.5">
            Analyse des connexions Entra ID du tenant (succès/échec, applications, localisations, MFA, authentification legacy).
          </p>
        </div>
        <Select value={String(hours)} onValueChange={(v) => setHours(Number(v ?? hours))}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24">Dernières 24h</SelectItem>
            <SelectItem value="168">7 derniers jours</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <div className="rounded-md border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 p-4 text-red-700 dark:text-red-300 text-sm">
          Erreur : {(error as Error).message}
        </div>
      ) : isLoading ? (
        <div className="py-16"><Loader label="Chargement des journaux de connexion…" /></div>
      ) : data?.supported === false ? (
        <div className="rounded-md border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 p-4 text-amber-700 dark:text-amber-300 text-sm">
          <div className="flex items-center gap-2 font-medium mb-1">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Journaux de connexion indisponibles
          </div>
          <p className="text-xs">
            Lecture des journaux de connexion refusée — permission <code>AuditLog.Read.All</code> manquante ou
            consentement admin non accordé.
          </p>
        </div>
      ) : data?.stats ? (
        <>
          <div className="flex items-center gap-2 mb-4">
            <Badge variant="secondary">{data.examined} événement(s) examiné(s)</Badge>
            {data.truncated && (
              <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800">
                Analyse limitée aux 2000 événements les plus récents sur la période
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatTile label="Total connexions" value={String(data.stats.total)} />
            <StatTile
              label="Succès"
              value={data.stats.total > 0 ? `${Math.round((data.stats.successCount / data.stats.total) * 100)}%` : "—"}
              sub={`${data.stats.successCount} succès · ${data.stats.failureCount} échec(s)`}
            />
            <StatTile label="MFA utilisée" value={`${data.stats.mfaPct}%`} sub={`${data.stats.mfaCount} connexion(s)`} />
            <StatTile
              label="Authentification legacy"
              value={`${data.stats.legacyAuthPct}%`}
              sub={`${data.stats.legacyAuthCount} connexion(s)`}
            />
          </div>

          <div className="rounded-md border bg-card p-4 mb-4">
            <h3 className="font-semibold text-sm mb-3">Répartition dans le temps</h3>
            <Timeline stats={data.stats} hours={hours} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="rounded-md border bg-card p-4">
              <h3 className="font-semibold text-sm mb-3">Top applications</h3>
              <BarList items={data.stats.topApps} />
            </div>
            <div className="rounded-md border bg-card p-4">
              <h3 className="font-semibold text-sm mb-3">Top pays</h3>
              <BarList items={data.stats.topCountries} />
            </div>
            <div className="rounded-md border bg-card p-4">
              <h3 className="font-semibold text-sm mb-3">Top adresses IP</h3>
              <BarList items={data.stats.topIps} />
            </div>
            <div className="rounded-md border bg-card p-4">
              <h3 className="font-semibold text-sm mb-3">Top motifs d&apos;échec</h3>
              <BarList items={data.stats.topFailureReasons} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-semibold text-sm">Événements récents ({recent.length})</h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Rechercher (utilisateur, application)…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-3 text-sm max-w-xs"
              />
              <ExportButton
                fileBase="onering-journaux-connexion"
                disabled={!data}
                sheets={() => [{
                  name: "Connexions",
                  columns: [
                    { header: "Utilisateur", key: "user", width: 28 },
                    { header: "UPN", key: "upn", width: 34 },
                    { header: "Application", key: "app", width: 24 },
                    { header: "Statut", key: "statut", width: 12 },
                    { header: "MFA", key: "mfa", width: 8 },
                    { header: "Client", key: "client", width: 20 },
                    { header: "IP", key: "ip", width: 16 },
                    { header: "Localisation", key: "loc", width: 24 },
                    { header: "Date", key: "date", width: 16 },
                  ],
                  rows: recent.map((s) => ({
                    user: s.userDisplayName ?? "",
                    upn: s.userPrincipalName ?? "",
                    app: s.appDisplayName,
                    statut: s.status.errorCode === 0 ? "Succès" : (s.status.failureReason || `Échec (${s.status.errorCode})`),
                    mfa: s.authenticationRequirement === "multiFactorAuthentication" ? "Oui" : "Non",
                    client: s.clientAppUsed ?? "",
                    ip: s.ipAddress ?? "",
                    loc: [s.location?.city, s.location?.countryOrRegion].filter(Boolean).join(", "),
                    date: s.createdDateTime ? format(new Date(s.createdDateTime), "dd/MM/yyyy HH:mm") : "",
                  })),
                }]}
              />
            </div>
          </div>

          <div className="rounded-md border bg-card overflow-x-auto">
            <Table className="min-w-max">
              <TableHeader>
                <TableRow>
                  <th className="p-3 text-sm font-medium text-left">Utilisateur</th>
                  <th className="p-3 text-sm font-medium text-left">Application</th>
                  <th className="p-3 text-sm font-medium text-left">Statut</th>
                  <th className="p-3 text-sm font-medium text-left">MFA</th>
                  <th className="p-3 text-sm font-medium text-left">Client</th>
                  <th className="p-3 text-sm font-medium text-left">IP</th>
                  <th className="p-3 text-sm font-medium text-left">Localisation</th>
                  <th className="p-3 text-sm font-medium text-left">Date</th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.pageItems.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.userDisplayName ?? s.userPrincipalName ?? "—"}
                      {s.userDisplayName && s.userPrincipalName && (
                        <span className="block text-xs text-foreground/40">{s.userPrincipalName}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-foreground/60">{s.appDisplayName}</TableCell>
                    <TableCell>
                      {s.status.errorCode === 0 ? (
                        <Badge variant="outline" className="text-green-600 dark:text-green-400 border-green-300 dark:border-green-800">Succès</Badge>
                      ) : (
                        <Badge variant="destructive" title={s.status.failureReason ?? undefined}>Échec</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-foreground/60">
                      {s.authenticationRequirement === "multiFactorAuthentication" ? "Oui" : "Non"}
                    </TableCell>
                    <TableCell className="text-sm text-foreground/60">{s.clientAppUsed ?? "—"}</TableCell>
                    <TableCell className="text-sm font-mono text-foreground/50">{s.ipAddress ?? "—"}</TableCell>
                    <TableCell className="text-sm text-foreground/60">
                      {[s.location?.city, s.location?.countryOrRegion].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-foreground/50 whitespace-nowrap">
                      {s.createdDateTime ? format(new Date(s.createdDateTime), "dd/MM/yyyy HH:mm") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {recent.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-foreground/40 py-8">Aucun événement.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <Pagination
            page={pagination.page}
            pageCount={pagination.pageCount}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </>
      ) : null}
    </div>
  );
}
