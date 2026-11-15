"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChainMe, IDEMPOTENCY_HEADER, Redemption, RewardsMe, StoreItemList, type StoreItem } from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { useApi } from "@/shared/ui";
import {
  BagIcon,
  BallIcon,
  BookIcon,
  ClockIcon,
  CoinIcon,
  CupIcon,
  DropIcon,
  FlameIcon,
  GiftIcon,
  HistoryIcon,
  IdCardIcon,
  LinkIcon,
  LockIcon,
  ShirtIcon,
  SparkleIcon,
  TicketIcon,
  UtensilsIcon,
} from "./icons";

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

/** A symbol for each store item, picked from its name. */
type IconC = (p: { className?: string }) => ReactNode;
const ITEM_ICONS: [RegExp, IconC][] = [
  [/sticker/i, SparkleIcon],
  [/coffee|tea/i, CupIcon],
  [/lanyard/i, IdCardIcon],
  [/dining|food|meal/i, UtensilsIcon],
  [/room|booking|study/i, BookIcon],
  [/bottle/i, DropIcon],
  [/hoodie|shirt/i, ShirtIcon],
  [/ticket/i, TicketIcon],
];
/** A symbol for each store item, picked from its name. */
const itemIcon = (name: string): IconC => ITEM_ICONS.find(([re]) => re.test(name))?.[1] ?? GiftIcon;
const entryIcon = (delta: number, reason: string): IconC =>
  delta < 0 ? BagIcon : /study/i.test(reason) ? BookIcon : /basketball|sport|frisbee/i.test(reason) ? BallIcon : /game|social/i.test(reason) ? SparkleIcon : ClockIcon;

function ItemIcon({ name, className }: { name: string; className?: string }) {
  // the icons are plain stateless functions, so calling one directly is safe
  return itemIcon(name)({ className });
}

