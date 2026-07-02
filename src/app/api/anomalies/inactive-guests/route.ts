import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { graphFetchAll } from "@/lib/graph";

interface RawGuest {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail: string | null;
  createdDateTime: string | null;
  signInActivity?: {
    lastSignInDateTime?: string | null;
    lastNonInteractiveSignInDateTime?: string | null;
  } | null;
}

/**
 * Invités (userType Guest) inactifs : sans connexion depuis `days` jours (ou jamais).
 * Basé sur signInActivity → best-effort (Entra Premium). { supported:false } sinon.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const days = Number(req.nextUrl.searchParams.get("days")) || 90;
  const cutoff = Date.now() - days * 86_400_000;

  let guests: RawGuest[];
  try {
    guests = await graphFetchAll<RawGuest>(
      session.accessToken,
      "/users?$filter=userType eq 'Guest'&$select=id,displayName,userPrincipalName,mail,createdDateTime,signInActivity&$top=999",
      { headers: { ConsistencyLevel: "eventual" } }
    );
  } catch {
    return NextResponse.json({ supported: false, days, guests: [] });
  }

  const inactive = guests
    .map((g) => {
      const dates = [g.signInActivity?.lastSignInDateTime, g.signInActivity?.lastNonInteractiveSignInDateTime]
        .filter(Boolean)
        .map((d) => new Date(d as string).getTime());
      const lastSignIn = dates.length ? Math.max(...dates) : null;
      return { g, lastSignIn };
    })
    .filter(({ lastSignIn }) => lastSignIn === null || lastSignIn < cutoff)
    .map(({ g, lastSignIn }) => ({
      id: g.id,
      displayName: g.displayName,
      userPrincipalName: g.userPrincipalName,
      mail: g.mail,
      createdDateTime: g.createdDateTime,
      lastSignIn: lastSignIn ? new Date(lastSignIn).toISOString() : null,
    }))
    .sort((a, b) => (a.lastSignIn ?? "").localeCompare(b.lastSignIn ?? ""));

  return NextResponse.json({ supported: true, days, guests: inactive });
}
