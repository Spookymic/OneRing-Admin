import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { logAudit } from "@/services/audit";
import {
  createCoworkImport,
  deleteCoworkImport,
  getCoworkImport,
  listCoworkImports,
} from "@/services/cowork";

/**
 * Copilot Cowork — données importées depuis le CSV du centre d'administration Microsoft 365
 * (aucune API Microsoft pour Cowork). Réservé aux comptes SSO (pas l'admin local).
 */

// GET /api/copilot/cowork[?id=] — historique des imports + import demandé (défaut : le plus récent)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id") ?? undefined;
  try {
    const [imports, current] = await Promise.all([listCoworkImports(), getCoworkImport(id)]);
    return NextResponse.json({ imports, current });
  } catch (error: unknown) {
    console.error("[/api/copilot/cowork GET]", error);
    return NextResponse.json({ error: "Erreur de lecture des imports Cowork." }, { status: 500 });
  }
}

const rowSchema = z.object({
  upn: z.string().min(1).max(320),
  displayName: z.string().max(256),
  totalTasks: z.number().finite().min(0),
  scheduledTasks: z.number().finite().min(0).nullable(),
  userTasks: z.number().finite().min(0).nullable(),
  activeDays: z.number().finite().min(0).nullable(),
  lastActivity: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

const postSchema = z.object({
  fileName: z.string().min(1).max(255),
  rows: z.array(rowSchema).min(1).max(100_000),
});

// POST /api/copilot/cowork — enregistre un import (lignes déjà normalisées côté client par parseCoworkCsv)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.email) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const meta = await createCoworkImport({ ...parsed.data, importedBy: session.user.email });
    await logAudit({
      userId: session.user.email,
      userUpn: session.user.email,
      action: "COWORK_USAGE_IMPORT",
      targetId: meta.id,
      targetName: meta.fileName,
      targetType: "Report",
      payloadBefore: {},
      payloadAfter: { fileName: meta.fileName, rowCount: meta.rowCount },
    });
    return NextResponse.json(meta);
  } catch (error: unknown) {
    console.error("[/api/copilot/cowork POST]", error);
    return NextResponse.json({ error: "Erreur lors de l'enregistrement de l'import." }, { status: 500 });
  }
}

// DELETE /api/copilot/cowork?id= — supprime un import (ex. mauvais fichier)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.email) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const id = z.string().uuid().safeParse(req.nextUrl.searchParams.get("id"));
  if (!id.success) {
    return NextResponse.json({ error: "id invalide" }, { status: 400 });
  }
  try {
    const meta = await deleteCoworkImport(id.data);
    if (!meta) return NextResponse.json({ error: "Import introuvable" }, { status: 404 });
    await logAudit({
      userId: session.user.email,
      userUpn: session.user.email,
      action: "COWORK_USAGE_DELETE",
      targetId: meta.id,
      targetName: meta.fileName,
      targetType: "Report",
      payloadBefore: { fileName: meta.fileName, rowCount: meta.rowCount, importedBy: meta.importedBy },
      payloadAfter: {},
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[/api/copilot/cowork DELETE]", error);
    return NextResponse.json({ error: "Erreur lors de la suppression." }, { status: 500 });
  }
}
