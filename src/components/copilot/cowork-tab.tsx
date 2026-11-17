"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ExternalLink, FileUp, Info, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader } from "@/components/ui/loader";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHead } from "@/components/ui/sortable-head";
import { ExportButton } from "@/components/ui/export-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useSort } from "@/lib/use-sort";
import { COWORK_FIELD_LABELS, parseCoworkCsv, type CoworkField, type CoworkUsageRow } from "@/lib/cowork";
import type { M365User } from "@/services/graph/users";
import type { CoworkImport, CoworkImportMeta } from "@/services/cowork";
import { HBarChart, SplitBar, StatTile } from "@/components/copilot/viz";

interface CoworkResponse {
  imports: CoworkImportMeta[];
  current: CoworkImport | null;
}

type SortCol = "name" | "total" | "user" | "scheduled" | "days" | "last";

const fmtDate = (d: string | null) => (d ? format(new Date(`${d}T00:00:00`), "dd/MM/yyyy", { locale: fr }) : "—");
const fmtDateTime = (d: string) => format(new Date(d), "dd/MM/yyyy HH:mm", { locale: fr });

export function CoworkTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<{ error: string; headers: string[] } | null>(null);
  const [lastMapping, setLastMapping] = useState<{ mapping: Partial<Record<CoworkField, string>>; ignored: string[] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery<CoworkResponse>({
    queryKey: ["cowork", selectedId],
    queryFn: () => apiFetch<CoworkResponse>(`/api/copilot/cowork${selectedId ? `?id=${selectedId}` : ""}`),
  });

  // Enrichissement : service (annuaire)
  const { data: users } = useQuery<M365User[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<M365User[]>("/api/users"),
    staleTime: 5 * 60 * 1000,
  });
  const userByUpn = useMemo(
    () => new Map((users ?? []).map((u) => [u.userPrincipalName.toLowerCase(), u])),
    [users]
  );

  const current = data?.current ?? null;
  const rows = useMemo(() => current?.rows ?? [], [current]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const dept = userByUpn.get(r.upn.toLowerCase())?.department ?? "";
      return r.displayName.toLowerCase().includes(q) || r.upn.toLowerCase().includes(q) || dept.toLowerCase().includes(q);
    });
  }, [rows, search, userByUpn]);

  const getVal = useCallback((r: CoworkUsageRow, c: SortCol) => {
    switch (c) {
      case "name": return r.displayName;
      case "total": return r.totalTasks;
      case "user": return r.userTasks ?? -1;
      case "scheduled": return r.scheduledTasks ?? -1;
      case "days": return r.activeDays ?? -1;
      case "last": return r.lastActivity ?? "";
    }
  }, []);
  const { sorted, col, dir, toggle } = useSort<CoworkUsageRow, SortCol>(filtered, getVal);

  async function handleFile(file: File) {
    setParseError(null);
    setLastMapping(null);
    const text = await file.text();
    const parsed = parseCoworkCsv(text);
    if (!parsed.ok) {
      setParseError({ error: parsed.error, headers: parsed.headers });
      return;
    }
    setImporting(true);
    try {
      await apiFetch<CoworkImportMeta>("/api/copilot/cowork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, rows: parsed.rows }),
      });
      setLastMapping({ mapping: parsed.mapping, ignored: parsed.ignored });
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ["cowork"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast({ title: "Import Cowork enregistré", description: `${parsed.rows.length} utilisateur(s) — ${file.name}` });
    } catch (err) {
      toast({ title: "Échec de l'import", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete() {
    if (!current) return;
    try {
      await apiFetch(`/api/copilot/cowork?id=${current.id}`, { method: "DELETE" });
      setConfirmDelete(false);
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ["cowork"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast({ title: "Import supprimé", description: current.fileName });
    } catch (err) {
      toast({ title: "Échec de la suppression", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  }

  // ── Agrégats ──
  const activeUsers = rows.filter((r) => r.totalTasks > 0);
  const totalTasks = rows.reduce((s, r) => s + r.totalTasks, 0);
  const userTasks = rows.reduce((s, r) => s + (r.userTasks ?? 0), 0);
  const scheduledTasks = rows.reduce((s, r) => s + (r.scheduledTasks ?? 0), 0);
  const hasSplit = rows.some((r) => r.userTasks !== null || r.scheduledTasks !== null);
  const withDays = activeUsers.filter((r) => r.activeDays !== null);
  const avgDays = withDays.length ? withDays.reduce((s, r) => s + (r.activeDays ?? 0), 0) / withDays.length : null;
  const lastData = rows.reduce<string | null>((m, r) => (r.lastActivity && (!m || r.lastActivity > m) ? r.lastActivity : m), null);
  const top = [...activeUsers]
    .sort((a, b) => b.totalTasks - a.totalTasks)
    .slice(0, 10)
    .map((r) => ({ label: r.displayName, value: r.totalTasks, note: r.activeDays !== null ? `${r.activeDays} j actifs` : undefined }));

  return (
    <div className="space-y-5">
      {/* Import */}
      <section className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 max-w-2xl">
            <h3 className="text-sm font-semibold">Données Copilot Cowork</h3>
            <p className="text-xs text-foreground/60">
              Microsoft ne propose pas d&apos;API pour Cowork. Exportez le détail depuis le centre
              d&apos;administration Microsoft 365 : <strong>Copilot → Cowork → Utilisation → Exporter</strong> (CSV),
              puis importez le fichier ici. Il est conservé et visible par tous les administrateurs.
            </p>
            <a
              href="https://admin.microsoft.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Ouvrir le centre d&apos;administration <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
            />
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={importing}>
              <FileUp className="h-4 w-4 mr-1" />
              {importing ? "Import…" : "Importer un CSV"}
            </Button>
          </div>
        </div>

        {parseError && (
          <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
            <p className="font-medium">{parseError.error}</p>
            <p className="mt-1">Colonnes trouvées : {parseError.headers.join(", ") || "(aucune)"}</p>
          </div>
        )}
        {lastMapping && (
          <div className="rounded-md border p-3 text-xs text-foreground/60 space-y-1">
            <p className="flex items-center gap-1 font-medium text-foreground/80"><Info className="h-3.5 w-3.5" /> Colonnes reconnues</p>
            <p>
              {(Object.keys(lastMapping.mapping) as CoworkField[])
                .map((f) => `${COWORK_FIELD_LABELS[f]} ← « ${lastMapping.mapping[f]} »`)
                .join(" · ")}
            </p>
            {lastMapping.ignored.length > 0 && <p>Ignorées : {lastMapping.ignored.join(", ")}</p>}
          </div>
        )}

        {data && data.imports.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-foreground/50">Import affiché :</span>
            <Select value={current?.id ?? ""} onValueChange={(v) => { setSelectedId(v ?? null); setConfirmDelete(false); }}>
              <SelectTrigger className="h-8 w-auto min-w-[16rem] text-xs">
                <SelectValue placeholder="Choisir un import">
                  {current ? `${fmtDateTime(current.createdAt)} — ${current.fileName}` : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {data.imports.map((i) => (
                  <SelectItem key={i.id} value={i.id} className="text-xs">
                    {fmtDateTime(i.createdAt)} — {i.fileName} ({i.rowCount}) · {i.importedBy}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {current && (confirmDelete ? (
              <>
                <span className="text-xs text-red-600 dark:text-red-400">Supprimer cet import ?</span>
                <Button size="sm" variant="destructive" className="h-8" onClick={handleDelete}>Confirmer</Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => setConfirmDelete(false)}>Annuler</Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" className="h-8 text-red-600 dark:text-red-400" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Supprimer
              </Button>
            ))}
          </div>
        )}
      </section>

      {isLoading ? (
        <div className="py-12"><Loader label="Chargement des données Cowork…" /></div>
      ) : error ? (
        <div className="rounded-md border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 p-4 text-red-700 dark:text-red-300 text-sm">
          Erreur : {(error as Error).message}
        </div>
      ) : !current ? (
        <p className="text-sm text-foreground/50 text-center py-10">
          Aucun import pour l&apos;instant. Importez l&apos;export CSV « Cowork usage » pour afficher la consommation.
        </p>
      ) : (
        <>
          <p className="text-xs text-foreground/50">
            Import du {fmtDateTime(current.createdAt)} par {current.importedBy}
            {lastData && <> · dernière activité dans le fichier : {fmtDate(lastData)}</>}
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="Utilisateurs actifs" value={String(activeUsers.length)} sub={`sur ${rows.length} dans le fichier`} />
            <StatTile label="Tâches Cowork" value={totalTasks.toLocaleString("fr-FR")} />
            <StatTile label="Tâches par utilisateur actif" value={activeUsers.length ? (totalTasks / activeUsers.length).toFixed(1) : "—"} />
            <StatTile label="Jours actifs (moyenne)" value={avgDays !== null ? avgDays.toFixed(1) : "—"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="text-sm font-semibold">Top 10 utilisateurs (tâches)</h3>
              <HBarChart items={top} ariaLabel="Top 10 des utilisateurs Cowork par nombre de tâches" />
            </section>
            {hasSplit && (
              <section className="rounded-lg border bg-card p-4 space-y-3">
                <h3 className="text-sm font-semibold">Origine des tâches</h3>
                <SplitBar
                  ariaLabel="Répartition des tâches Cowork"
                  a={{ label: "Lancées par l'utilisateur", value: userTasks }}
                  b={{ label: "Planifiées", value: scheduledTasks }}
                />
                <p className="text-xs text-foreground/50">
                  Cowork est facturé à l&apos;usage (Copilot Credits) : le coût par tâche est visible dans le
                  centre d&apos;administration, Copilot → Gestion des coûts.
                </p>
              </section>
            )}
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Rechercher (nom, UPN, service)…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-full sm:w-64"
              />
              <div className="ml-auto">
                <ExportButton
                  fileBase="copilot-cowork"
                  disabled={sorted.length === 0}
                  sheets={() => [{
                    name: "Cowork",
                    columns: [
                      { header: "Nom", key: "nom", width: 28 },
                      { header: "UPN", key: "upn", width: 34 },
                      { header: "Service", key: "service", width: 20 },
                      { header: "Tâches", key: "total", width: 10 },
                      { header: "Lancées", key: "user", width: 10 },
                      { header: "Planifiées", key: "scheduled", width: 11 },
                      { header: "Jours actifs", key: "days", width: 12 },
                      { header: "Dernière activité", key: "last", width: 16 },
                    ],
                    rows: sorted.map((r) => ({
                      nom: r.displayName,
                      upn: r.upn,
                      service: userByUpn.get(r.upn.toLowerCase())?.department ?? "",
                      total: r.totalTasks,
                      user: r.userTasks ?? "",
                      scheduled: r.scheduledTasks ?? "",
                      days: r.activeDays ?? "",
                      last: r.lastActivity ?? "",
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
                    <SortableHead label="Tâches" col="total" activeCol={col} dir={dir} onToggle={toggle} className="text-right" />
                    <SortableHead label="Lancées" col="user" activeCol={col} dir={dir} onToggle={toggle} className="text-right" />
                    <SortableHead label="Planifiées" col="scheduled" activeCol={col} dir={dir} onToggle={toggle} className="text-right" />
                    <SortableHead label="Jours actifs" col="days" activeCol={col} dir={dir} onToggle={toggle} className="text-right" />
                    <SortableHead label="Dernière activité" col="last" activeCol={col} dir={dir} onToggle={toggle} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((r) => {
                    const dept = userByUpn.get(r.upn.toLowerCase())?.department;
                    return (
                      <TableRow key={r.upn}>
                        <TableCell className="max-w-[18rem]">
                          <div className="font-medium truncate">{r.displayName}</div>
                          <div className="text-xs text-foreground/40 truncate">{r.upn}{dept ? ` · ${dept}` : ""}</div>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-right font-medium">{r.totalTasks}</TableCell>
                        <TableCell className="text-sm tabular-nums text-right">{r.userTasks ?? "—"}</TableCell>
                        <TableCell className="text-sm tabular-nums text-right">{r.scheduledTasks ?? "—"}</TableCell>
                        <TableCell className="text-sm tabular-nums text-right">{r.activeDays ?? "—"}</TableCell>
                        <TableCell className="text-sm tabular-nums whitespace-nowrap">{fmtDate(r.lastActivity)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
