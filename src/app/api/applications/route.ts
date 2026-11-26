import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCredentialUsageIndex } from "@/services/graph/applications";
import { getApplicationsReport } from "@/services/graph/app-inventory";
import { syncAndLoadAppCreators } from "@/services/app-creators";

// GET /api/applications — inventaire de sécurité des applications (lecture seule).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const tenantId = process.env.AZURE_AD_TENANT_ID ?? "";
  try {
    const now = Date.now();
    const [usage, creators] = await Promise.all([
      getCredentialUsageIndex(session.accessToken),
      syncAndLoadAppCreators(session.accessToken),
    ]);
    const report = await getApplicationsReport(session.accessToken, tenantId, now, usage, creators);
    return NextResponse.json({ supported: true, ...report });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("[403]")) {
      return NextResponse.json({ supported: false, usageSupported: false, apps: [], servicePrincipals: [] });
    }
    console.error("[/api/applications]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
