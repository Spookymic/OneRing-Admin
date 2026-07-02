import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { graphFetchAll } from "@/lib/graph";

interface RawUser {
  id: string;
  displayName: string;
  userPrincipalName: string;
  accountEnabled: boolean;
  assignedLicenses: { skuId: string }[];
  signInActivity?: {
    lastSignInDateTime?: string | null;
    lastNonInteractiveSignInDateTime?: string | null;
  } | null;
}

/**
 * Utilisateurs actifs et licenciés sans connexion depuis `days` jours (ou jamais connectés).
 * Basé sur signInActivity → nécessite AuditLog.Read.All + une licence Entra Premium sur le tenant.
 * Renvoie { supported:false } si l'API n'est pas disponible (pas de premium / pas de droit).
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const days = Number(req.nextUrl.searchParams.get("days")) || 90;
  const cutoff = Date.now() - days * 86_400_000;

  let users: RawUser[];
  try {
    users = await graphFetchAll<RawUser>(
      session.accessToken,
      "/users?$select=id,displayName,userPrincipalName,accountEnabled,assignedLicenses,signInActivity&$top=999"
    );
  } catch {
    // signInActivity indisponible (tenant sans premium ou droit manquant)
    return NextResponse.json({ supported: false, days, users: [] });
  }

  const inactive = users
    .filter((u) => u.accountEnabled && u.assignedLicenses.length > 0)
    .map((u) => {
      const dates = [
        u.signInActivity?.lastSignInDateTime,
        u.signInActivity?.lastNonInteractiveSignInDateTime,
      ]
        .filter(Boolean)
        .map((d) => new Date(d as string).getTime());
      const lastSignIn = dates.length ? Math.max(...dates) : null;
      return { u, lastSignIn };
    })
    .filter(({ lastSignIn }) => lastSignIn === null || lastSignIn < cutoff)
    .map(({ u, lastSignIn }) => ({
      id: u.id,
      displayName: u.displayName,
      userPrincipalName: u.userPrincipalName,
      licenseCount: u.assignedLicenses.length,
      lastSignIn: lastSignIn ? new Date(lastSignIn).toISOString() : null,
    }))
    .sort((a, b) => (a.lastSignIn ?? "").localeCompare(b.lastSignIn ?? ""));

  return NextResponse.json({ supported: true, days, users: inactive });
}
