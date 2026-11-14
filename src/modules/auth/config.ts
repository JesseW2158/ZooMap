import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { env } from "@/shared/config/env";
import { getDb } from "@/shared/db";
import { signInCallback } from "./callbacks";
import { revokeDeviceTokensOnSignOut } from "./events";
import { consumeHandoffCode } from "./handoff";
import { seedUsers } from "./seed-users";
import { upsertUser } from "./users";

const SESSION_MAX_AGE_S = 14 * 24 * 60 * 60;

async function databaseReachable(): Promise<boolean> {
  try {
    await (await getDb()).command({ ping: 1 });
    return true;
  } catch (error) {
    // name and message only: never the connection string
    const { name, message } = error instanceof Error ? error : { name: "Error", message: String(error) };
    console.error(`[auth] database unreachable during sign-in: ${name}: ${message}`);
    return false;
  }
}

/** Lazy: read at request time, so `next build` needs no secrets and tests can change env. */
function buildConfig(): NextAuthConfig {
  const e = env();
  const providers: NextAuthConfig["providers"] = [
    Google({
      clientId: e.googleClientId,
      clientSecret: e.googleClientSecret,
      authorization: {
        params: {
          scope: "openid email profile", // sign-in never asks for calendar access
          prompt: "select_account",
          // A hint for the account picker only. Enforcement is in the signIn callback.
          ...(e.allowedEmailDomains.length === 1 ? { hd: e.allowedEmailDomains[0] } : {}),
        },
      },
    }),
  ];

  if (e.devAuth) {
    providers.push(
      Credentials({
        id: "dev",
        name: "Dev sign-in",
        credentials: { email: { label: "Seed user email", type: "email" } },
        async authorize(credentials) {
          // Checked again at call time: DEV_AUTH is refused in production no matter how we got here.
          const current = env();
          if (!current.devAuth) return null;
          const email = String(credentials?.email ?? "").trim().toLowerCase();
          const user = seedUsers().find((u) => u.email === email);
          return user ? { id: user.id, email: user.email, name: user.name } : null;
        },
      }),
    );
  }

  // Always registered, production included: the Android shell signs in with a one-time code
  // made by /auth/mobile/done, never with a bare user id. The code is spent inside `authorize`.
  providers.push(
    Credentials({
      id: "handoff",
      name: "App handoff",
      credentials: { code: { type: "text" }, verifier: { type: "text" } },
      async authorize(credentials) {
        return consumeHandoffCode(credentials?.code, credentials?.verifier);
      },
    }),
  );

  return {
    providers,
    session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_S },
    pages: { signIn: "/signin", error: "/signin" },
    events: { signOut: revokeDeviceTokensOnSignOut },
    callbacks: {
      async signIn(params) {
        if (!(await signInCallback(params))) return false;
        // The user is written in `jwt` below, and Auth.js reports any error there as a bare
        // "Configuration". Check the database here so an outage gets its own message.
        if (!(await databaseReachable())) return "/signin?error=Database";
        return true;
      },
      async jwt({ token, user, account }) {
        // `user` and `account` are present only on the sign-in itself.
        if (user?.id && account?.provider === "handoff") {
          // The handoff provider only returns users that already exist: keep their id, create nobody.
          token.uid = user.id;
        } else if (user?.email && account) {
          const doc = await upsertUser({
            email: user.email,
            name: user.name,
            image: user.image,
            id: account.provider === "dev" ? user.id : undefined,
          });
          token.uid = doc._id;
        }
        return token;
      },
      async session({ session, token }) {
        if (token.uid) session.user.id = token.uid;
        return session;
      },
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => buildConfig());
