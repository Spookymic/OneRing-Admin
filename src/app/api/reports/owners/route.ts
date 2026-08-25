import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { graphBatch } from "@/lib/graph";

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
    .max(2000),
});

export interface ReportOwner {
  id: string;
  displayName: string;
  mail: string | null;
}

export interface OwnersReportEntity {
  id: string;
  name: string;
  type: string;
  owners: ReportOwner[];
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
  try {
    const requests = parsed.data.entities.map((e) => ({
      id: e.id,
      url: `/groups/${encodeURIComponent(e.id)}/owners?$select=id,displayName,mail&$top=100`,
    }));
    const results = await graphBatch<{ value?: ReportOwner[] }>(session.accessToken, requests);

    const entities: OwnersReportEntity[] = parsed.data.entities.map((e) => {
      const res = results[e.id];
      const owners = (res?.status === 200 ? res.body?.value ?? [] : []).map((o) => ({
        id: o.id,
        displayName: o.displayName ?? "",
        mail: o.mail ?? null,
      }));
      return { id: e.id, name: e.name, type: e.type, owners };
    });

    return NextResponse.json({ entities });
  } catch (error: any) {
    console.error("[/api/reports/owners POST]", error?.message);
    return NextResponse.json({ error: "Erreur lors de la génération du rapport." }, { status: 500 });
  }
}
