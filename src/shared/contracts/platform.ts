import { z } from "zod";
import { Id } from "./common";

/** Who is calling. `device` means a bearer token from the Android shell. */
export const AuthUser = z.object({
  id: Id,
  email: z.string(),
  name: z.string().nullish(),
  image: z.string().nullish(),
  via: z.enum(["session", "device"]),
});
export type AuthUser = z.infer<typeof AuthUser>;

/** POST /api/mobile/device-token (cookie auth only). The token is shown once; only its SHA-256 is stored. */
export const DeviceTokenResponse = z.object({ token: z.string().min(1) });
export type DeviceTokenResponse = z.infer<typeof DeviceTokenResponse>;

/** GET /api/chain/me (stretch). All fields are inert when the Solana env vars are unset. */
export const ChainMe = z.object({
  enabled: z.boolean(),
  address: z.string().nullable(),
  /** On-chain token balance, whole points. */
  balance: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  explorerUrl: z.string().nullable(),
});
export type ChainMe = z.infer<typeof ChainMe>;
