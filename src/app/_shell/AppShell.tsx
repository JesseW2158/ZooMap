"use client";

import { useState } from "react";
import { MapProvider, useMapStore } from "@/shared/ui";
import { registry } from "../registry";
import { signOutAction } from "./actions";
import { DevTools } from "./DevTools";
import { ThemeToggle } from "./ThemeToggle";

export interface ShellUser {
  name: string | null;
  email: string;
}

/**
 * Phone-first shell. On a phone the map fills the screen and the bottom sheet has one tab per
 * registered panel. From 1024 px (`lg`) the same tabs become a vertical rail on the left with
 * the open panel in a column beside it, and the map fills the rest. Clicking the open tab
 * hides the panel (the sheet on a phone, the column on a computer).
 */
export function AppShell({ user }: { user: ShellUser }) {
  const [activeId, setActiveId] = useState<string>(registry.panels[0]?.id ?? "");
  const [open, setOpen] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const active = registry.panels.find((p) => p.id === activeId);
  const label = user.name ?? user.email;
  // while a route is on the map, the phone sheet sits lower so the route stays visible
  const { routeRequest } = useMapStore();
  const routing = routeRequest !== null;
  const panelOpen = open && !!active;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-neutral-200">
      {/* The map area: the whole screen on a phone; right of the sidebar on a computer
          (rail 6rem, plus the 24rem panel column while it is open). MapLibre follows the resize. */}
      <div className={`absolute inset-0 transition-[left] duration-200 ${panelOpen ? "lg:left-[30rem]" : "lg:left-24"}`}>
        <MapProvider>
          {registry.mapLayers.map(({ id, Component }) => (
            <Component key={id} />
          ))}
        </MapProvider>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 pr-14 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto lg:max-w-xl">
            {registry.topSlot.map(({ id, Component }) => (
              <Component key={id} />
            ))}
          </div>
        </div>

        <DevTools />
        <ThemeToggle />
      </div>

      {registry.headless.map(({ id, Component }) => (
        <Component key={id} />
      ))}

      <section
        aria-label="Panels"
        className={`absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-2xl bg-white text-neutral-900 shadow-[0_-4px_24px_rgba(0,0,0,0.18)] transition-[max-height] duration-300 ${
          routing ? "max-h-[34dvh]" : "max-h-[60dvh]"
        } lg:inset-y-0 lg:left-0 lg:right-auto lg:max-h-none lg:flex-row lg:rounded-none lg:shadow-[4px_0_24px_rgba(0,0,0,0.12)]`}
      >
        {/* handle: collapse or expand the sheet (phone only) */}
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? "Hide panel" : "Show panel"}
          onClick={() => setOpen((o) => !o)}
          className="group flex w-full flex-col items-center gap-0.5 rounded-t-2xl pb-0.5 pt-1.5 hover:bg-neutral-50 lg:hidden"
        >
          <span className="h-1 w-10 rounded-full bg-neutral-300 group-hover:bg-neutral-400" aria-hidden />
          <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400 group-hover:text-neutral-600">
            {open ? "▾ Hide" : "▴ Show"}
          </span>
        </button>

        {/* tabs: a horizontal strip on a phone, a vertical rail on a computer */}
        <div className="flex items-center gap-1 border-b border-neutral-100 px-2 lg:w-24 lg:shrink-0 lg:flex-col lg:items-stretch lg:gap-2 lg:border-b-0 lg:border-r lg:px-2 lg:py-3">
          <div
            role="tablist"
            className="flex min-w-0 flex-1 gap-1 overflow-x-auto lg:flex-none lg:flex-col lg:overflow-x-visible lg:overflow-y-auto"
          >
            {registry.panels.map((panel) => {
              const selected = panel.id === activeId;
              return (
                <button
                  key={panel.id}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  onClick={() => {
                    // clicking the open tab again hides the panel
                    if (selected) setOpen((o) => !o);
                    else {
                      setActiveId(panel.id);
                      setOpen(true);
                    }
                  }}
                  className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium lg:rounded-lg lg:px-2 lg:py-2.5 lg:text-left ${
                    selected
                      ? `border-b-2 border-emerald-600 text-emerald-700 lg:border-b-0 ${panelOpen ? "lg:bg-emerald-50" : "lg:bg-neutral-100"}`
                      : "text-neutral-500 lg:hover:bg-neutral-50"
                  }`}
                >
                  {panel.title}
                </button>
              );
            })}
          </div>
          <div className="relative lg:mt-auto lg:flex lg:justify-center">
            <button
              type="button"
              aria-label="Account"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((o) => !o)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold text-neutral-700 lg:h-10 lg:w-10"
            >
              {label.slice(0, 1).toUpperCase()}
            </button>
            {accountOpen ? (
              <div className="absolute bottom-10 right-0 z-20 w-56 rounded-xl border border-neutral-200 bg-white p-3 text-sm shadow-lg lg:bottom-0 lg:left-full lg:right-auto lg:ml-3">
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

        {panelOpen ? (
          <div
            role="tabpanel"
            className="min-h-24 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:w-96 lg:flex-none lg:pb-4"
          >
            <active.Component />
          </div>
        ) : null}
      </section>
    </main>
  );
}
