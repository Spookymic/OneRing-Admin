import { describe, expect, it } from "vitest";
import {
  appActivityStatus, formatValidity, isDormant, isLongLived, maxRisk, permissionRisk,
  publisherKind, redirectUriIssues, validityDays,
} from "./app-security";

const NOW = new Date("2026-11-26T12:00:00Z").getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const TENANT = "11111111-2222-3333-4444-555555555555";

describe("permissionRisk", () => {
  it("classe les permissions d'élévation en critique, quelle que soit la casse", () => {
    expect(permissionRisk("RoleManagement.ReadWrite.Directory")).toBe("critical");
    expect(permissionRisk("application.readwrite.all")).toBe("critical");
    expect(permissionRisk("full_access_as_app")).toBe("critical");
  });
  it("classe l'accès massif aux données en élevé et le reste en standard", () => {
    expect(permissionRisk("Mail.ReadWrite")).toBe("high");
    expect(permissionRisk("Files.Read.All")).toBe("high");
    expect(permissionRisk("User.Read")).toBe("normal");
    expect(permissionRisk("openid")).toBe("normal");
  });
  it("retient le risque maximal", () => {
    expect(maxRisk(["normal", "high", "normal"])).toBe("high");
    expect(maxRisk([])).toBe("normal");
  });
});

describe("validité des identifiants", () => {
  it("calcule la durée et détecte les durées excessives selon le type", () => {
    const d = validityDays("2025-01-01T00:00:00Z", "2027-01-01T00:00:00Z");
    expect(d).toBe(730);
    expect(isLongLived("secret", d)).toBe(true);
    expect(isLongLived("certificate", d)).toBe(false);
    expect(isLongLived("secret", 180)).toBe(false);
    expect(isLongLived("secret", null)).toBe(false);
    expect(validityDays(null, "2027-01-01")).toBeNull();
  });
  it("formate la durée", () => {
    expect(formatValidity(730)).toBe("2 ans");
    expect(formatValidity(365)).toBe("1 an");
    expect(formatValidity(548)).toBe("18 mois");
    expect(formatValidity(29000)).toBe("illimitée (10 ans +)");
  });
});

describe("redirectUriIssues", () => {
  it("ignore localhost et les schémas natifs", () => {
    expect(redirectUriIssues("http://localhost:3000/callback")).toEqual([]);
    expect(redirectUriIssues("msal1234://auth")).toEqual([]);
    expect(redirectUriIssues("https://app.contoso.com/auth")).toEqual([]);
  });
  it("signale HTTP, joker, tunnel et hébergement mutualisé", () => {
    expect(redirectUriIssues("http://app.contoso.com/auth")).toEqual(["insecure-http"]);
    expect(redirectUriIssues("https://*.contoso.com/auth")).toEqual(["wildcard"]);
    expect(redirectUriIssues("https://abcd.ngrok-free.app/cb")).toEqual(["tunnel"]);
    expect(redirectUriIssues("https://monapp.azurewebsites.net/.auth")).toEqual(["shared-host"]);
  });
});

describe("appActivityStatus", () => {
  const act = (d: number | null) => ({ lastSignIn: d == null ? null : daysAgo(d), lastDelegated: null, lastAppOnly: null });
  it("distingue active, dormante, jamais utilisée et récente", () => {
    expect(appActivityStatus(act(10), daysAgo(400), NOW, true)).toBe("active");
    expect(appActivityStatus(act(200), daysAgo(400), NOW, true)).toBe("dormant");
    expect(appActivityStatus(act(null), daysAgo(400), NOW, true)).toBe("never");
    expect(appActivityStatus(act(null), daysAgo(20), NOW, true)).toBe("new");
    expect(appActivityStatus(act(10), daysAgo(400), NOW, false)).toBe("unknown");
    expect(isDormant("never")).toBe(true);
    expect(isDormant("new")).toBe(false);
  });
});

describe("publisherKind", () => {
  it("identifie l'origine du principal de service", () => {
    expect(publisherKind({ appOwnerOrganizationId: TENANT }, TENANT)).toBe("internal");
    expect(publisherKind({ appOwnerOrganizationId: "f8cdef31-a31e-4b4a-93e4-5f571e91255a" }, TENANT)).toBe("microsoft");
    expect(publisherKind({ appOwnerOrganizationId: "99999999-0000-0000-0000-000000000000" }, TENANT)).toBe("third-party");
    expect(publisherKind({ servicePrincipalType: "ManagedIdentity" }, TENANT)).toBe("managed-identity");
    expect(publisherKind({}, TENANT)).toBe("unknown");
  });
});
