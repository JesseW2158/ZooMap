/**
 * What the outbox needs from a chain. The real one is `solana.ts`; tests pass a fake.
 * A transaction is prepared (built and signed) first so its signature can be saved before
 * it is sent: a retry then checks that signature instead of minting twice.
 */
export interface PreparedTx {
  signature: string;
  send(): Promise<void>;
}

export type TxStatus = "confirmed" | "failed" | "not_found";

export interface ChainClient {
  /** Positive delta mints to the user, negative burns from the user. */
  prepare(op: { userId: string; delta: number }): Promise<PreparedTx>;
  /** Polls until the transaction is confirmed or failed, or the timeout passes ("not_found"). */
  confirm(signature: string, timeoutMs: number): Promise<TxStatus>;
  status(signature: string): Promise<TxStatus>;
  addressOf(userId: string): Promise<string>;
  /** Whole tokens the user holds; 0 when they have no token account yet. */
  balanceOf(userId: string): Promise<number>;
}
