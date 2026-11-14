import { describe, expect, it, vi } from "vitest";
import {
  base64Url,
  challengeFor,
  consumeReturnUrl,
  finishPath,
  generateVerifier,
  parseReturnUrl,
  startHandoff,
  startUrl,
  type HandoffDeps,
} from "./handoff";
import { PREF_KEYS, memoryPrefs } from "./prefs";

function fakeDeps(initial: Record<string, string> = {}) {
  const store = memoryPrefs(initial);
  const calls = { opened: [] as string[], closed: 0, navigated: [] as string[] };
  const deps: HandoffDeps = {
    store,
    openBrowser: async (url) => void calls.opened.push(url),
    closeBrowser: async () => void (calls.closed += 1),
    navigate: (path) => void calls.navigated.push(path),
    origin: () => "https://zoomap.example",
    randomBytes: (n) => Uint8Array.from({ length: n }, (_, i) => i),
  };
  return { deps, store, calls };
}

describe("PKCE challenge", () => {
  it("matches the RFC 7636 appendix B vector", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(await challengeFor(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("makes a challenge of exactly 43 characters, and a verifier the server accepts", async () => {
    const verifier = generateVerifier((n) => Uint8Array.from({ length: n }, (_, i) => i * 8));
    expect(verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    expect(await challengeFor(verifier)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("encodes base64url without padding", () => {
    expect(base64Url(Uint8Array.from([0xfb, 0xff, 0xfe]))).toBe("-__-");
    expect(base64Url(Uint8Array.from([1]))).toBe("AQ");
  });

  it("makes a 43-character verifier from 32 bytes", () => {
    const verifier = generateVerifier((n) => new Uint8Array(n).fill(7));
    expect(verifier).toHaveLength(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("parseReturnUrl", () => {
  it("reads the code", () => {
    expect(parseReturnUrl("zoomap://auth?code=abc123")).toEqual({ code: "abc123" });
    expect(parseReturnUrl("zoomap://auth/?code=a-b_c&x=1")).toEqual({ code: "a-b_c" });
  });

  it("ignores anything else", () => {
    expect(parseReturnUrl("zoomap://auth")).toBeNull();
    expect(parseReturnUrl("zoomap://auth?code=")).toBeNull();
    expect(parseReturnUrl("zoomap://other?code=abc")).toBeNull();
    expect(parseReturnUrl("https://zoomap.example/auth?code=abc")).toBeNull();
    expect(parseReturnUrl("not a url")).toBeNull();
  });
});

describe("urls", () => {
  it("builds the start and finish urls", () => {
    expect(startUrl("https://x.test", "abc-_")).toBe("https://x.test/auth/mobile/start?challenge=abc-_");
    expect(finishPath("c o", "v&1")).toBe("/auth/mobile/finish?code=c%20o&verifier=v%261");
  });
});

describe("startHandoff", () => {
  it("stores the verifier before it opens the tab, and sends only the challenge", async () => {
    const { deps, store, calls } = fakeDeps();
    const open = deps.openBrowser;
    deps.openBrowser = async (url) => {
      // the verifier must already be persisted when the tab opens
      expect(await store.get(PREF_KEYS.handoffVerifier)).not.toBeNull();
      return open(url);
    };
    await startHandoff(deps);
    const verifier = (await store.get(PREF_KEYS.handoffVerifier))!;
    expect(calls.opened).toEqual([startUrl("https://zoomap.example", await challengeFor(verifier))]);
    expect(calls.opened[0]).not.toContain(verifier);
  });
});

describe("consumeReturnUrl", () => {
  it("closes the tab, loads /finish with the stored verifier, and deletes it", async () => {
    const { deps, store, calls } = fakeDeps({ [PREF_KEYS.handoffVerifier]: "VERIFIER" });
    expect(await consumeReturnUrl("zoomap://auth?code=CODE", deps)).toBe("finished");
    expect(calls.closed).toBe(1);
    expect(calls.navigated).toEqual([finishPath("CODE", "VERIFIER")]);
    expect(await store.get(PREF_KEYS.handoffVerifier)).toBeNull();
  });

  it("does not replay a finished code (getLaunchUrl keeps returning it)", async () => {
    const { deps, calls } = fakeDeps({ [PREF_KEYS.handoffVerifier]: "VERIFIER" });
    await consumeReturnUrl("zoomap://auth?code=CODE", deps);
    expect(await consumeReturnUrl("zoomap://auth?code=CODE", deps)).toBe("ignored");
    expect(calls.navigated).toHaveLength(1);
  });

  it("goes back to sign-in when the verifier is gone", async () => {
    const { deps, calls } = fakeDeps();
    expect(await consumeReturnUrl("zoomap://auth?code=CODE", deps)).toBe("failed");
    expect(calls.navigated).toEqual(["/signin?error=handoff"]);
  });

  it("ignores other links without touching the tab", async () => {
    const { deps, calls } = fakeDeps({ [PREF_KEYS.handoffVerifier]: "VERIFIER" });
    expect(await consumeReturnUrl("https://zoomap.example/", deps)).toBe("ignored");
    expect(calls.closed).toBe(0);
    expect(calls.navigated).toEqual([]);
  });

  it("still finishes when closing the tab throws", async () => {
    const { deps, calls } = fakeDeps({ [PREF_KEYS.handoffVerifier]: "VERIFIER" });
    deps.closeBrowser = vi.fn().mockRejectedValue(new Error("no tab"));
    expect(await consumeReturnUrl("zoomap://auth?code=CODE", deps)).toBe("finished");
    expect(calls.navigated).toHaveLength(1);
  });
});
