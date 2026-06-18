const GRAPH_API = "https://graph.microsoft.com/v1.0";

export async function graphFetch<T = unknown>(
  accessToken: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = path.startsWith("http") ? path : `${GRAPH_API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Log serveur complet (innerError, request-id, date) pour diagnostiquer les 403/throttling
    console.error(`[graphFetch] ${res.status} ${path}`, JSON.stringify(body.error ?? body));
    // En cas de 403, logguer les scopes effectivement présents dans le jeton (claim scp)
    if (res.status === 403) {
      try {
        const claims = JSON.parse(
          Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8")
        );
        console.error(`[graphFetch] token scp: ${claims.scp ?? "(aucun)"}`);
      } catch {
        console.error("[graphFetch] jeton non décodable");
      }
    }
    // Inclure le status HTTP pour que les routes puissent distinguer 403/404/500
    const msg = body.error?.message || body.error?.code || `Graph API error on ${path}`;
    throw new Error(`[${res.status}] ${msg}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
