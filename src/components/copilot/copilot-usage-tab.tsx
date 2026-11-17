"use client";

import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, CheckCircle, Clock, MinusCircle, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader } from "@/components/ui/loader";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHead } from "@/components/ui/sortable-head";
import { ExportButton } from "@/components/ui/export-button";
import { apiFetch } from "@/lib/api";
import { useSort } from "@/lib/use-sort";
import {
  COPILOT_PERIODS,
  COPILOT_STATUS_LABELS,
  type CopilotPeriod,
  type CopilotUsageResponse,
  type CopilotUser,
  type CopilotUserStatus,
} from "@/lib/copilot";
import { HBarChart, Meter, StatTile } from "@/components/copilot/viz";

const STATUS_STYLE: Record<CopilotUserStatus, { icon: typeof CheckCircle; className: string }> = {
  active: { icon: CheckCircle, className: "text-green-700 dark:text-green-400" },
  inactive: { icon: Clock, className: "text-amber-700 dark:text-amber-400" },
  never: { icon: XCircle, className: "text-red-700 dark:text-red-400" },
  unlicensed: { icon: MinusCircle, className: "text-foreground/50" },
};

type StatusFilter = "all" | "licensed" | "underused" | CopilotUserStatus;

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "licensed", label: "Licenciés" },
  { id: "active", label: "Actifs" },
  { id: "underused", label: "À réaffecter" },
  { id: "unlicensed", label: "Sans licence" },
  { id: "all", label: "Tous" },
];

type SortCol = "name" | "status" | "last" | "days" | "prompts" | "apps";

const fmtDate = (d: string | null) => (d ? format(new Date(`${d}T00:00:00`), "dd/MM/yyyy", { locale: fr }) : "—");

function StatusBadge({ status }: { status: CopilotUserStatus }) {
  const { icon: Icon, className } = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${className}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {COPILOT_STATUS_LABELS[status]}
    </span>
  );
}

