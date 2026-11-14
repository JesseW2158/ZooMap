import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { env } from "@/shared/config/env";
import { signInCallback } from "./callbacks";
import { seedUsers } from "./seed-users";
import { upsertUser } from "./users";

const SESSION_MAX_AGE_S = 14 * 24 * 60 * 60;

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

  return {
    providers,
    session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_S },
    pages: { signIn: "/signin", error: "/signin" },
    callbacks: {
      signIn: signInCallback,
      async jwt({ token, user, account }) {
        // `user` and `account` are present only on the sign-in itself.
        if (user?.email && account) {
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
