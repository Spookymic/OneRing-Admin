/**
 * Rapports d'identité : état MFA des comptes et comptes administrateurs (rôles Entra).
 * Types partagés client/serveur + fonctions pures de synthèse (testées).
 */

import type { M365User } from "@/services/graph/users";
import { detectAccountType } from "@/lib/account-types";

// ── MFA ──────────────────────────────────────────────────────────────

/** Provenance des données MFA. */
export type MfaSource =
  /** Rapport Entra « User registration details » (licence Entra ID P1 requise). */
  | "registrationDetails"
  /** Repli : méthodes d'authentification lues compte par compte. */
  | "methods";

export interface MfaUserRow {
  id: string;
  displayName: string;
  userPrincipalName: string;
  userType: string | null;
  accountEnabled: boolean | null;
  /** Au moins une méthode MFA enregistrée (Authenticator, téléphone, FIDO2, Windows Hello…). */
  mfaRegistered: boolean;
  /** Capable de MFA au sens Entra (méthode enregistrée ET autorisée par la stratégie). Null en repli. */
  mfaCapable: boolean | null;
  passwordlessCapable: boolean | null;
  /** Codes de méthodes enregistrées (bruts Graph). */
  methods: string[];
  defaultMethod: string | null;
  lastUpdated: string | null;
}

export interface MfaReportResponse {
  supported: boolean;
  source: MfaSource | null;
  /** Explication si `supported` est faux (permission, licence, rôle). */
  reason?: string;
  users: MfaUserRow[];
  generatedAt: string;
}

/** Libellés FR des codes de méthodes (userRegistrationDetails.methodsRegistered et @odata.type). */
const METHOD_LABELS: Record<string, string> = {
  microsoftAuthenticatorPush: "Authenticator (notification)",
  microsoftAuthenticatorPasswordless: "Authenticator (sans mot de passe)",
  microsoftAuthenticatorAuthenticationMethod: "Microsoft Authenticator",
  softwareOneTimePasscode: "Code OATH logiciel",
  softwareOathAuthenticationMethod: "Code OATH logiciel",
  hardwareOneTimePasscode: "Jeton OATH matériel",
  hardwareOathAuthenticationMethod: "Jeton OATH matériel",
  mobilePhone: "Téléphone mobile",
  alternateMobilePhone: "Téléphone mobile secondaire",
  officePhone: "Téléphone de bureau",
  sms: "SMS",
  voiceMobile: "Appel mobile",
  voiceAlternateMobile: "Appel mobile secondaire",
  voiceOffice: "Appel bureau",
  phoneAuthenticationMethod: "Téléphone",
  fido2: "Clé FIDO2 / passkey",
  fido2AuthenticationMethod: "Clé FIDO2 / passkey",
  passKeyDeviceBound: "Passkey",
  passKeyDeviceBoundAuthenticator: "Passkey (Authenticator)",
  passKeyDeviceBoundWindowsHello: "Passkey (Windows Hello)",
  windowsHelloForBusiness: "Windows Hello Entreprise",
  windowsHelloForBusinessAuthenticationMethod: "Windows Hello Entreprise",
  platformCredential: "Identifiant de plateforme (macOS)",
  platformCredentialAuthenticationMethod: "Identifiant de plateforme (macOS)",
  macOsSecureEnclaveKey: "Clé Secure Enclave (macOS)",
  temporaryAccessPass: "Pass d'accès temporaire",
  temporaryAccessPassAuthenticationMethod: "Pass d'accès temporaire",
  email: "E-mail (réinitialisation)",
  emailAuthenticationMethod: "E-mail (réinitialisation)",
  securityQuestion: "Questions de sécurité",
  appPassword: "Mot de passe d'application",
  push: "Notification Authenticator",
  oath: "Code OATH",
  none: "Aucune",
};

export function authMethodLabel(code: string): string {
  return METHOD_LABELS[code] ?? code;
}

/**
 * Types @odata (repli « methods ») qui constituent un second facteur.
 * Mot de passe et e-mail n'en sont pas ; le pass d'accès temporaire non plus (usage ponctuel).
 */
const MFA_METHOD_TYPES = new Set([
  "microsoftAuthenticatorAuthenticationMethod",
  "phoneAuthenticationMethod",
  "fido2AuthenticationMethod",
  "softwareOathAuthenticationMethod",
  "hardwareOathAuthenticationMethod",
  "windowsHelloForBusinessAuthenticationMethod",
  "platformCredentialAuthenticationMethod",
]);

export function isMfaMethodType(odataType: string): boolean {
  return MFA_METHOD_TYPES.has(odataType.replace("#microsoft.graph.", ""));
}

/**
 * Périmètre du compteur MFA du tableau de bord : comptes utilisateurs actifs au sens de
 * `detectAccountType` (membres activés et licenciés). Exclut invités, boîtes partagées, salles,
 * équipements, comptes de service et comptes désactivés, pour qui l'absence de MFA est normale.
 */
export function isMfaScopeUser(user: M365User | undefined): boolean {
  return !!user && user.accountEnabled && detectAccountType(user) === "user";
}

/** Origine d'un compte : interne au tenant (membre) ou invité (B2B). */
export type MfaOrigin = "internal" | "guest";

export const MFA_ORIGIN_LABELS: Record<MfaOrigin, string> = {
  internal: "Interne",
  guest: "Invité",
};

