import { createHash } from "node:crypto";
import type { AuthUser } from "@/shared/contracts";
import { env } from "@/shared/config/env";
import { getCollections } from "@/shared/db";
import { emailDomain } from "./signin-policy";

/** SHA-256 hex, the same as the mobile module stores when it issues the token. */
function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** The token from `Authorization: Bearer <token>` (scheme is case-insensitive), or null. */
function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^\s*bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : null;
}

/** A token idle for this long is deleted on its next use. The app asks for a new one after the 401. */
export const DEVICE_TOKEN_IDLE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Reads `Authorization: Bearer <token>`, looks up the SHA-256 of the token in `device_tokens`,
 * updates `lastUsedAt` and returns the user, or null for a missing, malformed, unknown, deleted
 * or idle (30 days) token. Never throws on a bad header.
 */
export async function resolveDeviceToken(req: Request): Promise<AuthUser | null> {
  const token = bearerToken(req);
  if (!token) return null;

  const { device_tokens, users } = await getCollections();
  const tokenHash = hashToken(token);
  const now = new Date();
  const cutoff = new Date(now.getTime() - DEVICE_TOKEN_IDLE_MS);
  // Live = used (or, never used, issued) within the window. The check is part of the update, so an
  // idle token is never refreshed on its way to being refused.
  const live = { $or: [{ lastUsedAt: { $gte: cutoff } }, { lastUsedAt: { $exists: false }, createdAt: { $gte: cutoff } }] };
  const row = await device_tokens.findOneAndUpdate({ tokenHash, ...live }, { $set: { lastUsedAt: now } }, { returnDocument: "after" });
  if (!row) {
    await device_tokens.deleteOne({ tokenHash, $nor: [live] }); // idle: gone. Unknown: nothing to delete.
    return null;
  }

  const user = await users.findOne({ _id: row.userId });
  if (!user) return null;
  // Same rule as `getSessionUser`: a token must not outlive a change to ALLOWED_EMAIL_DOMAINS.
  const domain = emailDomain(user.email);
  if (!domain || !env().allowedEmailDomains.includes(domain)) return null;
  return { id: user._id, email: user.email, name: user.name, image: user.image, via: "device" };
}
