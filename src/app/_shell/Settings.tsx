"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SharingState } from "@/shared/contracts";
import { apiFetch } from "@/shared/http/client";
import type { ShellUser } from "./AppShell";

/**
 * Settings, opened from the account menu. A full-screen sheet portalled to <body> so it covers
 * the tab bar and map controls. Rows marked "Soon" are the draft of what this page should grow
 * into; only location sharing is wired today. Profile details and calendar sources keep living
 * in their own tabs, and this page points there instead of duplicating them.
 */
export function SettingsSheet({ user, onClose }: { user: ShellUser; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Settings" className="animate-fade zm-dots fixed inset-0 z-50 flex flex-col overflow-y-auto bg-linen text-ink">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-gradient-to-br from-ink to-yale px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-ivory">
        <h2 className="text-xl font-bold tracking-tight">Settings</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="zm-press flex h-10 w-10 items-center justify-center rounded-full bg-ivory/10 hover:bg-ivory/20"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div className="zm-stagger mx-auto w-full max-w-2xl space-y-5 px-4 py-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <Group title="Account">
          <Row title={user.name ?? "Signed in"} hint={user.email} />
          <Row title="Pronouns and phone" hint="Edit your card in the Friends tab" />
        </Group>

        <Group title="Privacy and location">
          <LocationSharingRow />
          <Row title="Background location" hint="Keep sharing while the Android app is closed" soon />
          <Row title="Hide me from friends" hint="Count toward crowds without showing friends where you are" soon />
        </Group>

        <Group title="Friends and invites">
          <Row title="Who can invite me" hint="Friends only, or nobody" soon />
          <Row title="Invite banner over the map" hint="Show new invites on every tab" soon />
        </Group>

        <Group title="Calendar">
          <Row title="Connected calendars" hint="Classes, Canvas and Google Calendar are managed in the Calendar tab" />
          <Row title="Leave-now reminders" hint="Nudge me when it's time to walk to class" soon />
          <Row title="Walking pace" hint="Used for travel times between classes" soon />
        </Group>

        <Group title="Map">
          <Row title="Start on" hint="My location or the campus centre" soon />
          <Row title="Reduce motion" hint="Jump instead of flying the camera" soon />
        </Group>

        <Group title="Points">
          <Row title="Points wallet" hint="Your points token address on Solana devnet" soon />
        </Group>

        <Group title="About">
          <Row title="Crowd levels" hint="Some crowd levels are simulated and are labelled that way on the map" />
          <Row title="What we store" hint="A coarse area and place for 10 minutes. No coordinates, no history" />
          <Row title="Delete my account" hint="Removes your profile, friends, points and schedule" soon danger />
        </Group>
      </div>
    </div>,
    document.body,
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wider text-yale">{title}</h3>
      <div className="divide-y divide-ash/30 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-ink/5">{children}</div>
    </section>
  );
}

function Row({
  title,
  hint,
  soon = false,
  danger = false,
  control,
}: {
  title: string;
  hint?: string;
  soon?: boolean;
  danger?: boolean;
  control?: ReactNode;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${soon ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${danger ? "text-red-700" : ""}`}>{title}</p>
        {hint ? <p className="text-xs text-yale">{hint}</p> : null}
      </div>
      {soon ? <span className="shrink-0 rounded-full bg-linen px-2 py-0.5 text-[10px] font-bold uppercase text-yale">Soon</span> : control}
    </div>
  );
}

/** The one live setting: the same opt-in the Crowds panel toggles, via /api/presence/sharing. */
function LocationSharingRow() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch("/api/presence/sharing", { schema: SharingState })
      .then((s) => setEnabled(s.enabled))
      .catch(() => setError(true));
  }, []);

  const toggle = async () => {
    if (enabled === null) return;
    setBusy(true);
    setError(false);
    try {
      const s = await apiFetch("/api/presence/sharing", { method: "PUT", body: { enabled: !enabled }, schema: SharingState });
      setEnabled(s.enabled);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Row
      title="Share my location"
      hint={error ? "Couldn't reach the server. Try again." : "Counts you in the crowd levels on the map. Off until you turn it on"}
      control={
        <button
          type="button"
          role="switch"
          aria-checked={!!enabled}
          aria-label="Share my location"
          disabled={busy || enabled === null}
          onClick={toggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${enabled ? "bg-ink" : "bg-ash/60"}`}
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? "left-[1.375rem]" : "left-0.5"}`} />
        </button>
      }
    />
  );
}
