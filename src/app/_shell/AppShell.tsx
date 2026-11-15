"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { MapProvider, mapStore } from "@/shared/ui";
import type { PanelEntry } from "@/shared/ui";
import { registry } from "../registry";
import { signOutAction } from "./actions";
import { DevTools } from "./DevTools";
import {
  ActivitiesIcon,
  CalendarIcon,
  CrowdIcon,
  MapIcon,
  PointsIcon,
} from "./icons";

export interface ShellUser {
  name: string | null;
  email: string;
}

const MAP_TAB = "map";

interface Tab {
  id: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  /** Registered panel ids shown on this tab's page, top to bottom. Empty for the map. */
  panelIds: string[];
  /** Section colour classes (literal strings so Tailwind sees them). */
  accent: {
    bg: string;
    text: string;
    /** Card background: a top stripe as a gradient, which the rounded corners clip cleanly (a
     *  thick top border tapers at the corners, and overflow-hidden would clip panel dropdowns). */
    card: string;
  };
}

/** Bottom navigation, left to right. The map sits in the middle. */
const TABS: Tab[] = [
  {
    id: "activities",
    label: "Activities",
    Icon: ActivitiesIcon,
    panelIds: ["activities"],
    accent: {
      bg: "bg-coral",
      text: "text-coral",
      card: "bg-[linear-gradient(var(--color-coral)_6px,white_6px)]",
    },
  },
  {
    id: "crowd",
    label: "Crowd",
    Icon: CrowdIcon,
    panelIds: ["density"],
    accent: {
      bg: "bg-lavender",
      text: "text-lavender",
      card: "bg-[linear-gradient(var(--color-lavender)_6px,white_6px)]",
    },
  },
  {
    id: MAP_TAB,
    label: "Map",
    Icon: MapIcon,
    panelIds: [],
    accent: {
      bg: "bg-jasmine",
      text: "text-jasmine",
      card: "bg-[linear-gradient(var(--color-jasmine)_6px,white_6px)]",
    },
  },
  {
    id: "calendar",
    label: "Calendar",
    Icon: CalendarIcon,
    panelIds: ["schedule", "recommend"],
    accent: {
      bg: "bg-sky",
      text: "text-sky",
      card: "bg-[linear-gradient(var(--color-sky)_6px,white_6px)]",
    },
  },
  {
    id: "points",
    label: "Points",
    Icon: PointsIcon,
    panelIds: ["rewards"],
    accent: {
      bg: "bg-sand",
      text: "text-sand",
      card: "bg-[linear-gradient(var(--color-sand)_6px,white_6px)]",
    },
  },
];

const panelsById = new Map(registry.panels.map((p) => [p.id, p]));

// A registered panel that no tab names still gets shown, on the calendar page, so a new
// registry line never silently disappears.
const claimed = new Set(TABS.flatMap((t) => t.panelIds));
const unclaimed = registry.panels
  .filter((p) => !claimed.has(p.id))
  .map((p) => p.id);

function panelsFor(tab: Tab): PanelEntry[] {
  const ids =
    tab.id === "calendar" ? [...tab.panelIds, ...unclaimed] : tab.panelIds;
  return ids
    .map((id) => panelsById.get(id))
    .filter((p): p is PanelEntry => p !== undefined);
}

/**
 * Phone-first shell: a bottom tab bar. The map tab shows the full-screen map; every other
 * tab shows its page over it. The map stays mounted underneath so its layers keep state,
 * and a panel that asks the map to route or fly somewhere switches to the map tab.
 */
