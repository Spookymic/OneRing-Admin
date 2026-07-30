import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listRiskyDetections, getEntraIdP2Status } from "@/services/graph/security";

// GET /api/security/risky-sign-ins
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const detections = await listRiskyDetections(session.accessToken);
    return NextResponse.json({ supported: true, detections });
  } catch (error: any) {
    // Licence Microsoft Entra ID P2 absente et/ou permission IdentityRiskEvent.Read.All
    // manquante : Graph renvoie des codes d'erreur variables selon le cas (403 le plus
    // souvent, mais pas garanti) — dégradation générique, cohérent avec les autres
    // fonctionnalités nécessitant une licence Premium (ex. utilisateurs inactifs).
    console.error("[/api/security/risky-sign-ins]", error?.message);
    // Diagnostic best-effort : indique à l'écran si une licence incluant P2 est bien présente
    // sur le tenant (Organization.Read.All, déjà un scope requis — ne devrait pas échouer).
    let hasP2 = false;
    let licenses: string[] = [];
    try {
      ({ hasP2, licenses } = await getEntraIdP2Status(session.accessToken));
    } catch {
      // best-effort : on affiche quand même la bannière générique
    }
    return NextResponse.json({ supported: false, detections: [], hasP2, licenses });
  }
}
