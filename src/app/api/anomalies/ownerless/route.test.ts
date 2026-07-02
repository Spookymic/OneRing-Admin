import { describe, it, expect, vi } from "vitest";

// La session est mockée (pas de vrai SSO en test)
vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ accessToken: "tok", user: { email: "admin@contoso.com" } }),
}));

import { http, HttpResponse } from "msw";
import { server } from "@/test/msw";
import { GET } from "@/app/api/anomalies/ownerless/route";

describe("GET /api/anomalies/ownerless", () => {
  it("retourne les groupes M365/Sécurité sans propriétaire", async () => {
    server.use(
      http.get("https://graph.microsoft.com/v1.0/groups", () =>
        HttpResponse.json({
          value: [
            {
              id: "g1",
              displayName: "M365 Sans Owner",
              groupTypes: ["Unified"],
              mailEnabled: true,
              securityEnabled: false,
              mail: null,
              description: null,
              membershipRule: null,
            },
          ],
        })
      ),
      http.get("https://graph.microsoft.com/v1.0/groups/g1/owners", () =>
        HttpResponse.json({ value: [] })
      )
    );

    const res = await GET();
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].displayName).toBe("M365 Sans Owner");
  });
});
