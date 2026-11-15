import type { AlertKind, AlertSettings, AlertSettingsBody } from "@/shared/contracts";
import { getCollections } from "@/shared/db";
import { inQuietHours } from "./time";

export const DEFAULT_SETTINGS: AlertSettings = {
  nearby: true,
  nearbyRadiusM: 200,
  nearbyCategories: [],
  bigEvents: true,
  exams: true,
  projects: true,
  assignments: false,
  quietRooms: false,
  leaveBy: true,
  leaveByLeadMin: 5,
  updates: true,
  quietHours: { start: "23:00", end: "07:00" },
  hideDetails: false,
  pausedUntil: null,
};

/** Which setting turns each kind on or off. */
export const SETTING_FOR: Record<AlertKind, keyof AlertSettings> = {
  nearby: "nearby",
  "big-event": "bigEvents",
  exam: "exams",
  project: "projects",
  assignment: "assignments",
  "quiet-room": "quietRooms",
  "leave-by": "leaveBy",
  points: "updates",
  activity: "updates",
};

export function kindEnabled(settings: AlertSettings, kind: AlertKind): boolean {
  return settings[SETTING_FOR[kind]] === true;
}

export function isPaused(settings: AlertSettings, now: Date): boolean {
  return settings.pausedUntil !== null && new Date(settings.pausedUntil).getTime() > now.getTime();
}

/** Whether an alert of `kind` may be shown at `at`. */
export function mayAlert(settings: AlertSettings, kind: AlertKind, at: Date): boolean {
  return kindEnabled(settings, kind) && !isPaused(settings, at) && !inQuietHours(at, settings.quietHours);
}

export async function getSettings(userId: string): Promise<AlertSettings> {
  const { notification_settings } = await getCollections();
  const doc = await notification_settings.findOne({ _id: userId });
  if (!doc) return DEFAULT_SETTINGS;
  const { _id, updatedAt, pausedUntil, ...rest } = doc;
  void _id;
  void updatedAt;
  // fields added later fall back to their defaults
  return { ...DEFAULT_SETTINGS, ...rest, pausedUntil: pausedUntil ? pausedUntil.toISOString() : null };
}

export async function updateSettings(userId: string, body: AlertSettingsBody, now = new Date()): Promise<AlertSettings> {
  const next: AlertSettings = { ...(await getSettings(userId)), ...body };
  const { pausedUntil, ...rest } = next;
  const { notification_settings } = await getCollections();
  await notification_settings.replaceOne(
    { _id: userId },
    { ...rest, pausedUntil: pausedUntil ? new Date(pausedUntil) : null, updatedAt: now },
    { upsert: true },
  );
  return next;
}
