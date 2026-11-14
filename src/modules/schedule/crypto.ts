import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ApiError } from "@/shared/http";

/**
 * AES-256-GCM for calendar secrets (feed URLs, refresh tokens, hand-entered classes).
 * Stored as "v1.<iv>.<tag>.<ciphertext>", each part base64url. The key is ENCRYPTION_KEY:
 * 32 bytes, base64.
 */

export function encryptionKey(raw = process.env.ENCRYPTION_KEY): Buffer {
  if (!raw || !raw.trim()) throw new ApiError("NOT_CONFIGURED", "ENCRYPTION_KEY is not set, so calendars cannot be saved");
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) throw new ApiError("NOT_CONFIGURED", "ENCRYPTION_KEY must be 32 bytes, base64");
  return key;
}

export function encryptSecret(plain: string, key: Buffer = encryptionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(enc: string, key: Buffer = encryptionKey()): string {
  const [version, iv, tag, ct] = enc.split(".");
  if (version !== "v1" || !iv || !tag || ct === undefined) throw new Error("Unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
