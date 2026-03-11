import type { Client } from "@microsoft/microsoft-graph-client";

export type GroupType = "unified" | "distribution" | "security" | "sharedMailbox";

export interface M365Group {
  id: string;
  displayName: string;
  description: string | null;
  mail: string | null;
  groupTypes: string[];
  mailEnabled: boolean;
  securityEnabled: boolean;
  membershipRule: string | null;
}

function detectGroupType(group: M365Group): GroupType {
  if (group.groupTypes?.includes("Unified")) return "unified";
  if (group.mailEnabled && !group.securityEnabled) return "distribution";
  if (group.mailEnabled && group.securityEnabled) return "security";
  return "security";
}

export async function listGroups(client: Client): Promise<(M365Group & { type: GroupType })[]> {
  const response = await client
    .api("/groups")
    .select("id,displayName,description,mail,groupTypes,mailEnabled,securityEnabled,membershipRule")
    .top(999)
    .orderby("displayName")
    .get();
  return response.value.map((g: M365Group) => ({ ...g, type: detectGroupType(g) }));
}

export async function getGroup(client: Client, groupId: string): Promise<M365Group & { type: GroupType }> {
  const group = await client
    .api(`/groups/${groupId}`)
    .select("id,displayName,description,mail,groupTypes,mailEnabled,securityEnabled,membershipRule")
    .get();
  return { ...group, type: detectGroupType(group) };
}

export async function listGroupMembers(client: Client, groupId: string): Promise<any[]> {
  const response = await client
    .api(`/groups/${groupId}/members`)
    .select("id,displayName,userPrincipalName,mail,jobTitle")
    .get();
  return response.value;
}

export async function addGroupMember(client: Client, groupId: string, userId: string): Promise<void> {
  await client.api(`/groups/${groupId}/members/$ref`).post({
    "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${userId}`,
  });
}

export async function removeGroupMember(client: Client, groupId: string, userId: string): Promise<void> {
  await client.api(`/groups/${groupId}/members/${userId}/$ref`).delete();
}
