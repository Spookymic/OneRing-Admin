import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOneDriveUsage, getMailboxUsage, getSharePointUsage } from "@/services/graph/reports";
import { getMailboxQuotas } from "@/services/exchange/mailbox-quotas";

// GET /api/reports/storage?type=onedrive|exchange|sharepoint
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const type = req.nextUrl.searchParams.get("type");
  const fetcher =
    type === "onedrive" ? getOneDriveUsage
    : type === "exchange" ? getMailboxUsage
    : type === "sharepoint" ? getSharePointUsage
    : null;
  if (!fetcher) {
    return NextResponse.json({ error: "type invalide (onedrive|exchange|sharepoint)" }, { status: 400 });
  }
  try {
    const items = await fetcher(session.accessToken);

    // Exchange : le quota du rapport Graph est peu fiable (souvent 50 Go). On le remplace par
    // le vrai ProhibitSendReceiveQuota via le pont Exchange (un seul appel). Dégradation propre
    // si le pont est indisponible : on conserve la valeur du rapport.
    if (type === "exchange") {
      try {
        const quotas = await getMailboxQuotas();
        const byKey = new Map<string, number>();
        for (const q of quotas) {
          if (q.upn) byKey.set(q.upn.toLowerCase(), q.bytes);
          if (q.smtp) byKey.set(q.smtp.toLowerCase(), q.bytes);
        }
        for (const it of items) {
          const real = byKey.get((it.detail ?? "").toLowerCase());
          if (real && real > 0) it.allocated = real;
        }
      } catch (e: any) {
        console.error("[/api/reports/storage] quotas Exchange (pont) indisponibles:", e?.message);
      }
    }

    return NextResponse.json({ supported: true, items });
  } catch (error: any) {
    // Permission Reports.Read.All absente → dégradation propre (pas d'erreur bloquante).
    if (String(error?.message ?? "").startsWith("[403]")) {
      return NextResponse.json({ supported: false, items: [] });
    }
    console.error("[/api/reports/storage GET]", error?.message);
    return NextResponse.json({ error: "Erreur lors de la récupération du rapport." }, { status: 500 });
  }
}
