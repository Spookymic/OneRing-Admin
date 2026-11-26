import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMfaReport } from "@/services/graph/identity-reports";

// GET /api/reports/mfa — état MFA (méthodes enregistrées) de tous les comptes. Lecture seule.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    return NextResponse.json(await getMfaReport(session.accessToken));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Droits insuffisants du compte connecté : dégradation propre, l'écran explique la cause.
    if (message.startsWith("[403]")) {
      return NextResponse.json({
        supported: false,
        source: null,
        reason: "Le compte connecté n'a pas le droit de lire les méthodes d'authentification ou les rapports Entra.",
        users: [],
        generatedAt: new Date().toISOString(),
      });
    }
    console.error("[/api/reports/mfa GET]", message);
    return NextResponse.json({ error: "Erreur lors de la récupération de l'état MFA." }, { status: 500 });
  }
}
