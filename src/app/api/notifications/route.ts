import { apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { getNotifications } from "@/modules/notifications";

/**
 * GET /api/notifications : your inbox, the alerts due in the next 24 hours (for the device to
 * fire on time) and your alert settings. Polling this is what delivers time-based alerts.
 * Owner: notifications.
 */
export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  return getNotifications(user.id);
});
