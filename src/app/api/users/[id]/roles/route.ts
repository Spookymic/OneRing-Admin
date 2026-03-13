import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listUserRoles, assignRole, removeRole } from "@/services/graph/roles";
import { getUser } from "@/services/graph/users";
import { logAudit } from "@/services/audit";
import { NextResponse } from "next/server";

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
  const body = await req.json();

  if (!body.roleId || !body.roleName || !["assign", "remove"].includes(body.action)) {
    return NextResponse.json({ error: "roleId, roleName et action (assign|remove) requis" }, { status: 400 });
  }

  try {
    const user = await getUser(session.accessToken, id);

    if (body.action === "assign") {
      await assignRole(session.accessToken, body.roleId, id);
    } else {
      await removeRole(session.accessToken, body.roleId, id);
    }

    await logAudit({
      userId: session.user?.email ?? "unknown",
      userUpn: session.user?.email ?? "unknown",
      action: body.action === "assign" ? "ROLE_ASSIGN" : "ROLE_REMOVE",
      targetId: id,
      targetName: user.displayName,
      targetType: "user",
      payloadAfter: { roleName: body.roleName, roleId: body.roleId },
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
