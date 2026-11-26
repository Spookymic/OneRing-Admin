/**
 * Garde des modifications d'applications (propriétaires, secrets).
 *
 * Graph refuse déjà l'opération si le compte connecté n'a pas les droits ; on vérifie en amont
 * qu'il détient un rôle d'administration des applications, conformément à la règle « toujours
 * vérifier les droits admin du compte connecté avant toute opération ».
 */

const APP_ADMIN_ROLE_TEMPLATE_IDS = new Set([
  "62e90394-69f5-4237-9190-012177145e10", // Global Administrator
  "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3", // Application Administrator
  "158c047a-c907-4556-b7ef-446551a6b5f7", // Cloud Application Administrator
]);

/** Vrai si le compte connecté possède un rôle d'administration des applications (ou Global Admin). */
export async function isAppAdmin(accessToken: string): Promise<boolean> {
  try {
    const resp = await fetch(
      "https://graph.microsoft.com/v1.0/me/transitiveMemberOf/microsoft.graph.directoryRole?$select=roleTemplateId",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!resp.ok) return false;
    const data = (await resp.json()) as { value?: { roleTemplateId: string }[] };
    return (data.value ?? []).some((r) => APP_ADMIN_ROLE_TEMPLATE_IDS.has(r.roleTemplateId));
  } catch {
    return false;
  }
}
