import { prisma } from "@/lib/prisma";
import type { CoworkUsageRow } from "@/lib/cowork";

/**
 * Stockage des imports Copilot Cowork (CSV exporté du centre d'administration Microsoft 365).
 * Données applicatives uniquement : aucun appel Microsoft.
 */

export interface CoworkImportMeta {
  id: string;
  fileName: string;
  importedBy: string;
  rowCount: number;
  createdAt: string;
}

export interface CoworkImport extends CoworkImportMeta {
  rows: CoworkUsageRow[];
}

const META_SELECT = { id: true, fileName: true, importedBy: true, rowCount: true, createdAt: true } as const;

function toMeta(r: { id: string; fileName: string; importedBy: string; rowCount: number; createdAt: Date }): CoworkImportMeta {
  return { ...r, createdAt: r.createdAt.toISOString() };
}

export async function listCoworkImports(limit = 20): Promise<CoworkImportMeta[]> {
  const rows = await prisma.coworkUsageImport.findMany({
    select: META_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toMeta);
}

/** Import demandé, ou le plus récent si `id` absent. */
export async function getCoworkImport(id?: string): Promise<CoworkImport | null> {
  const r = id
    ? await prisma.coworkUsageImport.findUnique({ where: { id } })
    : await prisma.coworkUsageImport.findFirst({ orderBy: { createdAt: "desc" } });
  if (!r) return null;
  return { ...toMeta(r), rows: r.rows as unknown as CoworkUsageRow[] };
}

export async function createCoworkImport(params: {
  fileName: string;
  importedBy: string;
  rows: CoworkUsageRow[];
}): Promise<CoworkImportMeta> {
  const r = await prisma.coworkUsageImport.create({
    data: {
      fileName: params.fileName,
      importedBy: params.importedBy,
      rowCount: params.rows.length,
      rows: params.rows as unknown as object,
    },
    select: META_SELECT,
  });
  return toMeta(r);
}

export async function deleteCoworkImport(id: string): Promise<CoworkImportMeta | null> {
  const r = await prisma.coworkUsageImport.findUnique({ where: { id }, select: META_SELECT });
  if (!r) return null;
  await prisma.coworkUsageImport.delete({ where: { id } });
  return toMeta(r);
}
