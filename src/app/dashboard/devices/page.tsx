"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Loader } from "@/components/ui/loader";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ExportButton } from "@/components/ui/export-button";
import { Trash2, AlertTriangle, Monitor, UserX, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Machine {
  key: string;
  name: string;
  os: string | null;
  osVersion: string | null;
  serial: string | null;
  trustType: string | null;
  lastActivity: string | null;
  owner: string | null;
  ownerEnabled?: boolean | null;
  compliance: string | null;
  sources: { entra?: { id: string }; intune?: { id: string }; autopilot?: { id: string } };
}

interface DevicesResponse {
  supported: { entra: boolean; intune: boolean; autopilot: boolean };
  machines: Machine[];
}

const sourceLabels: { key: "entra" | "intune" | "autopilot"; label: string }[] = [
  { key: "entra", label: "Entra" },
  { key: "intune", label: "Intune" },
  { key: "autopilot", label: "Autopilot" },
];

type SortKey = "name" | "os" | "owner" | "presence" | "lastActivity";

/** Valeur comparable d'une machine pour une colonne donnée. */
function sortValue(m: Machine, key: SortKey): string | number {
  switch (key) {
    case "name": return m.name.toLowerCase();
    case "os": return [m.os, m.osVersion].filter(Boolean).join(" ").toLowerCase();
    case "owner": return (m.owner ?? "").toLowerCase();
    case "presence": return Object.keys(m.sources).length;
    case "lastActivity": return m.lastActivity ? new Date(m.lastActivity).getTime() : 0;
  }
}

function complianceBadge(c: string | null) {
  if (!c) return null;
  const ok = c === "compliant";
  const warn = c === "noncompliant" || c === "nonCompliant";
  return (
    <Badge variant={ok ? "secondary" : warn ? "destructive" : "outline"} className="text-[10px]">
      {ok ? "Conforme" : warn ? "Non conforme" : c}
    </Badge>
  );
}

function SortableHead({
  label, sortKey, sort, onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className="p-3 text-sm font-medium text-left">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        aria-label={`Trier par ${label}`}
      >
        {label}
        <Icon className={active ? "h-3.5 w-3.5" : "h-3.5 w-3.5 text-foreground/30"} />
      </button>
    </th>
  );
}

export default function DevicesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<Machine | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [highlightDupes, setHighlightDupes] = useState(false);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const { data, isLoading, error } = useQuery<DevicesResponse>({
    queryKey: ["devices"],
    queryFn: () => apiFetch("/api/devices"),
    staleTime: 5 * 60 * 1000,
  });

  const del = useMutation({
    mutationFn: (m: Machine) =>
      apiFetch<{ success: boolean; results: { source: string; ok: boolean; error?: string }[] }>("/api/devices/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: m.name,
          entraId: m.sources.entra?.id,
          intuneId: m.sources.intune?.id,
          autopilotId: m.sources.autopilot?.id,
        }),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      setConfirm(null);
      if (res.success) {
        toast({ title: "Machine supprimée", description: `Retirée de : ${res.results.filter((r) => r.ok).map((r) => r.source).join(", ")}` });
      } else {
        const failed = res.results.filter((r) => !r.ok);
        toast({
          title: "Suppression partielle",
          description: `Échec sur : ${failed.map((f) => f.source).join(", ")}`,
          variant: "destructive",
        });
      }
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const machines = (data?.machines ?? [])
    .filter(
      (m) =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        (m.serial ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (m.owner ?? "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), "fr", { sensitivity: "base" });
      if (cmp === 0 && sort.key !== "name") cmp = a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
      return sort.dir === "asc" ? cmp : -cmp;
    });

  // Noms apparaissant sur plusieurs machines (sur l'ensemble, indépendamment du filtre)
  const dupeNames = (() => {
    const counts = new Map<string, number>();
    for (const m of data?.machines ?? []) {
      const n = m.name.trim().toLowerCase();
      if (n && n !== "—") counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, c]) => c > 1).map(([n]) => n));
  })();
  const isDupe = (m: Machine) => dupeNames.has(m.name.trim().toLowerCase());

  const allUnsupported = data && !data.supported.entra && !data.supported.intune && !data.supported.autopilot;

  if (error) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Postes de travail</h2>
        <div className="rounded-md border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 p-4 text-red-700 dark:text-red-300 text-sm">
          Erreur : {(error as Error).message}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-2 gap-3">
        <div>
          <h2 className="text-2xl font-bold">Postes de travail</h2>
          <p className="text-sm text-foreground/50 mt-0.5">
            Vue unifiée des machines (Entra ID, Intune, Autopilot). « Supprimer partout » retire la machine de
            toutes les sources où elle existe — <strong>irréversible</strong>.
          </p>
        </div>
        <ExportButton
          fileBase="onering-postes-de-travail"
          disabled={!data}
          sheets={() => [{
            name: "Postes de travail",
            columns: [
              { header: "Nom", key: "nom", width: 28 },
              { header: "OS", key: "os", width: 14 },
              { header: "Version", key: "ver", width: 16 },
              { header: "N° série", key: "serie", width: 20 },
              { header: "Propriétaire", key: "owner", width: 30 },
              { header: "Statut propriétaire", key: "ownerStatus", width: 18 },
              { header: "Conformité", key: "conf", width: 14 },
              { header: "Dernière activité", key: "act", width: 16 },
              { header: "Entra", key: "entra", width: 8 },
              { header: "Intune", key: "intune", width: 8 },
              { header: "Autopilot", key: "autopilot", width: 10 },
            ],
            rows: machines.map((m) => ({
              nom: m.name, os: m.os ?? "", ver: m.osVersion ?? "", serie: m.serial ?? "",
              owner: m.owner ?? "",
              ownerStatus: !m.owner ? "" : m.ownerEnabled === false ? "Désactivé" : m.ownerEnabled === true ? "Actif" : "Inconnu",
              conf: m.compliance ?? "",
              act: m.lastActivity ? format(new Date(m.lastActivity), "dd/MM/yyyy") : "",
              entra: m.sources.entra ? "Oui" : "", intune: m.sources.intune ? "Oui" : "", autopilot: m.sources.autopilot ? "Oui" : "",
            })),
          }]}
        />
      </div>

      {data && (
        <p className="text-xs text-foreground/40 mb-4">
          Sources : {sourceLabels.map((s) => `${s.label} ${data.supported[s.key] ? "✓" : "✗ (permission manquante)"}`).join(" · ")}
        </p>
      )}

      {allUnsupported ? (
        <div className="rounded-md border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 p-4 text-amber-700 dark:text-amber-300 text-sm">
          <div className="flex items-center gap-2 font-medium mb-1"><AlertTriangle className="h-4 w-4 shrink-0" />Aucune source disponible</div>
          <p className="text-xs">Les permissions <code>Device.ReadWrite.All</code>, <code>DeviceManagementManagedDevices.ReadWrite.All</code> et <code>DeviceManagementServiceConfig.ReadWrite.All</code> doivent être accordées (puis reconnexion).</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Input placeholder="Rechercher (nom, série, propriétaire)…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
            <Badge variant="secondary" className="self-center">{machines.length}</Badge>
            <label className="flex items-center gap-2 text-sm text-foreground/70 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={highlightDupes}
                onChange={(e) => setHighlightDupes(e.target.checked)}
                className="h-4 w-4 rounded border-foreground/30 accent-amber-500 cursor-pointer"
              />
              Surligner les noms en doublon
              {dupeNames.size > 0 && (
                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:text-amber-400">{dupeNames.size}</Badge>
              )}
            </label>
          </div>

          <div className="rounded-md border bg-card overflow-x-auto">
            {isLoading ? (
              <div className="py-16"><Loader label="Chargement des postes…" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label="Machine" sortKey="name" sort={sort} onSort={toggleSort} />
                    <SortableHead label="OS" sortKey="os" sort={sort} onSort={toggleSort} />
                    <SortableHead label="Propriétaire" sortKey="owner" sort={sort} onSort={toggleSort} />
                    <SortableHead label="Présence" sortKey="presence" sort={sort} onSort={toggleSort} />
                    <SortableHead label="Dernière activité" sortKey="lastActivity" sort={sort} onSort={toggleSort} />
                    <th className="p-3 text-sm font-medium text-right">Action</th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {machines.map((m) => (
                    <TableRow
                      key={m.key}
                      className={highlightDupes && isDupe(m) ? "bg-amber-50 dark:bg-amber-950/30" : undefined}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Monitor className="h-4 w-4 text-foreground/40 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{m.name}</p>
                            <p className="text-xs text-foreground/40">
                              {m.serial ? `SN ${m.serial}` : ""}{m.compliance ? " · " : ""}
                            </p>
                          </div>
                          {complianceBadge(m.compliance)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-foreground/60">
                        {[m.os, m.osVersion].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-foreground/60">
                        {m.owner ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={m.ownerEnabled === false ? "text-foreground/80" : undefined}>{m.owner}</span>
                            {m.ownerEnabled === false && (
                              <Badge variant="destructive" className="text-[10px] gap-1">
                                <UserX className="h-3 w-3" />
                                Désactivé
                              </Badge>
                            )}
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {sourceLabels.filter((s) => m.sources[s.key]).map((s) => (
                            <Badge key={s.key} variant="outline" className="text-[10px]">{s.label}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-foreground/60">
                        {m.lastActivity ? format(new Date(m.lastActivity), "dd/MM/yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 border-red-200 dark:border-red-900 hover:bg-red-50 dark:bg-red-950/40 h-7"
                          onClick={() => setConfirm(m)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Supprimer partout
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {machines.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-foreground/40 py-8">Aucune machine.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}

      {/* Confirmation de suppression multi-sources */}
      <Dialog open={confirm !== null} onOpenChange={(v) => { if (!v) setConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer « {confirm?.name} » partout ?</DialogTitle>
          </DialogHeader>
          {confirm && (
            <div className="text-sm space-y-3">
              <p className="text-foreground/70">
                La machine sera supprimée des sources suivantes. Cette action est <strong>irréversible</strong> (aucun rollback possible).
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sourceLabels.filter((s) => confirm.sources[s.key]).map((s) => (
                  <Badge key={s.key} variant="destructive" className="text-xs">{s.label}</Badge>
                ))}
              </div>
              {confirm.serial && <p className="text-xs text-foreground/40">N° série : {confirm.serial}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={del.isPending}>Annuler</Button>
            <Button variant="destructive" onClick={() => confirm && del.mutate(confirm)} disabled={del.isPending}>
              {del.isPending ? "Suppression…" : "Supprimer partout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
