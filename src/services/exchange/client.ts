/**
 * Client du pont Exchange Online (sidecar PowerShell).
 *
 * Utilisé UNIQUEMENT côté serveur (API routes) — n'importe jamais ce module dans un
 * composant client : il porte le secret partagé du bridge.
 *
 * Conception : docs/ADR-001-pont-exchange.md
 */

const BRIDGE_URL = process.env.EXO_BRIDGE_URL;
const BRIDGE_SECRET = process.env.EXO_BRIDGE_SECRET;

/** Réponse normalisée du bridge : toujours HTTP 200 + { ok, error? }. */
interface BridgeResponse {
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
}

export async function bridgeFetch<T extends BridgeResponse = BridgeResponse>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!BRIDGE_URL || !BRIDGE_SECRET) {
    throw new Error("Pont Exchange non configuré (EXO_BRIDGE_URL / EXO_BRIDGE_SECRET)");
  }

  const res = await fetch(`${BRIDGE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Bridge-Secret": BRIDGE_SECRET,
      ...options.headers,
    },
  });

  const data = (await res.json().catch(() => ({}))) as T;

  // Le bridge renvoie { ok: false, error } même en HTTP 200 (voir convention serveur).
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Pont Exchange : erreur [${res.status}]`);
  }
  return data;
}
