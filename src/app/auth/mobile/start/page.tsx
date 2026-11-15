import Image from "next/image";
import { redirect } from "next/navigation";
import { env } from "@/shared/config/env";
import { getSessionUser, isValidChallenge, seedUsers, signIn } from "@/modules/auth";

export const metadata = { title: "Sign in · ZooMap" };

/**
 * Opened by the Android app in a Chrome Custom Tab. Signs the person in with the browser's own
 * cookies, then hands off to /auth/mobile/done, which makes the one-time code for the app.
 * `challenge` is base64url(SHA-256(verifier)); the verifier stays in the app.
 */
export default async function MobileStartPage({ searchParams }: { searchParams: Promise<{ challenge?: string }> }) {
  const { challenge } = await searchParams;

  if (!isValidChallenge(challenge)) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <Image src="/logo/minute-map-circle-512.png" alt="" width={40} height={40} priority className="h-10 w-10 rounded-full" />
          ZooMap
        </h1>
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          This sign-in link is not valid. Go back to the ZooMap app and try again.
        </p>
      </main>
    );
  }

  const doneUrl = `/auth/mobile/done?challenge=${challenge}`;
  if (await getSessionUser()) redirect(doneUrl);

  const domains = env().allowedEmailDomains;
  const devAuth = env().devAuth;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <Image src="/logo/minute-map-circle-512.png" alt="" width={40} height={40} priority className="h-10 w-10 rounded-full" />
          ZooMap
        </h1>
        <p className="text-neutral-500">Your campus, live. Sign in with your {domains.map((d) => `@${d}`).join(" or ")} Google account.</p>
      </header>

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: doneUrl });
        }}
      >
        <button type="submit" className="w-full rounded-xl bg-neutral-900 px-4 py-3 font-medium text-white">
          Continue with Google
        </button>
      </form>

      {devAuth ? (
        <section className="space-y-2 rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3">
          <h2 className="text-sm font-semibold text-amber-900">Dev sign-in (DEV_AUTH=1)</h2>
          {seedUsers().map((u) => (
            <form
              key={u.id}
              action={async () => {
                "use server";
                await signIn("dev", { email: u.email, redirectTo: doneUrl });
              }}
            >
              <button type="submit" className="w-full rounded-lg bg-amber-200 px-3 py-2 text-left text-sm">
                {u.name} <span className="text-amber-800">{u.email}</span>
              </button>
            </form>
          ))}
        </section>
      ) : null}
    </main>
  );
}
