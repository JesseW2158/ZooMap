import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getCollections } from "@/shared/db";

/**
 * The sign-in handoff between the system browser and the Android shell's WebView.
 *
 * The app makes a random `verifier`, opens `/auth/mobile/start?challenge=<C>` with
 * C = base64url(SHA-256(verifier)), and later loads `/auth/mobile/finish?code=&verifier=`.
 * The one-time code travels through the `zoomap://` link, which any installed app could
 * register for; the verifier never leaves the app, so a stolen code alone signs nobody in.
 */

export const HANDOFF_TTL_MS = 60_000;

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest();

/** base64url(SHA-256(value)), no padding: the challenge for a verifier, and the stored code id. */
export function challengeFor(value: string): string {
  return sha256(value).toString("base64url");
}

/** A SHA-256 challenge: 32 bytes as unpadded base64url is exactly 43 characters. */
export function isValidChallenge(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** RFC 7636 verifier: 43 to 128 unreserved characters. */
export function isValidVerifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

/** A code, as the app receives it: 32 random bytes, base64url. */
function isWellFormedCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * Creates a one-time code for `userId`, good for 60 seconds. Returns the code; only its
 * SHA-256 is stored, together with the challenge it is bound to.
 */
export async function createHandoffCode(userId: string, challenge: string, now: Date = new Date()): Promise<string> {
  if (!isValidChallenge(challenge)) throw new Error("createHandoffCode: invalid challenge");
  const code = randomBytes(32).toString("base64url");
  const { handoff_codes } = await getCollections();
  await handoff_codes.insertOne({
    _id: challengeFor(code),
    userId,
    challenge,
    expiresAt: new Date(now.getTime() + HANDOFF_TTL_MS),
  });
  return code;
}

export interface HandoffUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Spends a code. The row is deleted as it is read (atomically), so a code works once, even when
 * the verifier is wrong or the user has gone. Returns the user when the code is live and
 * SHA-256(verifier) equals the stored challenge, else null. Never creates a user.
 */
export async function consumeHandoffCode(code: unknown, verifier: unknown, now: Date = new Date()): Promise<HandoffUser | null> {
  if (!isWellFormedCode(code) || !isValidVerifier(verifier)) return null;

  const { handoff_codes, users } = await getCollections();
  const row = await handoff_codes.findOneAndDelete({ _id: challengeFor(code), expiresAt: { $gt: now } });
  if (!row) return null;

  const expected = Buffer.from(row.challenge, "utf8");
  const actual = Buffer.from(challengeFor(verifier), "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  const user = await users.findOne({ _id: row.userId });
  if (!user) return null;
  return { id: user._id, email: user.email, name: user.name };
}
