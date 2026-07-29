"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHead } from "@/components/ui/sortable-head";
import { Loader } from "@/components/ui/loader";
import { AlertTriangle, Info } from "lucide-react";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { useSort } from "@/lib/use-sort";
import { ExportButton } from "@/components/ui/export-button";
import type { SharePointSite } from "@/services/graph/reports";
import type { SpoSiteSettings } from "@/services/sharepoint/site-settings";

type SiteRow = SharePointSite & { settings: SpoSiteSettings | null };
type SortCol = "name" | "kind" | "storageUsed" | "fileCount" | "pageViewCount" | "lastActivityDate";

const nf = new Intl.NumberFormat("fr-FR");

const sharingLabels: Record<string, string> = {
  Disabled: "Partage désactivé",
  ExternalUserSharingOnly: "Externe (authentifié)",
  ExternalUserAndGuestSharing: "Externe + anonyme",
  ExistingExternalUserSharingOnly: "Externes existants",
};
const lockLabels: Record<string, string> = {
  Unlock: "Déverrouillé",
  ReadOnly: "Lecture seule",
  NoAccess: "Aucun accès",
};

function sharingVariant(cap: string | null): "secondary" | "outline" | "destructive" {
  if (cap === "Disabled") return "secondary";
  if (cap === "ExternalUserAndGuestSharing") return "destructive";
  return "outline";
}

const mb = (n: number | null | undefined) => (n ? formatBytes(n * 1024 * 1024) : "—");
const isRealGroup = (g: string | null | undefined) => !!g && g !== "00000000-0000-0000-0000-000000000000";

function settingsTitle(s: SpoSiteSettings): string {
  return [
    `Partage externe : ${sharingLabels[s.sharingCapability ?? ""] ?? s.sharingCapability ?? "?"}`,
    `Verrou : ${lockLabels[s.lockState ?? ""] ?? s.lockState ?? "?"}`,
    `Étiquette de confidentialité : ${s.sensitivityLabel || "aucune"}`,
    `Quota : ${mb(s.storageQuotaMB)} (utilisé ${mb(s.storageUsageCurrentMB)})`,
    `Modèle : ${s.template || "?"}`,
    `Site hub : ${s.isHubSite ? "oui" : "non"}`,
    `Connecté à un Groupe M365 : ${isRealGroup(s.groupId) ? "oui" : "non"}`,
    `Accès conditionnel : ${s.conditionalAccessPolicy || "—"}`,
    `Scripts personnalisés bloqués : ${s.denyAddAndCustomizePages === "Enabled" ? "oui" : "non"}`,
  ].join("\n");
}

