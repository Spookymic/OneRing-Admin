"use client";

import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Loader } from "@/components/ui/loader";
import { ExportButton } from "@/components/ui/export-button";
import { usePagination } from "@/lib/use-pagination";
import { Pagination } from "@/components/ui/pagination";
import { apiFetch } from "@/lib/api";
import { AlertTriangle, ShieldCheck, ShieldAlert, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import type { ConditionalAccessPolicy, RiskyDetection } from "@/services/graph/security";
import { cn } from "@/lib/utils";

type Tab = "policies" | "risky";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "policies", label: "Stratégies d'accès conditionnel", icon: <ShieldCheck className="h-4 w-4" /> },
  { id: "risky", label: "Connexions à risque", icon: <ShieldAlert className="h-4 w-4" /> },
];

const STATE_LABELS: Record<string, string> = {
  enabled: "Activée",
  disabled: "Désactivée",
  enabledForReportingButNotEnforced: "Rapport seul",
};

const RISK_LEVEL_LABELS: Record<string, string> = {
  high: "Élevé", medium: "Moyen", low: "Faible", hidden: "Masqué", none: "Aucun",
};

function RiskBadge({ level }: { level: string }) {
  if (level === "high") return <Badge variant="destructive">{RISK_LEVEL_LABELS[level] ?? level}</Badge>;
  if (level === "medium") {
    return (
      <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800">
        {RISK_LEVEL_LABELS[level] ?? level}
      </Badge>
    );
  }
  return <Badge variant="secondary">{RISK_LEVEL_LABELS[level] ?? level}</Badge>;
}

function ListPreview({ items }: { items: string[] }) {
  if (items.length === 0) return <span>—</span>;
  const preview = items.slice(0, 2).join(", ");
  const extra = items.length - 2;
  return <span title={items.join(", ")}>{preview}{extra > 0 ? ` +${extra}` : ""}</span>;
}

function DetailRow({ label: rowLabel, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-foreground/50 mb-0.5">{rowLabel}</p>
      <p className="text-sm">{values.join(", ")}</p>
    </div>
  );
}

