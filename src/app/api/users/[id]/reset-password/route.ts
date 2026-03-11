import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getGraphClient } from "@/lib/graph";
import { resetUserPassword, getUser } from "@/services/graph/users";
import { logAudit } from "@/services/audit";

const schema = z.object({
  password: z.string().min(12, "Le mot de passe doit faire au moins 12 caractères"),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.email) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const client = getGraphClient(session.accessToken);
    const user = await getUser(client, id);
    await resetUserPassword(client, id, parsed.data.password);
    await logAudit({
      userId: session.user.email,
      userUpn: session.user.email,
      action: "PASSWORD_RESET",
      targetId: id,
      targetName: user.displayName,
      targetType: "User",
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
