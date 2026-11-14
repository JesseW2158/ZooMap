/**
 * Who may sign in. Pure functions, so the rules are unit-testable without Auth.js or a database.
 *
 * Google's `hd` request parameter is only a hint shown on the account picker: anyone can
 * remove it from the URL. The enforcement is here, on the server, from the claims in the
 * verified ID token.
 */

export type SignInDenyReason =
  | "no-email"
  | "email-unverified"
  | "wrong-hd"
  | "wrong-email-domain"
  | "provider-not-allowed"
  | "dev-auth-disabled"
  | "unknown-dev-user";

export type SignInDecision = { allowed: true } | { allowed: false; reason: SignInDenyReason };

const allow: SignInDecision = { allowed: true };
const deny = (reason: SignInDenyReason): SignInDecision => ({ allowed: false, reason });

/** The domain of an address with exactly one "@" and text on both sides, lower-cased; else null. */
export function emailDomain(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return parts[1];
}

export interface GoogleClaims {
  email?: unknown;
  email_verified?: unknown;
  hd?: unknown;
}

/**
 * The Google sign-in rule: a verified email, a hosted-domain (`hd`) claim and an email
 * domain that are each exactly one of `allowedDomains`. Exact match, never suffix: a
 * lookalike such as "umass.edu.evil.com" or "notumass.edu" must fail.
 */
export function checkGoogleClaims(claims: GoogleClaims | null | undefined, allowedDomains: string[]): SignInDecision {
  const allowed = allowedDomains.map((d) => d.trim().toLowerCase());
  const domain = emailDomain(claims?.email);
  if (!domain) return deny("no-email");
  if (claims?.email_verified !== true && claims?.email_verified !== "true") return deny("email-unverified");
  const hd = typeof claims?.hd === "string" ? claims.hd.trim().toLowerCase() : null;
  if (!hd || !allowed.includes(hd)) return deny("wrong-hd");
  if (!allowed.includes(domain)) return deny("wrong-email-domain");
  return allow;
}

export interface SignInInput {
  /** Auth.js provider id: "google", "dev", later "handoff". */
  provider: string | undefined;
  /** OAuth profile (the ID token claims) for Google. */
  profile?: GoogleClaims | null;
  /** The email Auth.js resolved for the user (used by the dev provider). */
  email?: string | null;
  allowedDomains: string[];
  devAuthEnabled: boolean;
  /** Emails of the seed users the dev provider may sign in as. */
  seedEmails: string[];
}

/** Default deny: a provider this function does not know is refused. The mobile stream adds "handoff" here. */
export function decideSignIn(input: SignInInput): SignInDecision {
  switch (input.provider) {
    case "google":
      return checkGoogleClaims(input.profile, input.allowedDomains);
    case "dev": {
      if (!input.devAuthEnabled) return deny("dev-auth-disabled");
      const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
      return input.seedEmails.includes(email) ? allow : deny("unknown-dev-user");
    }
    default:
      return deny("provider-not-allowed");
  }
}
