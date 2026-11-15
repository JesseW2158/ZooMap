import { describe, expect, it } from "vitest";
import { CAMPUS_CACHE_CONTROL, cachedJson, etagMatches } from "./cache";

const req = (headers: Record<string, string> = {}) => new Request("http://localhost/api/campus/x", { headers });

describe("cachedJson", () => {
  it("sends private Cache-Control, an ETag and the JSON body", async () => {
    const data = { type: "FeatureCollection", features: [] };
    const res = cachedJson(req(), data);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(CAMPUS_CACHE_CONTROL);
    expect(res.headers.get("Cache-Control")).toContain("private");
    expect(res.headers.get("ETag")).toMatch(/^"[\w-]+"$/);
    expect(await res.json()).toEqual(data);
  });

  it("answers 304 with no body when If-None-Match matches", async () => {
    const data = { a: 1 };
    const etag = cachedJson(req(), data).headers.get("ETag")!;
    const res = cachedJson(req({ "if-none-match": etag }), data);
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
    expect(res.headers.get("ETag")).toBe(etag);
  });

  it("sends the full body when the validator is stale", () => {
    expect(cachedJson(req({ "if-none-match": '"old"' }), { a: 2 }).status).toBe(200);
  });

  it("matches weak validators, lists and *", () => {
    expect(etagMatches('W/"x"', '"x"')).toBe(true);
    expect(etagMatches('"a", "x"', '"x"')).toBe(true);
    expect(etagMatches("*", '"x"')).toBe(true);
    expect(etagMatches(null, '"x"')).toBe(false);
  });
});
