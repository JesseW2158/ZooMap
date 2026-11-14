import { ObjectId } from "mongodb";

/** A new document id: a 24-char hex string (time-ordered). Every `_id` and reference is a string. */
export function newId(): string {
  return new ObjectId().toHexString();
}

/**
 * True for a unique-index violation (code 11000), including the same error wrapped in a
 * bulk write. Map it to 409 in the handler; do not pre-check.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: unknown; writeErrors?: unknown };
  if (e.code === 11000) return true;
  if (Array.isArray(e.writeErrors)) {
    return e.writeErrors.some((w) => (w as { code?: unknown }).code === 11000 || (w as { err?: { code?: unknown } }).err?.code === 11000);
  }
  return false;
}

/** The unique index a duplicate-key error hit (for example "one_active_host_unique"), if the server said. */
export function duplicateKeyIndexName(error: unknown): string | undefined {
  const message = (error as { errmsg?: unknown; message?: unknown } | null)?.errmsg ?? (error as { message?: unknown } | null)?.message;
  if (typeof message !== "string") return undefined;
  return /index: (\S+)/.exec(message)?.[1];
}
