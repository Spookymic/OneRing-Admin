/**
 * Garde de sécurité du canal Exchange (pont app-only).
 *
 * Le sidecar agit avec un rôle Exchange Administrator applicatif — donc PAS avec les droits
 * du compte connecté. On réimpose donc la règle « droits du compte connecté » ici : avant
 * tout appel au bridge, on vérifie que l'utilisateur possède bien un rôle Exchange pertinent.
 *
 * Voir docs/ADR-001-pont-exchange.md (§4 Conséquences sur la sécurité).
 */

const EXCHANGE_ADMIN_ROLE_TEMPLATE_IDS = new Set([
  "62e90394-69f5-4237-9190-012177145e10", // Global Administrator
  "29232cdf-9323-42fd-ade2-1d097af3e4de", // Exchange Administrator
  "31392ffb-586c-42d1-9346-e59415a2cc4e", // Exchange Recipient Administrator
]);

/** Vrai si le compte connecté possède un rôle d'annuaire Exchange (ou Global Admin). */
export async function isExchangeAdmin(accessToken: string): Promise<boolean> {
  try {
    const resp = await fetch(
      "https://graph.microsoft.com/v1.0/me/transitiveMemberOf/microsoft.graph.directoryRole?$select=roleTemplateId",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!resp.ok) return false;
    const data = await resp.json();
    const roleIds: string[] = (data.value ?? []).map((r: { roleTemplateId: string }) => r.roleTemplateId);
    return roleIds.some((id) => EXCHANGE_ADMIN_ROLE_TEMPLATE_IDS.has(id));
  } catch {
    return false;
  }
}
