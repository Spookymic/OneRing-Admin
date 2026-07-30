import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listConditionalAccessPolicies } from "@/services/graph/security";

// GET /api/security/conditional-access-policies
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const policies = await listConditionalAccessPolicies(session.accessToken);
    return NextResponse.json({ supported: true, policies });
  } catch (error: any) {
    const msg: string = error?.message ?? "";
    // Permission Policy.Read.All manquante ou consentement admin non accordé
    if (msg.includes("[403]")) {
      return NextResponse.json({ supported: false, policies: [] });
    }
    console.error("[/api/security/conditional-access-policies]", msg);
    return NextResponse.json({ error: "Erreur lors de la lecture des politiques d'accès conditionnel." }, { status: 500 });
  }
}
