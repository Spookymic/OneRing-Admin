import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Configuration SSO Azure AD (lecture seule, non sensible).
 * N'expose jamais le client secret.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const base = process.env.NEXTAUTH_URL ?? "";
  return NextResponse.json({
    tenantId: process.env.AZURE_AD_TENANT_ID ?? null,
    clientId: process.env.AZURE_AD_CLIENT_ID ?? null,
    nextAuthUrl: base || null,
    redirectUri: base ? `${base}/api/auth/callback/azure-ad` : null,
  });
}
