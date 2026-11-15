// Notifications module: alerts worked out from time (exams, leave-by, quiet rooms, big events)
// and alerts saved when something happens (an activity nearby, points, someone joined).
// Server-side only.
export { getNotifications } from "./service";
export { getSettings as getAlertSettings, updateSettings as updateAlertSettings, DEFAULT_SETTINGS } from "./settings";
export { markRead as markAlertsRead } from "./store";
export * as fixtures from "./fixtures";
