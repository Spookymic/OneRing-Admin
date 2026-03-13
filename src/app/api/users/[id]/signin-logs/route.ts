import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listUserSignInLogs } from "@/services/graph/users";
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
    const logs = await listUserSignInLogs(session.accessToken, id);
    return NextResponse.json(logs);
  } catch (err: any) {
    const msg: string = err.message ?? "";
    // 403 = permission AuditLog.Read.All manquante
    if (msg.includes("403") || msg.includes("Authorization_RequestDenied") || msg.includes("Forbidden")) {
      return NextResponse.json(
        { error: "permission_denied", message: "La permission AuditLog.Read.All est requise dans l'enregistrement Azure AD." },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
