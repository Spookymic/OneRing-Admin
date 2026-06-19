import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getObjectCreator } from "@/services/graph/directory";

// GET /api/directory/creator?id=<objectId>&type=user|group
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id");
  const type = req.nextUrl.searchParams.get("type") === "group" ? "group" : "user";
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  try {
    const creator = await getObjectCreator(session.accessToken, id, type);
    return NextResponse.json(creator);
  } catch (error: any) {
    console.error("[/api/directory/creator]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
