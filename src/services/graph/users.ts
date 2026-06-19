import { graphFetch, graphFetchAll } from "@/lib/graph";

export interface M365User {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail: string | null;
  jobTitle: string | null;
  department: string | null;
  accountEnabled: boolean;
  assignedLicenses: Array<{ skuId: string }>;
  userType: string | null;
  officeLocation: string | null;
  mobilePhone: string | null;
  businessPhones: string[];
  createdDateTime: string | null;
  employeeType: string | null;
  onPremisesSyncEnabled: boolean | null;
  onPremisesLastSyncDateTime: string | null;
}

export interface M365UserGroup {
  id: string;
  displayName: string;
  description: string | null;
  mail: string | null;
  groupTypes: string[];
  mailEnabled: boolean;
  securityEnabled: boolean;
}

const SELECT =
  "id,displayName,userPrincipalName,mail,jobTitle,department,accountEnabled," +
  "assignedLicenses,userType,officeLocation,mobilePhone,businessPhones," +
  "createdDateTime,employeeType,onPremisesSyncEnabled,onPremisesLastSyncDateTime";

export async function listUsers(accessToken: string): Promise<M365User[]> {
  const params = new URLSearchParams({
    $select: SELECT,
    $top: "999",
    $count: "true",
  });
  const users = await graphFetchAll<M365User>(
    accessToken,
    `/users?${params}`,
    { headers: { ConsistencyLevel: "eventual" } }
  );
  return users.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getUser(accessToken: string, userId: string): Promise<M365User> {
  return graphFetch<M365User>(accessToken, `/users/${userId}?$select=${SELECT}`);
}

export async function listUserMemberOf(accessToken: string, userId: string): Promise<M365UserGroup[]> {
  const params = new URLSearchParams({
    $select: "id,displayName,description,mail,groupTypes,mailEnabled,securityEnabled",
    $top: "100",
  });
  const data = await graphFetch<{ value: M365UserGroup[] }>(
    accessToken,
    `/users/${userId}/memberOf/microsoft.graph.group?${params}`
  );
  return data.value.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Groupes dont l'utilisateur est propriétaire. */
export async function listUserOwnedGroups(accessToken: string, userId: string): Promise<M365UserGroup[]> {
  const params = new URLSearchParams({
    $select: "id,displayName,description,mail,groupTypes,mailEnabled,securityEnabled",
    $top: "100",
  });
  const data = await graphFetch<{ value: M365UserGroup[] }>(
    accessToken,
    `/users/${userId}/ownedObjects/microsoft.graph.group?${params}`
  );
  return data.value.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export interface SignInLog {
  id: string;
  createdDateTime: string;
  appDisplayName: string;
  ipAddress: string | null;
  status: {
    errorCode: number;
    failureReason: string | null;
    additionalDetails: string | null;
  };
  location: {
    city: string | null;
    state: string | null;
    countryOrRegion: string | null;
  } | null;
  clientAppUsed: string | null;
}

export async function listUserSignInLogs(
  accessToken: string,
  userId: string
): Promise<SignInLog[]> {
  const params = new URLSearchParams({
    $filter: `userId eq '${userId}'`,
    $top: "50",
    $orderby: "createdDateTime desc",
    $select: "id,createdDateTime,appDisplayName,ipAddress,status,location,clientAppUsed",
  });
  const data = await graphFetch<{ value: SignInLog[] }>(
    accessToken,
    `/auditLogs/signIns?${params}`
  );
  return data.value;
}

export async function resetUserPassword(
  accessToken: string,
  userId: string,
  newPassword: string
): Promise<void> {
  await graphFetch(accessToken, `/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({
      passwordProfile: {
        forceChangePasswordNextSignIn: true,
        password: newPassword,
      },
    }),
  });
}

export async function updateUserEnabled(
  accessToken: string,
  userId: string,
  enabled: boolean
): Promise<void> {
  await graphFetch(accessToken, `/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ accountEnabled: enabled }),
  });
}

export interface AutomaticRepliesSetting {
  status: "disabled" | "alwaysEnabled" | "scheduledStartAndEnd";
  externalAudienceScope: "none" | "contactsOnly" | "all";
  internalReplyMessage: string;
  externalReplyMessage: string;
  scheduledStartDateTime?: { dateTime: string; timeZone: string };
  scheduledEndDateTime?: { dateTime: string; timeZone: string };
}

export interface MailboxSettings {
  automaticRepliesSetting: AutomaticRepliesSetting;
  timeZone: string | null;
}

export async function getMailboxSettings(
  accessToken: string,
  userId: string
): Promise<MailboxSettings> {
  return graphFetch<MailboxSettings>(accessToken, `/users/${userId}/mailboxSettings`);
}

export async function updateMailboxSettings(
  accessToken: string,
  userId: string,
  settings: { automaticRepliesSetting: Partial<AutomaticRepliesSetting> }
): Promise<void> {
  await graphFetch(accessToken, `/users/${userId}/mailboxSettings`, {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function setTeamsStatusMessage(
  accessToken: string,
  userId: string,
  message: string
): Promise<void> {
  await graphFetch(accessToken, `/users/${userId}/presence/setStatusMessage`, {
    method: "POST",
    body: JSON.stringify({
      statusMessage: {
        message: { content: message, contentType: "text" },
        expiryType: "never",
      },
    }),
  });
}
