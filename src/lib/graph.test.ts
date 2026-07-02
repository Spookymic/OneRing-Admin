import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw";
import { graphFetch, graphFetchAll, graphBatch } from "@/lib/graph";

describe("graphFetchAll", () => {
  it("suit @odata.nextLink et concatène les pages", async () => {
    server.use(
      http.get("https://graph.microsoft.com/v1.0/things", ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("page") === "2") {
          return HttpResponse.json({ value: [{ id: "c" }] });
        }
        return HttpResponse.json({
          value: [{ id: "a" }, { id: "b" }],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/things?page=2",
        });
      })
    );
    const all = await graphFetchAll<{ id: string }>("token", "/things");
    expect(all.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("graphFetch", () => {
  it("réessaie sur 429 en respectant Retry-After", async () => {
    let n = 0;
    server.use(
      http.get("https://graph.microsoft.com/v1.0/ping", () => {
        n++;
        if (n === 1) {
          return new HttpResponse(JSON.stringify({ error: { message: "throttled" } }), {
            status: 429,
            headers: { "Retry-After": "0" },
          });
        }
        return HttpResponse.json({ ok: true });
      })
    );
    const res = await graphFetch<{ ok: boolean }>("token", "/ping");
    expect(res.ok).toBe(true);
    expect(n).toBe(2);
  });
});

describe("graphBatch", () => {
  it("mappe les réponses par id", async () => {
    server.use(
      http.post("https://graph.microsoft.com/v1.0/$batch", async ({ request }) => {
        const body = (await request.json()) as { requests: { id: string }[] };
        return HttpResponse.json({
          responses: body.requests.map((r) => ({ id: r.id, status: 200, body: { value: [] } })),
        });
      })
    );
    const out = await graphBatch("token", [
      { id: "1", url: "/groups/1/memberOf" },
      { id: "2", url: "/groups/2/memberOf" },
    ]);
    expect(out["1"].status).toBe(200);
    expect(out["2"].status).toBe(200);
  });
});
