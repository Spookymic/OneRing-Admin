import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAdminReport } from "@/services/graph/identity-reports";

// GET /api/reports/admins — comptes détenant un rôle Entra (actifs + éligibles PIM). Lecture seule.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    return NextResponse.json(await getAdminReport(session.accessToken));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("[403]")) {
      return NextResponse.json({ error: "Droits insuffisants pour lire les rôles Entra." }, { status: 403 });
    }
    console.error("[/api/reports/admins GET]", message);
    return NextResponse.json({ error: "Erreur lors de la récupération des administrateurs." }, { status: 500 });
  }
}
