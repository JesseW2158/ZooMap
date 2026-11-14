import { z } from "zod";

/**
 * Typed, defaulted view of the server environment (see .env.example). Server-side only:
 * client code reads `publicEnv` instead. Parsed on every call so tests can change
 * `process.env`; it is cheap. Nothing throws at import time, so `next build` works with
 * no secrets. Use `requireEnv` where a value is mandatory.
 */

const text = z.string().optional();
const flag = (fallback: boolean) =>
  text.transform((v) => {
    if (v === undefined || v.trim() === "") return fallback;
    return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
  });
const int = (fallback: number) =>
  text.transform((v) => {
    if (v === undefined || v.trim() === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  });
const list = (fallback: string) =>
  text.transform((v) =>
    (v && v.trim() !== "" ? v : fallback)
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
const optionalText = text.transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const EnvSchema = z.object({
  NODE_ENV: text,
  MONGODB_URI: optionalText,
  MONGODB_DB: text.transform((v) => (v && v.trim() !== "" ? v.trim() : "zoomap")),
  AUTH_SECRET: optionalText,
  GOOGLE_CLIENT_ID: optionalText,
  GOOGLE_CLIENT_SECRET: optionalText,
  ALLOWED_EMAIL_DOMAINS: list("umass.edu"),
  DEV_AUTH: flag(false),
  ICS_ALLOWED_HOSTS: list(".instructure.com,calendar.google.com"),
  ENCRYPTION_KEY: optionalText,
  GEMINI_API_KEY: optionalText,
  GEMINI_MODEL: text.transform((v) => (v && v.trim() !== "" ? v.trim() : "gemini-3.8-flash")),
  SIMULATED_DENSITY: flag(false),
  DENSITY_MIN_LIVE_COUNT: int(1),
  GEOFENCE_ENFORCED: flag(true),
  POINTS_PER_MINUTE: int(1),
});

export interface Env {
  nodeEnv: string;
  isProduction: boolean;
  mongodbUri: string | undefined;
  mongodbDb: string;
  authSecret: string | undefined;
  googleClientId: string | undefined;
  googleClientSecret: string | undefined;
  /** Lower-cased, exact domains. */
  allowedEmailDomains: string[];
  /** True only when DEV_AUTH=1 and NODE_ENV is not production. */
  devAuth: boolean;
  /** Lower-cased. A leading dot matches subdomains. */
  icsAllowedHosts: string[];
  encryptionKey: string | undefined;
  geminiApiKey: string | undefined;
  geminiModel: string;
  simulatedDensity: boolean;
  densityMinLiveCount: number;
  /** False skips the distance check for presenting. */
  geofenceEnforced: boolean;
  pointsPerMinute: number;
}

export function env(source: Record<string, string | undefined> = process.env): Env {
  const e = EnvSchema.parse(source);
  const nodeEnv = e.NODE_ENV ?? "development";
  const isProduction = nodeEnv === "production";
  return {
    nodeEnv,
    isProduction,
    mongodbUri: e.MONGODB_URI,
    mongodbDb: e.MONGODB_DB,
    authSecret: e.AUTH_SECRET,
    googleClientId: e.GOOGLE_CLIENT_ID,
    googleClientSecret: e.GOOGLE_CLIENT_SECRET,
    allowedEmailDomains: e.ALLOWED_EMAIL_DOMAINS,
    // DEV_AUTH is refused in production no matter what the variable says.
    devAuth: e.DEV_AUTH && !isProduction,
    icsAllowedHosts: e.ICS_ALLOWED_HOSTS,
    encryptionKey: e.ENCRYPTION_KEY,
    geminiApiKey: e.GEMINI_API_KEY,
    geminiModel: e.GEMINI_MODEL,
    simulatedDensity: e.SIMULATED_DENSITY,
    densityMinLiveCount: Math.max(1, Math.trunc(e.DENSITY_MIN_LIVE_COUNT)),
    geofenceEnforced: e.GEOFENCE_ENFORCED,
    pointsPerMinute: Math.max(0, Math.trunc(e.POINTS_PER_MINUTE)),
  };
}

/** The named variable, or a clear error. The message never includes a value. */
export function requireEnv(name: "MONGODB_URI" | "AUTH_SECRET" | "ENCRYPTION_KEY" | "GEMINI_API_KEY"): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  }
  return value.trim();
}
