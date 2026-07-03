import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getAuditLogs, logAudit } from "@/services/audit";

// L'entrée d'audit « paramètres d'interface » est pilotée par le client : on borne son contenu
// (objets plats de taille raisonnable) pour éviter d'injecter du bruit volumineux dans le journal.
const settingsAuditSchema = z.object({
  payloadBefore: z.record(z.string(), z.unknown()).optional(),
  payloadAfter: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  // Accessible aux admins SSO ET à l'admin local (gestion de l'application)
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const days = parseInt(req.nextUrl.searchParams.get("days") ?? "0");
    const logs = await getAuditLogs(500, days > 0 ? days : undefined);
    return NextResponse.json(logs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const parsed = settingsAuditSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "payload invalide" }, { status: 400 });
    }
    // Garde-fou de taille (évite un journal pollué par des charges volumineuses)
    if (JSON.stringify(parsed.data).length > 8000) {
      return NextResponse.json({ error: "payload trop volumineux" }, { status: 413 });
    }
    await logAudit({
      userId: session.user.email,
      userUpn: session.user.email,
      action: "ADMIN_SETTINGS_UPDATE",
      targetId: session.user.email,
      targetName: "Paramètres d'interface",
      targetType: "AdminSettings",
      payloadBefore: parsed.data.payloadBefore ?? {},
      payloadAfter: parsed.data.payloadAfter ?? {},
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
