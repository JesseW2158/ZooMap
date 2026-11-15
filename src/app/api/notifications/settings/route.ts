import { AlertSettingsBody } from "@/shared/contracts";
import { apiRoute, parseBody } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { updateAlertSettings } from "@/modules/notifications";

/** PUT /api/notifications/settings : change any alert setting; omitted fields stay. Owner: notifications. */
export const PUT = apiRoute(async (req) => {
  const user = await requireUser(req);
  return updateAlertSettings(user.id, await parseBody(req, AlertSettingsBody));
});
