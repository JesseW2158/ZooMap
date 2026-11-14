import type { z } from "zod";
import { ApiError } from "./errors";

/** "path: message; path: message" from a zod error. Never echoes the offending values. */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.length ? i.path.join(".") : "value"}: ${i.message}`)
    .join("; ");
}

/**
 * Parses the JSON body against a schema. Bad JSON and failed validation both become
 * 400 BAD_REQUEST. Use `z.strictObject` in the schema so unknown keys are rejected.
 */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError("BAD_REQUEST", "Request body must be valid JSON");
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError("BAD_REQUEST", formatZodError(result.error));
  return result.data;
}

/**
 * Parses the query string against a schema. Empty values (`?fromLat=`) are treated as
 * absent so `z.coerce.number()` does not turn them into 0. Repeated keys: the last wins.
 */
export function parseQuery<S extends z.ZodType>(req: Request, schema: S): z.output<S> {
  const raw: Record<string, string> = {};
  for (const [key, value] of new URL(req.url).searchParams) {
    if (value !== "") raw[key] = value;
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError("BAD_REQUEST", formatZodError(result.error));
  return result.data;
}

/** A required header, trimmed, or 400 BAD_REQUEST. */
export function requireHeader(req: Request, name: string, maxLength = 200): string {
  const value = req.headers.get(name)?.trim();
  if (!value) throw new ApiError("BAD_REQUEST", `Missing ${name} header`);
  if (value.length > maxLength) throw new ApiError("BAD_REQUEST", `${name} header is too long`);
  return value;
}
