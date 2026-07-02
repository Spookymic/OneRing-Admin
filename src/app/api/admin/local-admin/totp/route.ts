import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import QRCode from "qrcode";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateTotpSecret, totpKeyUri, verifyTotp } from "@/lib/totp";
import { logAudit } from "@/services/audit";

/**
 * Gestion self-service de la 2FA (TOTP) par l'administrateur local connecté.
 * Réservé au compte local courant : on n'agit jamais sur un autre compte.
 */

async function currentLocalAdmin() {
  const session = await getServerSession(authOptions);
  if (session?.role !== "local" || !session.user?.email) return null;
  return prisma.localAdmin.findUnique({ where: { username: session.user.email } });
}

// Statut 2FA du compte local courant
export async function GET() {
  const admin = await currentLocalAdmin();
  if (!admin) return NextResponse.json({ error: "Réservé au compte local" }, { status: 403 });
  return NextResponse.json({ enabled: admin.totpEnabled });
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup") }),
  z.object({ action: z.literal("enable"), code: z.string().min(6).max(8) }),
  z.object({ action: z.literal("disable"), code: z.string().min(6).max(8) }),
]);

export async function POST(req: NextRequest) {
  const admin = await currentLocalAdmin();
  if (!admin) return NextResponse.json({ error: "Réservé au compte local" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  try {
    // 1) Génère un secret provisoire (non activé tant que non vérifié) + QR code
    if (parsed.data.action === "setup") {
      const secret = generateTotpSecret();
      await prisma.localAdmin.update({
        where: { id: admin.id },
        data: { totpSecret: secret, totpEnabled: false },
      });
      const uri = totpKeyUri(admin.username, secret);
      const qrDataUrl = await QRCode.toDataURL(uri);
      return NextResponse.json({ secret, uri, qrDataUrl });
    }

    // 2) Active la 2FA après vérification d'un premier code
    if (parsed.data.action === "enable") {
      if (!admin.totpSecret) {
        return NextResponse.json({ error: "Aucune configuration en cours — relancez la mise en place." }, { status: 400 });
      }
      if (!verifyTotp(parsed.data.code, admin.totpSecret)) {
        return NextResponse.json({ error: "Code incorrect. Vérifiez l'heure de votre appareil." }, { status: 400 });
      }
      await prisma.localAdmin.update({
        where: { id: admin.id },
        data: { totpEnabled: true },
      });
      await logAudit({
        userId: admin.username,
        userUpn: admin.username,
        action: "LOCAL_ADMIN_SET",
        targetId: admin.username,
        targetName: admin.username,
        targetType: "LocalAdmin",
        payloadBefore: { totpEnabled: false },
        payloadAfter: { totpEnabled: true },
      });
      return NextResponse.json({ success: true, enabled: true });
    }

    // 3) Désactive la 2FA après vérification d'un code (empêche la désactivation par une session volée)
    if (!admin.totpEnabled || !admin.totpSecret) {
      return NextResponse.json({ error: "La 2FA n'est pas activée." }, { status: 400 });
    }
    if (!verifyTotp(parsed.data.code, admin.totpSecret)) {
      return NextResponse.json({ error: "Code incorrect." }, { status: 400 });
    }
    await prisma.localAdmin.update({
      where: { id: admin.id },
      data: { totpSecret: null, totpEnabled: false },
    });
    await logAudit({
      userId: admin.username,
      userUpn: admin.username,
      action: "LOCAL_ADMIN_SET",
      targetId: admin.username,
      targetName: admin.username,
      targetType: "LocalAdmin",
      payloadBefore: { totpEnabled: true },
      payloadAfter: { totpEnabled: false },
    });
    return NextResponse.json({ success: true, enabled: false });
  } catch (error: any) {
    console.error("[/api/admin/local-admin/totp POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
