import { createHash, randomBytes } from "node:crypto";
import type { DeviceTokenResponse } from "@/shared/contracts";
import { getCollections, newId } from "@/shared/db";

/**
 * Mobile module (owner: mobile). Server API: issuing device tokens for the Android shell.
 * `resolveDeviceToken` (auth module) is the reading side and must hash the same way.
 */

/** SHA-256 hex of a device token. The auth module's `resolveDeviceToken` repeats this one line. */
export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * A new device token for `userId`: 32 random bytes, base64url, returned once. Only its SHA-256
 * is stored, so a database leak does not yield working tokens.
 */
export async function createDeviceToken(userId: string): Promise<DeviceTokenResponse> {
  const token = randomBytes(32).toString("base64url");
  const { device_tokens } = await getCollections();
  await device_tokens.insertOne({ _id: newId(), userId, tokenHash: hashDeviceToken(token), createdAt: new Date() });
  return { token };
}
