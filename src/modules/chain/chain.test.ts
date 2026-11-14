import { afterEach, describe, expect, it } from "vitest";
import { chainConfig, DEFAULT_RPC_URL, explorerAddressUrl } from "./config";
import { decodeSecret, userPrivateKeyBytes, userSigner } from "./keys";

const VARS = ["CHAIN_MINT_ADDRESS", "CHAIN_AUTHORITY_SECRET", "CHAIN_USER_SEED", "SOLANA_RPC_URL"];
afterEach(() => VARS.forEach((v) => delete process.env[v]));

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
