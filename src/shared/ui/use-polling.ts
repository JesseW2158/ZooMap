import { useEffect, useRef } from "react";

export interface PollingOptions {
  /** Milliseconds between runs. `null` runs once. */
  intervalMs: number | null;
  enabled?: boolean;
  /** Changing this restarts the poll (use it for the thing the task depends on). */
  key?: unknown;
}

/**
 * Run `task` now and then every `intervalMs`, pausing while the tab is hidden and running
 * again as soon as it is visible. Vercel has no websockets, so clients poll.
 */
export function usePolling(task: (signal: AbortSignal) => Promise<void> | void, options: PollingOptions) {
  const { intervalMs, enabled = true, key } = options;
  const taskRef = useRef(task);
  useEffect(() => {
    taskRef.current = task;
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;

    const run = () => {
      void Promise.resolve(taskRef.current(controller.signal)).catch(() => {});
    };
    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      run();
      if (intervalMs !== null) timer = setInterval(run, intervalMs);
    };
    const onVisibility = () => {
      if (intervalMs === null) return;
      if (document.hidden) stop();
      else if (timer === undefined) start();
    };

    if (intervalMs === null || !document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      controller.abort();
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled, key]);
}
