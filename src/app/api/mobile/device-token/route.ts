import { ApiError, apiRoute } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { createDeviceToken } from "@/modules/mobile";

/**
 * POST /api/mobile/device-token : issues a device token, shown once. Cookie auth ONLY: a device
 * token must not be able to mint another. Owner: mobile.
 */
export const POST = apiRoute(
  async (req) => {
    const user = await requireUser(req);
    if (user.via !== "session") throw new ApiError("FORBIDDEN", "Device tokens are issued to a signed-in session only");
    return createDeviceToken(user.id);
  },
  { status: 201 },
);
