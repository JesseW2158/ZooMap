import { describe, expect, it } from "vitest";
import { checkGoogleClaims, decideSignIn, emailDomain } from "./signin-policy";

const ALLOWED = ["umass.edu"];
const good = { email: "student@umass.edu", email_verified: true, hd: "umass.edu" };

describe("checkGoogleClaims", () => {
  it("accepts a verified umass.edu account", () => {
    expect(checkGoogleClaims(good, ALLOWED)).toEqual({ allowed: true });
  });

  it("is case-insensitive about the domain", () => {
    expect(checkGoogleClaims({ ...good, email: "Student@UMass.EDU", hd: "UMASS.edu" }, ALLOWED)).toEqual({ allowed: true });
  });

  it("refuses a wrong hd claim even when the email looks right", () => {
    expect(checkGoogleClaims({ ...good, hd: "example.com" }, ALLOWED)).toEqual({ allowed: false, reason: "wrong-hd" });
  });

  it("refuses a missing hd claim (a personal gmail account has none)", () => {
    const { hd, ...withoutHd } = good;
    void hd;
    expect(checkGoogleClaims(withoutHd, ALLOWED)).toEqual({ allowed: false, reason: "wrong-hd" });
  });

  it("refuses a wrong email domain even when hd is right", () => {
    expect(checkGoogleClaims({ ...good, email: "student@gmail.com" }, ALLOWED)).toEqual({
      allowed: false,
      reason: "wrong-email-domain",
    });
  });

  it("refuses an unverified email", () => {
    expect(checkGoogleClaims({ ...good, email_verified: false }, ALLOWED)).toEqual({
      allowed: false,
      reason: "email-unverified",
    });
    expect(checkGoogleClaims({ email: good.email, hd: good.hd }, ALLOWED)).toEqual({
      allowed: false,
      reason: "email-unverified",
    });
  });

  it("refuses lookalike domains: no suffix or substring matching", () => {
    for (const domain of ["umass.edu.evil.com", "notumass.edu", "evil-umass.edu", "mail.umass.edu"]) {
      const result = checkGoogleClaims({ email: `a@${domain}`, email_verified: true, hd: domain }, ALLOWED);
      expect(result.allowed, domain).toBe(false);
    }
  });

  it("refuses a missing or malformed email", () => {
    for (const email of [undefined, null, 42, "", "no-at-sign", "a@b@umass.edu", "@umass.edu", "a@"]) {
      expect(checkGoogleClaims({ ...good, email }, ALLOWED), String(email)).toEqual({ allowed: false, reason: "no-email" });
    }
    expect(checkGoogleClaims(undefined, ALLOWED)).toEqual({ allowed: false, reason: "no-email" });
  });

  it("supports several allowed domains, each matched exactly", () => {
    const both = ["umass.edu", "amherst.edu"];
    expect(checkGoogleClaims({ email: "a@amherst.edu", email_verified: true, hd: "amherst.edu" }, both).allowed).toBe(true);
    expect(checkGoogleClaims({ email: "a@amherst.edu", email_verified: true, hd: "umass.edu" }, both).allowed).toBe(true);
    expect(checkGoogleClaims({ email: "a@smith.edu", email_verified: true, hd: "umass.edu" }, both).allowed).toBe(false);
  });
});

describe("emailDomain", () => {
  it("returns the lower-cased domain of a well-formed address", () => {
    expect(emailDomain(" A@UMass.edu ")).toBe("umass.edu");
  });
});

describe("decideSignIn", () => {
  const base = { allowedDomains: ALLOWED, devAuthEnabled: false, seedEmails: ["dev.alex@umass.edu"] };

  it("routes google through the claim check", () => {
    expect(decideSignIn({ ...base, provider: "google", profile: good }).allowed).toBe(true);
    expect(decideSignIn({ ...base, provider: "google", profile: { ...good, hd: "x.com" } }).allowed).toBe(false);
  });

  it("refuses the dev provider unless DEV_AUTH is on, and then only for seed users", () => {
    const input = { ...base, provider: "dev", email: "dev.alex@umass.edu" };
    expect(decideSignIn(input)).toEqual({ allowed: false, reason: "dev-auth-disabled" });
    expect(decideSignIn({ ...input, devAuthEnabled: true })).toEqual({ allowed: true });
    expect(decideSignIn({ ...input, devAuthEnabled: true, email: "someone@umass.edu" })).toEqual({
      allowed: false,
      reason: "unknown-dev-user",
    });
  });

  it("lets a handoff sign-in through only for an allowed email domain", () => {
    expect(decideSignIn({ ...base, provider: "handoff", email: "Student@umass.edu" })).toEqual({ allowed: true });
    expect(decideSignIn({ ...base, provider: "handoff", email: "student@gmail.com" })).toEqual({
      allowed: false,
      reason: "wrong-email-domain",
    });
    expect(decideSignIn({ ...base, provider: "handoff", email: "student@umass.edu.evil.com" }).allowed).toBe(false);
    expect(decideSignIn({ ...base, provider: "handoff", email: null })).toEqual({ allowed: false, reason: "no-email" });
  });

  it("refuses providers it does not know", () => {
    expect(decideSignIn({ ...base, provider: "github", profile: good })).toEqual({
      allowed: false,
      reason: "provider-not-allowed",
    });
    expect(decideSignIn({ ...base, provider: undefined })).toEqual({ allowed: false, reason: "provider-not-allowed" });
  });
});
