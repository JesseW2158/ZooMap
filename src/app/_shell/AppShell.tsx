"use client";

import { useState } from "react";
import { MapProvider } from "@/shared/ui";
import { registry } from "../registry";
import { signOutAction } from "./actions";
import { DevTools } from "./DevTools";

export interface ShellUser {
  name: string | null;
  email: string;
}

/** Phone-first shell: the map fills the screen; the bottom sheet has one tab per registered panel. */
export function AppShell({ user }: { user: ShellUser }) {
  const [activeId, setActiveId] = useState<string>(registry.panels[0]?.id ?? "");
  const [open, setOpen] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const active = registry.panels.find((p) => p.id === activeId);
  const label = user.name ?? user.email;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-neutral-200">
      <MapProvider>
        {registry.mapLayers.map(({ id, Component }) => (
          <Component key={id} />
        ))}
      </MapProvider>

      {registry.headless.map(({ id, Component }) => (
        <Component key={id} />
      ))}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 pr-14 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto">
          {registry.topSlot.map(({ id, Component }) => (
            <Component key={id} />
          ))}
        </div>
      </div>

      <DevTools />

      <section
        aria-label="Panels"
        className="absolute inset-x-0 bottom-0 z-10 flex max-h-[60dvh] flex-col rounded-t-2xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.18)]"
      >
        <div className="flex items-center gap-1 border-b border-neutral-100 px-2 pt-2">
          <div role="tablist" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {registry.panels.map((panel) => {
              const selected = panel.id === activeId;
              return (
                <button
                  key={panel.id}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  onClick={() => {
                    // tapping the open tab again collapses the sheet
                    if (selected) setOpen((o) => !o);
                    else {
                      setActiveId(panel.id);
                      setOpen(true);
                    }
                  }}
                  className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium ${
                    selected ? "border-b-2 border-emerald-600 text-emerald-700" : "text-neutral-500"
                  }`}
                >
                  {panel.title}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <button
              type="button"
              aria-label="Account"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((o) => !o)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold text-neutral-700"
            >
              {label.slice(0, 1).toUpperCase()}
            </button>
            {accountOpen ? (
              <div className="absolute bottom-10 right-0 w-56 rounded-xl border border-neutral-200 bg-white p-3 text-sm shadow-lg">
                <p className="truncate font-medium">{user.name ?? "Signed in"}</p>
                <p className="mb-2 truncate text-xs text-neutral-500">{user.email}</p>
                <form action={signOutAction}>
                  <button type="submit" className="w-full rounded-lg bg-neutral-900 px-3 py-2 text-white">
                    Sign out
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>

        {open && active ? (
          <div role="tabpanel" className="min-h-24 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <active.Component />
          </div>
        ) : null}
      </section>
    </main>
  );
}
