import { getPlace } from "@/modules/campus";
import { getCollections } from "@/shared/db";

/**
 * "Study group, Du Bois Library" for a ledger reason. Rewards never imports the activities
 * module: it reads the activity's stored title and place straight from the shared
 * collection. Any failure falls back to plain words; a reason is never worth failing an award.
 */
export async function describeActivity(activityId: string): Promise<string> {
  try {
    const { activities } = await getCollections();
    const activity = await activities.findOne({ _id: activityId }, { projection: { title: 1, placeId: 1 } });
    if (!activity) return "an activity";
    const place = await getPlace(activity.placeId);
    return place ? `${activity.title}, ${place.name}` : activity.title;
  } catch {
    return "an activity";
  }
}
