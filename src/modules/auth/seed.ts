import type { Db } from "mongodb";
import { collectionsOf } from "@/shared/db";
import { seedUsers } from "./seed-users";

/**
 * Five dev users, inserted only when missing so repeated runs change nothing (an existing
 * user keeps their balance and settings). Called by `npm run db:setup`.
 */
export async function seed(db: Db): Promise<void> {
  const { users } = collectionsOf(db);
  for (const user of seedUsers()) {
    await users.updateOne(
      { email: user.email },
      {
        $setOnInsert: {
          _id: user.id,
          email: user.email,
          name: user.name,
          createdAt: new Date(),
          pointsBalance: 0,
          settings: { shareLocation: false },
        },
      },
      { upsert: true },
    );
  }
}
