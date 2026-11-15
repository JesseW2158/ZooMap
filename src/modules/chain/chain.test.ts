import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SolanaClient } from "./solana";
import { chainConfig, DEFAULT_RPC_URL, explorerAddressUrl } from "./config";
import { decodeSecret, userPrivateKeyBytes, userSigner } from "./keys";

// .env.local may hold real CHAIN_* keys; these tests must never reach devnet.
const CHAIN_VARS = ["CHAIN_MINT_ADDRESS", "CHAIN_AUTHORITY_SECRET", "CHAIN_USER_SEED", "SOLANA_RPC_URL"] as const;
const savedEnv = Object.fromEntries(CHAIN_VARS.map((v) => [v, process.env[v]]));
beforeAll(() => CHAIN_VARS.forEach((v) => delete process.env[v]));
afterAll(() => CHAIN_VARS.forEach((v) => (savedEnv[v] === undefined ? delete process.env[v] : (process.env[v] = savedEnv[v]))));
afterEach(() => CHAIN_VARS.forEach((v) => delete process.env[v]));

describe("chainConfig", () => {
  it("is off unless mint, authority and seed are all set", () => {
    expect(chainConfig().enabled).toBe(false);
    process.env.CHAIN_MINT_ADDRESS = "Mint111";
    process.env.CHAIN_AUTHORITY_SECRET = "secret";
    expect(chainConfig().enabled).toBe(false);
    process.env.CHAIN_USER_SEED = "  ";
    expect(chainConfig().enabled).toBe(false);
    process.env.CHAIN_USER_SEED = "seed";
    expect(chainConfig().enabled).toBe(true);
    expect(chainConfig().rpcUrl).toBe(DEFAULT_RPC_URL);
  });

  it("links the devnet explorer", () => {
    expect(explorerAddressUrl("Abc")).toBe("https://explorer.solana.com/address/Abc?cluster=devnet");
  });
});

describe("custodial keys", () => {
  it("derives the same address for the same user and a different one per user and per seed", async () => {
    const a1 = (await userSigner("seed-1", "seed-alex")).address;
    const a2 = (await userSigner("seed-1", "seed-alex")).address;
    const b = (await userSigner("seed-1", "seed-blair")).address;
    const c = (await userSigner("seed-2", "seed-alex")).address;
    expect(a1).toBe(a2);
    expect(new Set([a1, b, c]).size).toBe(3);
    expect(userPrivateKeyBytes("seed-1", "seed-alex")).toHaveLength(32);
  });

  it("decodes a Solana CLI JSON keypair and base58", () => {
    expect(decodeSecret("[1,2,3]")).toEqual(Uint8Array.from([1, 2, 3]));
    expect(decodeSecret("2")).toEqual(Uint8Array.from([1]));
  });
});

describe("SolanaClient.confirm", () => {
  const client = () =>
    new SolanaClient({
      enabled: true,
      rpcUrl: "http://127.0.0.1:1",
      cluster: "devnet",
      mint: "So11111111111111111111111111111111111111112",
      authoritySecret: "x",
      userSeed: "y",
    });

  it("returns not_found at the deadline when the RPC keeps failing, instead of throwing or hanging", async () => {
    const c = client();
    vi.spyOn(c, "status").mockRejectedValue(new Error("rpc stalled"));
    const started = Date.now();
    expect(await c.confirm("sig", 1_200)).toBe("not_found");
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it("keeps polling past a failed poll and returns the status once it lands", async () => {
    const c = client();
    vi.spyOn(c, "status").mockRejectedValueOnce(new Error("blip")).mockResolvedValue("confirmed");
    expect(await c.confirm("sig", 5_000)).toBe("confirmed");
  });
});
