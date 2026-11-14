"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { MapProvider, mapStore } from "@/shared/ui";
import type { PanelEntry } from "@/shared/ui";
import { registry } from "../registry";
import { signOutAction } from "./actions";
import { DevTools } from "./DevTools";
import { ActivitiesIcon, CalendarIcon, CrowdIcon, MapIcon, PointsIcon } from "./icons";

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
  accent: { bg: string; text: string; border: string };
}

/** Bottom navigation, left to right. The map sits in the middle. */
const TABS: Tab[] = [
  {
    id: "activities",
    label: "Activities",
    Icon: ActivitiesIcon,
    panelIds: ["activities"],
    accent: { bg: "bg-jasmine", text: "text-jasmine", border: "border-jasmine" },
  },
  {
    id: "crowd",
    label: "Crowd",
    Icon: CrowdIcon,
    panelIds: ["density"],
    accent: { bg: "bg-lavender", text: "text-lavender", border: "border-lavender" },
  },
  {
    id: MAP_TAB,
    label: "Map",
    Icon: MapIcon,
    panelIds: [],
    accent: { bg: "bg-jasmine", text: "text-jasmine", border: "border-jasmine" },
  },
  {
    id: "calendar",
    label: "Calendar",
    Icon: CalendarIcon,
    panelIds: ["schedule", "recommend"],
    accent: { bg: "bg-sky", text: "text-sky", border: "border-sky" },
  },
  {
    id: "points",
    label: "Points",
    Icon: PointsIcon,
    panelIds: ["rewards"],
    accent: { bg: "bg-sand", text: "text-sand", border: "border-sand" },
  },
];

const panelsById = new Map(registry.panels.map((p) => [p.id, p]));

// A registered panel that no tab names still gets shown, on the calendar page, so a new
// registry line never silently disappears.
const claimed = new Set(TABS.flatMap((t) => t.panelIds));
const unclaimed = registry.panels.filter((p) => !claimed.has(p.id)).map((p) => p.id);

function panelsFor(tab: Tab): PanelEntry[] {
  const ids = tab.id === "calendar" ? [...tab.panelIds, ...unclaimed] : tab.panelIds;
  return ids.map((id) => panelsById.get(id)).filter((p): p is PanelEntry => p !== undefined);
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
      if ((s.routeRequest && s.routeRequest !== routeRequest) || (s.flyRequest && s.flyRequest !== flyRequest)) {
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

        {/* map chrome: account in the corner. The registry's top slot (building search) is
            left out on purpose: the map is kept clear. */}
        <div
          hidden={!onMap}
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-end p-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
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
                className={`rounded-2xl border-t-[6px] bg-white p-4 shadow-lg shadow-ink/10 ${active.accent.border}`}
              >
                {all.length > 1 ? <h2 className="mb-3 text-lg font-bold text-ink">{title}</h2> : null}
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

function Page({ tab, user, children }: { tab: Tab; user: ShellUser; children: ReactNode }) {
  const { label, Icon, accent } = tab;
  return (
    <div role="tabpanel" aria-label={label} className="absolute inset-0 z-20 flex flex-col overflow-y-auto bg-linen text-ink">
      {/* navy hero band with the section's colour; the cards overlap its bottom edge */}
      <header className="relative shrink-0 overflow-hidden bg-ink px-4 pb-14 pt-[max(1rem,env(safe-area-inset-top))] text-ivory">
        <div aria-hidden className={`absolute -right-10 -top-12 h-44 w-44 rounded-full opacity-90 ${accent.bg}`} />
        <div aria-hidden className="absolute -right-16 top-16 h-32 w-32 rounded-full bg-yale" />
        <div className="relative flex items-center justify-between">
          <span className={`flex h-11 w-11 items-center justify-center rounded-2xl text-ink shadow-md ${accent.bg}`}>
            <Icon className="h-6 w-6" />
          </span>
          <AccountButton user={user} />
        </div>
        <h1 className="relative mt-4 text-4xl font-extrabold tracking-tight">{label}</h1>
      </header>
      <div className="relative mx-auto -mt-8 flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-6">{children}</div>
    </div>
  );
}

function TabBar({ activeId, onSelect }: { activeId: string; onSelect: (id: string) => void }) {
  return (
    <nav
      aria-label="Sections"
      className="z-30 bg-ink pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(21,50,67,0.35)]"
    >
      <div role="tablist" className="mx-auto flex max-w-2xl items-end justify-around px-2 pb-1.5 pt-1.5">
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
              className={`flex flex-1 flex-col items-center gap-0.5 text-[11px] font-medium ${
                selected ? `font-bold ${accent.text}` : "text-ivory/75 hover:text-ivory"
              }`}
            >
              {isMap ? (
                <span
                  className={`-mt-6 flex h-14 w-16 items-center justify-center rounded-2xl text-ink shadow-lg ring-4 ring-ink transition-transform ${
                    accent.bg
                  } ${selected ? "scale-110" : ""}`}
                >
                  <Icon className="h-7 w-7" />
                </span>
              ) : (
                <span
                  className={`flex h-9 w-12 items-center justify-center rounded-full transition-colors ${
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
  const label = user.name ?? user.email;
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-sm font-bold text-jasmine shadow-md ring-2 ring-jasmine"
      >
        {label.slice(0, 1).toUpperCase()}
      </button>
      {open ? (
        <div className="absolute right-0 top-12 z-40 w-56 rounded-xl border-t-4 border-jasmine bg-white p-3 text-sm text-ink shadow-xl">
          <p className="truncate font-medium">{user.name ?? "Signed in"}</p>
          <p className="mb-2 truncate text-xs text-yale">{user.email}</p>
          <form action={signOutAction}>
            <button type="submit" className="w-full rounded-lg bg-ink px-3 py-2 text-ivory hover:bg-yale">
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
