import type { AuthUser } from "@/shared/contracts";
import { env } from "@/shared/config/env";
import { ApiError } from "@/shared/http";
import { auth } from "./config";
import { resolveDeviceToken } from "./device-token";
import { emailDomain } from "./signin-policy";

/**
 * The signed-in user from the session cookie only, for server components that have no
 * `Request` (pages, layouts). Null when signed out.
 */
export async function getSessionUser(): Promise<AuthUser | null> {
  const session = await auth();
  const user = session?.user;
  if (user?.id && user.email) {
    // Defence in depth: a session minted before ALLOWED_EMAIL_DOMAINS changed must not outlive it.
    const domain = emailDomain(user.email);
    if (domain && env().allowedEmailDomains.includes(domain)) {
      return { id: user.id, email: user.email, name: user.name, image: user.image, via: "session" };
    }
  }
  return null;
}

/**
 * The caller, from the session cookie or, failing that, a device bearer token from the
 * Android shell. Null when neither is valid.
 */
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  return (await getSessionUser()) ?? resolveDeviceToken(req);
}

/** `getAuthUser`, or throws 401 UNAUTHORIZED. Every route calls this first unless it is public. */
export async function requireUser(req: Request): Promise<AuthUser> {
  const user = await getAuthUser(req);
  if (!user) throw new ApiError("UNAUTHORIZED", "Sign in required");
  return user;
}
