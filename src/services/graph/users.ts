import type { Client } from "@microsoft/microsoft-graph-client";

export interface M365User {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail: string | null;
  jobTitle: string | null;
  department: string | null;
  accountEnabled: boolean;
  assignedLicenses: Array<{ skuId: string }>;
}

export async function listUsers(client: Client): Promise<M365User[]> {
  const response = await client
    .api("/users")
    .select("id,displayName,userPrincipalName,mail,jobTitle,department,accountEnabled,assignedLicenses")
    .filter("userType eq 'Member'")
    .top(999)
    .orderby("displayName")
    .get();
  return response.value;
}

export async function getUser(client: Client, userId: string): Promise<M365User> {
  return client
    .api(`/users/${userId}`)
    .select("id,displayName,userPrincipalName,mail,jobTitle,department,accountEnabled,assignedLicenses")
    .get();
}

export async function resetUserPassword(
  client: Client,
  userId: string,
  newPassword: string
): Promise<void> {
  await client.api(`/users/${userId}`).patch({
    passwordProfile: {
      forceChangePasswordNextSignIn: true,
      password: newPassword,
    },
  });
}
