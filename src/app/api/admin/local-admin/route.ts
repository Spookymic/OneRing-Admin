import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/services/audit";

// Renvoie l'état du compte admin local (existe ? quel identifiant)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const admin = await prisma.localAdmin.findFirst({ select: { username: true } });
  return NextResponse.json({ exists: !!admin, username: admin?.username ?? null });
}

const schema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(8).max(128),
});

// Crée / remplace le compte admin local — réservé aux administrateurs SSO (jeton Graph présent)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.email) {
    return NextResponse.json({ error: "Réservé aux administrateurs SSO" }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Identifiant (≥3, alphanumérique) et mot de passe (≥8) requis" }, { status: 400 });
  }
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    // Un seul compte de secours : on remplace l'existant
    await prisma.$transaction([
      prisma.localAdmin.deleteMany({}),
      prisma.localAdmin.create({ data: { username: parsed.data.username, passwordHash } }),
    ]);
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
    console.error("[/api/admin/local-admin]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
