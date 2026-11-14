import { createHash, randomBytes } from "node:crypto";
import type { SocialInput, SocialKind, SocialLink } from "@/shared/contracts";
import { ApiError } from "@/shared/http";

/**
 * Pure rules for friends: friend codes, contact fields and social links. Server-side only
 * (node:crypto); the UI never builds a link itself.
 */

// ------------------------------------------------------------------ friend codes

/** 32 letters and digits with no look-alikes (no I, O, 0, 1), so a typed code is unambiguous. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 20; // 100 bits

export function newFriendCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (const b of bytes) code += ALPHABET[b & 31];
  return code;
}

/** Upper-case and drop spaces and dashes, so "abcd-efgh ..." and "ABCDEFGH..." are the same code. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, "");
}

export function hashCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}

/** "ABCD-EFGH-JKLM-NPQR-STUV" for showing under the QR. */
export function formatCode(code: string): string {
  return normalizeCode(code).match(/.{1,4}/g)?.join("-") ?? code;
}

/** The friendship id for a pair: both ids sorted and joined, so (a,b) and (b,a) are one document. */
export function friendshipId(a: string, b: string): { id: string; userIds: [string, string] } {
  const userIds: [string, string] = a < b ? [a, b] : [b, a];
  return { id: `${userIds[0]}:${userIds[1]}`, userIds };
}

// ------------------------------------------------------------------ contact fields

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * A phone number in E.164, from what people type: "+44 20 7946 0958", "(413) 555-0100",
 * "413.555.0100". Ten digits without a country code are taken as US/Canada.
 */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  let e164: string;
  if (trimmed.startsWith("+")) e164 = `+${digits}`;
  else if (digits.length === 10) e164 = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith("1")) e164 = `+${digits}`;
  else e164 = `+${digits}`;
  if (!E164.test(e164)) throw new ApiError("BAD_REQUEST", "phone: not a valid phone number");
  return e164;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(input: string): string {
  const email = input.trim().toLowerCase();
  if (email.length > 200 || !EMAIL.test(email)) throw new ApiError("BAD_REQUEST", "contactEmail: not a valid email address");
  return email;
}

// ------------------------------------------------------------------ social links

const HANDLE = /^[A-Za-z0-9._-]{1,40}$/;

/** Where each service's profile lives. Every URL is https and built here, never taken from the user. */
const PROFILE_URL: Record<Exclude<SocialKind, "website">, ((handle: string) => string) | null> = {
  instagram: (h) => `https://www.instagram.com/${h}`,
  x: (h) => `https://x.com/${h}`,
  linkedin: (h) => `https://www.linkedin.com/in/${h}`,
  github: (h) => `https://github.com/${h}`,
  snapchat: (h) => `https://www.snapchat.com/add/${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  discord: null, // usernames have no public profile URL
};

/** The handle in a pasted profile link, e.g. "https://www.instagram.com/umass/" -> "umass". */
function handleFromUrl(kind: SocialKind, raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (kind === "linkedin") return parts[0] === "in" ? (parts[1] ?? null) : null;
  if (kind === "snapchat") return parts[0] === "add" ? (parts[1] ?? null) : null;
  return parts[0] ?? null;
}

/** Validate and normalise one social entry, or 400. Accepts "@handle", "handle" or a pasted profile link. */
export function normalizeSocial(input: SocialInput): { kind: SocialKind; handle: string } {
  const raw = input.handle.trim();
  if (input.kind === "website") {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new ApiError("BAD_REQUEST", "socials: website must be a full https:// link");
    }
    if (url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password || raw.length > 200) {
      throw new ApiError("BAD_REQUEST", "socials: website must be a full https:// link");
    }
    return { kind: "website", handle: url.href };
  }
  let handle = /^https?:\/\//i.test(raw) ? handleFromUrl(input.kind, raw) : raw;
  handle = handle?.replace(/^@/, "") ?? null;
  if (!handle || !HANDLE.test(handle)) {
    throw new ApiError("BAD_REQUEST", `socials: "${input.kind}" needs a username (letters, digits, . _ -)`);
  }
  return { kind: input.kind, handle };
}

/** A stored social entry as an API link. */
export function socialLink(s: { kind: SocialKind; handle: string }): SocialLink {
  if (s.kind === "website") return { kind: s.kind, handle: s.handle, url: s.handle.startsWith("https://") ? s.handle : null };
  const build = PROFILE_URL[s.kind];
  return { kind: s.kind, handle: s.handle, url: build && HANDLE.test(s.handle) ? build(encodeURIComponent(s.handle)) : null };
}
