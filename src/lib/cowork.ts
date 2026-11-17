/**
 * Copilot Cowork — import du CSV « Cowork usage details » exporté depuis le centre d'administration
 * Microsoft 365 (Copilot > Cowork > Usage > Export). Microsoft ne publie aucune API pour ces données.
 * Module partagé client/serveur.
 *
 * Colonnes documentées (EN) : User ID, Display name, Total tasks, Scheduled tasks, User-initiated tasks,
 * Active days, Last activity date. Les en-têtes sont reconnus par mots-clés (EN/FR) pour tolérer la
 * langue de l'interface et les évolutions de libellé.
 */

import { csvDate, csvHeaders, csvNumber, detectDateOrder, parseCsv } from "@/lib/csv-parse";

export interface CoworkUsageRow {
  upn: string;
  displayName: string;
  totalTasks: number;
  scheduledTasks: number | null;
  userTasks: number | null;
  activeDays: number | null;
  /** YYYY-MM-DD */
  lastActivity: string | null;
}

export type CoworkField = "upn" | "displayName" | "totalTasks" | "scheduledTasks" | "userTasks" | "activeDays" | "lastActivity";

export const COWORK_FIELD_LABELS: Record<CoworkField, string> = {
  upn: "Utilisateur (UPN)",
  displayName: "Nom",
  totalTasks: "Tâches (total)",
  scheduledTasks: "Tâches planifiées",
  userTasks: "Tâches lancées par l'utilisateur",
  activeDays: "Jours actifs",
  lastActivity: "Dernière activité",
};

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const TASK = /task|tache/;

// Ordre important : du plus spécifique au plus générique.
const MATCHERS: [CoworkField, (h: string) => boolean][] = [
  ["scheduledTasks", (h) => /schedul|planifi|programm/.test(h)],
  ["userTasks", (h) => TASK.test(h) && /initiat|lance|declench|manuel/.test(h)],
  ["totalTasks", (h) => TASK.test(h)],
  ["activeDays", (h) => /active day|jours? actif|jours? d.activite/.test(h)],
  ["lastActivity", (h) => /last activ|derniere activ/.test(h)],
  ["displayName", (h) => /display ?name|nom d.affichage|^nom$|^name$/.test(h)],
  ["upn", (h) => /user ?id|principal|upn|e-?mail|courrier|^utilisateur$|^user$|id.{0,4}utilisateur|utilisateur.{0,4}id/.test(h)],
];

export type CoworkParseResult =
  | { ok: true; rows: CoworkUsageRow[]; mapping: Partial<Record<CoworkField, string>>; ignored: string[] }
  | { ok: false; error: string; headers: string[] };

export function parseCoworkCsv(text: string): CoworkParseResult {
  const headers = csvHeaders(text);
  const mapping: Partial<Record<CoworkField, string>> = {};
  const ignored: string[] = [];

  for (const header of headers) {
    const h = norm(header);
    const match = MATCHERS.find(([field, test]) => !mapping[field] && test(h));
    if (match) mapping[match[0]] = header;
    else if (header) ignored.push(header);
  }

  if (!mapping.upn) {
    return { ok: false, error: "Colonne utilisateur (User ID / UPN) introuvable.", headers };
  }
  if (!mapping.totalTasks && !mapping.scheduledTasks && !mapping.userTasks) {
    return { ok: false, error: "Aucune colonne de tâches (Total tasks…) trouvée.", headers };
  }

  const raw = parseCsv(text);
  const frenchHeaders = headers.some((h) => /tache|activite|utilisateur|jours/.test(norm(h)));
  const order = detectDateOrder(
    mapping.lastActivity ? raw.map((r) => r[mapping.lastActivity!] ?? "") : [],
    frenchHeaders ? "dmy" : "mdy"
  );

  const rows: CoworkUsageRow[] = raw
    .filter((r) => (r[mapping.upn!] ?? "").trim() !== "")
    .map((r) => {
      const get = (f: CoworkField) => (mapping[f] ? r[mapping[f]!] : undefined);
      const scheduled = csvNumber(get("scheduledTasks"));
      const user = csvNumber(get("userTasks"));
      const total = csvNumber(get("totalTasks")) ?? (scheduled ?? 0) + (user ?? 0);
      return {
        upn: get("upn")!.trim(),
        displayName: (get("displayName") ?? "").trim() || get("upn")!.trim(),
        totalTasks: total,
        scheduledTasks: scheduled,
        userTasks: user,
        activeDays: csvNumber(get("activeDays")),
        lastActivity: csvDate(get("lastActivity"), order),
      };
    });

  if (rows.length === 0) {
    return { ok: false, error: "Le fichier ne contient aucune ligne de données.", headers };
  }
  return { ok: true, rows, mapping, ignored };
}
