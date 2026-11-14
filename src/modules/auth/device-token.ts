import type { AuthUser } from "@/shared/contracts";

/**
 * FOUNDATION STUB (owner: mobile). Reads `Authorization: Bearer <token>`, looks up the
 * SHA-256 of the token in `device_tokens`, updates `lastUsedAt` and returns the user, or
 * null for a missing, unknown or deleted token. Returns null until the mobile stream
 * fills it in; the signature stays.
 */
export async function resolveDeviceToken(req: Request): Promise<AuthUser | null> {
  void req;
  return null;
}
