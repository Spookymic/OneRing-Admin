import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { listUserRoles, assignRole, removeRole } from "@/services/graph/roles";
import { getUser } from "@/services/graph/users";
import { logAudit } from "@/services/audit";
import { NextResponse } from "next/server";

const roleSchema = z.object({
  roleId: z.string().uuid(),
  roleName: z.string().min(1).max(256),
  action: z.enum(["assign", "remove"]),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const roles = await listUserRoles(session.accessToken, id);
    return NextResponse.json(roles);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = roleSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "roleId (UUID), roleName et action (assign|remove) requis" }, { status: 400 });
  }
  const { roleId, roleName, action } = parsed.data;

  try {
    const user = await getUser(session.accessToken, id);

    if (action === "assign") {
      await assignRole(session.accessToken, roleId, id);
    } else {
      await removeRole(session.accessToken, roleId, id);
    }

    await logAudit({
      userId: session.user?.email ?? "unknown",
      userUpn: session.user?.email ?? "unknown",
      action: action === "assign" ? "ROLE_ASSIGN" : "ROLE_REMOVE",
      targetId: id,
      targetName: user.displayName,
      targetType: "user",
      payloadAfter: { roleName, roleId },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const msg: string = err.message ?? "";
    if (msg.includes("403") || msg.includes("Forbidden") || msg.includes("Authorization_RequestDenied")) {
      return NextResponse.json(
        { error: "permission_denied", message: "Permission RoleManagement.ReadWrite.Directory ou Directory.ReadWrite.All requise." },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
