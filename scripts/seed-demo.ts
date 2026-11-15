/**
 * TEMPORARY demo data for trying the UI: friends, live activities, classes and plans, and a
 * few points, for one signed-in user. Not part of `db:setup`; delete this file when done.
 *
 *   npx tsx scripts/seed-demo.ts [email]          add (default dev.alex@<domain>); safe to repeat
 *   npx tsx scripts/seed-demo.ts [email] --remove take it all away again
 *
 * Everything goes through the modules' own functions, so it is what real use would create.
 * Demo people have ids `demo-*`. Activities are kept alive for three hours (the settle rules
 * would otherwise end them after 30 minutes without a location ping).
 */
import { loadEnv } from "./load-env";
loadEnv();

import { createActivity, joinActivity } from "@/modules/activities";
import { searchPlaces } from "@/modules/campus";
import { addFriend, issueFriendCode, removeFriend, sendInvites, updateProfile } from "@/modules/friends";
import { applyEntry, getBalance } from "@/modules/rewards";
import { createConnection, deleteConnection, listConnections } from "@/modules/schedule";
import { env, requireEnv } from "@/shared/config/env";
import type { ActivityCategory, CreateConnectionBody, ProfileUpdateBody, SocialInput } from "@/shared/contracts";
import { closeClient, getCollections } from "@/shared/db";

type User = { id: string; email: string; name: string };

const domain = env().allowedEmailDomains[0] ?? "umass.edu";
const args = process.argv.slice(2);
const remove = args.includes("--remove");
const email = (args.find((a) => !a.startsWith("--")) ?? `dev.alex@${domain}`).toLowerCase();

const PEOPLE: { slug: string; name: string; pronouns: string; socials: SocialInput[] }[] = [
  { slug: "maya", name: "Maya Chen", pronouns: "she/her", socials: [{ kind: "instagram", handle: "maya.c" }, { kind: "snapchat", handle: "mayachen" }] },
  { slug: "jordan", name: "Jordan Rivera", pronouns: "he/him", socials: [{ kind: "instagram", handle: "jriv" }, { kind: "discord", handle: "jordanr" }] },
  { slug: "priya", name: "Priya Patel", pronouns: "she/her", socials: [{ kind: "linkedin", handle: "priyapatel" }] },
  { slug: "sam", name: "Sam Okafor", pronouns: "they/them", socials: [{ kind: "github", handle: "samok" }, { kind: "x", handle: "samokafor" }] },
  { slug: "liam", name: "Liam O'Brien", pronouns: "he/him", socials: [{ kind: "snapchat", handle: "liamob" }] },
  { slug: "ava", name: "Ava Thompson", pronouns: "she/her", socials: [{ kind: "tiktok", handle: "avat" }, { kind: "instagram", handle: "ava.t" }] },
  { slug: "noah", name: "Noah Kim", pronouns: "he/him", socials: [{ kind: "discord", handle: "noahk" }] },
];

const ACTIVITIES: { host: string; guests: string[]; title: string; description: string; place: string; category: ActivityCategory; capacity?: number }[] = [
  { host: "maya", guests: ["priya", "noah"], title: "CS 220 study group", description: "Going over project 3. Bring snacks.", place: "Du Bois", category: "study", capacity: 8 },
  { host: "jordan", guests: ["liam"], title: "Pickup basketball", description: "Half court, all levels.", place: "Recreation Center", category: "sports", capacity: 10 },
  { host: "ava", guests: [], title: "Late lunch at Frank", description: "Grabbing food between classes.", place: "Franklin", category: "food" },
  { host: "sam", guests: [], title: "Board games", description: "Catan and Codenames.", place: "Student Union", category: "social", capacity: 6 },
];

const demoUser = (slug: string): User => ({ id: `demo-${slug}`, email: `demo.${slug}@${domain}`, name: PEOPLE.find((p) => p.slug === slug)!.name });

