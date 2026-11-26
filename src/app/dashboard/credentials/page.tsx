"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader } from "@/components/ui/loader";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { apiFetch } from "@/lib/api";
import { ExportButton } from "@/components/ui/export-button";
import {
  RENEW_WITHIN_DAYS, STALE_DAYS, USAGE_STATUS_LABELS,
  isRemovalCandidate, isRenewPriority,
  type AppSignInActivity, type UsageStatus,
} from "@/lib/credential-usage";

interface Cred {
  appObjectId: string;
  appId: string;
  appName: string;
  type: "secret" | "certificate";
  name: string | null;
  keyId: string | null;
  endDateTime: string;
  daysLeft: number;
  appCreatedDateTime: string | null;
  appOwners: { displayName: string; userPrincipalName: string | null; kind: string }[];
  lastUsed?: string | null;
  usage?: UsageStatus;
  app?: AppSignInActivity | null;
  appCreator?: { by: string; at: string } | null;
}

const ownerNames = (c: Cred) => c.appOwners.map((o) => o.userPrincipalName ?? o.displayName).join(", ");

/** Origine de l'application : date de création, créateur (journal d'audit) ou propriétaires. */
function AppOrigin({ c }: { c: Cred }) {
  const created = c.appCreatedDateTime ? `Créée le ${format(new Date(c.appCreatedDateTime), "dd/MM/yyyy")}` : "Date de création inconnue";
  return (
    <div className="text-xs text-foreground/50">
      {created}
      {c.appCreator ? (
        <> · par <span className="text-foreground/70">{c.appCreator.by}</span></>
      ) : c.appOwners.length > 0 ? (
        <> · propriétaire(s) : <span className="text-foreground/70">{ownerNames(c)}</span></>
      ) : (
        <> · <span className="text-amber-700 dark:text-amber-400 font-medium">aucun propriétaire</span></>
      )}
    </div>
  );
}

interface CredResponse {
  supported: boolean;
  usageSupported?: boolean;
  credentials: Cred[];
}

type Filter = "all" | "renew" | "unused" | "noowner";

const USAGE_BADGE: Record<UsageStatus, string> = {
  recent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  stale: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  unused: "bg-foreground/10 text-foreground/70",
  unknown: "bg-foreground/5 text-foreground/40",
};

const fmtDate = (iso: string | null | undefined) => (iso ? format(new Date(iso), "dd/MM/yyyy") : "");
const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true, locale: fr });

/** Résumé de l'activité de l'application : dernière connexion et nature (applicative / déléguée). */
function appActivityText(a: AppSignInActivity | null | undefined): string {
  if (!a?.lastSignIn) return "Application : aucune connexion enregistrée";
  const kinds = [a.lastAppOnly && "applicative", a.lastDelegated && "au nom d'utilisateurs"].filter(Boolean).join(" et ");
  return `Application connectée ${ago(a.lastSignIn)}${kinds ? ` (${kinds})` : ""}`;
}

