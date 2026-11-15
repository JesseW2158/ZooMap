"use client";

import { useState } from "react";
import type { ActivityInvite, ActivityMe, Profile, PublicProfile, SocialKind } from "@/shared/contracts";
import { ActivityMe as ActivityMeSchema, ParticipationResult } from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { mapActions } from "@/shared/ui";
import { errorText, refreshFriends, refreshInvites } from "./feed";
import { ChatIcon, CheckIcon, CloseIcon, GlobeIcon, MailIcon, PhoneIcon, PinIcon } from "./icons";

/** Small pieces shared by the friends panel, the invite banner and the add page. */

/** A stable colour per name, from the app palette, so avatars are told apart at a glance. */
const AVATAR_COLORS = ["#f4a886", "#9fd8b0", "#81c3d7", "#989fce", "#ffe381", "#cec288"];
export function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({ person, size = 40 }: { person: Pick<PublicProfile, "name" | "image">; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initials = person.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const style = { width: size, height: size };
  if (person.image && !broken) {
    // Google profile photos; next/image would need their host configured, and these are tiny.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={person.image} alt="" style={style} referrerPolicy="no-referrer" onError={() => setBroken(true)} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <span style={{ ...style, backgroundColor: avatarColor(person.name) }} className="flex shrink-0 items-center justify-center rounded-full font-bold text-ink" aria-hidden>
      <span style={{ fontSize: size * 0.4 }}>{initials || "?"}</span>
    </span>
  );
}

export const SOCIAL_LABELS: Record<SocialKind, string> = {
  instagram: "Instagram",
  x: "X",
  linkedin: "LinkedIn",
  github: "GitHub",
  snapchat: "Snapchat",
  tiktok: "TikTok",
  discord: "Discord",
  website: "Website",
};

/** Short marks for each service, shown inside a round button (brand logos are not ours to draw). */
const SOCIAL_MARKS: Record<Exclude<SocialKind, "website">, string> = {
  instagram: "IG",
  x: "X",
  linkedin: "in",
  github: "GH",
  snapchat: "SC",
  tiktok: "TT",
  discord: "DC",
};
function SocialMark({ kind }: { kind: SocialKind }) {
  return kind === "website" ? <GlobeIcon className="h-5 w-5" /> : <span className="text-xs font-extrabold">{SOCIAL_MARKS[kind]}</span>;
}

const round =
  "flex h-11 w-11 items-center justify-center rounded-full bg-linen text-ink transition-colors hover:bg-ash/50 focus-visible:outline-2 focus-visible:outline-ink";

function Action({ label, children, ...rest }: { label: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...rest} aria-label={label} title={label} className="flex w-12 flex-col items-center gap-1 text-[10px] font-medium text-yale">
      <span className={round}>{children}</span>
      {label}
    </a>
  );
}

/** Call, text, email and social buttons as symbols. Every href comes from the server (tel:, mailto:, https). */
export function ContactButtons({ profile }: { profile: Profile }) {
  const [copied, setCopied] = useState<string | null>(null);
  const none = !profile.phone && !profile.email && profile.socials.length === 0;
  if (none) return <p className="text-sm text-yale">No contact details shared yet.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {profile.phone ? (
        <>
          <Action label="Call" href={`tel:${profile.phone}`}>
            <PhoneIcon className="h-5 w-5" />
          </Action>
          <Action label="Text" href={`sms:${profile.phone}`}>
            <ChatIcon className="h-5 w-5" />
          </Action>
        </>
      ) : null}
      {profile.email ? (
        <Action label="Email" href={`mailto:${profile.email}`}>
          <MailIcon className="h-5 w-5" />
        </Action>
      ) : null}
      {profile.socials.map((s) =>
        s.url ? (
          <Action key={`${s.kind}:${s.handle}`} label={SOCIAL_LABELS[s.kind]} href={s.url} target="_blank" rel="noopener noreferrer">
            <SocialMark kind={s.kind} />
          </Action>
        ) : (
          <button
            key={`${s.kind}:${s.handle}`}
            type="button"
            title={`Copy ${s.handle}`}
            onClick={() => {
              void navigator.clipboard?.writeText(s.handle);
              setCopied(s.handle);
            }}
            className="flex w-12 flex-col items-center gap-1 text-[10px] font-medium text-yale"
          >
            <span className={round}>
              {copied === s.handle ? <CheckIcon className="h-4 w-4" /> : <SocialMark kind={s.kind} />}
            </span>
            {copied === s.handle ? "Copied" : SOCIAL_LABELS[s.kind]}
          </button>
        ),
      )}
    </div>
  );
}