export function mfaOrigin(row: Pick<MfaUserRow, "userType">): MfaOrigin {
  // Insensible à la casse : la liste des comptes dit « Guest », le rapport d'inscription « guest ».
  return row.userType?.toLowerCase() === "guest" ? "guest" : "internal";
}

/**
 * Différentiel MFA internes / invités, sur les comptes activés uniquement.
 * - Internes : comptes utilisateurs actifs (même périmètre que la carte du tableau de bord).
 * - Invités : tous les invités activés.
 * Les comptes absents de la liste des utilisateurs sont ignorés.
 */
export function summarizeMfaByOrigin(
  rows: MfaUserRow[],
  usersById: Map<string, M365User>
): Record<MfaOrigin, MfaSummary> {
  const internal = rows.filter((r) => mfaOrigin(r) === "internal" && isMfaScopeUser(usersById.get(r.id)));
  const guest = rows.filter((r) => mfaOrigin(r) === "guest" && usersById.get(r.id)?.accountEnabled === true);
  return { internal: summarizeMfa(internal), guest: summarizeMfa(guest) };
}

export interface MfaSummary {
  total: number;
  enabled: number;
  disabled: number;
  /** Pourcentage entier de comptes avec MFA (0 si aucun compte). */
  percent: number;
}

export function summarizeMfa(rows: Pick<MfaUserRow, "mfaRegistered">[]): MfaSummary {
  const enabled = rows.filter((r) => r.mfaRegistered).length;
  const total = rows.length;
  return {
    total,
    enabled,
    disabled: total - enabled,
    percent: total === 0 ? 0 : Math.round((enabled / total) * 100),
  };
}

// ── Comptes administrateurs ─────────────────────────────────────────

export type AdminPrincipalType = "user" | "group" | "servicePrincipal" | "other";
export type AdminAssignmentKind = "active" | "eligible";

export interface AdminAssignment {
  principalId: string;
  principalType: AdminPrincipalType;
  displayName: string;
  userPrincipalName: string | null;
  accountEnabled: boolean | null;
  roleName: string;
  roleTemplateId: string;
  /** Attribution active, ou éligible via PIM (activable à la demande). */
  kind: AdminAssignmentKind;
  /** Nom du groupe attribuable à un rôle par lequel le compte hérite du rôle, sinon null. */
  viaGroup: string | null;
}

export interface AdminReportResponse {
  assignments: AdminAssignment[];
  /** Faux si les attributions éligibles (PIM) n'ont pas pu être lues (licence P2 ou permission). */
  eligibleSupported: boolean;
  generatedAt: string;
}

/** Identifiants de modèle des rôles Entra les plus sensibles (prise de contrôle du tenant). */
export const CRITICAL_ROLE_TEMPLATES: Record<string, string> = {
  "62e90394-69f5-4237-9190-012177145e10": "Administrateur général",
  "e8611ab8-c189-46e8-94e1-60213ab1f814": "Administrateur de rôle privilégié",
  "7be44c8a-adaf-4e2a-84d6-ab2649e08a13": "Administrateur d'authentification privilégié",
  "194ae4cb-b126-40b2-bd5b-6091b380977d": "Administrateur de la sécurité",
  "b1be1c3e-b65d-4f19-8427-f6fa0d97feb9": "Administrateur de l'accès conditionnel",
};

export const GLOBAL_ADMIN_TEMPLATE_ID = "62e90394-69f5-4237-9190-012177145e10";

export function isCriticalRole(roleTemplateId: string): boolean {
  return roleTemplateId.toLowerCase() in CRITICAL_ROLE_TEMPLATES;
}

export interface AdminSummary {
  /** Comptes utilisateurs distincts détenant au moins un rôle (actif ou éligible). */
  users: number;
  /** Comptes utilisateurs distincts administrateurs généraux. */
  globalAdmins: number;
  /** Comptes distincts détenant au moins un rôle critique. */
  criticalUsers: number;
  /** Applications (principaux de service) détenant un rôle. */
  servicePrincipals: number;
  /** Comptes administrateurs désactivés (rôle à retirer). */
  disabledUsers: number;
  /** Ids des comptes utilisateurs administrateurs. */
  userIds: string[];
  /** Ids des administrateurs généraux. */
  globalAdminIds: string[];
  /** Ids des administrateurs dont le compte est désactivé. */
  disabledUserIds: string[];
}

export function summarizeAdmins(assignments: AdminAssignment[]): AdminSummary {
  const users = new Map<string, AdminAssignment[]>();
  const sps = new Set<string>();
  for (const a of assignments) {
    if (a.principalType === "user") {
      const list = users.get(a.principalId) ?? [];
      list.push(a);
      users.set(a.principalId, list);
    } else if (a.principalType === "servicePrincipal") {
      sps.add(a.principalId);
    }
  }
  const globalAdminIds: string[] = [];
  const disabledUserIds: string[] = [];
  let criticalUsers = 0;
  for (const [id, list] of users) {
    if (list.some((a) => a.roleTemplateId.toLowerCase() === GLOBAL_ADMIN_TEMPLATE_ID)) globalAdminIds.push(id);
    if (list.some((a) => isCriticalRole(a.roleTemplateId))) criticalUsers++;
    if (list[0].accountEnabled === false) disabledUserIds.push(id);
  }
  return {
    users: users.size,
    globalAdmins: globalAdminIds.length,
    criticalUsers,
    servicePrincipals: sps.size,
    disabledUsers: disabledUserIds.length,
    userIds: [...users.keys()],
    globalAdminIds,
    disabledUserIds,
  };
}
