"use client";

import { useMemo, useState } from "react";
import { IDEMPOTENCY_HEADER, Redemption, RewardsMe, StoreItemList, type StoreItem } from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { useApi } from "@/shared/ui";

const POLL_MS = 10_000;

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

function errorText(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "INSUFFICIENT_POINTS") return "Not enough points for that yet.";
    if (error.code === "OUT_OF_STOCK") return "That item just sold out.";
    return error.message;
  }
  return "Something went wrong. Try again.";
}

/** The Points tab: balance, history in plain words, the store and your claim codes. */
export function RewardsPanel() {
  const me = useApi<RewardsMe>("/api/rewards/me", { pollMs: POLL_MS, schema: RewardsMe });
  const items = useApi<StoreItem[]>("/api/store/items", { schema: StoreItemList });

  // The key is made when the confirmation opens, so a double tap on "Redeem" sends one key.
  const [confirm, setConfirm] = useState<{ item: StoreItem; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const itemName = useMemo(() => {
    const byId = new Map((items.data ?? []).map((i) => [i.id, i.name]));
    return (id: string) => byId.get(id) ?? "Store item";
  }, [items.data]);

  const balance = me.data?.balance ?? 0;

  async function doRedeem() {
    if (!confirm) return;
    setBusy(true);
    setMessage(null);
    try {
      const redemption = await apiFetch("/api/store/redeem", {
        method: "POST",
        body: { itemId: confirm.item.id },
        headers: { [IDEMPOTENCY_HEADER]: confirm.key },
        schema: Redemption,
      });
      setMessage({ kind: "ok", text: `Redeemed ${confirm.item.name}. Your code: ${redemption.code}` });
      setConfirm(null);
    } catch (error) {
      setMessage({ kind: "error", text: errorText(error) });
      setConfirm(null);
    } finally {
      setBusy(false);
      void me.refresh();
      void items.refresh();
    }
  }

  return (
    // The sheet is always white, but body text turns light in dark mode, so set the colour here.
    <div className="space-y-4 text-sm text-neutral-900">
      <section className="flex items-baseline justify-between">
        <div>
          <p className="text-neutral-500">Your points</p>
          <p className="text-3xl font-semibold tabular-nums" aria-live="polite">
            {me.loading && !me.data ? "…" : balance.toLocaleString()}
          </p>
        </div>
        <p className="max-w-[12rem] text-right text-xs text-neutral-500">Earn points for verified time at activities.</p>
      </section>

      {me.error ? <p className="rounded-lg bg-red-50 p-2 text-red-700">{me.error.message}</p> : null}
      {message ? (
        <p className={`rounded-lg p-2 ${message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`} role="status">
          {message.text}
        </p>
      ) : null}

      <section>
        <h3 className="mb-1 font-semibold">Recent</h3>
        {me.data && me.data.entries.length === 0 ? (
          <p className="text-neutral-500">Nothing yet. Join an activity and stay a while.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {(me.data?.entries ?? []).slice(0, 8).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate">{e.reason}</span>
                  <span className="text-xs text-neutral-500">{timeAgo(e.createdAt)}</span>
                </span>
                <span className={`shrink-0 font-medium tabular-nums ${e.delta > 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {e.delta > 0 ? `+${e.delta}` : e.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-1 font-semibold">Store</h3>
        {items.error ? <p className="text-red-700">{items.error.message}</p> : null}
        <ul className="space-y-2">
          {(items.data ?? []).map((item) => {
            const soldOut = item.stock === 0;
            const affordable = balance >= item.cost;
            return (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 p-2">
                <span className="min-w-0">
                  <span className="block font-medium">{item.name}</span>
                  <span className="block text-xs text-neutral-500">
                    {item.description}
                    {item.stock !== undefined ? ` · ${item.stock} left` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={soldOut || !affordable || busy}
                  onClick={() => {
                    setMessage(null);
                    setConfirm({ item, key: crypto.randomUUID() });
                  }}
                  className="shrink-0 rounded-full bg-[#881c1c] px-3 py-1 text-xs font-semibold text-white disabled:bg-neutral-300 disabled:text-neutral-600"
                >
                  {soldOut ? "Sold out" : `${item.cost} pts`}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {confirm ? (
        <div role="dialog" aria-label="Confirm redemption" className="rounded-lg border border-neutral-300 bg-white p-3 shadow-sm">
          <p>
            Spend <strong>{confirm.item.cost}</strong> points on <strong>{confirm.item.name}</strong>? You will have{" "}
            {balance - confirm.item.cost} left.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirm(null)} disabled={busy} className="rounded-full px-3 py-1 text-neutral-700">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void doRedeem()}
              disabled={busy}
              className="rounded-full bg-[#881c1c] px-3 py-1 font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Redeeming…" : "Redeem"}
            </button>
          </div>
        </div>
      ) : null}

      {me.data && me.data.redemptions.length > 0 ? (
        <section>
          <h3 className="mb-1 font-semibold">Your claim codes</h3>
          <ul className="space-y-1">
            {me.data.redemptions.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">
                  {itemName(r.itemId)} <span className="text-xs text-neutral-500">· {timeAgo(r.createdAt)}</span>
                </span>
                <code className="shrink-0 rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs">{r.code}</code>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-neutral-500">Mock store for the demo. Codes are not redeemable at the real Campus Store.</p>
        </section>
      ) : null}
    </div>
  );
}
