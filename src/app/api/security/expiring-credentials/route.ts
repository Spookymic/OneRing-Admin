import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listExpiringCredentials } from "@/services/graph/applications";

// GET /api/security/expiring-credentials?days=30
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const days = Number(req.nextUrl.searchParams.get("days")) || 30;
  try {
    const credentials = await listExpiringCredentials(session.accessToken, days, Date.now());
    return NextResponse.json({ supported: true, credentials });
  } catch (error: any) {
    const msg: string = error.message ?? "";
    // Pas de droit de lecture des applications → fonctionnalité indisponible (pas une erreur bloquante)
    if (msg.includes("[403]")) {
      return NextResponse.json({ supported: false, credentials: [] });
    }
    console.error("[/api/security/expiring-credentials]", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
