import { graphFetchCsv } from "@/lib/graph";
import { parseCsv, csvDate, csvNumber } from "@/lib/csv-parse";
import { getSkuFriendlyName } from "@/lib/license-names";
import { listSubscribedSkus } from "@/services/graph/licenses";
import { listUsers } from "@/services/graph/users";
import {
  copilotAppLabel,
  isCopilotSku,
  type CopilotApp,
  type CopilotPeriod,
  type CopilotUsageResponse,
  type CopilotUser,
} from "@/lib/copilot";

/**
 * Utilisation de Microsoft 365 Copilot (licences par utilisateur).
 *
 * Rapport Graph v1.0 `/copilot/reports/getMicrosoft365CopilotUsageUserDetail` (version 2 par défaut :
 * périodes D7 / D28 / D90 / D180, renvoyé en CSV). Ne couvre que les utilisateurs disposant d'une
 * licence Microsoft 365 Copilot. Permission `Reports.Read.All` (déjà accordée pour l'écran Stockage).
 * Latence Microsoft : ~48 h.
 *
 * Copilot Cowork n'est PAS couvert (aucune API Microsoft) : voir l'import CSV de l'écran Copilot.
 */

const PERIOD_PARAM: Record<CopilotPeriod, string> = { 7: "D7", 28: "D28", 90: "D90", 180: "D180" };

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getCopilotUsage(accessToken: string, period: CopilotPeriod): Promise<CopilotUsageResponse> {
  const [csv, skus, users] = await Promise.all([
    graphFetchCsv(
      accessToken,
      `/copilot/reports/getMicrosoft365CopilotUsageUserDetail(period='${PERIOD_PARAM[period]}')`
    ),
    listSubscribedSkus(accessToken),
    listUsers(accessToken),
  ]);

  // ── Licences Copilot ──
  const copilotSkus = skus.filter((s) => isCopilotSku(s.skuPartNumber));
  const skuName = new Map(copilotSkus.map((s) => [s.skuId, getSkuFriendlyName(s.skuPartNumber)]));
  const licenses = copilotSkus.map((s) => ({
    skuId: s.skuId,
    skuPartNumber: s.skuPartNumber,
    name: getSkuFriendlyName(s.skuPartNumber),
    assigned: s.consumedUnits,
    enabled: s.prepaidUnits.enabled,
  }));

  // ── Rapport d'utilisation ──
  const rows = parseCsv(csv).filter((r) => r["User Principal Name"]);
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const apps: CopilotApp[] = headers
    .map((h) => ({ key: h, label: copilotAppLabel(h) }))
    .filter((a): a is CopilotApp => a.label !== null);
  const promptsKey = headers.find((h) => /^Prompts submitted for All Apps$/i.test(h));
  const activeDaysKey = headers.find((h) => /^Active Usage Days for All Apps$/i.test(h));

  const reportRefreshDate = csvDate(rows[0]?.["Report Refresh Date"], "mdy");
  const periodStart = reportRefreshDate ? addDays(reportRefreshDate, -(period - 1)) : null;
  const inPeriod = (d: string | null) => !!d && !!periodStart && d >= periodStart;

  const usageByUpn = new Map(rows.map((r) => [(r["User Principal Name"] ?? "").toLowerCase(), r]));

  // Rapport anonymisé : identifiants hexadécimaux à la place des UPN
  const concealed = rows.length > 0 && rows.filter((r) => (r["User Principal Name"] ?? "").includes("@")).length < rows.length / 2;

  function build(
    r: Record<string, string> | undefined,
    base: Pick<CopilotUser, "id" | "upn" | "displayName" | "department" | "accountEnabled" | "licenses">
  ): CopilotUser {
    const appDates: Record<string, string | null> = {};
    for (const a of apps) appDates[a.key] = csvDate(r?.[a.key], "mdy");
    const last = csvDate(r?.["Last Activity Date"], "mdy");
    const licensed = base.licenses.length > 0;
    return {
      ...base,
      status: !licensed ? "unlicensed" : inPeriod(last) ? "active" : last ? "inactive" : "never",
      lastActivityDate: last,
      apps: appDates,
      appsInPeriod: apps.filter((a) => inPeriod(appDates[a.key])).map((a) => a.key),
      prompts: promptsKey ? csvNumber(r?.[promptsKey]) : null,
      activeDays: activeDaysKey ? csvNumber(r?.[activeDaysKey]) : null,
    };
  }

  const result: CopilotUser[] = [];

  // Rapport anonymisé : rapprochement avec l'annuaire impossible — on s'appuie sur le rapport seul
  // (il ne couvre que des utilisateurs licenciés Copilot).
  if (concealed) {
    for (const r of rows) {
      result.push(
        build(r, {
          id: null,
          upn: r["User Principal Name"],
          displayName: r["Display Name"] || r["User Principal Name"],
          department: null,
          accountEnabled: null,
          licenses: ["Microsoft 365 Copilot"],
        })
      );
    }
    return {
      supported: true, period, reportRefreshDate, periodStart, concealed, licenses, apps,
      users: result.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    };
  }

  // Utilisateurs licenciés (annuaire) + rapport
  const seen = new Set<string>();
  for (const u of users) {
    const lic = u.assignedLicenses.map((l) => skuName.get(l.skuId)).filter((n): n is string => !!n);
    if (lic.length === 0) continue;
    const key = u.userPrincipalName.toLowerCase();
    seen.add(key);
    result.push(
      build(usageByUpn.get(key), {
        id: u.id,
        upn: u.userPrincipalName,
        displayName: u.displayName,
        department: u.department ?? null,
        accountEnabled: u.accountEnabled,
        licenses: lic,
      })
    );
  }
  // Présents dans le rapport mais plus licenciés (ou noms masqués : non rapprochables)
  const byUpn = new Map(users.map((u) => [u.userPrincipalName.toLowerCase(), u]));
  for (const [key, r] of usageByUpn) {
    if (!key || seen.has(key)) continue;
    const u = byUpn.get(key);
    result.push(
      build(r, {
        id: u?.id ?? null,
        upn: r["User Principal Name"],
        displayName: u?.displayName ?? r["Display Name"] ?? r["User Principal Name"],
        department: u?.department ?? null,
        accountEnabled: u?.accountEnabled ?? null,
        licenses: [],
      })
    );
  }

  return {
    supported: true,
    period,
    reportRefreshDate,
    periodStart,
    concealed,
    licenses,
    apps,
    users: result.sort((a, b) => a.displayName.localeCompare(b.displayName)),
  };
}
