import { getCollections, isDuplicateKeyError, newId } from "@/shared/db";
import type { UserDoc } from "@/shared/contracts";

/**
 * Creates the user on first sign-in, refreshes name and image on later ones. Location
 * sharing starts off. Two simultaneous first sign-ins race on the unique email index; the
 * loser reads the winner's document.
 */
export async function upsertUser(input: {
  email: string;
  name?: string | null;
  image?: string | null;
  /** Fixed id for seed users; everyone else gets a fresh one. */
  id?: string;
}): Promise<UserDoc> {
  const { users } = await getCollections();
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || email.split("@")[0];
  const set: Partial<UserDoc> = { name };
  if (input.image) set.image = input.image;

  const run = () =>
    users.findOneAndUpdate(
      { email },
      {
        $set: set,
        $setOnInsert: {
          _id: input.id ?? newId(),
          email,
          createdAt: new Date(),
          pointsBalance: 0,
          settings: { shareLocation: false },
        },
      },
      { upsert: true, returnDocument: "after" },
    );

  try {
    const doc = await run();
    if (doc) return doc;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const existing = await users.findOne({ email });
    if (existing) return existing;
    throw error;
  }
  throw new Error("upsertUser: the database returned no document");
}
