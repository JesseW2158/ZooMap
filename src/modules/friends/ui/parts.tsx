"use client";

import { useState } from "react";
import type { ActivityInvite, ActivityMe, Profile, PublicProfile, SocialKind } from "@/shared/contracts";
import { ActivityMe as ActivityMeSchema, ParticipationResult } from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { mapActions } from "@/shared/ui";
import { errorText, refreshFriends, refreshInvites } from "./feed";

/** Small pieces shared by the friends panel, the invite banner and the add page. */

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
    <span style={style} className="flex shrink-0 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-800" aria-hidden>
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

/** Call, email and social buttons. Every href comes from the server (tel:, mailto:, https). */
export function ContactButtons({ profile }: { profile: Profile }) {
  const [copied, setCopied] = useState<string | null>(null);
  const button = "rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800";
  const none = !profile.phone && !profile.email && profile.socials.length === 0;
  return (
    <div className="flex flex-wrap gap-2">
      {profile.phone ? (
        <>
          <a className={button} href={`tel:${profile.phone}`}>
            Call
          </a>
          <a className={button} href={`sms:${profile.phone}`}>
            Text
          </a>
        </>
      ) : null}
      {profile.email ? (
        <a className={button} href={`mailto:${profile.email}`}>
          Email
        </a>
      ) : null}
      {profile.socials.map((s) =>
        s.url ? (
          <a key={`${s.kind}:${s.handle}`} className={button} href={s.url} target="_blank" rel="noopener noreferrer">
            {SOCIAL_LABELS[s.kind]}
          </a>
        ) : (
          <button
            key={`${s.kind}:${s.handle}`}
            type="button"
            className={button}
            onClick={() => {
              void navigator.clipboard?.writeText(s.handle);
              setCopied(s.handle);
            }}
          >
            {SOCIAL_LABELS[s.kind]}: {copied === s.handle ? "copied" : s.handle}
          </button>
        ),
      )}
      {none ? <p className="text-sm text-neutral-500">No contact details shared yet.</p> : null}
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
    <div className={`rounded-xl border border-emerald-300 bg-emerald-50 text-neutral-900 ${compact ? "p-2.5" : "p-3"}`}>
      <div className="flex items-center gap-2">
        <Avatar person={invite.from} size={compact ? 32 : 36} />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">{invite.from.name}</span> invited you to{" "}
          <span className="font-semibold">{invite.activityTitle}</span>
          {invite.placeName ? <span className="text-neutral-600"> at {invite.placeName}</span> : null}
        </p>
      </div>
      {blocking?.activity ? (
        <div className="mt-2 rounded-lg bg-white p-2 text-sm">
          <p>
            You&apos;re in <span className="font-semibold">{blocking.activity.title}</span>.{" "}
            {hosting ? "You're hosting it, so leaving ends it for everyone." : "Leave it and join this one?"}
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={() => accept(true)} className={`rounded-lg px-3 py-1.5 font-medium text-white disabled:opacity-50 ${hosting ? "bg-red-600" : "bg-emerald-600"}`}>
              {hosting ? "End mine and join" : "Leave and join"}
            </button>
            <button type="button" disabled={busy} onClick={() => setBlocking(null)} className="rounded-lg border border-neutral-300 px-3 py-1.5 font-medium">
              Not now
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={busy} onClick={() => accept(false)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Joining…" : "Accept"}
          </button>
          <button type="button" disabled={busy} onClick={decline} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium">
            Decline
          </button>
        </div>
      )}
      {message ? <p className="mt-1 text-sm text-red-600">{message}</p> : null}
    </div>
  );
}
