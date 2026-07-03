const GRAPH_API = "https://graph.microsoft.com/v1.0";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Échappe une valeur destinée à un littéral de chaîne OData (`... eq '<valeur>'`).
 * Double les apostrophes pour empêcher l'injection de clause `$filter`.
 */
export function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

export async function graphFetch<T = unknown>(
  accessToken: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = path.startsWith("http") ? path : `${GRAPH_API}${path}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    // Throttling Graph : respecter Retry-After (jusqu'à 3 tentatives)
    if ((res.status === 429 || res.status === 503) && attempt < 3) {
      const retryAfter = Number(res.headers.get("Retry-After")) || 2 ** attempt;
      await sleep(retryAfter * 1000);
      continue;
    }
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
}

/**
 * Récupère toutes les pages d'une collection Graph en suivant `@odata.nextLink`.
 * Évite la troncature silencieuse au-delà de $top (ex. 999 utilisateurs/groupes).
 */
export async function graphFetchAll<T = unknown>(
  accessToken: string,
  path: string,
  options: RequestInit = {}
): Promise<T[]> {
  const all: T[] = [];
  let url: string | undefined = path;
  while (url) {
    const data: { value?: T[]; "@odata.nextLink"?: string } = await graphFetch(accessToken, url, options);
    if (data.value) all.push(...data.value);
    url = data["@odata.nextLink"];
  }
  return all;
}

/**
 * Exécute des requêtes GET Graph en lot via /$batch (20 par appel).
 * Retourne une map id → { status, body }. Les URLs sont relatives (ex. "/groups/{id}/...").
 */
export async function graphBatch<T = any>(
  accessToken: string,
  requests: { id: string; url: string }[]
): Promise<Record<string, { status: number; body: T }>> {
  const out: Record<string, { status: number; body: T }> = {};
  async function run(reqs: { id: string; url: string }[]) {
    for (let i = 0; i < reqs.length; i += 20) {
      const chunk = reqs.slice(i, i + 20);
      const res = await fetch(`${GRAPH_API}/$batch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: chunk.map((r) => ({ id: r.id, method: "GET", url: r.url })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`[${res.status}] ${body.error?.message || "Graph $batch error"}`);
      }
      const data = await res.json();
      for (const resp of data.responses ?? []) {
        out[resp.id] = { status: resp.status, body: resp.body };
      }
    }
  }

  await run(requests);
  // Rejoue les sous-requêtes throttlées (429), jusqu'à 2 fois
  for (let attempt = 0; attempt < 2; attempt++) {
    const throttled = requests.filter((r) => out[r.id]?.status === 429);
    if (throttled.length === 0) break;
    await sleep(2 ** attempt * 1000);
    await run(throttled);
  }
  return out;
}
