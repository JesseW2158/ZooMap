"use client";

import { useApi } from "./use-api";

/**
 * Placeholder body for a panel whose module has not been built yet. It shows what the
 * stub endpoint returns, which proves the route, auth and contract are wired.
 */
export function StubPanel({ title, endpoint, note }: { title: string; endpoint?: string; note?: string }) {
  const { data, error, loading } = useApi<unknown>(endpoint ?? null);
  return (
    <div className="space-y-2 text-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-neutral-500">{note ?? "Foundation stub. The owning workstream replaces this panel."}</p>
      {endpoint ? (
        <pre className="max-h-48 overflow-auto rounded-lg bg-neutral-100 p-2 text-xs text-neutral-700">
          {loading ? `GET ${endpoint} ...` : error ? `${error.code}: ${error.message}` : JSON.stringify(data, null, 1)}
        </pre>
      ) : null}
    </div>
  );
}
