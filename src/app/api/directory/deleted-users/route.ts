import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listDeletedUsers } from "@/services/graph/directory";

// GET /api/directory/deleted-users — corbeille Azure AD (comptes supprimés < 30 j)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const users = await listDeletedUsers(session.accessToken);
    return NextResponse.json({ supported: true, users });
  } catch (error: any) {
    if (String(error?.message ?? "").startsWith("[403]")) {
      return NextResponse.json({ supported: false, users: [] });
    }
    console.error("[/api/directory/deleted-users GET]", error?.message);
    return NextResponse.json({ error: "Erreur lors de la lecture de la corbeille." }, { status: 500 });
  }
}
