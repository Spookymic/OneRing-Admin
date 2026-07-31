import { graphFetch, graphFetchAll, escapeODataString } from "@/lib/graph";

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
  return graphFetch<M365User>(accessToken, `/users/${encodeURIComponent(userId)}?$select=${SELECT}`);
}

export async function listUserMemberOf(accessToken: string, userId: string): Promise<M365UserGroup[]> {
  const params = new URLSearchParams({
    $select: "id,displayName,description,mail,groupTypes,mailEnabled,securityEnabled",
    $top: "999",
  });
  // graphFetchAll suit @odata.nextLink : sinon plafonné à une page (un utilisateur peut être membre de > 100 groupes).
  const value = await graphFetchAll<M365UserGroup>(
    accessToken,
    `/users/${encodeURIComponent(userId)}/memberOf/microsoft.graph.group?${params}`
  );
  return value.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Groupes dont l'utilisateur est propriétaire. */
export async function listUserOwnedGroups(accessToken: string, userId: string): Promise<M365UserGroup[]> {
  const params = new URLSearchParams({
    $select: "id,displayName,description,mail,groupTypes,mailEnabled,securityEnabled",
    $top: "999",
  });
  const value = await graphFetchAll<M365UserGroup>(
    accessToken,
    `/users/${encodeURIComponent(userId)}/ownedObjects/microsoft.graph.group?${params}`
  );
  return value.sort((a, b) => a.displayName.localeCompare(b.displayName));
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
    $filter: `userId eq '${escapeODataString(userId)}'`,
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

export interface AuthMethod {
  type: string;
  label: string;
  detail: string | null;
  mfaCapable: boolean;
}

export interface AuthMethodsSummary {
  supported: boolean;
  methods: AuthMethod[];
  mfaEnabled: boolean;
}

// Correspondance @odata.type -> libellé FR + capacité MFA
const AUTH_METHOD_MAP: Record<string, { label: string; mfa: boolean }> = {
  microsoftAuthenticatorAuthenticationMethod: { label: "Microsoft Authenticator", mfa: true },
  phoneAuthenticationMethod: { label: "Téléphone (SMS/appel)", mfa: true },
  fido2AuthenticationMethod: { label: "Clé de sécurité FIDO2", mfa: true },
  softwareOathAuthenticationMethod: { label: "Application OATH (TOTP)", mfa: true },
  windowsHelloForBusinessAuthenticationMethod: { label: "Windows Hello Entreprise", mfa: true },
  temporaryAccessPassAuthenticationMethod: { label: "Pass d'accès temporaire", mfa: true },
  emailAuthenticationMethod: { label: "E-mail (réinitialisation)", mfa: false },
  passwordAuthenticationMethod: { label: "Mot de passe", mfa: false },
};

/**
 * Récupère les méthodes d'authentification d'un utilisateur (statut MFA).
 * Best-effort : requiert le scope UserAuthenticationMethod.Read.All. En cas de
 * 403 (consentement admin absent), renvoie `supported: false` sans lever.
 */
export async function getUserAuthMethods(
  accessToken: string,
  userId: string
): Promise<AuthMethodsSummary> {
  try {
    const data = await graphFetch<{ value: Array<Record<string, unknown>> }>(
      accessToken,
      `/users/${encodeURIComponent(userId)}/authentication/methods`
    );
    const methods: AuthMethod[] = (data.value ?? []).map((m) => {
      const odataType = String(m["@odata.type"] ?? "").replace("#microsoft.graph.", "");
      const info = AUTH_METHOD_MAP[odataType] ?? { label: odataType || "Inconnu", mfa: false };
      const detail =
        (m["displayName"] as string) ??
        (m["phoneNumber"] as string) ??
        (m["emailAddress"] as string) ??
        null;
      return { type: odataType, label: info.label, detail, mfaCapable: info.mfa };
    });
    return {
      supported: true,
      methods,
      mfaEnabled: methods.some((m) => m.mfaCapable),
    };
  } catch (error: any) {
    // 403 = scope/consentement manquant ; on dégrade proprement plutôt que d'échouer
    if (String(error?.message ?? "").startsWith("[403]")) {
      return { supported: false, methods: [], mfaEnabled: false };
    }
    throw error;
  }
}

export async function resetUserPassword(
  accessToken: string,
  userId: string,
  newPassword: string
): Promise<void> {
  await graphFetch(accessToken, `/users/${encodeURIComponent(userId)}`, {
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
  await graphFetch(accessToken, `/users/${encodeURIComponent(userId)}`, {
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
  return graphFetch<MailboxSettings>(accessToken, `/users/${encodeURIComponent(userId)}/mailboxSettings`);
}

export async function updateMailboxSettings(
  accessToken: string,
  userId: string,
  settings: { automaticRepliesSetting: Partial<AutomaticRepliesSetting> }
): Promise<void> {
  await graphFetch(accessToken, `/users/${encodeURIComponent(userId)}/mailboxSettings`, {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function setTeamsStatusMessage(
  accessToken: string,
  userId: string,
  message: string
): Promise<void> {
  await graphFetch(accessToken, `/users/${encodeURIComponent(userId)}/presence/setStatusMessage`, {
    method: "POST",
    body: JSON.stringify({
      statusMessage: {
        message: { content: message, contentType: "text" },
        expiryType: "never",
      },
    }),
  });
}
