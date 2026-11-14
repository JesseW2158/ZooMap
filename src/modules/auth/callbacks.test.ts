import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signInCallback } from "./callbacks";

const googleAccount = { provider: "google" };
const claims = { email: "student@umass.edu", email_verified: true, hd: "umass.edu" };

describe("signInCallback (Google)", () => {
  beforeEach(() => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "umass.edu");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("lets a verified umass.edu account in", async () => {
    expect(await signInCallback({ user: { email: claims.email }, account: googleAccount, profile: claims })).toBe(true);
  });

  it("refuses a token with the wrong hd", async () => {
    const profile = { ...claims, hd: "example.com" };
    expect(await signInCallback({ user: { email: claims.email }, account: googleAccount, profile })).toBe(false);
  });

  it("refuses a token with the right hd but a wrong email domain", async () => {
    const profile = { ...claims, email: "student@gmail.com" };
    expect(await signInCallback({ user: { email: profile.email }, account: googleAccount, profile })).toBe(false);
  });

  it("refuses an unverified email", async () => {
    const profile = { ...claims, email_verified: false };
    expect(await signInCallback({ user: { email: claims.email }, account: googleAccount, profile })).toBe(false);
  });

  it("refuses a provider it does not know", async () => {
    expect(await signInCallback({ user: { email: claims.email }, account: { provider: "github" }, profile: claims })).toBe(false);
  });

  it("honours ALLOWED_EMAIL_DOMAINS from the environment", async () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "amherst.edu");
    expect(await signInCallback({ user: { email: claims.email }, account: googleAccount, profile: claims })).toBe(false);
  });
});

describe("signInCallback (dev provider)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is refused when DEV_AUTH is unset", async () => {
    vi.stubEnv("DEV_AUTH", "");
    expect(await signInCallback({ user: { email: "dev.alex@umass.edu" }, account: { provider: "dev" } })).toBe(false);
  });

  it("is refused in production even with DEV_AUTH=1", async () => {
    vi.stubEnv("DEV_AUTH", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(await signInCallback({ user: { email: "dev.alex@umass.edu" }, account: { provider: "dev" } })).toBe(false);
  });

  it("lets a seed user in with DEV_AUTH=1 outside production, and nobody else", async () => {
    vi.stubEnv("DEV_AUTH", "1");
    vi.stubEnv("NODE_ENV", "development");
    expect(await signInCallback({ user: { email: "dev.alex@umass.edu" }, account: { provider: "dev" } })).toBe(true);
    expect(await signInCallback({ user: { email: "someone@umass.edu" }, account: { provider: "dev" } })).toBe(false);
  });
});
