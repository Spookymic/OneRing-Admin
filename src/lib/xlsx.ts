/**
 * Génération de classeurs Excel (.xlsx) côté navigateur, via exceljs (chargé à la demande).
 * Un classeur = une ou plusieurs feuilles ; chaque feuille a ses colonnes typées et ses lignes.
 */

export interface XlsxColumn {
  header: string;
  key: string;
  width?: number;
}

export interface XlsxSheet {
  name: string;
  columns: XlsxColumn[];
  rows: Record<string, unknown>[];
}

/** Nettoie un nom de feuille (Excel : ≤ 31 caractères, pas de \ / ? * [ ] :). */
function safeSheetName(name: string): string {
  return (name || "Feuille").replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
}

export async function downloadXlsx(filename: string, sheets: XlsxSheet[]): Promise<void> {
  // Interop robuste : selon le bundler, exceljs peut exposer l'objet en default ou en namespace.
  const mod = (await import("exceljs")) as unknown as { default?: typeof import("exceljs") };
  const ExcelJS = mod.default ?? (mod as unknown as typeof import("exceljs"));
  const wb = new ExcelJS.Workbook();
  wb.creator = "OneRing Admin";
  wb.created = new Date();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(safeSheetName(sheet.name));
    ws.columns = sheet.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 22 }));
    if (sheet.rows.length > 0) ws.addRows(sheet.rows);

    const header = ws.getRow(1);
    header.font = { bold: true };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F1F4" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    if (sheet.columns.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