export function AppShell({ user }: { user: ShellUser }) {
  const [activeId, setActiveId] = useState<string>(MAP_TAB);
  const active = TABS.find((t) => t.id === activeId) ?? TABS[2]!;
  const onMap = active.id === MAP_TAB;

  // a route or fly request from a panel means "show me on the map"
  useEffect(() => {
    let { routeRequest, flyRequest } = mapStore.get();
    return mapStore.subscribe(() => {
      const s = mapStore.get();
      if (
        (s.routeRequest && s.routeRequest !== routeRequest) ||
        (s.flyRequest && s.flyRequest !== flyRequest)
      ) {
        setActiveId(MAP_TAB);
      }
      routeRequest = s.routeRequest;
      flyRequest = s.flyRequest;
    });
  }, []);

  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-linen">
      <div className="relative min-h-0 flex-1">
        <MapProvider>
          {registry.mapLayers.map(({ id, Component }) => (
            <Component key={id} />
          ))}
        </MapProvider>

        {registry.headless.map(({ id, Component }) => (
          <Component key={id} />
        ))}

        {/* map chrome: account in the corner (the alerts bell sits just left of it, right-16,
            from the notifications module; keep the two in step). The registry's top slot
            (building search) is left out on purpose: the map is kept clear. */}
        <div
          hidden={!onMap}
          className="pointer-events-none absolute inset-x-0 top-0 z-[25] flex items-start justify-end p-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
        >
          <div className="pointer-events-auto">
            <AccountButton user={user} />
          </div>
        </div>

        {onMap ? <DevTools /> : null}

        {!onMap ? (
          <Page tab={active} user={user}>
            {panelsFor(active).map(({ id, title, Component }, _i, all) => (
              <section
                key={id}
                aria-label={title}
                className={`rounded-2xl px-4 pb-4 pt-5 shadow-md shadow-ink/10 ${active.accent.card}`}
              >
                {all.length > 1 ? (
                  <h2 className="mb-2 text-base font-bold text-ink">{title}</h2>
                ) : null}
                <Component />
              </section>
            ))}
          </Page>
        ) : null}
      </div>

      <TabBar activeId={active.id} onSelect={setActiveId} />
    </main>
  );
}

function Page({
  tab,
  user,
  children,
}: {
  tab: Tab;
  user: ShellUser;
  children: ReactNode;
}) {
  const { label, Icon, accent } = tab;
  return (
    <div
      role="tabpanel"
      aria-label={label}
      className="absolute inset-0 z-20 flex flex-col overflow-y-auto bg-linen text-ink"
    >
      {/* navy hero band with the section's colour; the cards overlap its bottom edge */}
      <header className="relative shrink-0 bg-ink pb-12 pt-[max(1rem,env(safe-area-inset-top))] text-ivory">
        {/* clip only the decorative circles: the header itself must not clip the account menu.
            The header has no z-index on purpose: the cards after it paint over its bottom edge,
            while the menu's own z-40 lifts it above those cards. */}
        <div aria-hidden className="absolute inset-0 overflow-hidden">
          <div className="absolute -bottom-24 right-6 h-40 w-40 rounded-full bg-yale/45" />
          <div className="absolute -bottom-10 -right-10 h-24 w-24 rounded-full bg-yale/70" />
        </div>
        <div className="relative mx-auto flex max-w-2xl items-center gap-3 px-4">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink ${accent.bg}`}
          >
            <Icon className="h-6 w-6" />
          </span>
          <h1 className="min-w-0 flex-1 truncate text-[28px] font-bold leading-tight tracking-tight">
            {label}
          </h1>
          <AccountButton user={user} />
        </div>
      </header>
      <div className="relative mx-auto -mt-7 flex w-full max-w-2xl flex-1 flex-col gap-3 px-4 pb-8">
        {children}
      </div>
    </div>
  );
}

function TabBar({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Sections"
      className="z-30 bg-ink pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(21,50,67,0.35)]"
    >
      <div
        role="tablist"
        className="mx-auto flex max-w-2xl items-end justify-around px-1 pb-2 pt-2"
      >
        {TABS.map(({ id, label, Icon, accent }) => {
          const selected = id === activeId;
          const isMap = id === MAP_TAB;
          return (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => onSelect(id)}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl text-[11px] leading-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ivory ${
                selected
                  ? `font-semibold ${accent.text}`
                  : "font-medium text-ivory/70 hover:text-ivory"
              }`}
            >
              {isMap ? (
                <span
                  className={`-mt-5 flex h-12 w-14 items-center justify-center rounded-2xl text-ink shadow-lg ring-4 ring-ink transition-transform ${
                    accent.bg
                  } ${selected ? "scale-105" : ""}`}
                >
                  <Icon className="h-7 w-7" />
                </span>
              ) : (
                <span
                  className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                    selected ? `${accent.bg} text-ink` : ""
                  }`}
                >
                  <Icon className="h-6 w-6" />
                </span>
              )}
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function AccountButton({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = user.name ?? user.email;

  // a tap anywhere else closes the menu, so it never sits under the alerts inbox, which opens
  // over the same corner
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-ivory shadow-md ring-2 ring-ivory/80"
      >
        {label.slice(0, 1).toUpperCase()}
      </button>
      {open ? (
        <div className="absolute right-0 top-12 z-40 w-56 rounded-xl bg-white p-3 text-sm text-ink shadow-xl ring-1 ring-ink/10">
          <p className="truncate font-medium">{user.name ?? "Signed in"}</p>
          <p className="mb-2 truncate text-xs text-yale">{user.email}</p>
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full rounded-lg bg-ink px-3 py-2 text-ivory hover:bg-yale"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
