import { redirect } from "next/navigation";
import { env } from "@/shared/config/env";
import { getSessionUser, seedUsers, signIn } from "@/modules/auth";

export const metadata = { title: "Sign in · ZooMap" };

const ERRORS: Record<string, string> = {
  AccessDenied: "That account is not allowed. Sign in with your UMass Google account.",
  Configuration: "Sign-in is not configured on this server.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSessionUser()) redirect("/");
  const { error } = await searchParams;
  const domains = env().allowedEmailDomains;
  const devAuth = env().devAuth;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <header>
        <h1 className="text-3xl font-bold">ZooMap</h1>
        <p className="text-neutral-500">Your campus, live. Sign in with your {domains.map((d) => `@${d}`).join(" or ")} Google account.</p>
      </header>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {ERRORS[error] ?? "Sign-in failed. Try again."}
        </p>
      ) : null}

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
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
                await signIn("dev", { email: u.email, redirectTo: "/" });
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
