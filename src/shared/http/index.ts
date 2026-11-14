// Server-side HTTP helpers. Import the client helper from "@/shared/http/client" in UI code.
// `requireUser` lives in the auth module (`@/modules/auth`) so shared never imports a module.
export { ApiError, errorBody, errorResponse } from "./errors";
export { apiRoute, toErrorResponse } from "./handler";
export { formatZodError, parseBody, parseQuery, requireHeader } from "./parse";
