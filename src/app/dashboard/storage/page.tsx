"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader } from "@/components/ui/loader";
import Link from "next/link";
import { HardDrive, Mail, Globe, AlertTriangle, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatBytes, usagePercent } from "@/lib/format";
import { ExportButton } from "@/components/ui/export-button";
import type { StorageItem } from "@/services/graph/reports";

type Tab = "onedrive" | "exchange" | "sharepoint";
type Mode = "quota" | "share";

const TABS: { id: Tab; label: string; icon: React.ReactNode; unit: string; mode: Mode }[] = [
  { id: "onedrive", label: "OneDrive", icon: <HardDrive className="h-3.5 w-3.5" />, unit: "utilisateur", mode: "quota" },
  { id: "exchange", label: "Exchange", icon: <Mail className="h-3.5 w-3.5" />, unit: "boîte", mode: "quota" },
  { id: "sharepoint", label: "SharePoint", icon: <Globe className="h-3.5 w-3.5" />, unit: "site", mode: "share" },
];

const MAX_ROWS = 100;

function UsageBar({ pct, mode }: { pct: number | null; mode: Mode }) {
  const cls =
    mode === "share" ? "bg-primary"
    : pct === null ? "bg-foreground/20"
    : pct >= 90 ? "bg-red-500"
    : pct >= 75 ? "bg-amber-500"
    : "bg-primary";
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full ${cls}`}
        style={{ width: `${pct ?? 2}%` }}
        role="progressbar"
        aria-valuenow={pct ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs text-foreground/50">{label}</p>
      <p className="text-lg font-bold mt-0.5 truncate">{value}</p>
      {sub && <p className="text-xs text-foreground/40 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function StorageSection({ tab, mode, unit, search }: { tab: Tab; mode: Mode; unit: string; search: string }) {
  const { data, isLoading, error } = useQuery<{ supported: boolean; items: StorageItem[] }>({
    queryKey: ["storage", tab],
    queryFn: () => apiFetch(`/api/reports/storage?type=${tab}`),
    staleTime: 30 * 60 * 1000,
  });

  if (isLoading) {
    return <div className="py-16"><Loader label="Chargement du rapport de stockage…" /></div>;
  }
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
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Rapport indisponible
        </div>
        <p className="text-xs">
          La permission Microsoft Graph <code>Reports.Read.All</code> doit être accordée à l&apos;application
          (puis reconnexion). Les noms peuvent aussi être masqués si l&apos;anonymisation des rapports est
          active dans le centre d&apos;administration Microsoft 365 (Paramètres &gt; Rapports).
        </p>
      </div>
    );
  }

  const items = data?.items ?? [];
  const totalUsed = items.reduce((s, i) => s + i.used, 0);

  // Dénominateur par ligne : quota de l'entité (OneDrive/Exchange) ou part du total (SharePoint).
  const rowPct = (i: StorageItem): number | null =>
    mode === "quota"
      ? usagePercent(i.used, i.allocated)
      : totalUsed > 0 ? Math.round((i.used / totalUsed) * 100) : null;

  const filtered = items
    .filter(
      (i) =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        (i.detail ?? "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => b.used - a.used);
  const shown = filtered.slice(0, MAX_ROWS);

  return (
    <div className="space-y-5">
      {/* Synthèse globale */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label={`Nombre de ${unit}s`} value={String(items.length)} />
        <StatTile label="Espace utilisé (total)" value={formatBytes(totalUsed)} />
        {mode === "quota" ? (
          <>
            <StatTile
              label="Quota total"
              value={(() => {
                const alloc = items.reduce((s, i) => s + i.allocated, 0);
                return alloc > 0 ? formatBytes(alloc) : "—";
              })()}
              sub={(() => {
                const alloc = items.reduce((s, i) => s + i.allocated, 0);
                const p = usagePercent(totalUsed, alloc);
                return p !== null ? `${p}% occupé` : "quota inconnu";
              })()}
            />
            <StatTile
              label="≥ 90% occupé"
              value={String(items.filter((i) => { const p = usagePercent(i.used, i.allocated); return p !== null && p >= 90; }).length)}
              sub={`${unit}s proches de la saturation`}
            />
          </>
        ) : (
          <>
            <StatTile
              label={`${unit[0].toUpperCase()}${unit.slice(1)} le plus volumineux`}
              value={items.length ? formatBytes(Math.max(...items.map((i) => i.used))) : "—"}
              sub={items.length ? [...items].sort((a, b) => b.used - a.used)[0].name : undefined}
            />
            <StatTile
              label="Top 5 (part du total)"
              value={(() => {
                if (totalUsed <= 0) return "—";
                const top5 = [...items].sort((a, b) => b.used - a.used).slice(0, 5).reduce((s, i) => s + i.used, 0);
                return `${Math.round((top5 / totalUsed) * 100)}%`;
              })()}
              sub={`des ${unit}s`}
            />
          </>
        )}
      </div>

      <div className="flex justify-end">
        <ExportButton
          fileBase={`onering-stockage-${tab}`}
          sheets={() => [{
            name: unit === "site" ? "SharePoint" : unit === "boîte" ? "Exchange" : "OneDrive",
            columns: mode === "quota"
              ? [
                  { header: unit === "boîte" ? "Boîte" : "Utilisateur", key: "nom", width: 30 },
                  { header: "Détail", key: "detail", width: 40 },
                  { header: "Utilisé (Go)", key: "go", width: 14 },
                  { header: "Quota (Go)", key: "quota", width: 14 },
                  { header: "% occupé", key: "pct", width: 10 },
                ]
              : [
                  { header: "Site", key: "nom", width: 30 },
                  { header: "Détail", key: "detail", width: 44 },
                  { header: "Utilisé (Go)", key: "go", width: 14 },
                  { header: "% du total", key: "pct", width: 12 },
                ],
            rows: filtered.map((i) => {
              const base: Record<string, unknown> = {
                nom: i.name,
                detail: i.detail ?? "",
                go: Math.round((i.used / 1073741824) * 100) / 100,
                pct: rowPct(i) ?? "",
              };
              if (mode === "quota") base.quota = i.allocated > 0 ? Math.round((i.allocated / 1073741824) * 100) / 100 : "";
              return base;
            }),
          }]}
        />
      </div>

      {/* Liste triée par espace décroissant */}
      <div className="rounded-md border bg-card divide-y">
        {shown.length === 0 ? (
          <p className="text-sm text-foreground/40 text-center py-8">Aucun résultat.</p>
        ) : (
          shown.map((i, idx) => {
            const pct = rowPct(i);
            return (
              <div key={`${i.detail ?? i.name}-${idx}`} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <div className="min-w-0">
                    <span className="text-sm font-medium truncate">{i.name}</span>
                    {i.tag && (
                      <Badge variant="secondary" className="text-[10px] ml-2 align-middle">{i.tag}</Badge>
                    )}
                    {i.detail && i.detail !== i.name && (
                      <span className="text-xs text-foreground/40 ml-2 truncate">{i.detail}</span>
                    )}
                  </div>
                  <div className="text-xs shrink-0 tabular-nums">
                    <span className="font-medium">{formatBytes(i.used)}</span>
                    {mode === "quota" ? (
                      <span className="text-foreground/40">
                        {" / "}
                        {i.allocated > 0 ? formatBytes(i.allocated) : "—"}
                        {pct !== null && <span className="ml-1 font-medium">({pct}%)</span>}
                      </span>
                    ) : (
                      pct !== null && <span className="text-foreground/40 ml-1">· {pct}% du total</span>
                    )}
                  </div>
                </div>
                <UsageBar pct={pct} mode={mode} />
              </div>
            );
          })
        )}
      </div>
      {filtered.length > MAX_ROWS && (
        <p className="text-xs text-foreground/40">
          Affichage des {MAX_ROWS} premiers (sur {filtered.length}). Affinez la recherche pour voir les autres.
        </p>
      )}
    </div>
  );
}

export default function StoragePage() {
  const [tab, setTab] = useState<Tab>("onedrive");
  const [search, setSearch] = useState("");
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-2xl font-bold">Stockage</h2>
        <p className="text-sm text-foreground/50 mt-0.5">
          OneDrive et Exchange : espace utilisé par rapport au quota. SharePoint : part de chaque site
          dans l&apos;espace total consommé (le quota par site vaut 25 To par défaut, non significatif).
          Données issues des rapports d&apos;utilisation Microsoft 365 (latence ~1 à 2 jours).
        </p>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 mb-4">
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors inline-flex items-center gap-1.5 ${
              tab === id ? "bg-primary text-white" : "text-foreground/60 hover:bg-foreground/5"
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center gap-3">
        <Input
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {tab === "sharepoint" && (
          <Link
            href="/dashboard/sharepoint-sites"
            className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Vue détaillée des sites
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      <StorageSection tab={tab} mode={active.mode} unit={active.unit} search={search} />
    </div>
  );
}
