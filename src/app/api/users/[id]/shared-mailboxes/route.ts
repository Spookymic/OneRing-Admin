import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isExchangeAdmin } from "@/lib/exchange-guard";
import { getUser } from "@/services/graph/users";
import { getUsersSharedMailboxAccess } from "@/services/exchange/shared-mailboxes";
import type { UserSharedMailboxesResponse } from "@/lib/mailbox-access";

/**
 * GET /api/users/[id]/shared-mailboxes[?refresh=1] — boîtes partagées sur lesquelles l'utilisateur
 * détient une délégation directe (Accès complet / Envoyer en tant que / de la part de).
 *
 * Réponse non bloquante : tant que l'index des délégations du pont n'est pas prêt, `mailboxes` est
 * absent et `done`/`total` indiquent la progression — le client rappelle la route (chaque appel fait
 * avancer l'index de ~8 s). Lecture via le pont Exchange app-only : réservée aux admins Exchange.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await params;
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  try {
    if (!(await isExchangeAdmin(session.accessToken))) {
      return NextResponse.json({ error: "exchange_forbidden" }, { status: 403 });
    }
    const user = await getUser(session.accessToken, id);
    const upn = user.userPrincipalName;
    const { access, ...status } = await getUsersSharedMailboxAccess([upn], refresh);
    const body: UserSharedMailboxesResponse = access ? { ...status, mailboxes: access[upn] ?? [] } : status;
    return NextResponse.json(body);
  } catch (error: unknown) {
    console.error("[/api/users/[id]/shared-mailboxes GET]", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
