import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { assignLicense, removeLicense } from "@/services/graph/licenses";
import { getUser } from "@/services/graph/users";
import { logAudit } from "@/services/audit";

const schema = z.object({
  skuId: z.string().uuid(),
  action: z.enum(["assign", "remove"]),
  skuName: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.email) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { userId } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const token = session.accessToken;
    const user = await getUser(token, userId);
    if (parsed.data.action === "assign") {
      await assignLicense(token, userId, parsed.data.skuId);
      await logAudit({
        userId: session.user.email,
        userUpn: session.user.email,
        action: "LICENSE_ASSIGN",
        targetId: userId,
        targetName: user.displayName,
        targetType: "User",
        payloadBefore: { assignedLicenses: user.assignedLicenses },
        payloadAfter: { addedSkuId: parsed.data.skuId, skuName: parsed.data.skuName },
      });
    } else {
      await removeLicense(token, userId, parsed.data.skuId);
      await logAudit({
        userId: session.user.email,
        userUpn: session.user.email,
        action: "LICENSE_REMOVE",
        targetId: userId,
        targetName: user.displayName,
        targetType: "User",
        payloadBefore: { removedSkuId: parsed.data.skuId, skuName: parsed.data.skuName },
        payloadAfter: { assignedLicenses: user.assignedLicenses },
      });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[/api/licenses/[userId]]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
