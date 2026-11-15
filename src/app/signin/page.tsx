import Image from "next/image";
import { redirect } from "next/navigation";
import { env } from "@/shared/config/env";
import { getSessionUser, seedUsers, signIn } from "@/modules/auth";
// eslint-disable-next-line no-restricted-imports -- client-only component; the module index is server code
import { ShellSignIn } from "@/modules/mobile/ui/ShellSignIn";

export const metadata = { title: "Sign in · ZooMap" };

const ERRORS: Record<string, string> = {
  AccessDenied: "That account is not allowed. Sign in with your UMass Google account.",
  Database: "Could not reach the database, so sign-in could not finish. Try again in a minute.",
  Configuration: "Sign-in failed on the server. The server log has the cause.",
};

/**
 * Where to go after signing in: `?next=` when it is a path on this site (for example a scanned
 * friend code's /add/<code>), otherwise the map. Anything that could leave the site ("//evil",
 * "https://...", "/\\evil") falls back to "/".
 */
function safeNext(next: string | undefined): string {
  if (!next || next.length > 200 || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next: rawNext } = await searchParams;
  const next = safeNext(rawNext);
  if (await getSessionUser()) redirect(next);
  const domains = env().allowedEmailDomains;
  const devAuth = env().devAuth;
  const googleReady = Boolean(env().googleClientId && env().googleClientSecret);

  return (
    <main className="relative min-h-dvh overflow-hidden bg-gradient-to-br from-ink via-ink to-yale text-ivory">
      {/* decoration: drifting glows in the section colours, a dot grid and a few map-like contour rings */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="animate-drift absolute -left-24 -top-24 h-96 w-96 rounded-full bg-coral/30 blur-3xl" />
        <div className="animate-drift absolute -bottom-32 -right-20 h-[28rem] w-[28rem] rounded-full bg-sky/25 blur-3xl [animation-delay:-7s]" />
        <div className="animate-drift absolute right-1/4 top-1/3 h-64 w-64 rounded-full bg-jasmine/15 blur-3xl [animation-delay:-3s]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgb(244_249_233/0.08)_1px,transparent_1.2px)] [background-size:22px_22px]" />
        <svg className="absolute -right-40 top-10 h-[36rem] w-[36rem] text-ivory/[0.06]" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="0.6">
          {[20, 36, 52, 68, 84, 98].map((r) => (
            <ellipse key={r} cx="100" cy="100" rx={r} ry={r * 0.82} transform={`rotate(${r} 100 100)`} />
          ))}
        </svg>
      </div>

      <div className="relative mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
        <header className="animate-rise">
          <Image
            src="/logo/minute-map-circle-512.png"
            alt=""
            width={64}
            height={64}
            priority
            className="mb-5 h-16 w-16 rounded-full shadow-lg shadow-black/30 ring-4 ring-ivory/10"
          />
          <h1 className="text-4xl font-extrabold tracking-tight">
            Zoo<span className="text-jasmine">Map</span>
          </h1>
          <p className="mt-2 text-ivory/70">Your campus, live. Sign in with your {domains.map((d) => `@${d}`).join(" or ")} Google account.</p>
        </header>

        {error ? (
          <p role="alert" className="animate-pop rounded-xl bg-red-50 p-3 text-sm text-red-700 shadow-md">
            {ERRORS[error] ?? "Sign-in failed. Try again."}
          </p>
        ) : null}

        <div className="zm-stagger flex flex-col gap-4">
        <ShellSignIn>
        {/* TEMPORARY local bypass (not committed): one tap into the demo user, whose sample classes are loaded. */}
        {devAuth ? (
          <form
            action={async () => {
              "use server";
              await signIn("dev", { email: "dev.alex@umass.edu", redirectTo: next });
            }}
          >
            <button type="submit" className="zm-press group relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#a12424] to-[#6f1616] px-5 py-4 text-left text-white shadow-lg shadow-black/30 ring-1 ring-white/10 hover:shadow-xl">
              <span aria-hidden className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10 transition-transform duration-500 group-hover:scale-150" />
              <span className="relative block text-lg font-semibold">Skip sign-in (demo)</span>
              <span className="relative block text-sm text-white/80">Continue as Alex, with a sample class schedule loaded</span>
            </button>
          </form>
        ) : null}

        {googleReady ? (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: next });
            }}
          >
            <button type="submit" className="zm-press flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-4 py-3.5 font-semibold text-ink shadow-lg shadow-black/20 hover:bg-ivory">
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
                <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
                <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z" />
                <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
              </svg>
              Continue with Google
            </button>
          </form>
        ) : (
          <p className="text-xs text-ivory/60">Google sign-in is not set up on this server yet.</p>
        )}

        {devAuth ? (
          <section className="space-y-2 rounded-2xl border border-dashed border-jasmine/50 bg-white/5 p-3 backdrop-blur-sm">
            <h2 className="text-sm font-semibold text-jasmine">Dev sign-in (DEV_AUTH=1)</h2>
            {seedUsers().map((u) => (
              <form
                key={u.id}
                action={async () => {
                  "use server";
                  await signIn("dev", { email: u.email, redirectTo: next });
                }}
              >
                <button type="submit" className="zm-press w-full rounded-xl bg-white/10 px-3 py-2 text-left text-sm text-ivory hover:bg-white/20">
                  {u.name} <span className="text-jasmine/80">{u.email}</span>
                </button>
              </form>
            ))}
          </section>
        ) : null}
        </ShellSignIn>
        </div>
      </div>
    </main>
  );
}
