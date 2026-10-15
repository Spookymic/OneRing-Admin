import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { isExchangeAdmin } from "@/lib/exchange-guard";
import { getMailForwarding } from "@/services/exchange/forwarding";

const querySchema = z.object({
  account: z.string().min(3).max(320),
  scanRules: z.enum(["0", "1"]).default("0"),
});

// GET /api/mailboxes/forwarding?account=<upn|smtp>&scanRules=0|1 — lecture seule
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const parsed = querySchema.safeParse({
    account: req.nextUrl.searchParams.get("account") ?? undefined,
    scanRules: req.nextUrl.searchParams.get("scanRules") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Paramètre account invalide" }, { status: 400 });
  }
  try {
    // Canal app-only : les règles de boîte d'autrui ne sont lisibles que par un admin Exchange
    if (!(await isExchangeAdmin(session.accessToken))) {
      return NextResponse.json({ error: "exchange_forbidden" }, { status: 403 });
    }
    const report = await getMailForwarding(parsed.data.account, parsed.data.scanRules === "1");
    return NextResponse.json(report);
  } catch (error) {
    console.error("[/api/mailboxes/forwarding GET]", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