/** Campus-local YYYY-MM-DD, `days` from today. */
function localDate(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

async function placeId(q: string): Promise<string | undefined> {
  return (await searchPlaces(q, 1))[0]?.id;
}

async function findTarget(): Promise<User> {
  const { users } = await getCollections();
  const doc = await users.findOne({ email });
  if (!doc) throw new Error(`no user ${email}: sign in once first (or run npm run db:setup for the dev users)`);
  return { id: doc._id, email: doc.email, name: doc.name };
}

async function ensurePeople() {
  const { users } = await getCollections();
  for (const p of PEOPLE) {
    const u = demoUser(p.slug);
    await users.updateOne(
      { _id: u.id },
      { $setOnInsert: { email: u.email, name: u.name, createdAt: new Date(), pointsBalance: 0, settings: { shareLocation: false } } },
      { upsert: true },
    );
    const body: ProfileUpdateBody = { pronouns: p.pronouns, socials: p.socials };
    await updateProfile(u, body);
  }
}

async function addAll(target: User) {
  await ensurePeople();

  // friends: the demo person shows a code, the target adds it (mutual at once)
  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  for (const p of PEOPLE) {
    const { code } = await issueFriendCode(demoUser(p.slug), origin);
    await addFriend(target, code);
  }
  console.log(`friends: ${PEOPLE.length}`);

  // activities, hosted and joined by demo people
  const { participations } = await getCollections();
  const endsAt = new Date(Date.now() + 3 * 3_600_000);
  let made = 0;
  for (const a of ACTIVITIES) {
    const where = await placeId(a.place);
    if (!where) {
      console.warn(`  no place matching "${a.place}", skipped`);
      continue;
    }
    try {
      const activity = await createActivity(demoUser(a.host), {
        title: a.title,
        description: a.description,
        placeId: where,
        category: a.category,
        endsAt: endsAt.toISOString(),
        ...(a.capacity ? { capacity: a.capacity } : {}),
      });
      for (const g of a.guests) await joinActivity(demoUser(g), activity.id).catch(() => {});
      // keep them alive until endsAt without location pings
      await participations.updateMany({ activityId: activity.id, status: "active" }, { $set: { lastInRangeAt: endsAt } });
      if (a.host === "maya") await sendInvites(demoUser(a.host), { activityId: activity.id, toUserIds: [target.id] }).catch(() => {});
      made++;
    } catch (error) {
      console.warn(`  ${a.title}: ${error instanceof Error ? error.message : error} (already running?)`);
    }
  }
  console.log(`activities: ${made} started`);

  // calendar: weekly classes and two one-off plans
  const existing = new Set((await listConnections(target.id)).map((c) => c.label));
  const [ilc, lgrt, isb, dubois, frank] = await Promise.all(["ILC", "LGRT", "Integrated Sciences", "Du Bois", "Franklin"].map(placeId));
  const calendar: CreateConnectionBody[] = [
    { provider: "manual", label: "COMPSCI 220", placeId: ilc, room: "S131", days: ["MO", "WE", "FR"], start: "10:10", end: "11:00" },
    { provider: "manual", label: "MATH 235", placeId: lgrt, room: "143", days: ["TU", "TH"], start: "13:00", end: "14:15" },
    { provider: "manual", label: "BIO 151", placeId: isb, room: "135", days: ["MO", "WE"], start: "14:30", end: "15:45" },
    { provider: "plan", label: "Study with Maya", placeId: dubois, date: localDate(0), start: "16:00", end: "18:00" },
    { provider: "plan", label: "Dinner with friends", placeId: frank, date: localDate(1), start: "18:30", end: "19:30" },
  ];
  let added = 0;
  for (const body of calendar) {
    if (existing.has(body.label)) continue;
    const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) as CreateConnectionBody;
    await createConnection(target.id, clean);
    added++;
  }
  console.log(`calendar: ${added} added`);

  // points, so the Points tab has history
  const grants = [
    { n: 1, delta: 120, reason: "Demo: 2 hours at CS 220 study group" },
    { n: 2, delta: 45, reason: "Demo: Pickup basketball" },
    { n: 3, delta: 80, reason: "Demo: Board games" },
  ];
  for (const g of grants) {
    await applyEntry({
      userId: target.id,
      delta: g.delta,
      ruleId: "demo",
      reason: g.reason,
      source: { type: "demo", id: `grant-${g.n}` },
      idempotencyKey: `demo:${target.id}:grant-${g.n}`,
    });
  }
  console.log(`points: balance ${await getBalance(target.id)}`);
}

async function removeAll(target: User) {
  const { users, activities, participations, activity_invites, profiles, friendships, ledger } = await getCollections();
  const ids = PEOPLE.map((p) => demoUser(p.slug).id);

  for (const id of ids) await removeFriend(target.id, id).catch(() => {});
  const acts = await activities.find({ hostId: { $in: ids } }, { projection: { _id: 1 } }).toArray();
  const actIds = acts.map((a) => a._id);
  await activity_invites.deleteMany({ $or: [{ activityId: { $in: actIds } }, { fromUserId: { $in: ids } }] });
  await participations.deleteMany({ $or: [{ activityId: { $in: actIds } }, { userId: { $in: ids } }] });
  await activities.deleteMany({ _id: { $in: actIds } });
  await friendships.deleteMany({ userIds: { $in: ids } });
  await profiles.deleteMany({ _id: { $in: ids } });
  await users.deleteMany({ _id: { $in: ids } });
  console.log(`removed ${ids.length} demo people and ${actIds.length} activities`);

  const labels = new Set(["COMPSCI 220", "MATH 235", "BIO 151", "Study with Maya", "Dinner with friends"]);
  for (const c of await listConnections(target.id)) if (labels.has(c.label)) await deleteConnection(target.id, c.id);
  console.log("removed demo calendar entries");

  // the ledger is append-only: reverse the demo grants instead of deleting them
  const granted = await ledger.find({ userId: target.id, ruleId: "demo" }).toArray();
  const total = granted.reduce((s, e) => s + e.delta, 0);
  if (total > 0) {
    await applyEntry({
      userId: target.id,
      delta: -total,
      ruleId: "demo",
      reason: "Demo points removed",
      source: { type: "demo", id: `reverse-${Date.now()}` },
      idempotencyKey: `demo:${target.id}:reverse-${granted.map((e) => e._id).join(",")}`,
    });
  }
  console.log(`points: balance ${await getBalance(target.id)}`);
}

async function main() {
  requireEnv("MONGODB_URI");
  console.log(`database: ${env().mongodbDb}, user: ${email}`);
  const target = await findTarget();
  await (remove ? removeAll(target) : addAll(target));
  console.log("done");
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message.replace(/mongodb(\+srv)?:\/\/[^\s"']+/g, "mongodb://<hidden>") : String(error);
    console.error(`seed-demo failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(() => closeClient());
