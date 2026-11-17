import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCopilotUsage } from "@/services/graph/copilot";
import { COPILOT_PERIODS, type CopilotPeriod, type CopilotUsageResponse } from "@/lib/copilot";

// GET /api/copilot/usage?period=7|28|90|180 — lecture seule (rapport Graph Reports.Read.All)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const raw = Number(req.nextUrl.searchParams.get("period") ?? 28);
  if (!COPILOT_PERIODS.includes(raw as CopilotPeriod)) {
    return NextResponse.json({ error: "period invalide (7, 28, 90 ou 180)" }, { status: 400 });
  }
  const period = raw as CopilotPeriod;
  try {
    return NextResponse.json(await getCopilotUsage(session.accessToken, period));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // Permission Reports.Read.All absente / rôle insuffisant → dégradation propre
    if (message.startsWith("[403]")) {
      const body: CopilotUsageResponse = {
        supported: false, period, reportRefreshDate: null, periodStart: null, concealed: false,
        licenses: [], apps: [], users: [],
      };
      return NextResponse.json(body);
    }
    console.error("[/api/copilot/usage GET]", message);
    return NextResponse.json({ error: "Erreur lors de la récupération du rapport Copilot." }, { status: 500 });
  }
}
