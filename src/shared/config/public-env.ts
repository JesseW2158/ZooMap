/**
 * Client-readable settings. Next inlines `process.env.NEXT_PUBLIC_*` only when written as
 * a literal member access, so do not destructure or index `process.env` here.
 */
export const publicEnv = {
  /** Enables the click-to-set-location override. Leave unset in production. */
  devTools: process.env.NEXT_PUBLIC_DEV_TOOLS === "1",
  /** Deployed origin, used by the Android shell. Empty means "this origin". */
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
} as const;
