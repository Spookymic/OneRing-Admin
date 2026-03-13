import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { listGroupCounts } from "@/services/graph/groups";

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const counts = await listGroupCounts(session.accessToken, parsed.data.ids);
    return NextResponse.json(counts);
  } catch (error: any) {
    console.error("[/api/groups/counts POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
