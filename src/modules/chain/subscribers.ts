import { after } from "next/server";
import type { EventBus } from "@/shared/events";
import { chainConfig } from "./config";
import { getChainClient } from "./index";
import { drainOutbox, enqueue } from "./outbox";

/**
 * `ledger.entry.created` -> one `chain_outbox` row, then a drain scheduled AFTER the response
 * so the points request is never slowed. Off entirely when the Solana env vars are unset.
 */
export function registerSubscribers(bus: EventBus): void {
  bus.on("ledger.entry.created", "chain:outbox", async (event) => {
    if (!chainConfig().enabled) return;
    const added = await enqueue(event);
    if (!added) return;
    try {
      after(async () => {
        const client = getChainClient();
        if (client) await drainOutbox(client).catch((e) => console.error("[chain] drain failed", e));
      });
    } catch {
      // Outside a request (a script or a test): the row waits for the next drain.
    }
  });
}