export function CopilotUsageTab() {
  const [period, setPeriod] = useState<CopilotPeriod>(28);
  const [filter, setFilter] = useState<StatusFilter>("licensed");
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery<CopilotUsageResponse>({
    queryKey: ["copilot-usage", period],
    queryFn: () => apiFetch<CopilotUsageResponse>(`/api/copilot/usage?period=${period}`),
    staleTime: 30 * 60 * 1000,
  });

  const users = useMemo(() => data?.users ?? [], [data]);
  const licensed = users.filter((u) => u.status !== "unlicensed");
  const active = licensed.filter((u) => u.status === "active");
  const underused = licensed.filter((u) => u.status === "inactive" || u.status === "never");
  const appLabel = useMemo(() => new Map((data?.apps ?? []).map((a) => [a.key, a.label])), [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const okStatus =
        filter === "all" ? true
        : filter === "licensed" ? u.status !== "unlicensed"
        : filter === "underused" ? u.status === "inactive" || u.status === "never"
        : u.status === filter;
      const okSearch =
        !q || u.displayName.toLowerCase().includes(q) || u.upn.toLowerCase().includes(q) ||
        (u.department ?? "").toLowerCase().includes(q);
      return okStatus && okSearch;
    });
  }, [users, filter, search]);

  const getVal = useCallback((u: CopilotUser, col: SortCol) => {
    switch (col) {
      case "name": return u.displayName;
      case "status": return ["active", "inactive", "never", "unlicensed"].indexOf(u.status);
      case "last": return u.lastActivityDate ?? "";
      case "days": return u.activeDays ?? -1;
      case "prompts": return u.prompts ?? -1;
      case "apps": return u.appsInPeriod.length;
    }
  }, []);
  const { sorted, col, dir, toggle } = useSort<CopilotUser, SortCol>(filtered, getVal);

  if (isLoading) return <div className="py-16"><Loader label="Chargement du rapport Copilot…" /></div>;
  if (error) {
    return (
      <div className="rounded-md border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 p-4 text-red-700 dark:text-red-300 text-sm">
        Erreur : {(error as Error).message}
      </div>
    );
  }
  if (data?.supported === false) {
    return (
      <div className="rounded-md border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 p-4 text-amber-700 dark:text-amber-300 text-sm">
        <div className="flex items-center gap-2 font-medium mb-1">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Rapport indisponible
        </div>
        <p className="text-xs">
          La permission Microsoft Graph <code>Reports.Read.All</code> et un rôle de lecture des rapports
          (Lecteur de rapports, Administrateur IA, Administrateur général…) sont requis.
        </p>
      </div>
    );
  }
  if (!data) return null;

  const totalAssigned = data.licenses.reduce((s, l) => s + l.assigned, 0);
  const totalEnabled = data.licenses.reduce((s, l) => s + l.enabled, 0);
  const prompts = active.reduce((s, u) => s + (u.prompts ?? 0), 0);
  const withDays = active.filter((u) => u.activeDays !== null);
  const avgDays = withDays.length ? withDays.reduce((s, u) => s + (u.activeDays ?? 0), 0) / withDays.length : null;
  const adoption = licensed.length ? Math.round((active.length / licensed.length) * 100) : 0;

  const byApp = data.apps
    .map((a) => {
      const n = licensed.filter((u) => u.appsInPeriod.includes(a.key)).length;
      return { label: a.label, value: n, note: licensed.length ? `${Math.round((n / licensed.length) * 100)} % des licenciés` : undefined };
    })
    .sort((x, y) => y.value - x.value);

  return (
    <div className="space-y-5">
      {/* Filtres : période */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Période">
          {COPILOT_PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                period === p ? "bg-primary text-white" : "text-foreground/60 hover:bg-foreground/5"
              }`}
            >
              {p} jours
            </button>
          ))}
        </div>
        <p className="text-xs text-foreground/50">
          {data.periodStart && data.reportRefreshDate
            ? <>Du {fmtDate(data.periodStart)} au {fmtDate(data.reportRefreshDate)} · données Microsoft (latence ~48 h)</>
            : "Aucune donnée d'utilisation"}
        </p>
      </div>

      {data.concealed && (
        <div className="rounded-md border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 p-3 text-amber-700 dark:text-amber-300 text-xs">
          Les noms sont masqués dans les rapports Microsoft 365 : le rapprochement avec l&apos;annuaire (service,
          licences inutilisées) est impossible. Centre d&apos;administration → Paramètres → Paramètres de
          l&apos;organisation → Rapports → décocher « Afficher les noms masqués ».
        </div>
      )}

      {/* Synthèse */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Licences attribuées" value={`${totalAssigned} / ${totalEnabled}`} sub={`${Math.max(0, totalEnabled - totalAssigned)} disponible(s)`} />
        <StatTile label="Utilisateurs actifs" value={`${active.length}`} sub={`${adoption} % des ${licensed.length} licenciés`} />
        <StatTile label="Licences à réaffecter" value={`${underused.length}`} sub="aucune activité sur la période" />
        <StatTile
          label="Prompts envoyés"
          value={prompts.toLocaleString("fr-FR")}
          sub={avgDays !== null ? `${(prompts / Math.max(1, active.length)).toFixed(0)} / actif · ${avgDays.toFixed(1)} j d'usage moyen` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Licences par SKU */}
        <section className="rounded-lg border bg-card p-4 space-y-4">
          <h3 className="text-sm font-semibold">Licences Copilot</h3>
          {data.licenses.length === 0 ? (
            <p className="text-sm text-foreground/40">Aucune licence Microsoft 365 Copilot dans le tenant.</p>
          ) : (
            data.licenses.map((l) => (
              <Meter
                key={l.skuId}
                label={l.name}
                used={l.assigned}
                total={l.enabled}
                note={`${Math.max(0, l.enabled - l.assigned)} disponible(s)`}
              />
            ))
          )}
        </section>

        {/* Adoption par application */}
        <section className="rounded-lg border bg-card p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Utilisateurs actifs par application</h3>
            <p className="text-xs text-foreground/50">Licenciés ayant utilisé Copilot dans l&apos;application sur la période</p>
          </div>
          <HBarChart items={byApp} ariaLabel="Utilisateurs actifs par application" max={Math.max(1, licensed.length)} />
        </section>
      </div>

      {/* Détail par utilisateur */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Filtrer par statut">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                  filter === f.id ? "bg-primary text-white" : "text-foreground/60 hover:bg-foreground/5"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Input
            placeholder="Rechercher (nom, UPN, service)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full sm:w-64"
          />
          <div className="ml-auto">
            <ExportButton
              fileBase={`copilot-utilisation-${period}j`}
              disabled={sorted.length === 0}
              sheets={() => [{
                name: "Copilot",
                columns: [
                  { header: "Nom", key: "nom", width: 28 },
                  { header: "UPN", key: "upn", width: 34 },
                  { header: "Service", key: "service", width: 20 },
                  { header: "Licence(s)", key: "licences", width: 36 },
                  { header: "Statut", key: "statut", width: 14 },
                  { header: "Dernière activité", key: "last", width: 16 },
                  { header: "Jours d'usage", key: "days", width: 12 },
                  { header: "Prompts", key: "prompts", width: 10 },
                  { header: "Applications (période)", key: "apps", width: 40 },
                ],
                rows: sorted.map((u) => ({
                  nom: u.displayName,
                  upn: u.upn,
                  service: u.department ?? "",
                  licences: u.licenses.join(", "),
                  statut: COPILOT_STATUS_LABELS[u.status],
                  last: u.lastActivityDate ?? "",
                  days: u.activeDays ?? "",
                  prompts: u.prompts ?? "",
                  apps: u.appsInPeriod.map((k) => appLabel.get(k) ?? k).join(", "),
                })),
              }]}
            />
          </div>
        </div>

        <div className="rounded-md border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Utilisateur" col="name" activeCol={col} dir={dir} onToggle={toggle} />
                <SortableHead label="Statut" col="status" activeCol={col} dir={dir} onToggle={toggle} />
                <SortableHead label="Dernière activité" col="last" activeCol={col} dir={dir} onToggle={toggle} />
                <SortableHead label="Jours d'usage" col="days" activeCol={col} dir={dir} onToggle={toggle} className="text-right" />
                <SortableHead label="Prompts" col="prompts" activeCol={col} dir={dir} onToggle={toggle} className="text-right" />
                <SortableHead label="Applications" col="apps" activeCol={col} dir={dir} onToggle={toggle} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-foreground/40 py-8">Aucun utilisateur.</TableCell>
                </TableRow>
              ) : (
                sorted.map((u) => (
                  <TableRow key={u.upn}>
                    <TableCell className="max-w-[18rem]">
                      <div className="font-medium truncate">{u.displayName}</div>
                      <div className="text-xs text-foreground/40 truncate">
                        {u.upn}{u.department ? ` · ${u.department}` : ""}
                      </div>
                      {u.licenses.length > 0 && (
                        <div className="text-[11px] text-foreground/40 truncate">{u.licenses.join(", ")}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={u.status} />
                      {u.accountEnabled === false && (
                        <Badge variant="outline" className="ml-1 text-[10px]">Compte désactivé</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums whitespace-nowrap">{fmtDate(u.lastActivityDate)}</TableCell>
                    <TableCell className="text-sm tabular-nums text-right">{u.activeDays ?? "—"}</TableCell>
                    <TableCell className="text-sm tabular-nums text-right">{u.prompts ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[20rem]">
                        {u.appsInPeriod.length === 0
                          ? <span className="text-xs text-foreground/40">—</span>
                          : u.appsInPeriod.map((k) => (
                              <Badge key={k} variant="secondary" className="text-[10px]">{appLabel.get(k) ?? k}</Badge>
                            ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-foreground/40">
          {sorted.length} utilisateur(s). « À réaffecter » : licence attribuée sans aucune activité Copilot sur la
          période. « Sans licence » : activité passée mais licence retirée depuis.
        </p>
      </section>
    </div>
  );
}