function PoliciesSection() {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const { data, isLoading } = useQuery<{ supported: boolean; policies: ConditionalAccessPolicy[] }>({
    queryKey: ["conditional-access-policies"],
    queryFn: () => apiFetch("/api/security/conditional-access-policies"),
    staleTime: 5 * 60 * 1000,
  });

  const filtered = (data?.policies ?? []).filter((p) =>
    p.displayName.toLowerCase().includes(search.toLowerCase())
  );
  const pagination = usePagination(filtered, 50);

  if (data?.supported === false) {
    return (
      <div className="rounded-md border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 p-4 text-amber-700 dark:text-amber-300 text-sm">
        <div className="flex items-center gap-2 font-medium mb-1">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Stratégies indisponibles
        </div>
        <p className="text-xs">
          Lecture des politiques d&apos;accès conditionnel refusée — permission <code>Policy.Read.All</code> manquante
          ou consentement admin non accordé.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4">
        <Input
          placeholder="Rechercher une stratégie…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{filtered.length}</Badge>
          <ExportButton
            fileBase="onering-acces-conditionnel"
            disabled={!data}
            sheets={() => [{
              name: "Stratégies CA",
              columns: [
                { header: "Nom", key: "nom", width: 34 },
                { header: "État", key: "etat", width: 16 },
                { header: "Utilisateurs inclus", key: "inclus", width: 30 },
                { header: "Utilisateurs exclus", key: "exclus", width: 30 },
                { header: "Rôles inclus", key: "roles", width: 12 },
                { header: "Applications incluses", key: "appsIn", width: 26 },
                { header: "Applications exclues", key: "appsOut", width: 26 },
                { header: "Plateformes incluses", key: "platIn", width: 20 },
                { header: "Plateformes exclues", key: "platOut", width: 20 },
                { header: "Types de client", key: "clients", width: 24 },
                { header: "Emplacements inclus", key: "locIn", width: 24 },
                { header: "Emplacements exclus", key: "locOut", width: 24 },
                { header: "Risque connexion", key: "signInRisk", width: 18 },
                { header: "Risque utilisateur", key: "userRisk", width: 18 },
                { header: "Contrôles d'octroi", key: "controles", width: 30 },
                { header: "Opérateur", key: "operateur", width: 10 },
                { header: "Contrôles de session", key: "session", width: 40 },
                { header: "Modifiée le", key: "modifie", width: 14 },
              ],
              rows: filtered.map((p) => ({
                nom: p.displayName,
                etat: STATE_LABELS[p.state] ?? p.state,
                inclus: p.includedUsers.join(", "),
                exclus: p.excludedUsers.join(", "),
                roles: p.includedRolesCount,
                appsIn: p.includedApplications.join(", "),
                appsOut: p.excludedApplications.join(", "),
                platIn: p.platforms.include.join(", "),
                platOut: p.platforms.exclude.join(", "),
                clients: p.clientAppTypes.join(", "),
                locIn: p.locations.include.join(", "),
                locOut: p.locations.exclude.join(", "),
                signInRisk: p.signInRiskLevels.join(", "),
                userRisk: p.userRiskLevels.join(", "),
                controles: p.grantControls.join(", "),
                operateur: p.grantOperator ?? "",
                session: p.sessionControls.join(" ; "),
                modifie: p.modifiedDateTime ? format(new Date(p.modifiedDateTime), "dd/MM/yyyy") : "",
              })),
            }]}
          />
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table className="min-w-max">
          <TableHeader>
            <TableRow>
              <th className="p-3 w-8"></th>
              <th className="p-3 text-sm font-medium text-left">Nom</th>
              <th className="p-3 text-sm font-medium text-left">État</th>
              <th className="p-3 text-sm font-medium text-left">Utilisateurs</th>
              <th className="p-3 text-sm font-medium text-left">Applications</th>
              <th className="p-3 text-sm font-medium text-left">Contrôles</th>
              <th className="p-3 text-sm font-medium text-left">Modifiée le</th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7}><div className="py-10"><Loader label="Chargement des stratégies…" /></div></TableCell>
              </TableRow>
            ) : pagination.pageItems.map((p) => {
              const isOpen = expanded.has(p.id);
              const hasDetails =
                p.platforms.include.length + p.platforms.exclude.length +
                p.clientAppTypes.length +
                p.locations.include.length + p.locations.exclude.length +
                p.signInRiskLevels.length + p.userRiskLevels.length +
                p.sessionControls.length + p.includedRolesCount > 0;
              return (
                <Fragment key={p.id}>
                  <TableRow
                    className={hasDetails ? "cursor-pointer hover:bg-foreground/5" : undefined}
                    onClick={() => hasDetails && toggleExpand(p.id)}
                  >
                    <TableCell className="w-8">
                      {hasDetails && (
                        <ChevronRight className={cn("h-4 w-4 text-foreground/40 transition-transform", isOpen && "rotate-90")} />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{p.displayName}</TableCell>
                    <TableCell>
                      <Badge variant={p.state === "enabled" ? "default" : p.state === "disabled" ? "secondary" : "outline"}>
                        {STATE_LABELS[p.state] ?? p.state}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-foreground/60">
                      <ListPreview items={p.includedUsers} />
                      {p.excludedUsers.length > 0 && (
                        <span className="block text-xs text-foreground/40">
                          Exclus : <ListPreview items={p.excludedUsers} />
                        </span>
                      )}
                      {p.includedRolesCount > 0 && (
                        <span className="block text-xs text-foreground/40">+ {p.includedRolesCount} rôle(s) d&apos;annuaire</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-foreground/60">
                      <ListPreview items={p.includedApplications} />
                    </TableCell>
                    <TableCell className="text-sm text-foreground/60">
                      {p.grantControls.length > 0 ? p.grantControls.join(` ${p.grantOperator ?? ""} `.trim() || ", ") : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-foreground/50 whitespace-nowrap">
                      {p.modifiedDateTime ? format(new Date(p.modifiedDateTime), "dd/MM/yyyy") : "—"}
                    </TableCell>
                  </TableRow>
                  {isOpen && hasDetails && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-foreground/[0.02] border-t-0">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-2">
                          <DetailRow label="Applications exclues" values={p.excludedApplications} />
                          <DetailRow label="Plateformes incluses" values={p.platforms.include} />
                          <DetailRow label="Plateformes exclues" values={p.platforms.exclude} />
                          <DetailRow label="Types de client" values={p.clientAppTypes} />
                          <DetailRow label="Emplacements inclus" values={p.locations.include} />
                          <DetailRow label="Emplacements exclus" values={p.locations.exclude} />
                          <DetailRow label="Niveau de risque connexion" values={p.signInRiskLevels} />
                          <DetailRow label="Niveau de risque utilisateur" values={p.userRiskLevels} />
                          <DetailRow label="Contrôles de session" values={p.sessionControls} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-foreground/40 py-8">Aucune stratégie.</TableCell>
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
  );
}

function RiskySignInsSection() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery<{
    supported: boolean;
    detections: RiskyDetection[];
    hasP2?: boolean;
    licenses?: string[];
  }>({
    queryKey: ["risky-sign-ins"],
    queryFn: () => apiFetch("/api/security/risky-sign-ins"),
    staleTime: 5 * 60 * 1000,
  });

  const filtered = (data?.detections ?? []).filter(
    (d) =>
      (d.userDisplayName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (d.userPrincipalName ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const pagination = usePagination(filtered, 50);

  if (data?.supported === false) {
    return (
      <div className="rounded-md border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 p-4 text-amber-700 dark:text-amber-300 text-sm">
        <div className="flex items-center gap-2 font-medium mb-1">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Connexions à risque indisponibles
        </div>
        <p className="text-xs">
          Nécessite une licence <strong>Microsoft Entra ID P2</strong> (Identity Protection) et la permission{" "}
          <code>IdentityRiskEvent.Read.All</code>.
        </p>
        {data.hasP2 ? (
          <p className="text-xs mt-2">
            ✓ Une licence incluant Entra ID P2 est bien présente sur ce tenant — le blocage vient donc
            probablement du <strong>consentement admin</strong> non accordé pour <code>IdentityRiskEvent.Read.All</code>,
            ou d&apos;une session pas encore régénérée (déconnexion / reconnexion nécessaire après consentement).
          </p>
        ) : (
          <p className="text-xs mt-2">
            Aucune licence incluant Entra ID P2 détectée sur ce tenant.
            {data.licenses && data.licenses.length > 0 && (
              <> Licences actives : {data.licenses.join(", ")}.</>
            )}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4">
        <Input
          placeholder="Rechercher un utilisateur…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{filtered.length}</Badge>
          <ExportButton
            fileBase="onering-connexions-risque"
            disabled={!data}
            sheets={() => [{
              name: "Connexions à risque",
              columns: [
                { header: "Utilisateur", key: "user", width: 28 },
                { header: "UPN", key: "upn", width: 34 },
                { header: "Niveau", key: "niveau", width: 12 },
                { header: "Type", key: "type", width: 24 },
                { header: "Motif", key: "motif", width: 36 },
                { header: "IP", key: "ip", width: 16 },
                { header: "Localisation", key: "loc", width: 24 },
                { header: "Détectée le", key: "date", width: 16 },
              ],
              rows: filtered.map((d) => ({
                user: d.userDisplayName ?? "",
                upn: d.userPrincipalName ?? "",
                niveau: RISK_LEVEL_LABELS[d.riskLevel] ?? d.riskLevel,
                type: d.riskEventType,
                motif: d.riskDetail,
                ip: d.ipAddress ?? "",
                loc: d.location ?? "",
                date: d.detectedDateTime ? format(new Date(d.detectedDateTime), "dd/MM/yyyy HH:mm") : "",
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
              <th className="p-3 text-sm font-medium text-left">Niveau</th>
              <th className="p-3 text-sm font-medium text-left">Type</th>
              <th className="p-3 text-sm font-medium text-left">Motif</th>
              <th className="p-3 text-sm font-medium text-left">IP</th>
              <th className="p-3 text-sm font-medium text-left">Localisation</th>
              <th className="p-3 text-sm font-medium text-left">Détectée le</th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7}><div className="py-10"><Loader label="Chargement des détections…" /></div></TableCell>
              </TableRow>
            ) : pagination.pageItems.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">
                  {d.userDisplayName ?? d.userPrincipalName ?? "—"}
                  {d.userDisplayName && d.userPrincipalName && (
                    <span className="block text-xs text-foreground/40">{d.userPrincipalName}</span>
                  )}
                </TableCell>
                <TableCell><RiskBadge level={d.riskLevel} /></TableCell>
                <TableCell className="text-sm text-foreground/60">{d.riskEventType}</TableCell>
                <TableCell className="text-sm text-foreground/60">{d.riskDetail}</TableCell>
                <TableCell className="text-sm font-mono text-foreground/50">{d.ipAddress ?? "—"}</TableCell>
                <TableCell className="text-sm text-foreground/60">{d.location ?? "—"}</TableCell>
                <TableCell className="text-sm text-foreground/50 whitespace-nowrap">
                  {d.detectedDateTime ? format(new Date(d.detectedDateTime), "dd/MM/yyyy HH:mm") : "—"}
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-foreground/40 py-8">Aucune détection.</TableCell>
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
  );
}

export default function ConditionalAccessPage() {
  const [tab, setTab] = useState<Tab>("policies");

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-2xl font-bold">Accès conditionnel</h2>
        <p className="text-sm text-foreground/50 mt-0.5">
          Stratégies d&apos;accès conditionnel du tenant et connexions signalées à risque par Identity Protection.
        </p>
      </div>

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

      {tab === "policies" ? <PoliciesSection /> : <RiskySignInsSection />}
    </div>
  );
}
