import { createHmac } from "node:crypto";
import { createKeyPairSignerFromBytes, createKeyPairSignerFromPrivateKeyBytes, getBase58Encoder, type KeyPairSigner } from "@solana/kit";

/** Bytes from base58 or a JSON array like the Solana CLI's keypair file. */
export function decodeSecret(secret: string): Uint8Array {
  const s = secret.trim();
  if (s.startsWith("[")) return Uint8Array.from(JSON.parse(s) as number[]);
  return Uint8Array.from(getBase58Encoder().encode(s));
}

/** The mint authority, which also pays every fee. */
export async function signerFromSecret(secret: string): Promise<KeyPairSigner> {
  const bytes = decodeSecret(secret);
  if (bytes.length === 64) return createKeyPairSignerFromBytes(bytes);
  if (bytes.length === 32) return createKeyPairSignerFromPrivateKeyBytes(bytes);
  throw new Error(`CHAIN_AUTHORITY_SECRET must be a 32- or 64-byte key (got ${bytes.length} bytes)`);
}

/**
 * The 32-byte private key for a user's custodial address: HMAC-SHA256(master seed, user id).
 * Deterministic, so no per-user key is ever stored; anyone holding the master seed controls
 * every user's tokens, which is acceptable for a devnet demo token and nothing more.
 */
export function userPrivateKeyBytes(userSeed: string, userId: string): Uint8Array {
  return Uint8Array.from(createHmac("sha256", userSeed).update(`zoomap:user:${userId}`).digest());
}

export async function userSigner(userSeed: string, userId: string): Promise<KeyPairSigner> {
  return createKeyPairSignerFromPrivateKeyBytes(userPrivateKeyBytes(userSeed, userId));
}
