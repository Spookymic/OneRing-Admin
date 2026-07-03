/**
 * Échappe une valeur pour une cellule CSV :
 * 1. Neutralise l'injection de formule (CSV/Excel) — une valeur commençant par
 *    `= + - @` (ou tabulation / retour chariot) est préfixée d'une apostrophe
 *    pour qu'Excel/LibreOffice la traite comme du texte, pas comme une formule.
 * 2. Double les guillemets et entoure la valeur de guillemets.
 */
export function csvCell(value: string | number | null | undefined): string {
  const s = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}
