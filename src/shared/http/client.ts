import type { z } from "zod";
import { ErrorEnvelope, type ErrorCode } from "@/shared/contracts";

/** Thrown by `apiFetch` for any non-2xx response. `code` is `UNAUTHORIZED` etc. from the envelope. */
export class ApiClientError extends Error {
  readonly code: ErrorCode | "NETWORK" | "UNKNOWN";
  readonly status: number;

  constructor(code: ApiClientError["code"], status: number, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

export interface ApiFetchOptions<S extends z.ZodType | undefined> {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Sent as JSON. */
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** When given, the response is validated against it (catches stubs drifting from contracts). */
  schema?: S;
}

/**
 * Browser-side fetch for ZooMap's own API. Same origin, cookies included. Resolves with
 * the bare payload; rejects with `ApiClientError`.
 */
export async function apiFetch<T = unknown, S extends z.ZodType | undefined = undefined>(
  path: string,
  options: ApiFetchOptions<S> = {},
): Promise<S extends z.ZodType ? z.output<S> : T> {
  const { method = "GET", body, headers, signal, schema } = options;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      signal,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiClientError("NETWORK", 0, "Could not reach the server");
  }

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // handled below
    }
  }

  if (!res.ok) {
    const envelope = ErrorEnvelope.safeParse(json);
    if (envelope.success) {
      throw new ApiClientError(envelope.data.error.code, res.status, envelope.data.error.message);
    }
    throw new ApiClientError("UNKNOWN", res.status, `Request failed (${res.status})`);
  }

  if (schema) return schema.parse(json) as never;
  return json as never;
}
