/**
 * Pure ping scheduling for the native location source. No Capacitor, no DOM: the clock, the
 * timers and the network are all passed in, so the rules are unit-tested with fake timers.
 *
 * Verified time on the server needs a presence ping at least every 300 s, and a student in a
 * library does not move. So pings run on a clock, not on movement:
 *   - a fix from the location callback sends a ping when the last attempt was >= `minGapMs` ago
 *     (default 60 s), so a stream of one fix per second still means one ping a minute;
 *   - a fallback timer checks every `checkEveryMs` (30 s) and resends the last fix when no ping
 *     has gone out for `fallbackAfterMs` (90 s), so a phone that stops producing fixes still pings
 *     about every 90 to 120 s while the last fix is fresh enough to trust (`maxFixAgeMs`).
 * The fallback checks every 30 s rather than firing every 90 s: a bare 90 s interval can leave a
 * gap of up to 180 s, which is longer than the 150 s the brief allows.
 */

export interface Fix {
  lat: number;
  lng: number;
  accuracyM?: number;
  /** Epoch milliseconds when the fix was taken. */
  time: number;
}

/** What a ping attempt came to. `unauthorized` = HTTP 401, `sharing-off` = HTTP 403. */
export type PingResult = "ok" | "unauthorized" | "sharing-off" | "error";
export type FatalReason = "unauthorized" | "sharing-off";

export interface PingerOptions {
  send(fix: Fix): Promise<PingResult>;
  /** Called once, after which the pinger has stopped itself. */
  onFatal?(reason: FatalReason): void;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  log?: (message: string) => void;
  minGapMs?: number;
  checkEveryMs?: number;
  fallbackAfterMs?: number;
  /** A resent fix older than this is dropped, so a stale place is not claimed forever. */
  maxFixAgeMs?: number;
}

export interface Pinger {
  /** Start the fallback timer. */
  start(): void;
  /** Feed a fix from the location callback. */
  onFix(fix: Fix): void;
  /** Stop the timer and ignore later fixes. */
  stop(): void;
}

export function createPinger(options: PingerOptions): Pinger {
  const now = options.now ?? Date.now;
  const setTimer = options.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clearTimer = options.clearInterval ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
  const log = options.log ?? (() => {});
  const minGapMs = options.minGapMs ?? 60_000;
  const checkEveryMs = options.checkEveryMs ?? 30_000;
  const fallbackAfterMs = options.fallbackAfterMs ?? 90_000;
  const maxFixAgeMs = options.maxFixAgeMs ?? 10 * 60_000;

  let timer: unknown = null;
  let running = false;
  let inflight = false;
  let lastAttemptAt = Number.NEGATIVE_INFINITY;
  let lastFix: Fix | null = null;

  const attempt = (fix: Fix, why: "fix" | "fallback") => {
    if (inflight) return;
    inflight = true;
    lastAttemptAt = now();
    log(`ping (${why}) fix=${new Date(fix.time).toISOString()}`);
    void options
      .send(fix)
      .catch((): PingResult => "error")
      .then((result) => {
        inflight = false;
        log(`ping result: ${result}`);
        if (result === "unauthorized" || result === "sharing-off") {
          if (!running) return;
          stop();
          options.onFatal?.(result);
        }
      });
  };

  const stop = () => {
    running = false;
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  return {
    start() {
      if (running) return;
      running = true;
      timer = setTimer(() => {
        if (!running || !lastFix) return;
        const t = now();
        if (t - lastAttemptAt < fallbackAfterMs) return;
        if (t - lastFix.time > maxFixAgeMs) {
          log(`fallback skipped: last fix is ${Math.round((t - lastFix.time) / 1000)} s old`);
          return;
        }
        attempt(lastFix, "fallback");
      }, checkEveryMs);
    },
    onFix(fix) {
      if (!running) return;
      lastFix = fix;
      if (now() - lastAttemptAt >= minGapMs) attempt(fix, "fix");
    },
    stop,
  };
}
