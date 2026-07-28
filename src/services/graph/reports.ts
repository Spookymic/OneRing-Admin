import { graphFetchCsv, graphFetchAll } from "@/lib/graph";
import { getAppOnlyGraphToken } from "@/lib/graph-app";

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
  if (t.includes("group")) return "Groupe M365";
  if (t.includes("sitepagepublishing") || t.includes("communication")) return "Communication";
  return "SharePoint seul";
}

/**
 * Map (GUID de collection de site → nom + URL réels) via /sites/getAllSites en APP-ONLY.
 * getAllSites n'accepte que les permissions applicatives (403 en délégué) → on utilise un
 * jeton client-credentials. Source unique et fiable (comme le portail d'admin SharePoint).
 * Best-effort : nécessite l'application permission Sites.Read.All consentie ; sinon map vide.
 */
async function fetchSiteNameMap(): Promise<Map<string, { name: string; url: string }>> {
  const map = new Map<string, { name: string; url: string }>();
  try {
    const appToken = await getAppOnlyGraphToken();
    const sites = await graphFetchAll<{ id?: string; displayName?: string; name?: string; webUrl?: string }>(
      appToken,
      "https://graph.microsoft.com/beta/sites/getAllSites?$select=id,displayName,name,webUrl&$top=200"
    );
    for (const s of sites) {
      // id composite = "hostname,{collectionGuid},{webGuid}" → on indexe par le GUID de collection.
      const guid = (s.id ?? "").split(",")[1];
      if (guid) map.set(guid.toLowerCase(), { name: s.displayName || s.name || "", url: s.webUrl || "" });
    }
  } catch (e: any) {
    console.error("[reports] getAllSites (app-only) indisponible:", e?.message);
  }
  return map;
}

export interface SharePointSite {
  name: string;
  url: string | null;
  kind: string;               // type de site (Groupe M365, Communication…)
  storageUsed: number;        // octets
  storageAllocated: number;   // octets (quota, souvent 25 To par défaut)
  fileCount: number;
  activeFileCount: number;
  pageViewCount: number;
  visitedPageCount: number;
  lastActivityDate: string | null;
}

/** SharePoint : détail complet par site (volumes + activité), depuis le rapport d'utilisation. */
export async function getSharePointSites(accessToken: string): Promise<SharePointSite[]> {
  const [csv, siteNames] = await Promise.all([
    graphFetchCsv(accessToken, `/reports/getSharePointSiteUsageDetail(period='D7')`),
    fetchSiteNameMap(),
  ]);
  const rows = parseCsv(csv).filter((r) => r["Is Deleted"] !== "True");

  return rows.map((r) => {
    const resolved = siteNames.get((r["Site Id"] || "").toLowerCase());
    // Vrai nom/URL (getAllSites) en priorité ; sinon dérivé de l'URL ou du groupe de propriétaires.
    const derived = siteNameFromUrl(r["Site URL"]) || siteNameFromOwner(r["Owner Display Name"]) || r["Owner Display Name"] || "—";
    return {
      name: resolved?.name || derived,
      url: resolved?.url || r["Site URL"] || null,
      kind: sharePointKind(r["Root Web Template"]),
      storageUsed: toNum(r["Storage Used (Byte)"]),
      storageAllocated: toNum(r["Storage Allocated (Byte)"]),
      fileCount: toNum(r["File Count"]),
      activeFileCount: toNum(r["Active File Count"]),
      pageViewCount: toNum(r["Page View Count"]),
      visitedPageCount: toNum(r["Visited Page Count"]),
      lastActivityDate: r["Last Activity Date"] || null,
    };
  });
}

/** SharePoint : espace par site (vue Stockage). Dérivé de getSharePointSites. */
export async function getSharePointUsage(accessToken: string): Promise<StorageItem[]> {
  const sites = await getSharePointSites(accessToken);
  return sites.map((s) => ({
    name: s.name,
    detail: s.url,
    used: s.storageUsed,
    allocated: s.storageAllocated,
    tag: s.kind,
  }));
}
