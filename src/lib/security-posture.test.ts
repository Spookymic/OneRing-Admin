import { describe, it, expect } from "vitest";
import {
  caPolicyRequiresMfa,
  caPolicyTargetsGlobalAdmins,
  isSyncStale,
  summarizeConditionalAccess,
  summarizeGuestMfaTrust,
  syncAgeHours,
  type CaPolicyLite,
} from "./security-posture";

const GA = "62e90394-69f5-4237-9190-012177145e10";

const policy = (p: Partial<CaPolicyLite> & { users?: string[]; roles?: string[]; controls?: string[] }): CaPolicyLite => ({
  state: p.state ?? "enabled",
  conditions: { users: { includeUsers: p.users ?? [], includeRoles: p.roles ?? [] } },
  grantControls: p.grantControls ?? { builtInControls: p.controls ?? ["mfa"] },
});

describe("caPolicyRequiresMfa", () => {
  it("détecte le contrôle mfa et la force d'authentification", () => {
    expect(caPolicyRequiresMfa(policy({ controls: ["mfa"] }))).toBe(true);
    expect(caPolicyRequiresMfa(policy({ grantControls: { builtInControls: [], authenticationStrength: { id: "x" } } }))).toBe(true);
    expect(caPolicyRequiresMfa(policy({ controls: ["compliantDevice"] }))).toBe(false);
    expect(caPolicyRequiresMfa({ grantControls: null })).toBe(false);
  });
});

describe("caPolicyTargetsGlobalAdmins", () => {
  it("couvre les admins via « Tous les utilisateurs » ou le rôle explicite (casse ignorée)", () => {
    expect(caPolicyTargetsGlobalAdmins(policy({ users: ["All"] }))).toBe(true);
    expect(caPolicyTargetsGlobalAdmins(policy({ roles: [GA.toUpperCase()] }))).toBe(true);
    expect(caPolicyTargetsGlobalAdmins(policy({ roles: ["194ae4cb-b126-40b2-bd5b-6091b380977d"] }))).toBe(false);
  });
});

describe("summarizeConditionalAccess", () => {
  it("ne retient que les stratégies actives pour le MFA", () => {
    const s = summarizeConditionalAccess(
      [
        policy({ users: ["All"], state: "enabledForReportingButNotEnforced" }),
        policy({ roles: [GA] }),
        policy({ users: ["All"], state: "disabled" }),
      ],
      false
    );
    expect(s).toMatchObject({ enabled: 1, reportOnly: 1, disabled: 1, mfaGlobalAdmins: true, mfaAllUsers: false });
  });
  it("les paramètres de sécurité par défaut imposent le MFA à tous", () => {
    expect(summarizeConditionalAccess([], true)).toMatchObject({ mfaAllUsers: true, mfaGlobalAdmins: true });
  });
});

describe("summarizeGuestMfaTrust", () => {
  it("un partenaire sans réglage propre hérite du défaut", () => {
    const s = summarizeGuestMfaTrust(true, [
      { inboundTrust: null },
      { inboundTrust: { isMfaAccepted: false } },
      { inboundTrust: { isMfaAccepted: true } },
    ]);
    expect(s).toEqual({ supported: true, defaultAccepted: true, partnersTotal: 3, partnersAccepting: 2 });
  });
});

describe("synchronisation AD", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  it("calcule l'âge en heures", () => {
    expect(syncAgeHours("2026-11-26T10:30:00Z", now)).toBe(1.5);
    expect(syncAgeHours(null, now)).toBeNull();
  });
  it("signale une synchronisation bloquée au-delà de 3 h, ou jamais faite", () => {
    expect(isSyncStale({ supported: true, enabled: true, lastSync: "2026-11-26T11:40:00Z" }, now)).toBe(false);
    expect(isSyncStale({ supported: true, enabled: true, lastSync: "2026-11-26T07:00:00Z" }, now)).toBe(true);
    expect(isSyncStale({ supported: true, enabled: true, lastSync: null }, now)).toBe(true);
  });
  it("n'alerte pas pour un annuaire 100 % cloud", () => {
    expect(isSyncStale({ supported: true, enabled: false, lastSync: null }, now)).toBe(false);
  });
});