export default function SharePointSitesPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery<{ supported: boolean; sites: SiteRow[] }>({
    queryKey: ["sharepoint-sites"],
    queryFn: () => apiFetch("/api/reports/sharepoint-sites"),
    staleTime: 30 * 60 * 1000,
  });

  const filtered = (data?.sites ?? []).filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.url ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const getVal = useCallback((s: SiteRow, col: SortCol): string | number => {
    switch (col) {
      case "name": return s.name;
      case "kind": return s.kind;
      case "storageUsed": return s.storageUsed;
      case "fileCount": return s.fileCount;
      case "pageViewCount": return s.pageViewCount;
      case "lastActivityDate": return s.lastActivityDate ?? "";
      default: return "";
    }
  }, []);

  const { sorted, col, dir, toggle } = useSort<SiteRow, SortCol>(filtered, getVal);

  if (error) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Sites SharePoint</h2>
        <div className="rounded-md border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 p-4 text-red-700 dark:text-red-300 text-sm">
          Erreur : {(error as Error).message}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-2xl font-bold">Sites SharePoint</h2>
        <p className="text-sm text-foreground/50 mt-0.5">
          Volumes et activité par site (rapport d&apos;utilisation Microsoft 365, période 7 jours, latence ~1-2 j).
          Cliquez sur une colonne pour trier.
        </p>
      </div>

      {data?.supported === false ? (
        <div className="rounded-md border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 p-4 text-amber-700 dark:text-amber-300 text-sm">
          <div className="flex items-center gap-2 font-medium mb-1">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Rapport indisponible
          </div>
          <p className="text-xs">La permission <code>Reports.Read.All</code> doit être accordée (puis reconnexion).</p>
        </div>
      ) : (
        <>
          <div className="flex gap-3 mb-4">
            <Input
              placeholder="Rechercher un site…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Badge variant="secondary" className="self-center">{filtered.length} sites</Badge>
            <ExportButton
              fileBase="onering-sites-sharepoint"
              sheets={() => [{
                name: "Sites SharePoint",
                columns: [
                  { header: "Site", key: "site", width: 30 },
                  { header: "URL", key: "url", width: 44 },
                  { header: "Type", key: "type", width: 16 },
                  { header: "Espace utilisé (Go)", key: "go", width: 16 },
                  { header: "Fichiers", key: "fichiers", width: 12 },
                  { header: "Fichiers actifs", key: "actifs", width: 14 },
                  { header: "Pages vues", key: "vues", width: 12 },
                  { header: "Pages visitées", key: "visitees", width: 14 },
                  { header: "Dernière activité", key: "activite", width: 16 },
                  { header: "Partage externe", key: "partage", width: 22 },
                  { header: "Verrou", key: "verrou", width: 14 },
                  { header: "Étiquette", key: "etiquette", width: 18 },
                  { header: "Quota (Go)", key: "quota", width: 12 },
                  { header: "Hub", key: "hub", width: 8 },
                  { header: "Groupe M365", key: "groupe", width: 12 },
                ],
                rows: sorted.map((s) => ({
                  site: s.name,
                  url: s.url ?? "",
                  type: s.kind,
                  go: Math.round((s.storageUsed / 1073741824) * 100) / 100,
                  fichiers: s.fileCount,
                  actifs: s.activeFileCount,
                  vues: s.pageViewCount,
                  visitees: s.visitedPageCount,
                  activite: s.lastActivityDate ? format(new Date(s.lastActivityDate), "dd/MM/yyyy") : "",
                  partage: s.settings ? (sharingLabels[s.settings.sharingCapability ?? ""] ?? s.settings.sharingCapability ?? "") : "",
                  verrou: s.settings ? (lockLabels[s.settings.lockState ?? ""] ?? s.settings.lockState ?? "") : "",
                  etiquette: s.settings?.sensitivityLabel ?? "",
                  quota: s.settings?.storageQuotaMB ? Math.round((s.settings.storageQuotaMB / 1024) * 10) / 10 : "",
                  hub: s.settings?.isHubSite ? "Oui" : "Non",
                  groupe: s.settings && s.settings.groupId && s.settings.groupId !== "00000000-0000-0000-0000-000000000000" ? "Oui" : "Non",
                })),
              }]}
            />
          </div>

          <div className="rounded-md border bg-card overflow-x-auto">
            {isLoading ? (
              <div className="py-16"><Loader label="Chargement des sites…" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label="Site" col="name" activeCol={col} dir={dir} onToggle={toggle} />
                    <SortableHead label="Type" col="kind" activeCol={col} dir={dir} onToggle={toggle} />
                    <SortableHead label="Espace" col="storageUsed" activeCol={col} dir={dir} onToggle={toggle} />
                    <SortableHead label="Fichiers" col="fileCount" activeCol={col} dir={dir} onToggle={toggle} />
                    <SortableHead label="Pages vues" col="pageViewCount" activeCol={col} dir={dir} onToggle={toggle} />
                    <SortableHead label="Dernière activité" col="lastActivityDate" activeCol={col} dir={dir} onToggle={toggle} />
                    <th className="p-3 text-sm font-medium text-left">Paramètres</th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((s, i) => (
                    <TableRow key={`${s.url ?? s.name}-${i}`}>
                      <TableCell>
                        <p className="text-sm font-medium">{s.name}</p>
                        {s.url && <p className="text-xs text-foreground/40 truncate max-w-[320px]">{s.url}</p>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{s.kind}</Badge>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">{formatBytes(s.storageUsed)}</TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {nf.format(s.fileCount)}
                        {s.activeFileCount > 0 && (
                          <span className="text-foreground/40"> · {nf.format(s.activeFileCount)} actifs</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {nf.format(s.pageViewCount)}
                        {s.visitedPageCount > 0 && (
                          <span className="text-foreground/40"> · {nf.format(s.visitedPageCount)} pages</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-foreground/60">
                        {s.lastActivityDate ? format(new Date(s.lastActivityDate), "dd/MM/yyyy") : "—"}
                      </TableCell>
                      <TableCell>
                        {s.settings ? (
                          <div className="flex items-center gap-1.5" title={settingsTitle(s.settings)}>
                            <Badge variant={sharingVariant(s.settings.sharingCapability)} className="text-[10px]">
                              {sharingLabels[s.settings.sharingCapability ?? ""] ?? s.settings.sharingCapability ?? "?"}
                            </Badge>
                            <Info className="h-3.5 w-3.5 text-foreground/40" />
                          </div>
                        ) : (
                          <span className="text-xs text-foreground/30">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {sorted.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-foreground/40 py-8">
                        Aucun site.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
