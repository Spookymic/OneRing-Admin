"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { AppWindow, KeySquare, ShieldAlert, UserPlus, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Loader } from "@/components/ui/loader";
import { ExportButton } from "@/components/ui/export-button";
import { AddAppOwnerDialog } from "@/components/applications/add-app-owner-dialog";
import { apiFetch } from "@/lib/api";
import { STALE_DAYS } from "@/lib/credential-usage";
import {
  APP_ACTIVITY_LABELS, PUBLISHER_LABELS, REDIRECT_ISSUE_HINTS, REDIRECT_ISSUE_LABELS, RISK_LABELS,
  isDormant,
  type AppActivityStatus, type AppInventoryItem, type ApplicationsReport, type PermissionRisk,
  type PublisherKind, type ServicePrincipalAccess,
} from "@/lib/app-security";

type Tab = "apps" | "permissions" | "consents";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "apps", label: "Inscriptions", icon: <AppWindow className="size-4" /> },
  { id: "permissions", label: "Permissions applicatives", icon: <ShieldAlert className="size-4" /> },
  { id: "consents", label: "Consentements délégués", icon: <Users className="size-4" /> },
];

type Response = ApplicationsReport & { supported: boolean };

const RISK_BADGE: Record<PermissionRisk, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  high: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  normal: "bg-foreground/5 text-foreground/60",
};

const STATUS_BADGE: Record<AppActivityStatus, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  dormant: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  never: "bg-foreground/10 text-foreground/70",
  new: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  unknown: "bg-foreground/5 text-foreground/40",
};

const PUBLISHER_BADGE: Record<PublisherKind, string> = {
  internal: "bg-primary/10 text-primary",
  microsoft: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  "third-party": "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  "managed-identity": "bg-foreground/10 text-foreground/70",
  unknown: "bg-foreground/5 text-foreground/50",
};

const fmtDate = (iso: string | null | undefined) => (iso ? format(new Date(iso), "dd/MM/yyyy") : "");
const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true, locale: fr });
const pill = (cls: string, text: string, title?: string) => (
  <span title={title} className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${cls}`}>{text}</span>
);
const ownerNames = (a: AppInventoryItem) => a.owners.map((o) => o.userPrincipalName ?? o.displayName).join(", ");
const hostOf = (url: string) => { try { return new URL(url).host; } catch { return url; } };

function Chip<T extends string>({ id, current, onSelect, label, count }: {
  id: T; current: T; onSelect: (id: T) => void; label: string; count?: number;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        current === id ? "border-primary bg-primary/10 text-primary" : "hover:bg-foreground/5 text-foreground/70"
      }`}
    >
      {label}{count != null ? ` (${count})` : ""}
    </button>
  );
}

function PermissionList({ items }: { items: { value: string; risk: PermissionRisk }[] }) {
  const sorted = [...items].sort((a, b) => (a.risk === b.risk ? a.value.localeCompare(b.value) : a.risk === "critical" ? -1 : b.risk === "critical" ? 1 : a.risk === "high" ? -1 : 1));
  return (
    <div className="flex flex-wrap gap-1">
      {sorted.map((p, i) => <span key={`${p.value}-${i}`}>{pill(RISK_BADGE[p.risk], p.value, RISK_LABELS[p.risk])}</span>)}
    </div>
  );
}

function PublisherCell({ sp }: { sp: ServicePrincipalAccess }) {
  return (
    <div className="flex flex-wrap items-center gap-1 mt-0.5">
      {pill(PUBLISHER_BADGE[sp.publisher], PUBLISHER_LABELS[sp.publisher])}
      {sp.publisher === "third-party" && (sp.verifiedPublisher
        ? pill("bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", "Éditeur vérifié", sp.verifiedPublisher)
        : pill("bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", "Éditeur non vérifié"))}
      {!sp.enabled && pill("bg-foreground/10 text-foreground/60", "Désactivée")}
      {sp.publisherName && sp.publisher === "third-party" && (
        <span className="text-xs text-foreground/50 truncate max-w-56">{sp.verifiedPublisher ?? sp.publisherName}</span>
      )}
    </div>
  );
}

// ── Onglet Inscriptions ─────────────────────────────────────────────

type AppFilter = "all" | "sensitive" | "dormant" | "noowner" | "longlived" | "redirect" | "federated";

