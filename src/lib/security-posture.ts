/**
 * Posture de sécurité du tenant, affichée sur le tableau de bord :
 * accès conditionnel / paramètres de sécurité par défaut, confiance MFA envers les invités,
 * synchronisation de l'annuaire local. Types partagés client/serveur + fonctions pures (testées).
 */

import { GLOBAL_ADMIN_TEMPLATE_ID } from "@/lib/identity-reports";

/** Recommandation Microsoft : moins de 5 administrateurs généraux (et au moins 2). */
export const GLOBAL_ADMIN_RECOMMENDED_MAX = 5;

/** Entra Connect synchronise toutes les 30 min : au-delà de 3 h, la synchronisation est considérée bloquée. */
export const SYNC_STALE_HOURS = 3;

// ── Accès conditionnel ───────────────────────────────────────────────

/** Sous-ensemble utile d'une stratégie d'accès conditionnel Graph. */
export interface CaPolicyLite {
  state?: string | null;
  conditions?: {
    users?: { includeUsers?: string[] | null; includeRoles?: string[] | null } | null;
  } | null;
  grantControls?: {
    builtInControls?: string[] | null;
    authenticationStrength?: unknown;
  } | null;
}

/** La stratégie exige le MFA (contrôle « mfa » ou force d'authentification). */
export function caPolicyRequiresMfa(p: CaPolicyLite): boolean {
  const g = p.grantControls;
  if (!g) return false;
  return (g.builtInControls ?? []).includes("mfa") || g.authenticationStrength != null;
}

/** La stratégie cible tous les utilisateurs. */
export function caPolicyTargetsAllUsers(p: CaPolicyLite): boolean {
  return (p.conditions?.users?.includeUsers ?? []).includes("All");
}

/** La stratégie couvre les administrateurs généraux (rôle ciblé explicitement, ou tous les utilisateurs). */
export function caPolicyTargetsGlobalAdmins(p: CaPolicyLite): boolean {
  if (caPolicyTargetsAllUsers(p)) return true;
  return (p.conditions?.users?.includeRoles ?? []).some((r) => r.toLowerCase() === GLOBAL_ADMIN_TEMPLATE_ID);
}

export interface ConditionalAccessPosture {
  supported: boolean;
  enabled: number;
  reportOnly: number;
  disabled: number;
  /** Paramètres de sécurité par défaut activés (MFA imposé à tous, sans accès conditionnel). Null si illisible. */
  securityDefaults: boolean | null;
  /** Une stratégie ACTIVE impose le MFA à tous les utilisateurs (ou paramètres par défaut activés). */
  mfaAllUsers: boolean;
  /** Une stratégie ACTIVE impose le MFA aux administrateurs généraux (ou paramètres par défaut activés). */
  mfaGlobalAdmins: boolean;
}

/**
 * Synthèse des stratégies. Les exclusions (comptes de secours, groupes) ne sont pas évaluées :
 * « MFA imposé à tous » signifie qu'une stratégie active cible « Tous les utilisateurs ».
 */
export function summarizeConditionalAccess(
  policies: CaPolicyLite[],
  securityDefaults: boolean | null
): ConditionalAccessPosture {
  const active = policies.filter((p) => p.state === "enabled");
  const mfa = active.filter(caPolicyRequiresMfa);
  return {
    supported: true,
    enabled: active.length,
    reportOnly: policies.filter((p) => p.state === "enabledForReportingButNotEnforced").length,
    disabled: policies.filter((p) => p.state === "disabled").length,
    securityDefaults,
    mfaAllUsers: securityDefaults === true || mfa.some(caPolicyTargetsAllUsers),
    mfaGlobalAdmins: securityDefaults === true || mfa.some(caPolicyTargetsGlobalAdmins),
  };
}

// ── Confiance MFA envers les invités (accès inter-locataires) ───────

export interface GuestMfaTrustPosture {
  supported: boolean;
  /** Paramètre par défaut : MFA du tenant d'origine accepté pour tous les invités. */
  defaultAccepted: boolean | null;
  /** Organisations partenaires configurées. */
  partnersTotal: number;
  /** Partenaires dont le MFA est accepté (réglage propre, ou hérité du défaut). */
  partnersAccepting: number;
}

export interface PartnerTrustLite {
  inboundTrust?: { isMfaAccepted?: boolean | null } | null;
}

export function summarizeGuestMfaTrust(
  defaultAccepted: boolean | null,
  partners: PartnerTrustLite[]
): GuestMfaTrustPosture {
  const accepting = partners.filter((p) => (p.inboundTrust?.isMfaAccepted ?? defaultAccepted) === true).length;
  return { supported: true, defaultAccepted, partnersTotal: partners.length, partnersAccepting: accepting };
}

// ── Synchronisation de l'annuaire local ─────────────────────────────

export interface DirectorySyncPosture {
  supported: boolean;
  /** Synchronisation Entra Connect / Cloud Sync activée sur le tenant. */
  enabled: boolean;
  lastSync: string | null;
}

/** Âge de la dernière synchronisation en heures (null si jamais synchronisé). */
export function syncAgeHours(lastSync: string | null, now: Date = new Date()): number | null {
  if (!lastSync) return null;
  const t = new Date(lastSync).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (now.getTime() - t) / 3_600_000);
}

export function isSyncStale(sync: DirectorySyncPosture, now: Date = new Date()): boolean {
  if (!sync.supported || !sync.enabled) return false;
  const age = syncAgeHours(sync.lastSync, now);
  return age == null || age > SYNC_STALE_HOURS;
}

// ── Réponse de /api/dashboard/posture ───────────────────────────────

export interface SecurityPosture {
  conditionalAccess: ConditionalAccessPosture;
  guestMfaTrust: GuestMfaTrustPosture;
  directorySync: DirectorySyncPosture;
  generatedAt: string;
}
