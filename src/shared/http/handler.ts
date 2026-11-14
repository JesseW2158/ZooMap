import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { ApiError, errorBody } from "./errors";
import { formatZodError } from "./parse";

/** Maps anything thrown by a handler to the error envelope. Unknown errors are logged, never leaked. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(errorBody(error.code, error.message), { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json(errorBody("BAD_REQUEST", formatZodError(error)), { status: 400 });
  }
  console.error("[api] unhandled error", error);
  return Response.json(errorBody("INTERNAL", "Something went wrong"), { status: 500 });
}

export interface ApiRouteOptions {
  /** Success status when the handler returns a plain value. Default 200. */
  status?: number;
}

/**
 * Wraps a route handler. Return the payload (it is sent as JSON) or a `Response` (sent as is);
 * throw `ApiError` for failures. Validation and `requireUser(req)` go at the top of the handler.
 *
 *   export const GET = apiRoute(async (req) => {
 *     const user = await requireUser(req);
 *     return doThing(user.id);
 *   });
 *
 * For dynamic segments type the second argument with Next's `RouteContext<'/api/x/[id]'>`.
 */
export function apiRoute<Ctx = unknown>(
  handler: (req: NextRequest, ctx: Ctx) => Promise<unknown> | unknown,
  options: ApiRouteOptions = {},
): (req: NextRequest, ctx: Ctx) => Promise<Response> {
  return async (req, ctx) => {
    try {
      const result = await handler(req, ctx);
      if (result instanceof Response) return result;
      return Response.json(result ?? null, { status: options.status ?? 200 });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
