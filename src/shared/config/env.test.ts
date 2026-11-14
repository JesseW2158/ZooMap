import { describe, expect, it } from "vitest";
import { env, requireEnv } from "./env";

describe("env()", () => {
  it("applies defaults with nothing set", () => {
    const e = env({});
    expect(e).toMatchObject({
      mongodbDb: "zoomap",
      allowedEmailDomains: ["umass.edu"],
      devAuth: false,
      geofenceEnforced: true,
      simulatedDensity: false,
      pointsPerMinute: 1,
      isProduction: false,
    });
  });

  it("parses a domain list, lower-cased and trimmed", () => {
    expect(env({ ALLOWED_EMAIL_DOMAINS: " UMass.edu, Student.UMass.edu " }).allowedEmailDomains).toEqual([
      "umass.edu",
      "student.umass.edu",
    ]);
  });

  it("DEV_AUTH works outside production and is refused in production", () => {
    expect(env({ DEV_AUTH: "1" }).devAuth).toBe(true);
    expect(env({ DEV_AUTH: "1", NODE_ENV: "production" }).devAuth).toBe(false);
  });

  it("reads booleans and numbers leniently and falls back on junk", () => {
    expect(env({ GEOFENCE_ENFORCED: "0" }).geofenceEnforced).toBe(false);
    expect(env({ SIMULATED_DENSITY: "true" }).simulatedDensity).toBe(true);
    expect(env({ POINTS_PER_MINUTE: "abc" }).pointsPerMinute).toBe(1);
    expect(env({ DENSITY_MIN_LIVE_COUNT: "0" }).densityMinLiveCount).toBe(1);
  });

  it("treats blank values as unset", () => {
    expect(env({ MONGODB_URI: "  ", MONGODB_DB: "" })).toMatchObject({ mongodbUri: undefined, mongodbDb: "zoomap" });
  });
});

describe("requireEnv()", () => {
  it("names the variable but never echoes a value", () => {
    const before = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    try {
      expect(() => requireEnv("ENCRYPTION_KEY")).toThrow(/ENCRYPTION_KEY is not set/);
    } finally {
      if (before !== undefined) process.env.ENCRYPTION_KEY = before;
    }
  });
});
