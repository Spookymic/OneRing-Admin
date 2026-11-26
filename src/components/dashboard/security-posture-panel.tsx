"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { ShieldAlert, ShieldCheck, UserCheck, Forward, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { isSyncStale, type SecurityPosture } from "@/lib/security-posture";
import type { MfaSummary } from "@/lib/identity-reports";
import type { ForwardingSummaryItem } from "@/services/exchange/forwarding";

type Status = "ok" | "warn" | "info" | "na";

const STATUS_STYLE: Record<Status, { label: string; className: string }> = {
  ok: { label: "OK", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  warn: { label: "À vérifier", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  info: { label: "Info", className: "bg-foreground/10 text-foreground/70" },
  na: { label: "Indisponible", className: "bg-foreground/5 text-foreground/40" },
};

interface ForwardingSummaryResponse {
  supported: boolean;
  reason?: string;
  forwards: ForwardingSummaryItem[];
}

function Tile({
  title, icon: Icon, status, loading, children, href, linkLabel,
}: {
  title: string;
  icon: React.ElementType;
  status: Status;
  loading?: boolean;
  children: React.ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  const s = STATUS_STYLE[status];
  return (
    <Card className="p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-medium truncate">{title}</span>
        {!loading && (
          <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.className}`}>{s.label}</span>
        )}
      </div>
      {loading ? (
        <div className="space-y-1.5"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
      ) : (
        <div className="text-xs text-foreground/60 space-y-1 flex-1">{children}</div>
      )}
      {href && !loading && (
        <Link href={href} className="text-xs font-medium text-primary underline underline-offset-2 hover:opacity-80 self-start">
          {linkLabel ?? "Détails"} →
        </Link>
      )}
    </Card>
  );
}

const yes = (v: boolean) => (
  <span className={v ? "text-emerald-700 dark:text-emerald-400 font-medium" : "text-amber-700 dark:text-amber-400 font-medium"}>
    {v ? "oui" : "non"}
  </span>
);

/**
 * Posture de sécurité du tenant : accès conditionnel, confiance MFA envers les invités,
 * redirections mail externes, synchronisation de l'annuaire local.
 * `guestMfa` : taux MFA des invités (rapport MFA), pour interpréter la confiance inter-locataires.
 */
export function SecurityPosturePanel({ guestMfa }: { guestMfa: MfaSummary | null }) {
  const { data: posture, isLoading, isError } = useQuery<SecurityPosture>({
    queryKey: ["security-posture"],
    queryFn: () => apiFetch<SecurityPosture>("/api/dashboard/posture"),
    staleTime: 10 * 60 * 1000,
  });
  const { data: fwd, isLoading: fwdLoading } = useQuery<ForwardingSummaryResponse>({
    queryKey: ["forwarding-summary"],
    queryFn: () => apiFetch<ForwardingSummaryResponse>("/api/mailboxes/forwarding/summary"),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  // ── Accès conditionnel ──
  const ca = posture?.conditionalAccess;
  const caStatus: Status = !ca || (!ca.supported && ca.securityDefaults == null)
    ? "na"
    : ca.mfaGlobalAdmins && ca.mfaAllUsers ? "ok" : "warn";

  // ── Invités ──
  const trust = posture?.guestMfaTrust;
  const trustStatus: Status = !trust?.supported ? "na" : trust.defaultAccepted ? "ok" : "warn";

  // ── Redirections ──
  const external = (fwd?.forwards ?? []).filter((f) => f.external);
  const fwdStatus: Status = !fwd?.supported ? "na" : external.length === 0 ? "ok" : "warn";

  // ── Synchronisation ──
  const sync = posture?.directorySync;
  const syncStatus: Status = !sync?.supported ? "na" : !sync.enabled ? "info" : isSyncStale(sync) ? "warn" : "ok";

  return (
    <div>
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-primary" />
        Sécurité du tenant
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Tile title="Accès conditionnel" icon={ShieldCheck} status={isError ? "na" : caStatus} loading={isLoading}
          href="/dashboard/conditional-access" linkLabel="Voir les stratégies">
          {ca && (ca.supported || ca.securityDefaults != null) ? (
            <>
              {ca.supported && (
                <p className="text-sm text-foreground">
                  {ca.enabled} stratégie(s) active(s)
                  {ca.reportOnly > 0 && <span className="text-foreground/50"> · {ca.reportOnly} en mode rapport</span>}
                </p>
              )}
              {ca.securityDefaults && <p>Paramètres de sécurité par défaut activés</p>}
              <p>MFA imposé aux admins généraux : {yes(ca.mfaGlobalAdmins)}</p>
              <p>MFA imposé à tous les utilisateurs : {yes(ca.mfaAllUsers)}</p>
              <p className="text-foreground/40">Exclusions (comptes de secours…) non évaluées.</p>
            </>
          ) : (
            <p>Permission Policy.Read.All requise.</p>
          )}
        </Tile>

        <Tile title="MFA des invités" icon={UserCheck} status={isError ? "na" : trustStatus} loading={isLoading}
          href="/dashboard/reports?report=mfa-status" linkLabel="Rapport MFA">
          {trust?.supported ? (
            <>
              <p className="text-sm text-foreground">
                MFA du tenant d&apos;origine {trust.defaultAccepted ? "accepté" : "non accepté"} par défaut
              </p>
              {trust.defaultAccepted ? (
                <p>Le faible taux MFA des invités mesuré ici est attendu : ils valident leur MFA chez eux.</p>
              ) : (
                <p>
                  Les invités doivent enregistrer une méthode dans ce tenant
                  {guestMfa && guestMfa.total > 0 ? ` : ${guestMfa.percent} % l'ont fait (${guestMfa.enabled}/${guestMfa.total}).` : "."}
                </p>
              )}
              {trust.partnersTotal > 0 && (
                <p>Organisations partenaires : {trust.partnersAccepting}/{trust.partnersTotal} avec MFA accepté</p>
              )}
              <p className="text-foreground/40">Entra → Identités externes → Accès inter-locataires.</p>
            </>
          ) : (
            <p>Permission Policy.Read.All requise.</p>
          )}
        </Tile>

        <Tile title="Redirections externes" icon={Forward} status={fwdStatus} loading={fwdLoading}
          href="/dashboard/mail-forwarding?view=external" linkLabel="Voir les transferts externes">
          {fwd?.supported ? (
            <>
              <p className="text-sm text-foreground">
                {external.length} boîte(s) transférée(s) hors du tenant
                <span className="text-foreground/50"> · {fwd.forwards.length - external.length} en interne</span>
              </p>
              {external.slice(0, 3).map((f) => (
                <p key={`${f.source.mail}-${f.target}`} className="truncate" title={`${f.source.mail} → ${f.target}`}>
                  {f.source.displayName} → {f.target}
                </p>
              ))}
              {external.length > 3 && <p>… et {external.length - 3} autre(s)</p>}
              <p className="text-foreground/40">Transferts au niveau boîte ; règles de boîte non incluses.</p>
            </>
          ) : (
            <p>
              {fwd?.reason === "exchange_forbidden"
                ? "Rôle Exchange requis pour le compte connecté."
                : "Pont Exchange indisponible."}
            </p>
          )}
        </Tile>

        <Tile title="Synchronisation AD" icon={RefreshCw} status={isError ? "na" : syncStatus} loading={isLoading}>
          {sync?.supported ? (
            sync.enabled ? (
              <>
                <p className="text-sm text-foreground">
                  {sync.lastSync
                    ? `Dernière synchronisation ${formatDistanceToNow(new Date(sync.lastSync), { addSuffix: true, locale: fr })}`
                    : "Aucune synchronisation enregistrée"}
                </p>
                <p>
                  {isSyncStale(sync)
                    ? "Au-delà de 3 h : vérifier le serveur Entra Connect / Cloud Sync."
                    : "Cycle normal (toutes les 30 min)."}
                </p>
              </>
            ) : (
              <p className="text-sm text-foreground">Annuaire 100 % cloud (pas de synchronisation AD).</p>
            )
          ) : (
            <p>Lecture de l&apos;organisation impossible.</p>
          )}
        </Tile>
      </div>
    </div>
  );
}
