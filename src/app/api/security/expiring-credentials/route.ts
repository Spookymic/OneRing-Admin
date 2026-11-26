import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import {
  getCredentialUsageIndex, listExpiringCredentials, withUsage,
} from "@/services/graph/applications";
import { syncAndLoadAppCreators } from "@/services/app-creators";

const querySchema = z.object({
  days: z.coerce.number().int().min(0).max(100_000).default(30),
  usage: z.enum(["0", "1"]).default("0"),
});

// GET /api/security/expiring-credentials?days=30&usage=1
// usage=1 : ajoute la dernière utilisation de chaque secret/certificat et de son application.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const parsed = querySchema.safeParse({
    days: req.nextUrl.searchParams.get("days") || undefined,
    usage: req.nextUrl.searchParams.get("usage") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }
  const { days, usage } = parsed.data;
  try {
    const now = Date.now();
    const detailed = usage === "1";
    const [credentials, index, creators] = await Promise.all([
      listExpiringCredentials(session.accessToken, days, now),
      detailed ? getCredentialUsageIndex(session.accessToken) : Promise.resolve(null),
      detailed ? syncAndLoadAppCreators(session.accessToken) : Promise.resolve(undefined),
    ]);
    if (!index) return NextResponse.json({ supported: true, credentials });
    return NextResponse.json({
      supported: true,
      usageSupported: index.supported,
      credentials: withUsage(credentials, index, now, creators),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Pas de droit de lecture des applications → fonctionnalité indisponible (pas une erreur bloquante)
    if (msg.includes("[403]")) {
      return NextResponse.json({ supported: false, credentials: [] });
    }
    console.error("[/api/security/expiring-credentials]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
