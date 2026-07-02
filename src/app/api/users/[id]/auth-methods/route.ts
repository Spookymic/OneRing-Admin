import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserAuthMethods } from "@/services/graph/users";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const summary = await getUserAuthMethods(session.accessToken, id);
    return NextResponse.json(summary);
  } catch (error: any) {
    console.error("[/api/users/[id]/auth-methods GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
