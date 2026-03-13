import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { updateUserEnabled, getUser } from "@/services/graph/users";
import { logAudit } from "@/services/audit";
import { NextResponse } from "next/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  if (typeof body.accountEnabled !== "boolean") {
    return NextResponse.json({ error: "accountEnabled (boolean) requis" }, { status: 400 });
  }

  try {
    const user = await getUser(session.accessToken, id);
    await updateUserEnabled(session.accessToken, id, body.accountEnabled);

    await logAudit({
      userId: session.user?.email ?? "unknown",
      userUpn: session.user?.email ?? "unknown",
      action: body.accountEnabled ? "ACCOUNT_ENABLE" : "ACCOUNT_DISABLE",
      targetId: id,
      targetName: user.displayName,
      targetType: "user",
      payloadBefore: { accountEnabled: !body.accountEnabled },
      payloadAfter: { accountEnabled: body.accountEnabled },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
