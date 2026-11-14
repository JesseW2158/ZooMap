import { useCallback, useState } from "react";
import type { z } from "zod";
import { ApiClientError, apiFetch } from "@/shared/http/client";
import { usePolling } from "./use-polling";

export interface UseApiOptions<T> {
  /** Re-fetch this often (paused while the tab is hidden). Omit to fetch once. */
  pollMs?: number;
  /** Validate the response; a mismatch surfaces as `error`. */
  schema?: z.ZodType<T>;
}

export interface ApiState<T> {
  data: T | null;
  error: ApiClientError | null;
  loading: boolean;
}

/** GET a JSON endpoint of our own API. Pass `null` as the path to hold off. */
export function useApi<T>(path: string | null, options: UseApiOptions<T> = {}) {
  const { pollMs, schema } = options;
  const [state, setState] = useState<ApiState<T>>({ data: null, error: null, loading: path !== null });

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (path === null) return;
      try {
        const raw = await apiFetch<unknown>(path, { signal });
        const data = schema ? schema.parse(raw) : (raw as T);
        setState({ data, error: null, loading: false });
      } catch (cause) {
        if (signal.aborted) return;
        const error =
          cause instanceof ApiClientError ? cause : new ApiClientError("UNKNOWN", 0, "Unexpected response from the server");
        setState((s) => ({ data: s.data, error, loading: false }));
      }
    },
    [path, schema],
  );

  usePolling(load, { intervalMs: pollMs ?? null, enabled: path !== null, key: path });

  const refresh = useCallback(() => load(new AbortController().signal), [load]);
  return { ...state, refresh };
}
