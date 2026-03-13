import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAuditLogs, logAudit } from "@/services/audit";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const days = parseInt(req.nextUrl.searchParams.get("days") ?? "0");
    const logs = await getAuditLogs(500, days > 0 ? days : undefined);
    return NextResponse.json(logs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const body = await req.json();
    await logAudit({
      userId: session.user.email,
      userUpn: session.user.email,
      action: "ADMIN_SETTINGS_UPDATE",
      targetId: session.user.email,
      targetName: "Paramètres d'interface",
      targetType: "AdminSettings",
      payloadBefore: body.payloadBefore ?? {},
      payloadAfter: body.payloadAfter ?? {},
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
