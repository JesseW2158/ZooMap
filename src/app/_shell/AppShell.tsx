"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { MapProvider, mapStore, usePolling } from "@/shared/ui";
import { UnreadCount } from "@/shared/contracts";
import { apiFetch } from "@/shared/http/client";
import type { PanelEntry } from "@/shared/ui";
import { registry } from "../registry";
import { signOutAction } from "./actions";
import { DevTools } from "./DevTools";
import { MapSheet, SidebarOpenButton, mapInsetVars, useIsDesktop } from "./MapSheet";
import { SettingsSheet } from "./Settings";
import {
  ActivitiesIcon,
  AskIcon,
  CalendarIcon,
  CrowdIcon,
  FriendsIcon,
  MapIcon,
  MessagesIcon,
  PointsIcon,
  StudyIcon,
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
  /** Registered panel ids shown on this tab's page, top to bottom. For the map tab, the
   *  panels in the map sheet instead. */
  panelIds: string[];
  /** Section colour classes (literal strings so Tailwind sees them). */
  accent: {
    bg: string;
    text: string;
  };
}

/** Bottom navigation, left to right. The map sits in the middle: three tabs either side. */
const TABS: Tab[] = [
  {
    id: "activities",
    label: "Activities",
    Icon: ActivitiesIcon,
    panelIds: ["activities", "events"],
    accent: {
      bg: "bg-coral",
      text: "text-coral",
    },
  },
  {
    id: "friends",
    label: "Friends",
    Icon: FriendsIcon,
    panelIds: ["friends"],
    accent: {
      bg: "bg-rose",
      text: "text-rose",
    },
  },
  {
    id: "messages",
    label: "Messages",
    Icon: MessagesIcon,
    panelIds: ["messages"],
    accent: {
      bg: "bg-lavender",
      text: "text-lavender",
    },
  },
  {
    id: MAP_TAB,
    label: "Map",
    Icon: MapIcon,
    // shown on the map itself, in the sidebar (desktop) or swipe-up sheet (phone)
    panelIds: ["density"],
    accent: {
      bg: "bg-jasmine",
      text: "text-jasmine",
    },
  },
  {
    id: "calendar",
    label: "Calendar",
    Icon: CalendarIcon,
    // "recommend" (Study) joins this page once it is built; until then its stub is hidden
    panelIds: ["schedule"],
    accent: {
      bg: "bg-sky",
      text: "text-sky",
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
    },
  },
  {
    id: "ask",
    label: "Ask",
    Icon: AskIcon,
    panelIds: ["assistant"],
    accent: {
      bg: "bg-mint",
      text: "text-mint",
    },
  },
];

/** Symbols for panel sections on a page that shows more than one panel. */
const PANEL_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  activities: ActivitiesIcon,
  friends: FriendsIcon,
  messages: MessagesIcon,
  schedule: CalendarIcon,
  recommend: StudyIcon,
  rewards: PointsIcon,
  density: CrowdIcon,
};

/** Title of the map's sidebar (desktop) and swipe-up sheet (phone). */
const MAP_SHEET_TITLE = "Map update";

const panelsById = new Map(registry.panels.map((p) => [p.id, p]));