/**
 * One pending invite with Accept and Decline. If you're already in another activity, accepting
 * asks first and then leaves it (a host is warned that leaving ends theirs for everyone).
 */
export function InviteCard({ invite, compact = false }: { invite: ActivityInvite; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<ActivityMe | null>(null);

  const accept = async (leaveCurrent: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      const joined = await apiFetch(`/api/friends/invites/${invite.id}/accept`, {
        method: "POST",
        body: leaveCurrent ? { leaveCurrent: true } : {},
        schema: ParticipationResult,
      });
      if (joined.activity.placeCenter) {
        mapActions.selectPlace(joined.activity.placeId);
        mapActions.flyTo(joined.activity.placeCenter);
      }
      await refreshFriends();
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.code === "ALREADY_IN_ACTIVITY" && !leaveCurrent) {
        setBlocking(await apiFetch("/api/activities/me", { schema: ActivityMeSchema }).catch(() => null));
      } else {
        setMessage(errorText(cause));
      }
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/friends/invites/${invite.id}/decline`, { method: "POST" });
      await refreshInvites();
    } catch (cause) {
      setMessage(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const hosting = blocking?.participation?.role === "host";
  return (
    <div className={`rounded-2xl bg-white text-ink shadow-sm ring-1 ring-ink/10 ${compact ? "p-2.5" : "p-3"}`}>
      <div className="flex items-center gap-3">
        <span className="relative">
          <Avatar person={invite.from} size={compact ? 36 : 44} />
          <span aria-hidden className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose text-ink ring-2 ring-white">
            <MailIcon className="h-3 w-3" />
          </span>
        </span>
        <p className="min-w-0 flex-1 text-sm leading-snug">
          <span className="font-semibold">{invite.from.name.split(" ")[0]}</span>
          <span className="text-yale"> invited you</span>
          <span className="block truncate font-semibold">{invite.activityTitle}</span>
          {invite.placeName ? <span className="flex items-center gap-1 truncate text-xs text-yale"><PinIcon className="h-3 w-3 shrink-0" />{invite.placeName}</span> : null}
        </p>
        {!blocking?.activity ? (
          <span className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={decline}
              aria-label="Decline"
              title="Decline"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-linen text-yale hover:bg-ash/50 disabled:opacity-50"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => accept(false)}
              aria-label="Accept"
              title="Accept"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-ivory hover:bg-yale disabled:opacity-50"
            >
              <CheckIcon className="h-5 w-5" />
            </button>
          </span>
        ) : null}
      </div>
      {blocking?.activity ? (
        <div className="mt-2 rounded-xl bg-linen p-2.5 text-sm">
          <p>
            You&apos;re in <span className="font-semibold">{blocking.activity.title}</span>.{" "}
            {hosting ? "Leaving ends it for everyone." : "Switch to this one?"}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => accept(true)}
              className={`rounded-full px-3.5 py-1.5 font-semibold text-white disabled:opacity-50 ${hosting ? "bg-red-600" : "bg-ink"}`}
            >
              {hosting ? "End mine & join" : "Switch"}
            </button>
            <button type="button" disabled={busy} onClick={() => setBlocking(null)} className="rounded-full bg-white px-3.5 py-1.5 font-medium">
              Not now
            </button>
          </div>
        </div>
      ) : null}
      {message ? <p className="mt-1 text-sm text-red-600">{message}</p> : null}
    </div>
  );
}
