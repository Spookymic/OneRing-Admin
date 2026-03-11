import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGraphClient } from "@/lib/graph";
import { listSubscribedSkus } from "@/services/graph/licenses";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const client = getGraphClient(session.accessToken);
    const skus = await listSubscribedSkus(client);
    return NextResponse.json(skus);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
