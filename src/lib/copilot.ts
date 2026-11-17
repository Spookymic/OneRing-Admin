/**
 * Types et règles partagés (client/serveur) de l'écran Copilot.
 */

export const COPILOT_PERIODS = [7, 28, 90, 180] as const;
export type CopilotPeriod = (typeof COPILOT_PERIODS)[number];

/**
 * Statut d'un utilisateur vis-à-vis de Microsoft 365 Copilot sur la période :
 * - active : licence + activité sur la période
 * - inactive : licence, dernière activité antérieure à la période
 * - never : licence, aucune activité connue
 * - unlicensed : présent dans le rapport (activité passée) mais plus de licence Copilot
 */
export type CopilotUserStatus = "active" | "inactive" | "never" | "unlicensed";

export const COPILOT_STATUS_LABELS: Record<CopilotUserStatus, string> = {
  active: "Actif",
  inactive: "Inactif",
  never: "Jamais utilisé",
  unlicensed: "Sans licence",
};

export interface CopilotLicense {
  skuId: string;
  skuPartNumber: string;
  name: string;
  assigned: number;
  enabled: number;
}

export interface CopilotApp {
  /** En-tête de colonne du rapport Graph */
  key: string;
  label: string;
}

export interface CopilotUser {
  /** Id Entra (absent si l'utilisateur du rapport n'est pas retrouvé dans l'annuaire) */
  id: string | null;
  upn: string;
  displayName: string;
  department: string | null;
  accountEnabled: boolean | null;
  /** Noms des licences Copilot attribuées */
  licenses: string[];
  status: CopilotUserStatus;
  lastActivityDate: string | null;
  /** Dernière activité par application (clé = CopilotApp.key) */
  apps: Record<string, string | null>;
  /** Applications utilisées sur la période (clés) */
  appsInPeriod: string[];
  prompts: number | null;
  activeDays: number | null;
}

export interface CopilotUsageResponse {
  supported: boolean;
  period: CopilotPeriod;
  reportRefreshDate: string | null;
  /** Début de la période (YYYY-MM-DD) : activité ≥ cette date = active */
  periodStart: string | null;
  /** Noms/UPN masqués par le paramètre d'anonymisation des rapports */
  concealed: boolean;
  licenses: CopilotLicense[];
  apps: CopilotApp[];
  users: CopilotUser[];
}

/** SKU Copilot « Microsoft 365 » (exclut Copilot Studio, agents virtuels, essais viraux). */
export function isCopilotSku(skuPartNumber: string): boolean {
  return /copilot/i.test(skuPartNumber) && !/studio|virtual|viral|ccibots/i.test(skuPartNumber);
}

/**
 * Libellé d'application à partir d'une colonne « X Last Activity Date » du rapport Graph,
 * ou null si la colonne n'est pas une application à afficher.
 */
export function copilotAppLabel(header: string): string | null {
  const m = header.match(/^(.+?)\s+Last Activity Date$/i);
  if (!m) return null;
  const raw = m[1].trim();
  // Ventilations de Copilot Chat (travail / web) : redondantes avec « Copilot Chat »
  if (/^Copilot Chat (Work|Web)$/i.test(raw)) return null;
  const known: Record<string, string> = {
    "copilot chat": "Copilot Chat",
    "microsoft teams copilot": "Teams",
    "word copilot": "Word",
    "excel copilot": "Excel",
    "powerpoint copilot": "PowerPoint",
    "outlook copilot": "Outlook",
    "onenote copilot": "OneNote",
    "loop copilot": "Loop",
    edge: "Edge",
    "microsoft 365 app": "App Microsoft 365",
  };
  return known[raw.toLowerCase()] ?? raw.replace(/\s+Copilot$/i, "");
}
