import { PREF_KEYS, type KeyValueStore } from "./prefs";

/**
 * The device token is kept with the id of the user it was issued for, as one JSON value in
 * Preferences. The server deletes tokens only on an explicit sign-out, not when a session expires
 * or cookies are cleared, so a token can outlive its owner's session. Binding it to a user id lets
 * the app notice that a different person has signed in and replace it.
 */
export interface StoredToken {
  token: string;
  /** null for a value from before tokens were bound to users (a bare string). */
  userId: string | null;
}

export function serializeStoredToken(token: string, userId: string): string {
  return JSON.stringify({ token, userId });
}

export function parseStoredToken(raw: string | null): StoredToken | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object") {
      const { token, userId } = value as { token?: unknown; userId?: unknown };
      if (typeof token === "string" && token && typeof userId === "string" && userId) return { token, userId };
      return null;
    }
  } catch {
    // not JSON: a legacy bare token
  }
  return { token: raw, userId: null };
}

export async function readStoredToken(store: KeyValueStore): Promise<StoredToken | null> {
  return parseStoredToken(await store.get(PREF_KEYS.deviceToken));
}

/** The token to send with a ping: only one that is bound to a user. */
export async function readTokenForPing(store: KeyValueStore): Promise<string | null> {
  const stored = await readStoredToken(store);
  return stored?.userId ? stored.token : null;
}