// A registered panel that no tab names still gets shown, on the calendar page, so a new
// registry line never silently disappears.
const HIDDEN_UNTIL_BUILT = new Set(["recommend"]);
const claimed = new Set([...TABS.flatMap((t) => t.panelIds), ...HIDDEN_UNTIL_BUILT]);
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
  const active = TABS.find((t) => t.id === activeId) ?? TABS.find((t) => t.id === MAP_TAB)!;
  const unread = useUnreadMessages();
  const onMap = active.id === MAP_TAB;
  const isDesktop = useIsDesktop();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const mapTab = TABS.find((t) => t.id === MAP_TAB)!;
  const mapPanels = panelsFor(mapTab);

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
      <div
        className="relative min-h-0 flex-1"
        style={mapInsetVars(isDesktop, mapPanels.length > 0 && sidebarOpen)}
      >
        <MapProvider>
          {registry.mapLayers.map(({ id, Component }) => (
            <Component key={id} />
          ))}
        </MapProvider>

        {registry.headless.map(({ id, Component }) => (
          <Component key={id} />
        ))}

        {/* map chrome: building search (directions from your location) and the account. The
            alerts bell (notifications module) sits in the spacer just left of the account,
            right-[3.75rem]; keep the two in step. z-[25] keeps the account menu above the
            friend-invite banner (z-20). */}
        <div
          hidden={!onMap}
          className="pointer-events-none absolute left-[var(--map-inset-left,0px)] right-0 top-0 z-[25] flex items-start gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
        >
          {isDesktop && mapPanels.length > 0 && !sidebarOpen ? (
            <div className="pointer-events-auto">
              <SidebarOpenButton
                title={MAP_SHEET_TITLE}
                Icon={CrowdIcon}
                accentBg="bg-lavender"
                onOpen={() => setSidebarOpen(true)}
              />
            </div>
          ) : null}
          <div className="pointer-events-auto min-w-0 flex-1 md:mx-auto md:max-w-md">
            {registry.topSlot.map(({ id, Component }) => (
              <Component key={id} />
            ))}
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <ShellActions />
            <AccountButton user={user} />
          </div>
        </div>

        {onMap ? <DevTools /> : null}

        {mapPanels.length ? (
          <MapSheet
            title={MAP_SHEET_TITLE}
            Icon={CrowdIcon}
            accentBg="bg-lavender"
            isDesktop={isDesktop}
            sidebarOpen={sidebarOpen}
            onSidebarOpenChange={setSidebarOpen}
            hidden={!onMap}
          >
            <div className="space-y-6">
              {mapPanels.map(({ id, Component }) => (
                <Component key={id} />
              ))}
            </div>
          </MapSheet>
        ) : null}

        {!onMap ? (
          <Page tab={active} user={user}>
            {panelsFor(active).map(({ id, title, Component }, _i, all) => (
              <section
                key={id}
                aria-label={title}
                className="rounded-3xl bg-white p-4 shadow-md shadow-ink/10"
              >
                {all.length > 1 ? (
                  <SectionTitle
                    title={title}
                    Icon={PANEL_ICONS[id]}
                    accentBg={active.accent.bg}
                  />
                ) : null}
                <Component />
              </section>
            ))}
          </Page>
        ) : null}
      </div>

      <TabBar activeId={active.id} onSelect={setActiveId} badges={{ messages: unread }} />
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
            while the menu's own z-index lifts it above those cards. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -bottom-24 right-6 h-40 w-40 rounded-full bg-yale/45" />
          <div className="absolute -bottom-10 -right-10 h-24 w-24 rounded-full bg-yale/70" />
        </div>
        <div className="relative mx-auto flex max-w-2xl items-center gap-3 px-4">
          <span
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-ink shadow-md ring-4 ring-ivory/15 ${accent.bg}`}
          >
            <Icon className="h-8 w-8" />
          </span>
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold leading-tight tracking-tight">
            {label}
          </h1>
          <ShellActions />
          <AccountButton user={user} />
        </div>
      </header>
      <div className="relative mx-auto -mt-7 flex w-full max-w-2xl flex-1 flex-col gap-3 px-4 pb-8">
        {children}
      </div>
    </div>
  );
}

/** A section heading led by its symbol. */
function SectionTitle({
  title,
  Icon,
  accentBg,
}: {
  title: string;
  Icon?: ComponentType<{ className?: string }>;
  accentBg: string;
}) {
  return (
    <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-ink">
      {Icon ? (
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink ${accentBg}`}
        >
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      {title}
    </h2>
  );
}

/** Fired by the friends module after reading or sending, so the badge updates without waiting for a poll. */
const MESSAGES_CHANGED_EVENT = "zoomap:messages-changed";
const UNREAD_POLL_MS = 20_000;

