import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBridgeHealth } from "@/services/exchange/client";

// État du pont Exchange (pour l'indicateur UI)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const health = await getBridgeHealth();
  return NextResponse.json({ reachable: !!health, ...(health ?? {}) });
}
