"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { InviteResult, Profile, SocialKind, type Friend, type Profile as ProfileT, type SocialInput } from "@/shared/contracts";
import { apiFetch } from "@/shared/http/client";
import { errorText, refreshFriends, setMyProfile, useFriendsFeed } from "./feed";
import { MyCodeOverlay, ScanOverlay } from "./overlays";
import { Avatar, ContactButtons, InviteCard, SOCIAL_LABELS } from "./parts";

/**
 * Friends: your profile, your QR code, Scan, pending invites, and your friends. There is no
 * search: the only way to add someone is their code.
 */
export function FriendsPanel() {
  const { me, friends, invites, current, error } = useFriendsFeed();
  const [overlay, setOverlay] = useState<"code" | "scan" | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    void refreshFriends();
  }, []);

  return (
    <div className="space-y-4 text-sm text-neutral-900">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setOverlay("code")} className="rounded-xl bg-emerald-600 px-3 py-3 font-semibold text-white">
          My code
        </button>
        <button type="button" onClick={() => setOverlay("scan")} className="rounded-xl border border-emerald-600 px-3 py-3 font-semibold text-emerald-700">
          Scan
        </button>
      </div>

      {error ? <p className="text-red-600">{error}</p> : null}

      {me ? (
        editing ? (
          <ProfileEditor me={me} onDone={() => setEditing(false)} />
        ) : (
          <section className="rounded-2xl border border-neutral-200 p-3">
            <div className="flex items-center gap-3">
              <Avatar person={me} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{me.name}</p>
                <p className="text-neutral-500">{me.pronouns ?? "Add your pronouns"}</p>
              </div>
              <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-neutral-300 px-3 py-1.5 font-medium">
                Edit
              </button>
            </div>
            <p className="mt-2 text-xs text-neutral-500">Friends see your phone, email and socials. Someone scanning your code sees only your name, photo and pronouns.</p>
          </section>
        )
      ) : null}

      {invites.length ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Invites</h2>
          {invites.map((invite) => (
            <InviteCard key={invite.id} invite={invite} />
          ))}
        </section>
      ) : null}

      <FriendsList friends={friends} current={current?.participation ? current.activity : null} />

      {overlay === "code" ? <MyCodeOverlay me={me} onClose={() => setOverlay(null)} /> : null}
      {overlay === "scan" ? <ScanOverlay onClose={() => setOverlay(null)} /> : null}
    </div>
  );
}

