import { env } from "@/shared/config/env";

export interface SeedUser {
  id: string;
  email: string;
  name: string;
}

const SLUGS: [slug: string, name: string][] = [
  ["alex", "Alex Dev"],
  ["blair", "Blair Dev"],
  ["casey", "Casey Dev"],
  ["drew", "Drew Dev"],
  ["eli", "Eli Dev"],
];

/**
 * The five dev users: `dev.alex@<domain>` ... with stable ids `seed-alex` ... , so tests
 * and the two-phone demo can name them. `<domain>` is the first of ALLOWED_EMAIL_DOMAINS.
 * They can sign in only through the `dev` provider, which needs DEV_AUTH=1 outside production.
 */
export function seedUsers(domain: string = env().allowedEmailDomains[0] ?? "umass.edu"): SeedUser[] {
  return SLUGS.map(([slug, name]) => ({ id: `seed-${slug}`, email: `dev.${slug}@${domain}`, name }));
}
