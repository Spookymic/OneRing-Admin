import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listDirectoryRoles } from "@/services/graph/roles";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const roles = await listDirectoryRoles(session.accessToken);
    return NextResponse.json(roles);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