/** Unread direct messages, for the Messages tab badge. */
function useUnreadMessages(): number {
  const [count, setCount] = useState(0);
  const load = async (signal?: AbortSignal) => {
    try {
      setCount((await apiFetch("/api/messages/unread", { schema: UnreadCount, signal })).count);
    } catch {
      // keep the last count; the next poll retries
    }
  };
  usePolling(load, { intervalMs: UNREAD_POLL_MS });
  useEffect(() => {
    const onChange = () => void load();
    window.addEventListener(MESSAGES_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(MESSAGES_CHANGED_EVENT, onChange);
  }, []);
  return count;
}

/**
 * Icon-only bottom bar, in the manner of Snapchat: symbols, no captions (each has an
 * aria-label and a tooltip). The selected symbol takes its section colour, grows a little and
 * gets a dot underneath; the map sits raised in the middle.
 */
function TabBar({
  activeId,
  onSelect,
  badges,
}: {
  activeId: string;
  onSelect: (id: string) => void;
  badges: Record<string, number>;
}) {
  return (
    <nav
      aria-label="Sections"
      className="z-30 bg-ink pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(21,50,67,0.35)]"
    >
      <div
        role="tablist"
        className="mx-auto flex max-w-2xl items-center justify-around px-2 py-2.5"
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
              aria-label={label}
              title={label}
              onClick={() => onSelect(id)}
              className={`relative flex min-w-0 flex-1 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ivory ${
                selected ? accent.text : "text-ivory/60 hover:text-ivory"
              }`}
            >
              {isMap ? (
                <span
                  className={`-my-4 flex h-14 w-14 items-center justify-center rounded-full text-ink shadow-lg ring-4 ring-ink transition-transform ${
                    accent.bg
                  } ${selected ? "scale-110" : "opacity-90"}`}
                >
                  <Icon className="h-8 w-8" />
                </span>
              ) : (
                <span className="relative flex h-11 w-11 flex-col items-center justify-center">
                  <Icon
                    className={`h-7 w-7 transition-transform duration-200 ${selected ? "scale-115" : ""}`}
                  />
                  {badges[id] ? (
                    <span
                      aria-hidden
                      className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-ink"
                    >
                      {badges[id] > 9 ? "9+" : badges[id]}
                    </span>
                  ) : null}
                  <span
                    aria-hidden
                    className={`absolute bottom-[-6px] h-1.5 w-1.5 rounded-full transition-opacity ${accent.bg} ${
                      selected ? "opacity-100" : "opacity-0"
                    }`}
                  />
                </span>
              )}
              {badges[id] ? (
                <span className="sr-only">, {badges[id]} unread</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** The registry's small buttons (the alerts bell), left of the account button. */
function ShellActions() {
  return (
    <>
      {(registry.actions ?? []).map(({ id, Component }) => (
        <Component key={id} />
      ))}
    </>
  );
}

function AccountButton({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const label = user.name ?? user.email;
  const initial = label.slice(0, 1).toUpperCase();

  // close on a tap outside or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-sm font-bold text-ivory shadow-md ring-2 ring-ivory/80"
      >
        {initial}
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 rounded-2xl bg-white p-4 text-sm text-ink shadow-xl ring-1 ring-ink/10">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink font-bold text-ivory">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{user.name ?? "Signed in"}</p>
              <p className="truncate text-xs text-yale">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setSettings(true);
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-linen px-3 py-2.5 font-semibold text-ink hover:bg-ash/40"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
            Settings
          </button>
          <form action={signOutAction} className="mt-2">
            <button
              type="submit"
              className="w-full rounded-full bg-ink px-3 py-2.5 font-semibold text-ivory hover:bg-yale"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : null}
      {settings ? <SettingsSheet user={user} onClose={() => setSettings(false)} /> : null}
    </div>
  );
}
