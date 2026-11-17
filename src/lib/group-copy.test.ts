import { describe, it, expect } from "vitest";
import { getNonCopyableReason, isExchangeManaged } from "@/lib/group-copy";

describe("getNonCopyableReason", () => {
  it("accepte un groupe de sécurité cloud", () => {
    expect(getNonCopyableReason({ groupTypes: [], onPremisesSyncEnabled: null })).toBeNull();
  });

  it("refuse un groupe dynamique", () => {
    expect(getNonCopyableReason({ groupTypes: ["Unified", "DynamicMembership"] })).toMatch(/dynamique/i);
  });

  it("refuse un groupe synchronisé depuis l'AD", () => {
    expect(getNonCopyableReason({ groupTypes: [], onPremisesSyncEnabled: true })).toMatch(/on-premise/i);
  });
});

describe("isExchangeManaged", () => {
  it("liste de distribution → Exchange", () => {
    expect(isExchangeManaged({ mailEnabled: true, groupTypes: [] })).toBe(true);
  });

  it("groupe Microsoft 365 → Graph", () => {
    expect(isExchangeManaged({ mailEnabled: true, groupTypes: ["Unified"] })).toBe(false);
  });

  it("groupe de sécurité pur → Graph", () => {
    expect(isExchangeManaged({ mailEnabled: false, groupTypes: [] })).toBe(false);
  });
});
