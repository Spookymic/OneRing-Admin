import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listTenantSignIns, computeSignInStats } from "@/services/graph/signins";

// GET /api/security/sign-ins?hours=24|168
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const hours = Number(req.nextUrl.searchParams.get("hours")) || 24;

  try {
    const { signIns, truncated } = await listTenantSignIns(session.accessToken, hours);
    const stats = computeSignInStats(signIns, hours);
    return NextResponse.json({
      supported: true,
      hours,
      examined: signIns.length,
      truncated,
      stats,
      recent: signIns.slice(0, 100),
    });
  } catch (error: any) {
    const msg: string = error?.message ?? "";
    // Permission AuditLog.Read.All manquante ou consentement admin non accordé
    if (msg.includes("[403]")) {
      return NextResponse.json({ supported: false, hours, examined: 0, truncated: false, stats: null, recent: [] });
    }
    console.error("[/api/security/sign-ins]", msg);
    return NextResponse.json({ error: "Erreur lors de la lecture des journaux de connexion." }, { status: 500 });
  }
}
