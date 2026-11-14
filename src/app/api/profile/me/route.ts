import { ProfileUpdateBody } from "@/shared/contracts";
import { apiRoute, parseBody } from "@/shared/http";
import { requireUser } from "@/modules/auth";
import { getMyProfile, updateProfile } from "@/modules/friends";

/** GET /api/profile/me : your full profile. Owner: friends. */
export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  return getMyProfile(user);
});

/** PUT /api/profile/me : update pronouns, phone, contact email and socials. Owner: friends. */
export const PUT = apiRoute(async (req) => {
  const user = await requireUser(req);
  return updateProfile(user, await parseBody(req, ProfileUpdateBody));
});
