"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Profile, SharingState } from "@/shared/contracts";
import { apiFetch } from "@/shared/http/client";
import type { ShellUser } from "./AppShell";

/**
 * Settings, opened from the account menu. A full-screen sheet portalled to <body> so it covers
 * the tab bar and map controls. Rows marked "Soon" are the draft of what this page should grow
 * into; your friend card (pronouns, phone, contact email) and location sharing are the live
 * controls. Everything else either states how the app behaves today or points to where it is set
 * (calendars in their own tab, alerts in the bell). Keep the hints true to what the app does.
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
          <ProfileRows />
        </Group>

        <Group title="Privacy and location">
          <LocationSharingRow />
          <Row title="Background location" hint="Android app only: set ZooMap's location permission to Allow all the time to keep sharing with the screen off" />
          <Row title="Who sees where you are" hint="Nobody. Others see only how busy each building is" />
        </Group>

        <Group title="Friends and invites">
          <Row title="Who can invite me" hint="Friends only, or nobody" soon />
          <Row title="Invites" hint="A new activity invite shows over the map on every tab until you accept or decline it" />
        </Group>

        <Group title="Calendar">
          <Row title="Connected calendars" hint="Classes, Canvas and Google Calendar are managed in the Calendar tab" />
          <Row title="Leave-now reminders" hint="Turn on Leave for class in the alerts bell" />
          <Row title="Walking pace" hint="Used for travel times between classes" soon />
        </Group>

        <Group title="Map">
          <Row title="Start on" hint="My location or the campus centre" soon />
          <Row title="Reduce motion" hint="Jump instead of flying the camera" soon />
        </Group>

        <Group title="Points">
          <Row title="Points on Solana devnet" hint="When the devnet mirror is on, your balance and a receipt link show at the bottom of the Points tab" />
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

/**
 * Your card as friends see it: pronouns, phone and contact email, saved through
 * PUT /api/profile/me. Save appears once something changed; the Chat tab reloads your profile
 * when it next opens.
 */
function ProfileRows() {
  const [saved, setSaved] = useState<{ pronouns: string; phone: string; email: string } | null>(null);
  const [draft, setDraft] = useState({ pronouns: "", phone: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = (p: Profile) => {
    const fields = { pronouns: p.pronouns ?? "", phone: p.phone ?? "", email: p.email ?? "" };
    setSaved(fields);
    setDraft(fields);
  };

  useEffect(() => {
    apiFetch("/api/profile/me", { schema: Profile })
      .then(load)
      .catch(() => setStatus("Couldn't load your profile. Try again."));
  }, []);

  const dirty = !!saved && (draft.pronouns !== saved.pronouns || draft.phone !== saved.phone || draft.email !== saved.email);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const p = await apiFetch("/api/profile/me", {
        method: "PUT",
        schema: Profile,
        body: {
          pronouns: draft.pronouns.trim() || null,
          phone: draft.phone.trim() || null,
          contactEmail: draft.email.trim() || null,
        },
      });
      load(p);
      setStatus("Saved");
    } catch {
      setStatus("Couldn't save. Check the phone and email and try again.");
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof typeof draft, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="flex items-center gap-3 px-4 py-3">
      <span className="w-28 shrink-0 text-sm font-semibold">{label}</span>
      <input
        {...props}
        value={draft[key]}
        disabled={!saved}
        onChange={(e) => {
          setStatus(null);
          setDraft((d) => ({ ...d, [key]: e.target.value }));
        }}
        className="min-w-0 flex-1 bg-transparent text-right text-sm text-ink placeholder:text-yale/50 focus:outline-none disabled:opacity-50"
      />
    </label>
  );

  return (
    <form onSubmit={save} className="divide-y divide-ash/30">
      {field("pronouns", "Pronouns", { maxLength: 40, placeholder: "she/her, they/them…" })}
      {field("phone", "Phone", { type: "tel", inputMode: "tel", maxLength: 30, placeholder: "(413) 555-0100" })}
      {field("email", "Contact email", { type: "email", maxLength: 200, placeholder: "Shown to friends" })}
      {dirty || status ? (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <p className={`text-xs ${status && status !== "Saved" ? "text-red-700" : "text-yale"}`}>
            {status ?? "Friends see these on your card"}
          </p>
          {dirty ? (
            <button type="submit" disabled={busy} className="zm-press shrink-0 rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-ivory disabled:opacity-50">
              {busy ? "Saving…" : "Save"}
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

/**
 * Same name as in density/ui/state.ts and activities/ui/feed.ts (the shell cannot import module
 * code): fired after the setting changes so the Crowds panel, the map's pinger and the activity
 * card follow, and listened to here so this row follows them.
 */
const SHARING_CHANGED_EVENT = "zoomap:sharing-changed";

/** Location sharing: the same opt-in the Crowds panel toggles, via /api/presence/sharing. */
function LocationSharingRow() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch("/api/presence/sharing", { schema: SharingState })
      .then((s) => setEnabled(s.enabled))
      .catch(() => setError(true));
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<{ enabled?: unknown }>).detail?.enabled;
      if (typeof next === "boolean") setEnabled(next);
    };
    window.addEventListener(SHARING_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(SHARING_CHANGED_EVENT, onChange);
  }, []);

  const toggle = async () => {
    if (enabled === null) return;
    setBusy(true);
    setError(false);
    try {
      const s = await apiFetch("/api/presence/sharing", { method: "PUT", body: { enabled: !enabled }, schema: SharingState });
      setEnabled(s.enabled);
      window.dispatchEvent(new CustomEvent(SHARING_CHANGED_EVENT, { detail: { enabled: s.enabled } }));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Row
      title="Share my location"
      hint={
        error
          ? "Couldn't reach the server. Try again."
          : enabled
            ? "On: you count toward crowd levels and your time at an activity counts. Switch off to stop at once"
            : "Off: you don't count toward crowd levels, and time at an activity won't count. Off until you turn it on"
      }
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
