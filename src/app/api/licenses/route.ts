import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listSubscribedSkus } from "@/services/graph/licenses";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const skus = await listSubscribedSkus(session.accessToken);
    return NextResponse.json(skus);
  } catch (error: any) {
    console.error("[/api/licenses]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
