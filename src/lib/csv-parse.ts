/**
 * Parse un CSV (champs entre guillemets, CRLF, BOM) en objets indexés par en-tête.
 * Module partagé client/serveur.
 *
 * Le séparateur est détecté sur la ligne d'en-tête (`,` `;` ou tabulation) : les exports du centre
 * d'administration Microsoft 365 en français utilisent parfois `;`.
 */
export function parseCsv(text: string, delimiter?: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, "");
  const sep = delimiter ?? detectDelimiter(clean);
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === sep) {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "")
    .map((r) => {
      const o: Record<string, string> = {};
      header.forEach((h, idx) => { o[h] = (r[idx] ?? "").trim(); });
      return o;
    });
}

/** En-têtes d'un CSV (première ligne), séparateur détecté. */
export function csvHeaders(text: string): string[] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.split(detectDelimiter(clean)).map((h) => h.replace(/^"|"$/g, "").trim());
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts: [string, number][] = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** Nombre depuis une cellule CSV (tolère espaces et virgule décimale) ; null si vide/invalide. */
export function csvNumber(v: string | undefined): number | null {
  if (v === undefined) return null;
  const s = v.replace(/\s/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type DateOrder = "dmy" | "mdy";

/**
 * Date depuis une cellule CSV → `YYYY-MM-DD`, ou null.
 * Accepte ISO (`2026-11-10`, `2026-11-10T08:00:00Z`) et `NN/NN/AAAA`, interprété selon `order`
 * (`dmy` pour un export en français, `mdy` pour un export en anglais US — voir detectDateOrder).
 */
export function csvDate(v: string | undefined, order: DateOrder = "dmy"): string | null {
  if (!v) return null;
  const s = v.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (!m) return null;
  const [day, month] = order === "dmy" ? [m[1], m[2]] : [m[2], m[1]];
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null;
  return `${m[3]}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Ordre jour/mois d'une colonne de dates `NN/NN/AAAA` : une valeur > 12 en première position impose
 * `dmy`, en deuxième position `mdy`. Indécidable (toutes ≤ 12) → `fallback`.
 */
export function detectDateOrder(values: string[], fallback: DateOrder): DateOrder {
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{4}/);
    if (!m) continue;
    if (Number(m[1]) > 12) return "dmy";
    if (Number(m[2]) > 12) return "mdy";
  }
  return fallback;
}