function FriendsList({ friends, current }: { friends: Friend[] | null; current: { id: string; title: string } | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const invite = async () => {
    if (!current || picked.size === 0) return;
    setSending(true);
    setResult(null);
    try {
      const r = await apiFetch("/api/friends/invites", {
        method: "POST",
        body: { activityId: current.id, toUserIds: [...picked] },
        schema: InviteResult,
      });
      const name = (id: string) => friends?.find((f) => f.userId === id)?.name ?? "someone";
      const notes = r.skipped.map((s) =>
        s.reason === "already_in_activity" ? `${name(s.userId)} is already there` : s.reason === "already_invited" ? `${name(s.userId)} was already invited` : `${name(s.userId)} was skipped`,
      );
      setResult([r.sent.length ? `Invited ${r.sent.length} to ${current.title}.` : "No new invites sent.", ...notes].join(" "));
      setPicked(new Set());
    } catch (cause) {
      setResult(errorText(cause));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">Friends{friends ? ` (${friends.length})` : ""}</h2>
      {friends === null ? <p className="text-neutral-500">Loading…</p> : null}
      {friends?.length === 0 ? <p className="text-neutral-500">No friends yet. Show your code to someone, or scan theirs.</p> : null}
      {current && friends?.length ? (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-2">
          <p className="min-w-0 flex-1">
            Invite friends to <span className="font-semibold">{current.title}</span>
          </p>
          <button type="button" disabled={sending || picked.size === 0} onClick={invite} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white disabled:opacity-50">
            {sending ? "Sending…" : `Invite${picked.size ? ` ${picked.size}` : ""}`}
          </button>
        </div>
      ) : null}
      {result ? <p className="text-neutral-700">{result}</p> : null}
      <ul className="space-y-2">
        {friends?.map((f) => (
          <li key={f.userId} className="rounded-xl border border-neutral-200 p-2.5">
            <div className="flex items-center gap-3">
              {current ? (
                <input
                  type="checkbox"
                  aria-label={`Invite ${f.name}`}
                  checked={picked.has(f.userId)}
                  onChange={(e) =>
                    setPicked((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(f.userId);
                      else next.delete(f.userId);
                      return next;
                    })
                  }
                  className="h-5 w-5 accent-emerald-600"
                />
              ) : null}
              <button type="button" onClick={() => setOpen(open === f.userId ? null : f.userId)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar person={f} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{f.name}</span>
                  {f.pronouns ? <span className="block text-neutral-500">{f.pronouns}</span> : null}
                </span>
                <span className="text-neutral-400" aria-hidden>
                  {open === f.userId ? "▴" : "▾"}
                </span>
              </button>
            </div>
            {open === f.userId ? (
              <div className="mt-2 space-y-2 border-t border-neutral-100 pt-2">
                <ContactButtons profile={f} />
                <p className="text-xs text-neutral-500">Friends since {new Date(f.since).toLocaleDateString()}</p>
                <UnfriendButton friend={f} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Two taps to unfriend: the first arms the button for a few seconds. */
function UnfriendButton({ friend }: { friend: Friend }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const tap = async () => {
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/friends/${friend.userId}`, { method: "DELETE" });
      await refreshFriends();
    } finally {
      setBusy(false);
      setArmed(false);
    }
  };

  return (
    <button type="button" disabled={busy} onClick={tap} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${armed ? "bg-red-600 text-white" : "border border-red-300 text-red-700"}`}>
      {armed ? `Tap again to unfriend ${friend.name.split(" ")[0]}` : "Unfriend"}
    </button>
  );
}

const SOCIAL_HINTS: Record<SocialInput["kind"], string> = {
  instagram: "username",
  x: "username",
  linkedin: "profile name (linkedin.com/in/…)",
  github: "username",
  snapchat: "username",
  tiktok: "username",
  discord: "username",
  website: "https://…",
};

function ProfileEditor({ me, onDone }: { me: ProfileT; onDone: () => void }) {
  const [pronouns, setPronouns] = useState(me.pronouns ?? "");
  const [phone, setPhone] = useState(me.phone ?? "");
  const [email, setEmail] = useState(me.email ?? "");
  const [socials, setSocials] = useState<SocialInput[]>(me.socials.map((s) => ({ kind: s.kind, handle: s.handle })));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const saved = await apiFetch("/api/profile/me", {
        method: "PUT",
        schema: Profile,
        body: {
          pronouns: pronouns.trim() || null,
          phone: phone.trim() || null,
          contactEmail: email.trim() || null,
          socials: socials.filter((s) => s.handle.trim()),
        },
      });
      setMyProfile(saved);
      onDone();
    } catch (cause) {
      setMessage(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900";
  return (
    <form onSubmit={save} className="space-y-3 rounded-2xl border border-neutral-200 p-3">
      <div className="flex items-center gap-3">
        <Avatar person={me} size={40} />
        <p className="min-w-0 flex-1 truncate font-semibold">{me.name}</p>
        <button type="button" onClick={onDone} className="text-neutral-500 underline">
          Cancel
        </button>
      </div>
      <p className="text-xs text-neutral-500">Your name and photo come from your Google account.</p>
      <label className="block space-y-1">
        <span className="font-medium">Pronouns</span>
        <input maxLength={40} value={pronouns} onChange={(e) => setPronouns(e.target.value)} className={input} placeholder="she/her, they/them…" />
      </label>
      <label className="block space-y-1">
        <span className="font-medium">Phone</span>
        <input type="tel" inputMode="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} className={input} placeholder="(413) 555-0100" />
      </label>
      <label className="block space-y-1">
        <span className="font-medium">Contact email</span>
        <input type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="Shown to friends" />
      </label>
      <fieldset className="space-y-2">
        <legend className="font-medium">Social links</legend>
        {socials.map((s, i) => (
          <div key={i} className="flex gap-2">
            <select
              value={s.kind}
              onChange={(e) => setSocials((all) => all.map((x, j) => (j === i ? { ...x, kind: e.target.value as SocialInput["kind"] } : x)))}
              className="rounded-lg border border-neutral-300 bg-white px-2 py-2"
              aria-label="Service"
            >
              {SocialKind.options.map((k) => (
                <option key={k} value={k}>
                  {SOCIAL_LABELS[k]}
                </option>
              ))}
            </select>
            <input
              value={s.handle}
              maxLength={200}
              onChange={(e) => setSocials((all) => all.map((x, j) => (j === i ? { ...x, handle: e.target.value } : x)))}
              className={`${input} min-w-0 flex-1`}
              placeholder={SOCIAL_HINTS[s.kind]}
              aria-label={`${SOCIAL_LABELS[s.kind]} ${SOCIAL_HINTS[s.kind]}`}
            />
            <button type="button" onClick={() => setSocials((all) => all.filter((_, j) => j !== i))} className="px-2 text-neutral-500" aria-label="Remove">
              ✕
            </button>
          </div>
        ))}
        {socials.length < 8 ? (
          <button type="button" onClick={() => setSocials((all) => [...all, { kind: "instagram", handle: "" }])} className="font-medium text-emerald-700">
            + Add a link
          </button>
        ) : null}
      </fieldset>
      {message ? <p className="text-red-600">{message}</p> : null}
      <button type="submit" disabled={busy} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
