import {
  address,
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  signature as toSignature,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getBurnInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
  getMintToInstruction,
} from "@solana-program/token";
import type { ChainClient, PreparedTx, TxStatus } from "./client";
import type { ChainConfig } from "./config";
import { signerFromSecret, userSigner } from "./keys";

type Rpc = ReturnType<typeof createSolanaRpc>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Solana devnet client for the points token. The mint authority pays every fee. */
export class SolanaClient implements ChainClient {
  private readonly rpc: Rpc;
  private readonly mint: Address;
  private authorityPromise: Promise<KeyPairSigner> | undefined;

  constructor(private readonly config: ChainConfig & { mint: string; authoritySecret: string; userSeed: string }) {
    this.rpc = createSolanaRpc(config.rpcUrl);
    this.mint = address(config.mint);
  }

  private authority(): Promise<KeyPairSigner> {
    return (this.authorityPromise ??= signerFromSecret(this.config.authoritySecret));
  }

  private async tokenAccount(owner: Address): Promise<Address> {
    const [ata] = await findAssociatedTokenPda({ owner, mint: this.mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    return ata;
  }

  async addressOf(userId: string): Promise<string> {
    return (await userSigner(this.config.userSeed, userId)).address;
  }

  async balanceOf(userId: string): Promise<number> {
    const owner = address(await this.addressOf(userId));
    try {
      const { value } = await this.rpc.getTokenAccountBalance(await this.tokenAccount(owner)).send();
      return Number(value.amount);
    } catch {
      return 0; // no token account yet
    }
  }

  async prepare({ userId, delta }: { userId: string; delta: number }): Promise<PreparedTx> {
    if (!Number.isInteger(delta) || delta === 0) throw new Error("delta must be a non-zero integer");
    const authority = await this.authority();
    const user = await userSigner(this.config.userSeed, userId);
    const ata = await this.tokenAccount(user.address);
    const amount = BigInt(Math.abs(delta));

    const instructions: Instruction[] =
      delta > 0
        ? [
            getCreateAssociatedTokenIdempotentInstruction({ payer: authority, ata, owner: user.address, mint: this.mint }),
            getMintToInstruction({ mint: this.mint, token: ata, mintAuthority: authority, amount }),
          ]
        : // Only the token account's owner may burn: the user's derived key signs, the authority pays.
          [getBurnInstruction({ account: ata, mint: this.mint, authority: user, amount })];

    const { value: blockhash } = await this.rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(authority, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    );
    const tx = await signTransactionMessageWithSigners(message);
    const signature = getSignatureFromTransaction(tx);
    const wire = getBase64EncodedWireTransaction(tx);

    return {
      signature,
      send: async () => {
        await this.rpc.sendTransaction(wire, { encoding: "base64", preflightCommitment: "confirmed" }).send();
      },
    };
  }

  async status(sig: string): Promise<TxStatus> {
    const { value } = await this.rpc.getSignatureStatuses([toSignature(sig)], { searchTransactionHistory: true }).send();
    const s = value[0];
    if (!s) return "not_found";
    if (s.err) return "failed";
    return s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized" ? "confirmed" : "not_found";
  }

  async confirm(sig: string, timeoutMs: number): Promise<TxStatus> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const s = await this.status(sig);
      if (s !== "not_found") return s;
      await sleep(1_000);
    }
    return "not_found";
  }
}
