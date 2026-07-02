import { describe, it, expect } from "vitest";
import { detectAccountType } from "@/lib/account-types";
import type { M365User } from "@/services/graph/users";

const base: M365User = {
  id: "1",
  displayName: "Test",
  userPrincipalName: "test@contoso.com",
  mail: null,
  jobTitle: null,
  department: null,
  accountEnabled: true,
  assignedLicenses: [],
  userType: null,
  officeLocation: null,
  mobilePhone: null,
  businessPhones: [],
  createdDateTime: null,
  employeeType: null,
  onPremisesSyncEnabled: null,
  onPremisesLastSyncDateTime: null,
};

describe("detectAccountType", () => {
  it("invité", () => {
    expect(detectAccountType({ ...base, userType: "Guest" })).toBe("guest");
  });
  it("utilisateur actif licencié", () => {
    expect(detectAccountType({ ...base, assignedLicenses: [{ skuId: "s" }] })).toBe("user");
  });
  it("désactivé avec licence", () => {
    expect(detectAccountType({ ...base, accountEnabled: false, assignedLicenses: [{ skuId: "s" }] })).toBe("disabled");
  });
  it("boîte partagée (member sans licence, avec mail)", () => {
    expect(detectAccountType({ ...base, mail: "shared@contoso.com" })).toBe("shared");
  });
  it("compte service (sans licence, sans mail)", () => {
    expect(detectAccountType(base)).toBe("service");
  });
  it("salle par mot-clé", () => {
    expect(detectAccountType({ ...base, displayName: "Salle Réunion 1" })).toBe("room");
  });
});
