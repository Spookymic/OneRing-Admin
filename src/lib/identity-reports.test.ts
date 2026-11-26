import { describe, it, expect } from "vitest";
import {
  authMethodLabel,
  isCriticalRole,
  isMfaMethodType,
  isMfaScopeUser,
  summarizeAdmins,
  summarizeMfa,
  summarizeMfaByOrigin,
  mfaOrigin,
  type MfaUserRow,
  GLOBAL_ADMIN_TEMPLATE_ID,
  type AdminAssignment,
} from "./identity-reports";
import type { M365User } from "@/services/graph/users";

function user(p: Partial<M365User>): M365User {
  return {
    id: "u", displayName: "Alice Martin", userPrincipalName: "alice@contoso.fr", mail: "alice@contoso.fr",
    jobTitle: null, department: null, accountEnabled: true, assignedLicenses: [{ skuId: "sku" }],
    userType: "Member", officeLocation: null, mobilePhone: null, businessPhones: [], createdDateTime: null,
    employeeType: null, onPremisesSyncEnabled: null, onPremisesLastSyncDateTime: null,
    ...p,
  };
}

function assignment(p: Partial<AdminAssignment>): AdminAssignment {
  return {
    principalId: "u1", principalType: "user", displayName: "Alice", userPrincipalName: "alice@contoso.fr",
    accountEnabled: true, roleName: "Lecteur général", roleTemplateId: "f2ef992c-3afb-46b9-b7cf-a126ee74c451",
    kind: "active", viaGroup: null,
    ...p,
  };
}

describe("summarizeMfa", () => {
  it("compte actifs, inactifs et pourcentage arrondi", () => {
    expect(summarizeMfa([{ mfaRegistered: true }, { mfaRegistered: true }, { mfaRegistered: false }])).toEqual({
      total: 3, enabled: 2, disabled: 1, percent: 67,
    });
  });
  it("renvoie 0 % sans compte (pas de division par zéro)", () => {
    expect(summarizeMfa([]).percent).toBe(0);
  });
});

describe("isMfaMethodType", () => {
  it("reconnaît les seconds facteurs, préfixe @odata compris", () => {
    expect(isMfaMethodType("#microsoft.graph.microsoftAuthenticatorAuthenticationMethod")).toBe(true);
    expect(isMfaMethodType("fido2AuthenticationMethod")).toBe(true);
  });
  it("exclut mot de passe, e-mail et pass d'accès temporaire", () => {
    expect(isMfaMethodType("passwordAuthenticationMethod")).toBe(false);
    expect(isMfaMethodType("emailAuthenticationMethod")).toBe(false);
    expect(isMfaMethodType("temporaryAccessPassAuthenticationMethod")).toBe(false);
  });
});

describe("authMethodLabel", () => {
  it("traduit les codes connus et conserve les inconnus", () => {
    expect(authMethodLabel("microsoftAuthenticatorPush")).toBe("Authenticator (notification)");
    expect(authMethodLabel("nouvelleMethode")).toBe("nouvelleMethode");
  });
});

describe("isMfaScopeUser", () => {
  it("retient les comptes utilisateurs activés et licenciés", () => {
    expect(isMfaScopeUser(user({}))).toBe(true);
  });
  it("exclut invités, désactivés, comptes sans licence et inconnus", () => {
    expect(isMfaScopeUser(user({ userType: "Guest" }))).toBe(false);
    expect(isMfaScopeUser(user({ accountEnabled: false }))).toBe(false);
    expect(isMfaScopeUser(user({ assignedLicenses: [] }))).toBe(false);
    expect(isMfaScopeUser(undefined)).toBe(false);
  });
});

describe("summarizeAdmins", () => {
  it("dédoublonne les comptes et distingue rôles critiques, admins généraux et applications", () => {
    const s = summarizeAdmins([
      assignment({ principalId: "u1", roleTemplateId: GLOBAL_ADMIN_TEMPLATE_ID, roleName: "Administrateur général" }),
      assignment({ principalId: "u1" }),
      assignment({ principalId: "u2", roleTemplateId: "194AE4CB-B126-40B2-BD5B-6091B380977D", kind: "eligible" }),
      assignment({ principalId: "u3", accountEnabled: false }),
      assignment({ principalId: "u4", viaGroup: "Admins Helpdesk" }),
      assignment({ principalId: "g1", principalType: "group", accountEnabled: null }),
      assignment({ principalId: "sp1", principalType: "servicePrincipal", accountEnabled: null }),
    ]);
    expect(s.users).toBe(4);
    expect(s.globalAdmins).toBe(1);
    expect(s.criticalUsers).toBe(2);
    expect(s.disabledUsers).toBe(1);
    expect(s.servicePrincipals).toBe(1);
    expect(s.userIds.sort()).toEqual(["u1", "u2", "u3", "u4"]);
    expect(s.globalAdminIds).toEqual(["u1"]);
    expect(s.disabledUserIds).toEqual(["u3"]);
  });
});

describe("isCriticalRole", () => {
  it("ignore la casse de l'identifiant de modèle", () => {
    expect(isCriticalRole(GLOBAL_ADMIN_TEMPLATE_ID.toUpperCase())).toBe(true);
    expect(isCriticalRole("f2ef992c-3afb-46b9-b7cf-a126ee74c451")).toBe(false);
  });
});

describe("summarizeMfaByOrigin", () => {
  const row = (id: string, userType: string, mfa: boolean): MfaUserRow => ({
    id, displayName: id, userPrincipalName: `${id}@contoso.fr`, userType, accountEnabled: true,
    mfaRegistered: mfa, mfaCapable: null, passwordlessCapable: null, methods: [], defaultMethod: null, lastUpdated: null,
  });
  const users = new Map<string, M365User>([
    ["i1", user({ id: "i1" })],
    ["i2", user({ id: "i2" })],
    ["shared", user({ id: "shared", assignedLicenses: [] })],
    ["g1", user({ id: "g1", userType: "Guest", assignedLicenses: [] })],
    ["g2", user({ id: "g2", userType: "Guest", assignedLicenses: [] })],
    ["g3", user({ id: "g3", userType: "Guest", accountEnabled: false })],
  ]);

  it("sépare internes (comptes utilisateurs actifs) et invités activés", () => {
    const s = summarizeMfaByOrigin(
      [
        row("i1", "Member", true), row("i2", "Member", false), row("shared", "Member", false),
        row("g1", "Guest", true), row("g2", "Guest", false), row("g3", "Guest", false), row("inconnu", "Guest", true),
      ],
      users
    );
    expect(s.internal).toEqual({ total: 2, enabled: 1, disabled: 1, percent: 50 });
    expect(s.guest).toEqual({ total: 2, enabled: 1, disabled: 1, percent: 50 });
  });

  it("classe l'origine d'après userType", () => {
    expect(mfaOrigin({ userType: "Guest" })).toBe("guest");
    expect(mfaOrigin({ userType: "guest" })).toBe("guest");
    expect(mfaOrigin({ userType: "Member" })).toBe("internal");
    expect(mfaOrigin({ userType: null })).toBe("internal");
  });
});
