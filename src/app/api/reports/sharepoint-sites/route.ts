import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSharePointSites } from "@/services/graph/reports";
import { getSpoSiteSettings, type SpoSiteSettings } from "@/services/sharepoint/site-settings";

const normUrl = (u: string | null | undefined) => (u ?? "").toLowerCase().replace(/\/+$/, "");

// GET /api/reports/sharepoint-sites — détail des sites (volumes + activité + paramètres SPO)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const sites = await getSharePointSites(session.accessToken);

    // Paramètres SharePoint (PnP app-only via le pont) — best-effort : si indisponible, settings = null.
    let settingsByUrl = new Map<string, SpoSiteSettings>();
    try {
      const settings = await getSpoSiteSettings();
      settingsByUrl = new Map(settings.map((s) => [normUrl(s.url), s]));
    } catch (e: any) {
      console.error("[/api/reports/sharepoint-sites] paramètres SPO (pont) indisponibles:", e?.message);
    }

    const enriched = sites.map((s) => ({
      ...s,
      settings: settingsByUrl.get(normUrl(s.url)) ?? null,
    }));

    return NextResponse.json({ supported: true, sites: enriched });
  } catch (error: any) {
    if (String(error?.message ?? "").startsWith("[403]")) {
      return NextResponse.json({ supported: false, sites: [] });
    }
    console.error("[/api/reports/sharepoint-sites GET]", error?.message);
    return NextResponse.json({ error: "Erreur lors de la récupération du rapport." }, { status: 500 });
  }
}
