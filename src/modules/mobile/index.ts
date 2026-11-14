import type { DeviceTokenResponse } from "@/shared/contracts";

/**
 * Mobile module (owner: mobile). FOUNDATION STUB: a made-up token that authenticates nothing.
 * The owning stream returns 32 random bytes once, stores only their SHA-256 in
 * `device_tokens`, and fills in `resolveDeviceToken` in the auth module.
 */
export async function createDeviceToken(userId: string): Promise<DeviceTokenResponse> {
  // FOUNDATION STUB
  void userId;
  return { token: "FIXTURE-DEVICE-TOKEN" };
}
