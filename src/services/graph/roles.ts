import { graphFetch } from "@/lib/graph";

export interface DirectoryRole {
  id: string;
  displayName: string;
  description: string | null;
  roleTemplateId: string;
}

/** Liste les rôles AD actifs sur le tenant */
export async function listDirectoryRoles(accessToken: string): Promise<DirectoryRole[]> {
  const data = await graphFetch<{ value: DirectoryRole[] }>(
    accessToken,
    "/directoryRoles?$select=id,displayName,description,roleTemplateId"
  );
  return data.value.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Rôles attribués à un utilisateur spécifique */
export async function listUserRoles(
  accessToken: string,
  userId: string
): Promise<DirectoryRole[]> {
  const data = await graphFetch<{ value: DirectoryRole[] }>(
    accessToken,
    `/users/${userId}/transitiveMemberOf/microsoft.graph.directoryRole?$select=id,displayName,description,roleTemplateId`
  );
  return data.value.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Attribue un rôle à un utilisateur */
export async function assignRole(
  accessToken: string,
  roleId: string,
  userId: string
): Promise<void> {
  await graphFetch(accessToken, `/directoryRoles/${roleId}/members/$ref`, {
    method: "POST",
    body: JSON.stringify({
      "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${userId}`,
    }),
  });
}

/** Retire un rôle d'un utilisateur */
export async function removeRole(
  accessToken: string,
  roleId: string,
  userId: string
): Promise<void> {
  await graphFetch(accessToken, `/directoryRoles/${roleId}/members/${userId}/$ref`, {
    method: "DELETE",
  });
}
