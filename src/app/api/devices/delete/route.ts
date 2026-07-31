import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { deleteEntraDevice, deleteIntuneDevice, deleteAutopilotDevice } from "@/services/graph/devices";
import { logAudit } from "@/services/audit";

const schema = z.object({
  name: z.string().min(1).max(256),
  entraId: z.string().optional(),
  intuneId: z.string().optional(),
  autopilotId: z.string().optional(),
});

interface Result {
  source: "entra" | "intune" | "autopilot";
  ok: boolean;
  error?: string;
}

// POST /api/devices/delete — supprime une machine dans toutes les sources fournies (irréversible)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.email) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const { name, entraId, intuneId, autopilotId } = parsed.data;
  if (!entraId && !intuneId && !autopilotId) {
    return NextResponse.json({ error: "Aucune source à supprimer" }, { status: 400 });
  }

  const token = session.accessToken;
  const results: Result[] = [];

  const run = async (source: Result["source"], id: string | undefined, fn: (t: string, i: string) => Promise<void>) => {
    if (!id) return;
    try {
      await fn(token, id);
      results.push({ source, ok: true });
    } catch (e: any) {
      results.push({ source, ok: false, error: String(e?.message ?? "erreur") });
    }
  };

  await run("intune", intuneId, deleteIntuneDevice);
  await run("autopilot", autopilotId, deleteAutopilotDevice);
  await run("entra", entraId, deleteEntraDevice);

  const deleted = results.filter((r) => r.ok).map((r) => r.source);
  const failed = results.filter((r) => !r.ok);

  // Journalisation (opération irréversible — pas de rollback)
  await logAudit({
    userId: session.user.email,
    userUpn: session.user.email,
    action: "DEVICE_DELETE",
    targetId: entraId || intuneId || autopilotId || name,
    targetName: name,
    targetType: "Device",
    payloadBefore: { sources: results.map((r) => r.source) },
    payloadAfter: { deleted, failed: failed.map((f) => ({ source: f.source, error: f.error })) },
  });

  return NextResponse.json({ success: failed.length === 0, results });
}
