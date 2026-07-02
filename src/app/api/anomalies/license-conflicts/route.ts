import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { graphFetchAll } from "@/lib/graph";

interface AssignmentState {
  skuId: string;
  assignedByGroup: string | null;
  state: string;
  error: string;
}

interface RawUser {
  id: string;
  displayName: string;
  userPrincipalName: string;
  licenseAssignmentStates?: AssignmentState[] | null;
}

/**
 * Utilisateurs dont une licence est assignée à la fois EN DIRECT et VIA UN GROUPE
 * (doublon → une des deux affectations peut être retirée). Basé sur licenseAssignmentStates.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const users = await graphFetchAll<RawUser>(
      session.accessToken,
      "/users?$select=id,displayName,userPrincipalName,licenseAssignmentStates&$top=999"
    );

    const conflicts: { id: string; displayName: string; userPrincipalName: string; skuIds: string[] }[] = [];
    for (const u of users) {
      const states = u.licenseAssignmentStates ?? [];
      const bySku = new Map<string, AssignmentState[]>();
      for (const s of states) {
        if (!bySku.has(s.skuId)) bySku.set(s.skuId, []);
        bySku.get(s.skuId)!.push(s);
      }
      const dup: string[] = [];
      for (const [skuId, arr] of bySku) {
        const direct = arr.some((s) => !s.assignedByGroup);
        const viaGroup = arr.some((s) => s.assignedByGroup);
        if (direct && viaGroup) dup.push(skuId);
      }
      if (dup.length > 0) {
        conflicts.push({ id: u.id, displayName: u.displayName, userPrincipalName: u.userPrincipalName, skuIds: dup });
      }
    }

    conflicts.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return NextResponse.json(conflicts);
  } catch (error: any) {
    console.error("[/api/anomalies/license-conflicts]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
