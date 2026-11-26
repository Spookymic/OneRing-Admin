import { describe, it, expect } from "vitest";
import { daysSince, isRemovalCandidate, isRenewPriority, latest, usageStatus } from "./credential-usage";

const now = new Date("2026-11-26T12:00:00Z").getTime();
const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString();

describe("usageStatus", () => {
  it("utilisé dans les 90 jours, ancien au-delà, jamais si aucune date", () => {
    expect(usageStatus(daysAgo(10), now, true)).toBe("recent");
    expect(usageStatus(daysAgo(90), now, true)).toBe("recent");
    expect(usageStatus(daysAgo(91), now, true)).toBe("stale");
    expect(usageStatus(null, now, true)).toBe("unused");
  });
  it("inconnu si le rapport n'est pas lisible", () => {
    expect(usageStatus(daysAgo(10), now, false)).toBe("unknown");
  });
});

describe("isRenewPriority", () => {
  it("expire sous 30 jours (ou expiré) ET encore utilisé", () => {
    expect(isRenewPriority({ daysLeft: 12, usage: "recent" })).toBe(true);
    expect(isRenewPriority({ daysLeft: -3, usage: "recent" })).toBe(true);
    expect(isRenewPriority({ daysLeft: 45, usage: "recent" })).toBe(false);
    expect(isRenewPriority({ daysLeft: 12, usage: "unused" })).toBe(false);
  });
});

describe("isRemovalCandidate", () => {
  it("ancien ou jamais utilisé, jamais quand le statut est inconnu", () => {
    expect(isRemovalCandidate({ usage: "stale" })).toBe(true);
    expect(isRemovalCandidate({ usage: "unused" })).toBe(true);
    expect(isRemovalCandidate({ usage: "recent" })).toBe(false);
    expect(isRemovalCandidate({ usage: "unknown" })).toBe(false);
  });
});

describe("latest / daysSince", () => {
  it("retient la date la plus récente en ignorant les vides", () => {
    expect(latest(null, "2026-01-01T00:00:00Z", undefined, "2026-03-01T00:00:00Z")).toBe("2026-03-01T00:00:00Z");
    expect(latest(null, undefined)).toBeNull();
  });
  it("compte les jours écoulés", () => {
    expect(daysSince(daysAgo(5), now)).toBe(5);
    expect(daysSince("pas une date", now)).toBeNull();
  });
});
