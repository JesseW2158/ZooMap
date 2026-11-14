import { redirect } from "next/navigation";
import { getSessionUser } from "@/modules/auth";
import { AddFriendView } from "./AddFriendView";

export const metadata = { title: "Add friend · ZooMap" };

/**
 * What a scanned friend code opens: /add/<code>. Signed out, it goes through sign-in and
 * comes back here (`?next=`). It does not load the map, so it opens fast from a camera scan.
 * Owner: friends.
 */
export default async function AddFriendPage({ params }: PageProps<"/add/[code]">) {
  const { code } = await params;
  const clean = code.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);
  if (!(await getSessionUser())) redirect(`/signin?next=${encodeURIComponent(`/add/${clean}`)}`);
  return <AddFriendView code={clean} />;
}
