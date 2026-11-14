import { ERROR_STATUS, type ErrorCode, type ErrorEnvelope } from "@/shared/contracts";

/** Throw from a handler (or a module it calls) to return `{ error: { code, message } }`. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? defaultMessage(code));
    this.name = "ApiError";
    this.code = code;
    this.status = ERROR_STATUS[code];
  }
}

function defaultMessage(code: ErrorCode): string {
  return code
    .toLowerCase()
    .split("_")
    .join(" ")
    .replace(/^./, (c) => c.toUpperCase());
}

export function errorBody(code: ErrorCode, message: string): ErrorEnvelope {
  return { error: { code, message } };
}

export function errorResponse(code: ErrorCode, message?: string): Response {
  const err = new ApiError(code, message);
  return Response.json(errorBody(err.code, err.message), { status: err.status });
}
