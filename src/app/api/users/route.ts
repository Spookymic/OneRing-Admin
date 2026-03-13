import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listUsers } from "@/services/graph/users";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const users = await listUsers(session.accessToken);
    return NextResponse.json(users);
  } catch (error: any) {
    console.error("[/api/users]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
