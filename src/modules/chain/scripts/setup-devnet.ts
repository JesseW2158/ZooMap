/**
 * One-time devnet setup for the chain mirror:  npx tsx src/modules/chain/scripts/setup-devnet.ts
 *
 * 1. Creates the mint authority key and the user master seed if they are missing, and appends
 *    them to .env.local (gitignored). Secrets are written to that file only, never printed.
 * 2. Makes sure the authority has devnet SOL for fees (tries an airdrop; the public faucet is
 *    often rate-limited, in which case it prints the address to fund by hand and stops).
 * 3. Creates the points token mint (0 decimals) if CHAIN_MINT_ADDRESS is missing.
 *
 * Safe to re-run: every step is skipped when its value already exists. Devnet only.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  appendTransactionMessageInstructions,
  createKeyPairSignerFromPrivateKeyBytes,
  createSolanaRpc,
  createTransactionMessage,
  generateKeyPairSigner,
  getAddressEncoder,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type KeyPairSigner,
  type Signature,
} from "@solana/kit";
import { getCreateAccountInstruction } from "@solana-program/system";
import { TOKEN_PROGRAM_ADDRESS, getInitializeMint2Instruction, getMintSize } from "@solana-program/token";
import { loadEnv } from "../../../../scripts/load-env";
import { chainConfig, explorerAddressUrl } from "../config";
import { signerFromSecret } from "../keys";

const ENV_FILE = ".env.local";
const MIN_LAMPORTS = BigInt(20_000_000); // 0.02 SOL covers the mint and many token accounts' rent and fees
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function appendEnv(name: string, value: string) {
  const current = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  if (new RegExp(`^${name}=.+`, "m").test(current)) throw new Error(`${name} already has a value in ${ENV_FILE}; not overwriting it`);
  const prefix = current.endsWith("\n") || current === "" ? "" : "\n";
  appendFileSync(ENV_FILE, `${prefix}${name}=${value}\n`, { mode: 0o600 });
  process.env[name] = value;
}

async function newAuthority(): Promise<KeyPairSigner> {
  const privateKey = randomBytes(32);
  const signer = await createKeyPairSignerFromPrivateKeyBytes(privateKey);
  // Solana CLI layout: 32-byte private key then 32-byte public key, base58-encoded.
  const keypair = new Uint8Array([...privateKey, ...getAddressEncoder().encode(signer.address)]);
  appendEnv("CHAIN_AUTHORITY_SECRET", getBase58Decoder().decode(keypair));
  return signer;
}

async function main() {
  loadEnv();
  let config = chainConfig();
  const rpc = createSolanaRpc(config.rpcUrl);
  console.log(`rpc: ${config.rpcUrl}`);

  const authority = config.authoritySecret ? await signerFromSecret(config.authoritySecret) : await newAuthority();
  console.log(`authority: ${authority.address}${config.authoritySecret ? "" : " (new, saved to .env.local)"}`);

  if (!config.userSeed) {
    appendEnv("CHAIN_USER_SEED", randomBytes(32).toString("base64url"));
    console.log("user seed: new, saved to .env.local");
  }

  async function sendAndConfirm(instructions: Instruction[]): Promise<Signature> {
    const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
    const tx = await signTransactionMessageWithSigners(
      pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(authority, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        (m) => appendTransactionMessageInstructions(instructions, m),
      ),
    );
    const sig = getSignatureFromTransaction(tx);
    await rpc.sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: "base64", preflightCommitment: "confirmed" }).send();
    await waitFor(sig);
    return sig;
  }

  async function waitFor(sig: Signature) {
    for (let i = 0; i < 60; i++) {
      const { value } = await rpc.getSignatureStatuses([sig]).send();
      const s = value[0];
      if (s?.err) throw new Error(`transaction ${sig} failed: ${JSON.stringify(s.err)}`);
      if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) return;
      await sleep(1_000);
    }
    throw new Error(`transaction ${sig} was not confirmed in 60 s`);
  }

  let { value: balance } = await rpc.getBalance(authority.address).send();
  if (balance < MIN_LAMPORTS) {
    console.log("authority needs devnet SOL: requesting an airdrop of 1 SOL ...");
    try {
      const sig = await rpc.requestAirdrop(authority.address, lamports(BigInt(1_000_000_000))).send();
      await waitFor(sig);
      ({ value: balance } = await rpc.getBalance(authority.address).send());
    } catch (error) {
      console.error(`airdrop failed: ${error instanceof Error ? error.message.split("\n")[0] : "unknown error"}`);
      console.error(`Fund this devnet address by hand at https://faucet.solana.com, then run this script again:\n  ${authority.address}`);
      process.exitCode = 1;
      return;
    }
  }
  console.log(`authority balance: ${Number(balance) / 1e9} SOL (devnet)`);

  config = chainConfig();
  if (!config.mint) {
    const mint = await generateKeyPairSigner();
    const space = BigInt(getMintSize());
    const rent = await rpc.getMinimumBalanceForRentExemption(space).send();
    await sendAndConfirm([
      getCreateAccountInstruction({ payer: authority, newAccount: mint, lamports: rent, space, programAddress: TOKEN_PROGRAM_ADDRESS }),
      getInitializeMint2Instruction({ mint: mint.address, decimals: 0, mintAuthority: authority.address }),
    ]);
    appendEnv("CHAIN_MINT_ADDRESS", mint.address);
    console.log(`mint: ${mint.address} (new, saved to .env.local)`);
  } else {
    console.log(`mint: ${config.mint}`);
  }

  console.log(`\nToken on the explorer: ${explorerAddressUrl(chainConfig().mint!)}`);
  console.log("Chain mirror is configured. Restart the dev server so it reads the new variables.");
}

main().catch((error) => {
  console.error(`setup failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
