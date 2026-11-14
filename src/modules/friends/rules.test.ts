import { describe, expect, it } from "vitest";
import {
  formatCode,
  friendshipId,
  hashCode,
  newFriendCode,
  normalizeCode,
  normalizeEmail,
  normalizePhone,
  normalizeSocial,
  socialLink,
} from "./rules";

describe("friend codes", () => {
  it("are 20 unambiguous characters and differ every time", () => {
    const codes = new Set(Array.from({ length: 200 }, newFriendCode));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{20}$/);
  });

  it("hash the same whatever the case, spaces or dashes", () => {
    const code = newFriendCode();
    expect(hashCode(formatCode(code).toLowerCase())).toBe(hashCode(code));
    expect(hashCode(` ${code.slice(0, 4)} ${code.slice(4)} `)).toBe(hashCode(code));
    expect(normalizeCode(formatCode(code))).toBe(code);
    expect(formatCode(code)).toMatch(/^(\w{4}-){4}\w{4}$/);
  });

  it("one friendship id per pair, whichever order", () => {
    expect(friendshipId("b", "a")).toEqual(friendshipId("a", "b"));
    expect(friendshipId("a", "b")).toEqual({ id: "a:b", userIds: ["a", "b"] });
  });
});

describe("contact fields", () => {
  it("normalises phone numbers to E.164", () => {
    expect(normalizePhone("(413) 555-0100")).toBe("+14135550100");
    expect(normalizePhone("1 413 555 0100")).toBe("+14135550100");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(() => normalizePhone("555")).toThrow();
    expect(() => normalizePhone("call me")).toThrow();
  });

  it("validates emails", () => {
    expect(normalizeEmail(" Me@Example.COM ")).toBe("me@example.com");
    expect(() => normalizeEmail("not an email")).toThrow();
  });
});

describe("social links", () => {
  it("accepts a handle, an @handle or a pasted profile link, and builds an https URL", () => {
    expect(normalizeSocial({ kind: "instagram", handle: "@umass" })).toEqual({ kind: "instagram", handle: "umass" });
    expect(normalizeSocial({ kind: "instagram", handle: "https://www.instagram.com/umass/" }).handle).toBe("umass");
    expect(normalizeSocial({ kind: "linkedin", handle: "https://www.linkedin.com/in/jane-doe" }).handle).toBe("jane-doe");
    expect(socialLink({ kind: "x", handle: "umass" }).url).toBe("https://x.com/umass");
    expect(socialLink({ kind: "tiktok", handle: "umass" }).url).toBe("https://www.tiktok.com/@umass");
    expect(socialLink({ kind: "discord", handle: "zoomap" }).url).toBeNull();
  });

  it("never produces a non-https link and rejects script or junk", () => {
    expect(() => normalizeSocial({ kind: "website", handle: "javascript:alert(1)" })).toThrow();
    expect(() => normalizeSocial({ kind: "website", handle: "http://example.com" })).toThrow();
    expect(() => normalizeSocial({ kind: "website", handle: "https://user:pw@example.com" })).toThrow();
    expect(() => normalizeSocial({ kind: "instagram", handle: "javascript:alert(1)" })).toThrow();
    expect(() => normalizeSocial({ kind: "github", handle: "../../evil" })).toThrow();
    expect(() => normalizeSocial({ kind: "x", handle: "a b" })).toThrow();
    expect(normalizeSocial({ kind: "website", handle: "https://umass.edu/" }).handle).toBe("https://umass.edu/");
    // a bad handle that somehow got stored still never becomes a link
    expect(socialLink({ kind: "instagram", handle: "javascript:x" }).url).toBeNull();
    expect(socialLink({ kind: "website", handle: "javascript:x" }).url).toBeNull();
  });
});
