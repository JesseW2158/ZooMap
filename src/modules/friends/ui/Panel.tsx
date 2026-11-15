"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { InviteResult, Profile, SocialKind, type Friend, type Profile as ProfileT, type SocialInput } from "@/shared/contracts";
import { apiFetch } from "@/shared/http/client";
import { errorText, refreshFriends, setMyProfile, useFriendsFeed } from "./feed";
import { MyCodeOverlay, ScanOverlay } from "./overlays";
import { ChatIcon, CheckIcon, CloseIcon, HeartIcon, MailIcon, PencilIcon, QrIcon, ScanIcon, SendIcon, UserMinusIcon, UserPlusIcon, UsersIcon } from "./icons";
import { Avatar, ContactButtons, InviteCard, SOCIAL_LABELS } from "./parts";

/**
 * Friends: you (with your code, Scan and Edit as symbols), pending invites, and your friends as
 * a chat-style list. There is no search: the only way to add someone is their code. Direct
 * messages have their own tab (`MessagesPanel`).
 */
export function FriendsPanel() {
  const { me, friends, invites, current, error } = useFriendsFeed();
  const [overlay, setOverlay] = useState<"code" | "scan" | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    void refreshFriends();
  }, []);

  return (
    <div className="space-y-5 text-sm text-ink">
      {me && editing ? (
        <ProfileEditor me={me} onDone={() => setEditing(false)} />
      ) : (
        <section className="flex items-center gap-3">
          {me ? (
            <span className="rounded-full p-0.5 ring-2 ring-rose">
              <Avatar person={me} size={52} />
            </span>
          ) : (
            <span className="h-14 w-14 animate-pulse rounded-full bg-linen" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold">{me?.name ?? " "}</p>
            <p className="truncate text-yale">{me?.pronouns ?? (me ? "Add pronouns" : "")}</p>
          </div>
          <RoundButton label="My code" onClick={() => setOverlay("code")} primary>
            <QrIcon className="h-5 w-5" />
          </RoundButton>
          <RoundButton label="Scan" onClick={() => setOverlay("scan")}>
            <ScanIcon className="h-5 w-5" />
          </RoundButton>
          {me ? (
            <RoundButton label="Edit" onClick={() => setEditing(true)}>
              <PencilIcon className="h-5 w-5" />
            </RoundButton>
          ) : null}
        </section>
      )}

      {error ? <p className="text-red-600">{error}</p> : null}

      {invites.length ? (
        <section className="space-y-2">
          <SectionLabel Icon={MailIcon} text="Invites" count={invites.length} />
          {invites.map((invite) => (
            <InviteCard key={invite.id} invite={invite} />
          ))}
        </section>
      ) : null}

      <FriendsList
        friends={friends}
        current={current?.participation ? current.activity : null}
        onAdd={() => setOverlay("code")}
        onScan={() => setOverlay("scan")}
      />

      {overlay === "code" ? <MyCodeOverlay me={me} onClose={() => setOverlay(null)} /> : null}
      {overlay === "scan" ? <ScanOverlay onClose={() => setOverlay(null)} /> : null}
    </div>
  );
}

function RoundButton({ label, onClick, primary = false, children }: { label: string; onClick: () => void; primary?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
        primary ? "bg-ink text-ivory hover:bg-yale" : "bg-linen text-ink hover:bg-ash/50"
      }`}
    >
      {children}
    </button>
  );
}

function SectionLabel({ Icon, text, count }: { Icon: (p: { className?: string }) => ReactNode; text: string; count?: number }) {
  return (
    <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-yale">
      <Icon className="h-4 w-4" />
      {text}
      {count !== undefined ? <span className="rounded-full bg-linen px-2 py-0.5 text-[11px] text-ink">{count}</span> : null}
    </h2>
  );
}

function FriendsList({
  friends,
  current,
  onAdd,
  onScan,
}: {
  friends: Friend[] | null;
  current: { id: string; title: string } | null;
  onAdd: () => void;
  onScan: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const choosing = selecting && !!current;

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
      const name = (id: string) => friends?.find((f) => f.userId === id)?.name.split(" ")[0] ?? "someone";
      const notes = r.skipped.map((s) =>
        s.reason === "already_in_activity" ? `${name(s.userId)} is already there` : s.reason === "already_invited" ? `${name(s.userId)} was already invited` : `${name(s.userId)} was skipped`,
      );
      setResult([r.sent.length ? `Sent ${r.sent.length} ${r.sent.length === 1 ? "invite" : "invites"}.` : "No new invites.", ...notes].join(" "));
      setPicked(new Set());
      setSelecting(false);
    } catch (cause) {
      setResult(errorText(cause));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel Icon={UsersIcon} text="Friends" count={friends?.length} />
        {current && friends?.length ? (
          <button
            type="button"
            onClick={() => {
              setSelecting((x) => !x);
              setPicked(new Set());
              setResult(null);
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${choosing ? "bg-linen text-ink" : "bg-rose text-ink"}`}
          >
            {choosing ? (
              "Cancel"
            ) : (
              <>
                <SendIcon className="h-3.5 w-3.5" /> Invite
              </>
            )}
          </button>
        ) : null}
      </div>

      {friends === null ? (
        <ul className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 py-1">
              <span className="h-11 w-11 animate-pulse rounded-full bg-linen" />
              <span className="h-3 w-32 animate-pulse rounded bg-linen" />
            </li>
          ))}
        </ul>
      ) : null}

      {friends?.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-linen px-4 py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose text-ink" aria-hidden>
            <UserPlusIcon className="h-7 w-7" />
          </span>
          <p className="font-semibold">Add your first friend</p>
          <div className="flex gap-2">
            <button type="button" onClick={onAdd} className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 font-semibold text-ivory">
              <QrIcon className="h-4 w-4" /> My code
            </button>
            <button type="button" onClick={onScan} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 font-semibold">
              <ScanIcon className="h-4 w-4" /> Scan
            </button>
          </div>
        </div>
      ) : null}

      {result ? <p className="rounded-xl bg-linen px-3 py-2 text-ink">{result}</p> : null}

      <ul className="-mx-2">
        {friends?.map((f) => {
          const isOpen = open === f.userId && !choosing;
          const isPicked = picked.has(f.userId);
          return (
            <li key={f.userId} className={`rounded-2xl px-2 transition-colors ${isOpen ? "bg-linen/70" : ""}`}>
              <button
                type="button"
                aria-expanded={choosing ? undefined : isOpen}
                aria-pressed={choosing ? isPicked : undefined}
                onClick={() => (choosing ? toggle(f.userId) : setOpen(isOpen ? null : f.userId))}
                className="flex w-full items-center gap-3 py-2 text-left"
              >
                <span className="relative">
                  <Avatar person={f} size={44} />
                  {choosing ? (
                    <span
                      aria-hidden
                      className={`absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white ${isPicked ? "bg-ink text-ivory" : "bg-white text-transparent ring-ash"}`}
                    >
                      <CheckIcon className="h-3 w-3" />
                    </span>
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{f.name}</span>
                  {f.pronouns ? <span className="block truncate text-xs text-yale">{f.pronouns}</span> : null}
                </span>
                {!choosing && f.phone ? (
                  <a
                    href={`sms:${f.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Text ${f.name}`}
                    title="Text"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-yale hover:bg-linen"
                  >
                    <ChatIcon className="h-5 w-5" />
                  </a>
                ) : null}
              </button>
              {isOpen ? (
                <div className="space-y-3 pb-3 pl-14">
                  <ContactButtons profile={f} />
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1 text-xs text-yale"><HeartIcon className="h-3.5 w-3.5" />since {new Date(f.since).toLocaleDateString([], { month: "short", year: "numeric" })}</p>
                    <UnfriendButton friend={f} />
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {choosing ? (
        <div className="sticky bottom-2 flex items-center gap-2 rounded-full bg-ink p-1.5 pl-4 text-ivory shadow-lg">
          <p className="min-w-0 flex-1 truncate text-sm">
            {picked.size ? `${picked.size} selected` : "Pick friends"} · <span className="font-semibold">{current!.title}</span>
          </p>
          <button
            type="button"
            disabled={sending || picked.size === 0}
            onClick={invite}
            aria-label="Send invites"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-rose text-ink disabled:opacity-40"
          >
            <SendIcon className="h-5 w-5" />
          </button>
        </div>
      ) : null}
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
    <button
      type="button"
      disabled={busy}
      onClick={tap}
      aria-label={`Unfriend ${friend.name}`}
      title="Unfriend"
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${armed ? "bg-red-600 text-white" : "text-red-700 hover:bg-red-50"}`}
    >
      <UserMinusIcon className="h-4 w-4" />
      {armed ? "Tap again" : null}
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

  const input = "w-full rounded-xl border-0 bg-linen px-3 py-2.5 text-ink placeholder:text-yale/50 focus:outline-2 focus:outline-ink";
  return (
    <form onSubmit={save} className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar person={me} size={40} />
        <p className="min-w-0 flex-1 truncate font-semibold">{me.name}</p>
        <button type="button" onClick={onDone} className="rounded-full bg-linen px-3 py-1.5 font-medium">
          Cancel
        </button>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-yale">Pronouns</span>
        <input maxLength={40} value={pronouns} onChange={(e) => setPronouns(e.target.value)} className={input} placeholder="she/her, they/them…" />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-yale">Phone</span>
        <input type="tel" inputMode="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} className={input} placeholder="(413) 555-0100" />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-yale">Contact email</span>
        <input type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="Shown to friends" />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-yale">Social links</legend>
        {socials.map((s, i) => (
          <div key={i} className="flex gap-2">
            <select
              value={s.kind}
              onChange={(e) => setSocials((all) => all.map((x, j) => (j === i ? { ...x, kind: e.target.value as SocialInput["kind"] } : x)))}
              className="rounded-xl border-0 bg-linen px-2 py-2.5"
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
            <button type="button" onClick={() => setSocials((all) => all.filter((_, j) => j !== i))} className="px-2 text-yale" aria-label="Remove">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
        {socials.length < 8 ? (
          <button type="button" onClick={() => setSocials((all) => [...all, { kind: "instagram", handle: "" }])} className="font-semibold text-ink">
            + Add a link
          </button>
        ) : null}
      </fieldset>
      {message ? <p className="text-red-600">{message}</p> : null}
      <button type="submit" disabled={busy} className="w-full rounded-full bg-ink px-4 py-3 font-semibold text-ivory disabled:opacity-50">
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
