import { existsSync } from "node:fs";

/**
 * Load `.env.local` for scripts (Next does this for the app; tsx does not). Variables already
 * in the environment win. Values are never printed.
 */
export function loadEnv(): void {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}
