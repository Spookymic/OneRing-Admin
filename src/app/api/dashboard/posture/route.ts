import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSecurityPosture } from "@/services/graph/security-posture";

// GET /api/dashboard/posture — accès conditionnel, confiance MFA invités, synchronisation AD. Lecture seule.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    return NextResponse.json(await getSecurityPosture(session.accessToken));
  } catch (error) {
    console.error("[/api/dashboard/posture GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Erreur lors de la lecture de la posture de sécurité." }, { status: 500 });
  }
}