function AppsTab({ data, search }: { data: Response; search: string }) {
  const [filter, setFilter] = useState<AppFilter>("all");
  const [ownerTarget, setOwnerTarget] = useState<{ id: string; displayName: string } | null>(null);
  const apps = data.apps;
  const tests: Record<AppFilter, (a: AppInventoryItem) => boolean> = {
    all: () => true,
    sensitive: (a) => a.risk !== "normal",
    dormant: (a) => isDormant(a.status),
    noowner: (a) => a.owners.length === 0,
    longlived: (a) => a.longLivedCredentials > 0,
    redirect: (a) => a.redirectFindings.length > 0,
    federated: (a) => a.federated.length > 0,
  };
  const count = (f: AppFilter) => apps.filter(tests[f]).length;
  const q = search.toLowerCase();
  const rows = apps.filter(tests[filter]).filter((a) => a.displayName.toLowerCase().includes(q) || a.appId.includes(q));

  const hints: Partial<Record<AppFilter, string>> = {
    sensitive: "Permissions critiques (élévation jusqu'à administrateur général) ou élevées (accès massif aux mails, fichiers, conversations) accordées à l'application.",
    dormant: `Aucune connexion depuis ${STALE_DAYS} jours, ou jamais. Les applications créées il y a moins de ${STALE_DAYS} jours sont exclues. Candidates au ménage après vérification avec le propriétaire.`,
    noowner: "Personne n'est responsable de l'application. Utiliser « désigner » pour lui attribuer un propriétaire.",
    longlived: "Au moins un secret valable plus de 12 mois ou un certificat valable plus de 24 mois. Détail dans Secrets & certificats.",
    redirect: "Adresses de redirection exploitables pour détourner des jetons (HTTP, joker, tunnel, sous-domaine réclamable).",
    federated: "L'application s'authentifie sans secret, par un jeton émis par un autre fournisseur (GitHub Actions, Kubernetes, autre tenant…). Vérifier que l'émetteur et le sujet sont attendus.",
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-3">
        <Chip id="all" current={filter} onSelect={setFilter} label="Toutes" count={apps.length} />
        <Chip id="sensitive" current={filter} onSelect={setFilter} label="Permissions sensibles" count={count("sensitive")} />
        {data.usageSupported && <Chip id="dormant" current={filter} onSelect={setFilter} label="Dormantes" count={count("dormant")} />}
        <Chip id="noowner" current={filter} onSelect={setFilter} label="Sans propriétaire" count={count("noowner")} />
        <Chip id="longlived" current={filter} onSelect={setFilter} label="Identifiants longue durée" count={count("longlived")} />
        <Chip id="redirect" current={filter} onSelect={setFilter} label="Redirections risquées" count={count("redirect")} />
        <Chip id="federated" current={filter} onSelect={setFilter} label="Identifiants fédérés" count={count("federated")} />
      </div>
      {hints[filter] && <p className="text-xs text-foreground/50 mb-3">{hints[filter]}</p>}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <th className="p-3 text-sm font-medium text-left">Application</th>
              <th className="p-3 text-sm font-medium text-left">Activité</th>
              <th className="p-3 text-sm font-medium text-left">Identifiants</th>
              <th className="p-3 text-sm font-medium text-left">Permissions</th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="align-top max-w-80">
                  <div className="font-medium">{a.displayName}</div>
                  <div className="text-xs text-foreground/50">
                    {a.createdDateTime ? `Créée le ${fmtDate(a.createdDateTime)}` : "Date de création inconnue"}
                    {a.creator && <> · par <span className="text-foreground/70">{a.creator.by}</span></>}
                  </div>
                  <div className="text-xs text-foreground/50">
                    {a.owners.length > 0 ? (
                      <>Propriétaire(s) : <span className="text-foreground/70">{ownerNames(a)}</span></>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400 font-medium">Aucun propriétaire</span>
                    )}{" "}
                    <button
                      type="button"
                      onClick={() => setOwnerTarget({ id: a.id, displayName: a.displayName })}
                      className="inline-flex items-center gap-0.5 text-primary hover:underline"
                    >
                      <UserPlus className="size-3" /> {a.owners.length > 0 ? "ajouter" : "désigner"}
                    </button>
                  </div>
                  {a.redirectFindings.map((f) => (
                    <div key={f.uri} className="text-xs mt-1 text-red-700 dark:text-red-400 break-all">
                      {f.issues.map((i) => (
                        <span key={i} title={REDIRECT_ISSUE_HINTS[i]} className="font-medium">{REDIRECT_ISSUE_LABELS[i]} : </span>
                      ))}
                      {f.uri}
                    </div>
                  ))}
                </TableCell>
                <TableCell className="align-top text-sm">
                  {pill(STATUS_BADGE[a.status], APP_ACTIVITY_LABELS[a.status])}
                  {a.activity?.lastSignIn && <div className="text-xs text-foreground/50 mt-1">{ago(a.activity.lastSignIn)}</div>}
                </TableCell>
                <TableCell className="align-top text-xs text-foreground/70">
                  {a.secrets + a.certificates === 0 && a.federated.length === 0 && <span className="text-foreground/40">Aucun</span>}
                  {a.secrets > 0 && <div>{a.secrets} secret{a.secrets > 1 ? "s" : ""}</div>}
                  {a.certificates > 0 && <div>{a.certificates} certificat{a.certificates > 1 ? "s" : ""}</div>}
                  {a.expiredCredentials > 0 && <div className="text-red-600">{a.expiredCredentials} expiré{a.expiredCredentials > 1 ? "s" : ""}</div>}
                  {a.longLivedCredentials > 0 && (
                    <div className="text-amber-700 dark:text-amber-400 font-medium">{a.longLivedCredentials} de durée excessive</div>
                  )}
                  {a.federated.map((f) => (
                    <div key={`${f.issuer}-${f.subject}`} className="mt-1 flex items-start gap-1" title={`${f.issuer}\n${f.subject}`}>
                      <KeySquare className="size-3 mt-0.5 shrink-0" />
                      <span className="break-all">Fédéré : {hostOf(f.issuer)} · <span className="text-foreground/50">{f.subject}</span></span>
                    </div>
                  ))}
                </TableCell>
                <TableCell className="align-top">
                  {a.risk === "normal" ? (
                    <span className="text-xs text-foreground/40">Rien de sensible</span>
                  ) : (
                    <div className="space-y-1">
                      {pill(RISK_BADGE[a.risk], `Risque ${RISK_LABELS[a.risk].toLowerCase()}`)}
                      <div className="text-xs text-foreground/60 max-w-72">{a.sensitivePermissions.join(", ")}</div>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-foreground/40 py-8">Aucune application.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <AddAppOwnerDialog app={ownerTarget} onClose={() => setOwnerTarget(null)} />
    </>
  );
}

// ── Onglets Permissions applicatives et Consentements délégués ──────

type RiskFilter = "all" | "critical" | "high";
type OriginFilter = "all" | "third-party" | "unverified" | "internal" | "microsoft" | "managed-identity";

function originMatch(sp: ServicePrincipalAccess, f: OriginFilter): boolean {
  if (f === "all") return true;
  if (f === "unverified") return sp.publisher === "third-party" && !sp.verifiedPublisher;
  return sp.publisher === f;
}

function SpFilters({ list, risk, setRisk, origin, setOrigin, riskOf }: {
  list: ServicePrincipalAccess[];
  risk: RiskFilter; setRisk: (r: RiskFilter) => void;
  origin: OriginFilter; setOrigin: (o: OriginFilter) => void;
  riskOf: (sp: ServicePrincipalAccess) => PermissionRisk;
}) {
  const n = (r: RiskFilter, o: OriginFilter) =>
    list.filter((sp) => (r === "all" || riskOf(sp) === r) && originMatch(sp, o)).length;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 mb-3">
      <div className="flex flex-wrap gap-2">
        <Chip id="all" current={risk} onSelect={setRisk} label="Tous risques" count={n("all", origin)} />
        <Chip id="critical" current={risk} onSelect={setRisk} label="Critique" count={n("critical", origin)} />
        <Chip id="high" current={risk} onSelect={setRisk} label="Élevé" count={n("high", origin)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip id="all" current={origin} onSelect={setOrigin} label="Toutes origines" />
        <Chip id="third-party" current={origin} onSelect={setOrigin} label="Tierces" count={n(risk, "third-party")} />
        <Chip id="unverified" current={origin} onSelect={setOrigin} label="Éditeur non vérifié" count={n(risk, "unverified")} />
        <Chip id="internal" current={origin} onSelect={setOrigin} label="Internes" count={n(risk, "internal")} />
        <Chip id="microsoft" current={origin} onSelect={setOrigin} label="Microsoft" count={n(risk, "microsoft")} />
        <Chip id="managed-identity" current={origin} onSelect={setOrigin} label="Identités managées" count={n(risk, "managed-identity")} />
      </div>
    </div>
  );
}

const appRiskOf = (sp: ServicePrincipalAccess): PermissionRisk =>
  sp.appPermissions.some((p) => p.risk === "critical") ? "critical" : sp.appPermissions.some((p) => p.risk === "high") ? "high" : "normal";
const delegatedRiskOf = (sp: ServicePrincipalAccess): PermissionRisk => {
  const all = sp.delegated.flatMap((d) => d.scopes);
  return all.some((s) => s.risk === "critical") ? "critical" : all.some((s) => s.risk === "high") ? "high" : "normal";
};

function PermissionsTab({ data, search }: { data: Response; search: string }) {
  const [risk, setRisk] = useState<RiskFilter>("all");
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const list = data.servicePrincipals.filter((sp) => sp.appPermissions.length > 0);
  const q = search.toLowerCase();
  const rows = list
    .filter((sp) => (risk === "all" || appRiskOf(sp) === risk) && originMatch(sp, origin))
    .filter((sp) => sp.displayName.toLowerCase().includes(q) || sp.appPermissions.some((p) => p.value.toLowerCase().includes(q)));
  return (
    <>
      <p className="text-xs text-foreground/50 mb-3">
        Droits accordés à l&apos;application elle-même (sans utilisateur connecté), avec un consentement administrateur.
        Une permission critique permet de prendre le contrôle du tenant si le secret ou le certificat de l&apos;application fuite.
      </p>
      <SpFilters list={list} risk={risk} setRisk={setRisk} origin={origin} setOrigin={setOrigin} riskOf={appRiskOf} />
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <th className="p-3 text-sm font-medium text-left">Application</th>
              <th className="p-3 text-sm font-medium text-left">Permissions</th>
              <th className="p-3 text-sm font-medium text-left">Dernière connexion</th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((sp) => {
              const byResource = new Map<string, ServicePrincipalAccess["appPermissions"]>();
              sp.appPermissions.forEach((p) => byResource.set(p.resource, [...(byResource.get(p.resource) ?? []), p]));
              return (
                <TableRow key={sp.id}>
                  <TableCell className="align-top max-w-72">
                    <div className="font-medium">{sp.displayName}</div>
                    <PublisherCell sp={sp} />
                  </TableCell>
                  <TableCell className="align-top">
                    {[...byResource.entries()].map(([resource, perms]) => (
                      <div key={resource} className="mb-1.5">
                        <div className="text-xs text-foreground/50 mb-0.5">{resource}</div>
                        <PermissionList items={perms} />
                      </div>
                    ))}
                  </TableCell>
                  <TableCell className="align-top text-xs text-foreground/60 whitespace-nowrap">
                    {data.usageSupported ? (sp.lastSignIn ? ago(sp.lastSignIn) : "Aucune enregistrée") : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-foreground/40 py-8">Aucune permission applicative.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function ConsentsTab({ data, search }: { data: Response; search: string }) {
  const [risk, setRisk] = useState<RiskFilter>("all");
  const [origin, setOrigin] = useState<OriginFilter>("third-party");
  const list = data.servicePrincipals.filter((sp) => sp.delegated.length > 0);
  const q = search.toLowerCase();
  const rows = list
    .filter((sp) => (risk === "all" || delegatedRiskOf(sp) === risk) && originMatch(sp, origin))
    .filter((sp) => sp.displayName.toLowerCase().includes(q) || sp.delegated.some((d) => d.scopes.some((s) => s.value.toLowerCase().includes(q))));
  return (
    <>
      <p className="text-xs text-foreground/50 mb-3">
        Droits d&apos;agir au nom des utilisateurs, accordés par un administrateur pour toute l&apos;organisation ou par
        chaque utilisateur individuellement. Une application tierce non vérifiée avec un accès aux mails ou aux fichiers
        est un vecteur classique d&apos;hameçonnage par consentement.
      </p>
      <SpFilters list={list} risk={risk} setRisk={setRisk} origin={origin} setOrigin={setOrigin} riskOf={delegatedRiskOf} />
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <th className="p-3 text-sm font-medium text-left">Application</th>
              <th className="p-3 text-sm font-medium text-left">Consentement</th>
              <th className="p-3 text-sm font-medium text-left">Autorisations</th>
              <th className="p-3 text-sm font-medium text-left">Dernière connexion</th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((sp) => (
              <TableRow key={sp.id}>
                <TableCell className="align-top max-w-72">
                  <div className="font-medium">{sp.displayName}</div>
                  <PublisherCell sp={sp} />
                </TableCell>
                <TableCell className="align-top text-xs whitespace-nowrap">
                  {sp.delegated.some((d) => d.adminConsent) && <div className="font-medium">Toute l&apos;organisation (admin)</div>}
                  {Math.max(0, ...sp.delegated.map((d) => d.userCount)) > 0 && (
                    <div className="text-foreground/70">
                      {Math.max(...sp.delegated.map((d) => d.userCount))} utilisateur(s)
                    </div>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  {sp.delegated.map((d) => (
                    <div key={d.resource} className="mb-1.5">
                      <div className="text-xs text-foreground/50 mb-0.5">{d.resource}</div>
                      <PermissionList items={d.scopes} />
                    </div>
                  ))}
                </TableCell>
                <TableCell className="align-top text-xs text-foreground/60 whitespace-nowrap">
                  {data.usageSupported ? (sp.lastSignIn ? ago(sp.lastSignIn) : "Aucune enregistrée") : "—"}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-foreground/40 py-8">Aucun consentement.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-foreground/40 mt-3">
        Pour révoquer un consentement : Entra → Applications d&apos;entreprise → application → Autorisations.
      </p>
    </>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function ApplicationsPage() {
  // Lien profond ?tab=permissions|consents
  const initialTab = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>(
    initialTab === "permissions" || initialTab === "consents" ? initialTab : "apps"
  );
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery<Response>({
    queryKey: ["applications"],
    queryFn: () => apiFetch<Response>("/api/applications"),
    staleTime: 10 * 60 * 1000,
  });

  const sheets = useMemo(() => () => {
    if (!data) return [];
    const perm = (sp: ServicePrincipalAccess) => ({
      app: sp.displayName, appId: sp.appId, origin: PUBLISHER_LABELS[sp.publisher],
      verified: sp.publisher === "third-party" ? (sp.verifiedPublisher ?? "Non vérifié") : "",
      last: fmtDate(sp.lastSignIn),
    });
    return [
      {
        name: "Inscriptions",
        columns: [
          { header: "Application", key: "app", width: 36 },
          { header: "App ID", key: "appId", width: 38 },
          { header: "Créée le", key: "created", width: 14 },
          { header: "Créée par", key: "creator", width: 32 },
          { header: "Propriétaires", key: "owners", width: 40 },
          { header: "Activité", key: "status", width: 18 },
          { header: "Dernière connexion", key: "last", width: 16 },
          { header: "Secrets", key: "secrets", width: 9 },
          { header: "Certificats", key: "certs", width: 11 },
          { header: "Expirés", key: "expired", width: 9 },
          { header: "Durée excessive", key: "long", width: 15 },
          { header: "Identifiants fédérés", key: "fic", width: 50 },
          { header: "Redirections risquées", key: "redirects", width: 50 },
          { header: "Risque", key: "risk", width: 10 },
          { header: "Permissions sensibles", key: "perms", width: 50 },
        ],
        rows: data.apps.map((a) => ({
          app: a.displayName, appId: a.appId, created: fmtDate(a.createdDateTime),
          creator: a.creator ? `${a.creator.by} (${fmtDate(a.creator.at)})` : "",
          owners: ownerNames(a) || "(aucun)", status: APP_ACTIVITY_LABELS[a.status], last: fmtDate(a.activity?.lastSignIn),
          secrets: a.secrets, certs: a.certificates, expired: a.expiredCredentials, long: a.longLivedCredentials,
          fic: a.federated.map((f) => `${f.issuer} | ${f.subject}`).join(" ; "),
          redirects: a.redirectFindings.map((f) => `${f.uri} (${f.issues.map((i) => REDIRECT_ISSUE_LABELS[i]).join(", ")})`).join(" ; "),
          risk: RISK_LABELS[a.risk], perms: a.sensitivePermissions.join(", "),
        })),
      },
      {
        name: "Permissions applicatives",
        columns: [
          { header: "Application", key: "app", width: 36 },
          { header: "App ID", key: "appId", width: 38 },
          { header: "Origine", key: "origin", width: 16 },
          { header: "Éditeur vérifié", key: "verified", width: 28 },
          { header: "Ressource", key: "resource", width: 28 },
          { header: "Permission", key: "perm", width: 36 },
          { header: "Risque", key: "risk", width: 10 },
          { header: "Dernière connexion", key: "last", width: 16 },
        ],
        rows: data.servicePrincipals.flatMap((sp) =>
          sp.appPermissions.map((p) => ({ ...perm(sp), resource: p.resource, perm: p.value, risk: RISK_LABELS[p.risk] }))
        ),
      },
      {
        name: "Consentements délégués",
        columns: [
          { header: "Application", key: "app", width: 36 },
          { header: "App ID", key: "appId", width: 38 },
          { header: "Origine", key: "origin", width: 16 },
          { header: "Éditeur vérifié", key: "verified", width: 28 },
          { header: "Ressource", key: "resource", width: 28 },
          { header: "Consentement admin", key: "admin", width: 18 },
          { header: "Utilisateurs", key: "users", width: 12 },
          { header: "Autorisations", key: "scopes", width: 60 },
          { header: "Risque", key: "risk", width: 10 },
          { header: "Dernière connexion", key: "last", width: 16 },
        ],
        rows: data.servicePrincipals.flatMap((sp) =>
          sp.delegated.map((d) => ({
            ...perm(sp), resource: d.resource, admin: d.adminConsent ? "Oui" : "", users: d.userCount,
            scopes: d.scopes.map((s) => s.value).join(" "),
            risk: RISK_LABELS[d.scopes.some((s) => s.risk === "critical") ? "critical" : d.scopes.some((s) => s.risk === "high") ? "high" : "normal"],
          }))
        ),
      },
    ];
  }, [data]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-bold">Applications</h2>
          <p className="text-sm text-foreground/50 mt-0.5">
            Inscriptions d&apos;applications du tenant et droits accordés à toutes les applications d&apos;entreprise.
            Secrets et certificats : <Link href="/dashboard/credentials" className="text-primary hover:underline">écran dédié</Link>.
          </p>
        </div>
        <ExportButton fileBase="onering-applications" disabled={!data?.supported} sheets={sheets} />
      </div>

      <div className="flex flex-wrap gap-1 mb-4" role="tablist">
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === id ? "bg-primary text-white" : "text-foreground/60 hover:bg-foreground/5"
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-md border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 p-4 text-red-700 dark:text-red-300 text-sm">
          Erreur : {(error as Error).message}
        </div>
      ) : isLoading || !data ? (
        <div className="py-16"><Loader label="Analyse des applications…" /></div>
      ) : !data.supported ? (
        <div className="rounded-md border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 p-4 text-amber-700 dark:text-amber-300 text-sm">
          Lecture des applications indisponible : le compte connecté doit pouvoir lire l&apos;annuaire (Application.Read.All).
        </div>
      ) : (
        <>
          {!data.usageSupported && (
            <div className="rounded-md border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 p-3 mb-4 text-amber-700 dark:text-amber-300 text-sm">
              Activité des applications indisponible : le compte connecté doit avoir un rôle de lecture des rapports
              (Lecteur général, Lecteur sécurité…) et la permission AuditLog.Read.All.
            </div>
          )}
          <Input
            placeholder={tab === "apps" ? "Rechercher une application ou un App ID..." : "Rechercher une application ou une permission..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm mb-3"
          />
          {tab === "apps" && <AppsTab data={data} search={search} />}
          {tab === "permissions" && <PermissionsTab data={data} search={search} />}
          {tab === "consents" && <ConsentsTab data={data} search={search} />}
        </>
      )}
    </div>
  );
}
