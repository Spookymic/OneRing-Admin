import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { updateUserEnabled, getUser } from "@/services/graph/users";
import { logAudit } from "@/services/audit";
import { NextResponse } from "next/server";

const patchSchema = z.object({ accountEnabled: z.boolean() });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "accountEnabled (boolean) requis" }, { status: 400 });
  }
  const { accountEnabled } = parsed.data;

  try {
    const user = await getUser(session.accessToken, id);
    await updateUserEnabled(session.accessToken, id, accountEnabled);

    await logAudit({
      userId: session.user?.email ?? "unknown",
      userUpn: session.user?.email ?? "unknown",
      action: accountEnabled ? "ACCOUNT_ENABLE" : "ACCOUNT_DISABLE",
      targetId: id,
      targetName: user.displayName,
      targetType: "user",
      payloadBefore: { accountEnabled: !accountEnabled },
      payloadAfter: { accountEnabled },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
