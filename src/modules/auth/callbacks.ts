import { env } from "@/shared/config/env";
import { decideSignIn, type GoogleClaims } from "./signin-policy";
import { seedUsers } from "./seed-users";

export interface SignInCallbackParams {
  user: { email?: string | null };
  account?: { provider?: string } | null;
  profile?: unknown;
}

/**
 * The Auth.js `signIn` callback. Returning false stops the sign-in. Runs on the server against
 * the claims of the verified ID token; the `hd` request parameter plays no part.
 */
export async function signInCallback({ user, account, profile }: SignInCallbackParams): Promise<boolean> {
  const current = env();
  const decision = decideSignIn({
    provider: account?.provider,
    profile: profile as GoogleClaims | undefined,
    email: user.email,
    allowedDomains: current.allowedEmailDomains,
    devAuthEnabled: current.devAuth,
    seedEmails: seedUsers().map((u) => u.email),
  });
  if (!decision.allowed) console.warn(`[auth] sign-in refused: ${decision.reason}`);
  return decision.allowed;
}