/** The Points tab: balance with progress to the next reward, history, the store and claim codes. */
export function RewardsPanel() {
  const me = useApi<RewardsMe>("/api/rewards/me", { pollMs: POLL_MS, schema: RewardsMe });
  const items = useApi<StoreItem[]>("/api/store/items", { schema: StoreItemList });
  // The devnet mirror (chain module). Opening it also syncs pending entries; hidden when off.
  const chain = useApi<ChainMe>("/api/chain/me", { pollMs: 20_000, schema: ChainMe });

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
      void chain.refresh();
    }
  }

  const storeItems = items.data ?? [];
  const nextGoal = storeItems.filter((i) => i.stock !== 0 && i.cost > balance).sort((a, b) => a.cost - b.cost)[0];
  const progress = nextGoal ? Math.min(1, balance / nextGoal.cost) : 1;

  return (
    // The sheet is always white, but body text turns light in dark mode, so set the colour here.
    <div className="space-y-5 text-sm text-ink">
      <section className="relative overflow-hidden rounded-3xl bg-ink p-5 text-ivory">
        <CoinIcon className="pointer-events-none absolute -right-6 -top-6 h-36 w-36 text-sand opacity-15" />
        <p className="text-xs font-bold uppercase tracking-wider text-sand">Your points</p>
        <p className="mt-1 text-5xl font-bold tabular-nums" aria-live="polite">
          {me.loading && !me.data ? "…" : balance.toLocaleString()}
        </p>
        {nextGoal ? (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-ivory/15">
              <div className="h-full rounded-full bg-sand transition-[width]" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ivory/70">
              <ItemIcon name={nextGoal.name} className="h-3.5 w-3.5" /> {(nextGoal.cost - balance).toLocaleString()} to {nextGoal.name}
            </p>
          </div>
        ) : storeItems.length ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-ivory/70"><SparkleIcon className="h-3.5 w-3.5" />You can get anything in the store</p>
        ) : null}
      </section>

      {me.error ? <p className="rounded-xl bg-red-50 p-2.5 text-red-700">{me.error.message}</p> : null}
      {message ? (
        <p className={`rounded-xl p-2.5 ${message.kind === "ok" ? "bg-mint/40 text-ink" : "bg-red-50 text-red-700"}`} role="status">
          {message.text}
        </p>
      ) : null}

      <section>
        <SectionLabel Icon={HistoryIcon} text="Recent" />
        {me.data && me.data.entries.length === 0 ? (
          <div className="mt-2 flex items-center gap-3 rounded-2xl bg-linen p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-yale" aria-hidden>
              <ClockIcon className="h-5 w-5" />
            </span>
            <p className="text-yale">Join an activity and stay a while to earn.</p>
          </div>
        ) : (
          <ul className="mt-1">
            {(me.data?.entries ?? []).slice(0, 6).map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2">
                <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linen text-ink">
                  {(() => {
                    const Icon = entryIcon(e.delta, e.reason);
                    return <Icon className="h-5 w-5" />;
                  })()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.reason}</span>
                  <span className="text-xs text-yale">{timeAgo(e.createdAt)}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${e.delta > 0 ? "bg-mint/50 text-ink" : "bg-red-50 text-red-700"}`}
                >
                  {e.delta > 0 ? `+${e.delta}` : e.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionLabel Icon={BagIcon} text="Store" />
        {items.error ? <p className="text-red-700">{items.error.message}</p> : null}
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {storeItems.map((item) => {
            const soldOut = item.stock === 0;
            const affordable = balance >= item.cost;
            const locked = soldOut || !affordable;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={locked || busy}
                  title={item.description}
                  onClick={() => {
                    setMessage(null);
                    setConfirm({ item, key: crypto.randomUUID() });
                  }}
                  className={`flex h-full w-full flex-col items-center gap-1.5 rounded-2xl p-3 text-center ring-1 ring-ink/10 transition ${
                    locked ? "bg-linen/60" : "bg-white shadow-sm hover:-translate-y-0.5 hover:shadow-md"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-14 w-14 items-center justify-center rounded-full ${locked ? "bg-white text-yale/50" : "bg-sand/40 text-ink"}`}
                  >
                    <ItemIcon name={item.name} className="h-7 w-7" />
                  </span>
                  <span className="line-clamp-2 text-xs font-semibold leading-tight">{item.name}</span>
                  {item.stock !== undefined && item.stock > 0 && item.stock <= 10 ? (
                    <span className="flex items-center gap-0.5 text-[10px] font-semibold text-coral"><FlameIcon className="h-3 w-3" />{item.stock} left</span>
                  ) : null}
                  <span
                    className={`mt-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
                      soldOut ? "bg-ash/40 text-yale" : affordable ? "bg-ink text-ivory" : "bg-white text-yale"
                    }`}
                  >
                    {!soldOut && !affordable ? <LockIcon className="h-3 w-3" /> : null}
                    {soldOut ? "Sold out" : item.cost.toLocaleString()}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {confirm ? (
        <div role="dialog" aria-label="Confirm redemption" className="sticky bottom-2 rounded-3xl bg-ink p-4 text-ivory shadow-xl">
          <div className="flex items-center gap-3">
            <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sand text-ink">
              <ItemIcon name={confirm.item.name} className="h-6 w-6" />
            </span>
            <p className="min-w-0 flex-1">
              <span className="block font-bold">{confirm.item.name}</span>
              <span className="text-xs text-ivory/70">
                −{confirm.item.cost} · {balance - confirm.item.cost} left after
              </span>
            </p>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setConfirm(null)} disabled={busy} className="flex-1 rounded-full bg-ivory/10 py-2.5 font-semibold max-md:min-h-11">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void doRedeem()}
              disabled={busy}
              className="flex-1 rounded-full bg-sand py-2.5 font-bold text-ink disabled:opacity-60 max-md:min-h-11"
            >
              {busy ? "Redeeming…" : "Redeem"}
            </button>
          </div>
        </div>
      ) : null}

      {me.data && me.data.redemptions.length > 0 ? (
        <section>
          <SectionLabel Icon={TicketIcon} text="Your codes" />
          <ul className="mt-2 space-y-2">
            {me.data.redemptions.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-sand p-2.5">
                <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand/40 text-ink">
                  <ItemIcon name={itemName(r.itemId)} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{itemName(r.itemId)}</span>
                  <span className="text-xs text-yale">{timeAgo(r.createdAt)}</span>
                </span>
                <code className="shrink-0 rounded-lg bg-linen px-2 py-1 font-mono text-xs font-bold">{r.code}</code>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-yale">Demo store: codes don&apos;t work at the real Campus Store.</p>
        </section>
      ) : null}

      {chain.data?.enabled ? (
        <p className="flex items-center justify-center gap-1 text-[11px] text-yale">
          <LinkIcon className="h-3 w-3" /> {chain.data.balance} on Solana devnet{chain.data.pendingCount > 0 ? ` · ${chain.data.pendingCount} syncing` : ""}
          {chain.data.explorerUrl ? (
            <>
              {" · "}
              <a href={chain.data.explorerUrl} target="_blank" rel="noreferrer" className="underline max-md:inline-flex max-md:min-h-11 max-md:items-center">
                receipt
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function SectionLabel({ Icon, text }: { Icon: IconC; text: string }) {
  return (
    <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-yale">
      <Icon className="h-4 w-4" />
      {text}
    </h3>
  );
}
