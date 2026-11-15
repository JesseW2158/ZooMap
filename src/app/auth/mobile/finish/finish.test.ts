import { beforeEach, describe, expect, it, vi } from "vitest";

const signIn = vi.fn<(...args: unknown[]) => Promise<string>>(async () => "/");
vi.mock("@/modules/auth", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));

import { GET } from "./route";

const VERIFIER = "v".repeat(43);
const call = (headers: Record<string, string>) =>
  GET(new Request(`http://localhost:3000/auth/mobile/finish?code=${"c".repeat(43)}&verifier=${VERIFIER}`, { headers }));

beforeEach(() => {
  signIn.mockClear();
  signIn.mockResolvedValue("/");
});

describe("GET /auth/mobile/finish", () => {
  it("signs in and goes to / when the navigation came from a page on this site", async () => {
    const res = await call({ "Sec-Fetch-Site": "same-origin" });
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("refuses anything but same-origin, without touching the code", async () => {
    const refused: Record<string, string>[] = [{}, { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Site": "same-site" }, { "Sec-Fetch-Site": "none" }, { "Sec-Fetch-Site": "Same-Origin " }];
    for (const headers of refused) {
      const res = await call(headers);
      expect(res.status, JSON.stringify(headers)).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost:3000/signin?error=Handoff");
    }
    expect(signIn).not.toHaveBeenCalled();
  });

  it("goes to /signin?error=Handoff when Auth.js reports an error", async () => {
    signIn.mockResolvedValue("/signin?error=CredentialsSignin&code=credentials");
    const res = await call({ "Sec-Fetch-Site": "same-origin" });
    expect(res.headers.get("location")).toBe("http://localhost:3000/signin?error=Handoff");
  });

  it("goes to /signin?error=Handoff when the code or verifier is missing", async () => {
    const res = await GET(new Request("http://localhost:3000/auth/mobile/finish?code=x", { headers: { "Sec-Fetch-Site": "same-origin" } }));
    expect(res.headers.get("location")).toBe("http://localhost:3000/signin?error=Handoff");
    expect(signIn).not.toHaveBeenCalled();
  });
});
