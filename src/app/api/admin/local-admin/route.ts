import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/services/audit";

// Liste des comptes admin locaux
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  // Un admin local ne voit que son propre compte (pas d'énumération de tous les comptes) ;
  // la liste complète est réservée aux admins SSO.
  const where = session.role === "local" ? { username: session.user.email ?? "" } : {};
  const admins = await prisma.localAdmin.findMany({
    where,
    select: { id: true, username: true, createdAt: true, totpEnabled: true },
    orderBy: { username: "asc" },
  });
  return NextResponse.json({ admins });
}

const schema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(12).max(128),
});

// Crée un compte (ou réinitialise son mot de passe si l'identifiant existe) — admins SSO uniquement
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.email) {
    return NextResponse.json({ error: "Réservé aux administrateurs SSO" }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Identifiant (≥3, alphanumérique) et mot de passe (≥12) requis" }, { status: 400 });
  }
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await prisma.localAdmin.upsert({
      where: { username: parsed.data.username },
      update: { passwordHash },
      create: { username: parsed.data.username, passwordHash },
    });
    await logAudit({
      userId: session.user.email,
      userUpn: session.user.email,
      action: "LOCAL_ADMIN_SET",
      targetId: parsed.data.username,
      targetName: parsed.data.username,
      targetType: "LocalAdmin",
      payloadBefore: {},
      payloadAfter: { username: parsed.data.username },
    });
    return NextResponse.json({ success: true, username: parsed.data.username });
  } catch (error: any) {
    console.error("[/api/admin/local-admin POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Supprime un compte (?id=...) ou tous (?all=true) — admins SSO uniquement
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.email) {
    return NextResponse.json({ error: "Réservé aux administrateurs SSO" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  const all = req.nextUrl.searchParams.get("all") === "true";
  if (!id && !all) {
    return NextResponse.json({ error: "Paramètre id ou all requis" }, { status: 400 });
  }
  try {
    let deletedLabel: string;
    if (all) {
      const res = await prisma.localAdmin.deleteMany({});
      deletedLabel = `tous (${res.count})`;
    } else {
      const admin = await prisma.localAdmin.findUnique({ where: { id: id! } });
      if (!admin) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
      await prisma.localAdmin.delete({ where: { id: id! } });
      deletedLabel = admin.username;
    }
    await logAudit({
      userId: session.user.email,
      userUpn: session.user.email,
      action: "LOCAL_ADMIN_DELETE",
      targetId: id ?? "all",
      targetName: deletedLabel,
      targetType: "LocalAdmin",
      payloadBefore: { deleted: deletedLabel },
      payloadAfter: {},
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[/api/admin/local-admin DELETE]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
