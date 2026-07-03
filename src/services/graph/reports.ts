import { graphFetchCsv, graphBatch } from "@/lib/graph";

/**
 * Rapports d'utilisation du stockage Microsoft 365 (Graph usage reports).
 * Nécessite la permission déléguée `Reports.Read.All`.
 *
 * Ces rapports ne sont disponibles qu'en CSV (le JSON renvoie « JSON format is not supported »).
 *
 * Notes :
 * - Latence de ~1 à 2 jours (période D7 = 7 derniers jours).
 * - Si l'anonymisation est active (centre d'admin M365 > Paramètres > Rapports),
 *   les noms/UPN/URL sont remplacés par des identifiants aléatoires.
 */

export interface StorageItem {
  name: string;          // nom d'affichage (utilisateur ou site)
  detail: string | null; // UPN ou URL du site
  used: number;          // octets utilisés
  allocated: number;     // octets alloués (quota)
  tag?: string | null;   // catégorie (SharePoint : type de site)
}

function toNum(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Nom lisible d'un site SharePoint à partir de son URL (segment après /sites/ ou /teams/). */
function siteNameFromUrl(url: string | undefined): string {
  if (!url) return "";
  const m = url.match(/\/(?:sites|teams)\/([^/]+)/i);
  if (m) return decodeURIComponent(m[1]);
  try { return new URL(url).hostname; } catch { return url; }
}

/**
 * Certains tenants renvoient une colonne « Site URL » vide dans le rapport SharePoint.
 * Le nom du site est alors récupérable depuis le groupe de propriétaires
 * (« Propriétaires de <Site> », « <Site> Owners »…) en retirant les préfixes/suffixes usuels.
 */
function siteNameFromOwner(owner: string | undefined): string {
  if (!owner) return "";
  return owner
    .trim()
    .replace(/^propriétaires d[eu]\s+/i, "")
    .replace(/^owners of\s+/i, "")
    .replace(/^membres d[eu]\s+/i, "")
    .replace(/\s+(owners|members|propriétaires|membres|visitors|visiteurs)$/i, "")
    .trim();
}

/** Parse un CSV (gère les champs entre guillemets, CRLF, BOM) en objets indexés par en-tête. */
function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.length > 1)
    .map((r) => {
      const o: Record<string, string> = {};
      header.forEach((h, idx) => { o[h] = (r[idx] ?? "").trim(); });
      return o;
    });
}

async function fetchReport(
  accessToken: string,
  path: string,
  map: (row: Record<string, string>) => StorageItem
): Promise<StorageItem[]> {
  const csv = await graphFetchCsv(accessToken, path);
  return parseCsv(csv)
    .filter((r) => r["Is Deleted"] !== "True")
    .map(map);
}

/** OneDrive : espace par utilisateur. */
export function getOneDriveUsage(accessToken: string): Promise<StorageItem[]> {
  return fetchReport(
    accessToken,
    `/reports/getOneDriveUsageAccountDetail(period='D7')`,
    (r) => ({
      name: r["Owner Display Name"] || r["Owner Principal Name"] || r["Site URL"] || "—",
      detail: r["Owner Principal Name"] || r["Site URL"] || null,
      used: toNum(r["Storage Used (Byte)"]),
      allocated: toNum(r["Storage Allocated (Byte)"]),
    })
  );
}

/** Exchange : espace par boîte aux lettres (quota = Prohibit Send/Receive). */
export function getMailboxUsage(accessToken: string): Promise<StorageItem[]> {
  return fetchReport(
    accessToken,
    `/reports/getMailboxUsageDetail(period='D7')`,
    (r) => ({
      name: r["Display Name"] || r["User Principal Name"] || "—",
      detail: r["User Principal Name"] || null,
      used: toNum(r["Storage Used (Byte)"]),
      allocated: toNum(r["Prohibit Send/Receive Quota (Byte)"]),
    })
  );
}

/**
 * Type de site SharePoint d'après « Root Web Template ».
 * Un site connecté à un Groupe M365 (template « Group ») est celui que Teams crée ;
 * les canaux Teams ont leur propre site. Les autres sont des sites SharePoint autonomes.
 */
function sharePointKind(template: string | undefined): string {
  const t = (template || "").toLowerCase();
  if (t.includes("teamchannel")) return "Canal Teams";
  if (t.includes("group")) return "Teams / Groupe";
  if (t.includes("sitepagepublishing") || t.includes("communication")) return "Communication";
  return "SharePoint seul";
}

/** SharePoint : espace par site. */
export async function getSharePointUsage(accessToken: string): Promise<StorageItem[]> {
  const csv = await graphFetchCsv(accessToken, `/reports/getSharePointSiteUsageDetail(period='D7')`);
  const rows = parseCsv(csv).filter((r) => r["Is Deleted"] !== "True");

  type Row = StorageItem & { siteId: string; needsResolve: boolean };
  const items: Row[] = rows.map((r) => {
    const urlName = siteNameFromUrl(r["Site URL"]);
    const owner = (r["Owner Display Name"] || "").trim();
    const stripped = siteNameFromOwner(r["Owner Display Name"]);
    // Nom du site : URL > groupe de propriétaires (« Propriétaires de <Site> ») > propriétaire brut.
    // `needsResolve` = aucun nom fiable trouvé (URL vide + propriétaire = personne) → à résoudre via Site Id.
    return {
      name: urlName || stripped || owner || "—",
      detail: r["Site URL"] || r["Owner Display Name"] || null,
      used: toNum(r["Storage Used (Byte)"]),
      allocated: toNum(r["Storage Allocated (Byte)"]),
      tag: sharePointKind(r["Root Web Template"]),
      siteId: r["Site Id"] || "",
      needsResolve: !urlName && stripped === owner,
    };
  });

  // Résolution best-effort des noms de sites autonomes via Graph /sites/{siteId} (lot $batch).
  // Nécessite Sites.Read.All ; en son absence (403) on conserve l'affichage actuel.
  const toResolve = items.filter((i) => i.needsResolve && i.siteId);
  if (toResolve.length > 0) {
    try {
      const batch = await graphBatch<{ displayName?: string; name?: string; webUrl?: string }>(
        accessToken,
        toResolve.map((i) => ({ id: i.siteId, url: `/sites/${i.siteId}?$select=displayName,name,webUrl` }))
      );
      for (const i of toResolve) {
        const resp = batch[i.siteId];
        if (resp?.status === 200 && resp.body) {
          const resolved = resp.body.displayName || resp.body.name || siteNameFromUrl(resp.body.webUrl);
          if (resolved) {
            i.name = resolved;
            if (resp.body.webUrl) i.detail = resp.body.webUrl;
          }
        }
      }
    } catch {
      // best-effort : on garde les noms dérivés
    }
  }

  return items.map(({ siteId: _siteId, needsResolve: _needsResolve, ...rest }) => rest);
}
