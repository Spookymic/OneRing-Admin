/**
 * Jeton Microsoft Graph app-only (client credentials).
 *
 * Utilisé UNIQUEMENT côté serveur pour les opérations qui n'existent pas en délégué
 * (ex. /sites/getAllSites, réservé aux permissions applicatives).
 * Réutilise l'app registration SSO (AZURE_AD_CLIENT_ID / _SECRET / _TENANT_ID) ; nécessite
 * que les permissions APPLICATION voulues (ex. Sites.Read.All) soient consenties côté Azure.
 */

const TENANT = process.env.AZURE_AD_TENANT_ID;
const CLIENT_ID = process.env.AZURE_AD_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_AD_CLIENT_SECRET;

let cached: { token: string; exp: number } | null = null;

export async function getAppOnlyGraphToken(): Promise<string> {
  // Cache en mémoire jusqu'à ~1 min avant expiration.
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Azure AD non configuré (client credentials indisponibles)");
  }
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`[${res.status}] jeton app-only: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  cached = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cached.token;
}
