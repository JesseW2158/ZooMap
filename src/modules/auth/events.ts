import { getCollections } from "@/shared/db";

/**
 * Auth.js `events.signOut` for the JWT strategy: the event carries the decoded token, whose `uid`
 * is the Minute Map user id. Signing out revokes that user's device tokens, so a phone that signed
 * out stops reporting location. Auth.js logs and swallows an error thrown here, but the cookie
 * is cleared either way.
 */
export async function revokeDeviceTokensOnSignOut(message: { token?: { uid?: unknown } | null } | { session?: unknown }): Promise<void> {
  const uid = "token" in message ? message.token?.uid : undefined;
  if (typeof uid !== "string" || !uid) return;
  const { device_tokens } = await getCollections();
  await device_tokens.deleteMany({ userId: uid });
}