export default function CredentialsPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  // days élevé → renvoie tous les secrets/certificats ; usage=1 → dernière utilisation
  const { data, isLoading, error } = useQuery<CredResponse>({
    queryKey: ["all-credentials", "usage"],
    queryFn: () => apiFetch<CredResponse>("/api/security/expiring-credentials?days=100000&usage=1"),
    staleTime: 10 * 60 * 1000,
  });

  const all = useMemo(() => data?.credentials ?? [], [data]);
  const usageOn = data?.usageSupported === true;
  const renew = (c: Cred) => isRenewPriority({ daysLeft: c.daysLeft, usage: c.usage ?? "unknown" });
  const unused = (c: Cred) => isRemovalCandidate({ usage: c.usage ?? "unknown" });

  const noOwner = (c: Cred) => c.appOwners.length === 0;
  const matchesFilter = (c: Cred) =>
    filter === "all" ? true : filter === "renew" ? renew(c) : filter === "unused" ? unused(c) : noOwner(c);

  const creds = all
    .filter(matchesFilter)
    .filter(
      (c) =>
        c.appName.toLowerCase().includes(search.toLowerCase()) ||
        (c.name ?? "").toLowerCase().includes(search.toLowerCase())
    );

  const expiredCount = all.filter((c) => c.daysLeft < 0).length;
  const soonCount = all.filter((c) => c.daysLeft >= 0 && c.daysLeft <= 30).length;
  const renewCount = all.filter(renew).length;
  const unusedCount = all.filter(unused).length;
  const noOwnerCount = all.filter(noOwner).length;

  if (error) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Secrets &amp; certificats</h2>
        <div className="rounded-md border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 p-4 text-red-700 dark:text-red-300 text-sm">
          Erreur : {(error as Error).message}
        </div>
      </div>
    );
  }

  const chip = (id: Filter, label: string, count?: number) => (
    <button
      type="button"
      onClick={() => setFilter(id)}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        filter === id ? "border-primary bg-primary/10 text-primary" : "hover:bg-foreground/5 text-foreground/70"
      }`}
    >
      {label}{count != null ? ` (${count})` : ""}
    </button>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold">Secrets &amp; certificats</h2>
          <p className="text-sm text-foreground/50 mt-0.5">
            Identifiants des inscriptions d&apos;applications Azure AD, leur expiration et leur dernière utilisation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {expiredCount > 0 && <Badge variant="destructive">{expiredCount} expiré(s)</Badge>}
          {soonCount > 0 && <Badge variant="secondary">{soonCount} ≤ 30 j</Badge>}
          <ExportButton
            fileBase="onering-secrets-certificats"
            disabled={data?.supported === false}
            sheets={() => [{
              name: "Secrets et certificats",
              columns: [
                { header: "Application", key: "app", width: 36 },
                { header: "App ID", key: "appId", width: 38 },
                { header: "Application créée le", key: "created", width: 18 },
                { header: "Créée par (journal d'audit)", key: "creator", width: 32 },
                { header: "Propriétaires", key: "owners", width: 44 },
                { header: "Type", key: "type", width: 14 },
                { header: "Identifiant", key: "nom", width: 28 },
                { header: "Key ID", key: "keyId", width: 38 },
                { header: "Expiration", key: "exp", width: 14 },
                { header: "Jours restants", key: "jours", width: 14 },
                { header: "Dernière utilisation", key: "used", width: 18 },
                { header: "Statut d'utilisation", key: "usage", width: 30 },
                { header: "À renouveler en priorité", key: "renew", width: 22 },
                { header: "Dernière connexion de l'application", key: "appLast", width: 22 },
                { header: "Dernière connexion applicative", key: "appOnly", width: 22 },
                { header: "Dernière connexion déléguée", key: "appDeleg", width: 22 },
              ],
              rows: creds.map((c) => ({
                app: c.appName,
                appId: c.appId,
                created: fmtDate(c.appCreatedDateTime),
                creator: c.appCreator ? `${c.appCreator.by} (${fmtDate(c.appCreator.at)})` : "",
                owners: ownerNames(c) || "(aucun)",
                type: c.type === "certificate" ? "Certificat" : "Secret",
                nom: c.name ?? "",
                keyId: c.keyId ?? "",
                exp: format(new Date(c.endDateTime), "dd/MM/yyyy"),
                jours: c.daysLeft,
                used: fmtDate(c.lastUsed),
                usage: USAGE_STATUS_LABELS[c.usage ?? "unknown"],
                renew: renew(c) ? "Oui" : "",
                appLast: fmtDate(c.app?.lastSignIn),
                appOnly: fmtDate(c.app?.lastAppOnly),
                appDeleg: fmtDate(c.app?.lastDelegated),
              })),
            }]}
          />
        </div>
      </div>

      {data?.supported === false ? (
        <div className="rounded-md border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 p-4 text-amber-700 dark:text-amber-300 text-sm">
          Lecture des applications indisponible — le droit Directory/Application est requis sur le compte connecté.
        </div>
      ) : (
        <>
          {data && !usageOn && (
            <div className="rounded-md border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 p-3 mb-4 text-amber-700 dark:text-amber-300 text-sm">
              Dernière utilisation indisponible : le compte connecté doit avoir un rôle de lecture des rapports
              (Lecteur général, Lecteur sécurité…) et la permission AuditLog.Read.All.
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Input
              placeholder="Rechercher une application ou un identifiant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            {usageOn && (
              <div className="flex flex-wrap gap-2">
                {chip("all", "Tous", all.length)}
                {chip("renew", "À renouveler en priorité", renewCount)}
                {chip("unused", `Inutilisés (${STALE_DAYS} j+) ou jamais`, unusedCount)}
                {chip("noowner", "Sans propriétaire", noOwnerCount)}
              </div>
            )}
            {!usageOn && data && chip("noowner", "Sans propriétaire", noOwnerCount)}
          </div>
          {filter !== "all" && (
            <p className="text-xs text-foreground/50 mb-3">
              {filter === "renew"
                ? `Expire dans ${RENEW_WITHIN_DAYS} jours ou moins (ou déjà expiré) et utilisé ces ${STALE_DAYS} derniers jours : risque de panne, à renouveler d'abord.`
                : filter === "unused"
                  ? "Aucune utilisation depuis 90 jours, ou jamais : candidat à la suppression après vérification avec le propriétaire de l'application (un traitement annuel peut ne pas apparaître)."
                  : "Application sans propriétaire : personne n'est responsable de son renouvellement. Désigner un propriétaire (Entra → Inscriptions d'applications → Propriétaires)."}
            </p>
          )}
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <th className="p-3 text-sm font-medium text-left">Application</th>
                  <th className="p-3 text-sm font-medium text-left">Type</th>
                  <th className="p-3 text-sm font-medium text-left">Identifiant</th>
                  <th className="p-3 text-sm font-medium text-left">Expiration</th>
                  <th className="p-3 text-sm font-medium text-left">Restant</th>
                  {usageOn && <th className="p-3 text-sm font-medium text-left">Dernière utilisation</th>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <div className="py-10"><Loader label="Chargement des secrets & certificats…" /></div>
                        </TableCell>
                      </TableRow>
                    )
                  : creds.map((c, i) => (
                      <TableRow key={`${c.appObjectId}-${c.keyId ?? i}`}>
                        <TableCell>
                          <div className="font-medium">{c.appName}</div>
                          <AppOrigin c={c} />
                          {usageOn && <div className="text-xs text-foreground/50">{appActivityText(c.app)}</div>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.type === "certificate" ? "outline" : "secondary"} className="text-xs">
                            {c.type === "certificate" ? "Certificat" : "Secret"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500 dark:text-gray-400">{c.name ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(c.endDateTime), "dd MMM yyyy", { locale: fr })}
                        </TableCell>
                        <TableCell
                          className={`text-sm font-medium ${
                            c.daysLeft < 0 ? "text-red-600" : c.daysLeft <= 30 ? "text-amber-600" : "text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {c.daysLeft < 0 ? `expiré depuis ${-c.daysLeft} j` : `${c.daysLeft} j`}
                        </TableCell>
                        {usageOn && (
                          <TableCell className="text-sm">
                            <div className="flex flex-col items-start gap-1">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${USAGE_BADGE[c.usage ?? "unknown"]}`}>
                                {USAGE_STATUS_LABELS[c.usage ?? "unknown"]}
                              </span>
                              {c.lastUsed && <span className="text-xs text-foreground/50">{ago(c.lastUsed)}</span>}
                              {renew(c) && (
                                <span className="text-[11px] font-medium text-red-600">À renouveler en priorité</span>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                {!isLoading && creds.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                      Aucun secret / certificat.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {usageOn && (
            <p className="text-xs text-foreground/40 mt-3">
              Source : rapports d&apos;activité Entra (préversion). « Aucune utilisation enregistrée » = jamais vu par Microsoft
              depuis le début du suivi. Avant de supprimer, vérifier avec le propriétaire de l&apos;application.
            </p>
          )}
        </>
      )}
    </div>
  );
}
