import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { listGroupMembersDetailed, type ReportMember } from "@/services/graph/groups";

const schema = z.object({
  entities: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().default(""),
        type: z.string().default(""),
      })
    )
    .min(1)
    .max(500),
});

export interface MembersReportEntity {
  id: string;
  name: string;
  type: string;
  members: ReportMember[];
  error?: string;
}

/** Exécute des tâches par lots pour limiter la concurrence côté Graph. */
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    out.push(...(await Promise.all(chunk.map(fn))));
  }
  return out;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const token = session.accessToken;
  try {
    const entities = await inBatches(parsed.data.entities, 5, async (e): Promise<MembersReportEntity> => {
      try {
        const members = await listGroupMembersDetailed(token, e.id);
        return { id: e.id, name: e.name, type: e.type, members };
      } catch (err: any) {
        return { id: e.id, name: e.name, type: e.type, members: [], error: err?.message ?? "Erreur" };
      }
    });
    return NextResponse.json({ entities });
  } catch (error: any) {
    console.error("[/api/reports/members POST]", error?.message);
    return NextResponse.json({ error: "Erreur lors de la génération du rapport." }, { status: 500 });
  }
}
