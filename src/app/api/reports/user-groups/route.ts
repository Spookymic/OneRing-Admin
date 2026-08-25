import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { listUserMemberOf, type M365UserGroup } from "@/services/graph/users";

const schema = z.object({
  users: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().default(""),
        upn: z.string().default(""),
      })
    )
    .min(1)
    .max(500),
});

export interface UserGroupsReportEntity {
  id: string;
  name: string;
  upn: string;
  groups: M365UserGroup[];
  error?: string;
}

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
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
    const entities = await inBatches(parsed.data.users, 5, async (u): Promise<UserGroupsReportEntity> => {
      try {
        const groups = await listUserMemberOf(token, u.id);
        return { id: u.id, name: u.name, upn: u.upn, groups };
      } catch (err: any) {
        return { id: u.id, name: u.name, upn: u.upn, groups: [], error: err?.message ?? "Erreur" };
      }
    });
    return NextResponse.json({ entities });
  } catch (error: any) {
    console.error("[/api/reports/user-groups POST]", error?.message);
    return NextResponse.json({ error: "Erreur lors de la génération du rapport." }, { status: 500 });
  }
}
