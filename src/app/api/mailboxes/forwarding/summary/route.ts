import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isExchangeAdmin } from "@/lib/exchange-guard";
import { getForwardingSummary } from "@/services/exchange/forwarding";

// GET /api/mailboxes/forwarding/summary — transferts au niveau boîte sur tout le tenant. Lecture seule.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    // Canal app-only : réservé aux comptes ayant un rôle Exchange (droits du compte connecté)
    if (!(await isExchangeAdmin(session.accessToken))) {
      return NextResponse.json({ supported: false, reason: "exchange_forbidden", forwards: [] });
    }
    return NextResponse.json({ supported: true, forwards: await getForwardingSummary() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[/api/mailboxes/forwarding/summary GET]", message);
    // Pont indisponible : le tableau de bord affiche la section comme indisponible
    return NextResponse.json({ supported: false, reason: "bridge_unavailable", forwards: [] });
  }
}
