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
import { useTabSwipe } from "./swipe";
import {
  ActivitiesIcon,
  AskIcon,
  CalendarIcon,
  CrowdIcon,
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
/** Fired on window when the Map tab button is tapped. Keep in step with routing/ui/PlaceSheet.tsx. */
const MAP_TAB_TAPPED_EVENT = "zoomap:map-tab-tapped";

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

/** Bottom navigation, left to right. The map sits in the middle: two tabs either side. */
const TABS: Tab[] = [
  {
    id: "activities",
    label: "Activities",
    Icon: ActivitiesIcon,
    // the assistant ("Ask ZooKeeper") leads the page, above the activities and events lists
    panelIds: ["assistant", "activities", "events"],
    accent: {
      bg: "bg-coral",
      text: "text-coral",
    },
  },
  {
    // friends and direct messages in one list: tapping a friend opens the chat
    id: "friends",
    label: "Chat",
    Icon: MessagesIcon,
    panelIds: ["friends"],
    accent: {
      bg: "bg-rose",
      text: "text-rose",
    },
  },
  {
    id: MAP_TAB,
    label: "Map",
    Icon: MapIcon,
    // shown on the map itself, in the sidebar (desktop) or swipe-up sheet (phone)
    panelIds: ["location-status", "density"],
    accent: {
      bg: "bg-jasmine",
      text: "text-jasmine",
    },
  },
  {
    id: "calendar",
    label: "Calendar",
    Icon: CalendarIcon,
    // "recommend" (Study) is built and sits under the schedule: it picks a spot near your next class
    panelIds: ["schedule", "recommend"],
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
];

const TAB_IDS = TABS.map((t) => t.id);
const tabIndex = (id: string) => TAB_IDS.indexOf(id);

/** Symbols for panel sections on a page that shows more than one panel. */
const PANEL_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  activities: ActivitiesIcon,
  assistant: AskIcon,
  friends: MessagesIcon,
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
  // Bumped whenever the Map tab button is tapped; the phone's map sheet closes on each bump.
  const [sheetCloseSignal, setSheetCloseSignal] = useState(0);
  const selectTab = (id: string) => {
    if (id === MAP_TAB) setSheetCloseSignal((n) => n + 1);
    setActiveId(id);
  };
  // a tap on the Map button (not a swipe onto the map) also tells the map's sheets to come down;
  // the routing module's building sheet listens for it (it can't import the shell)
  const tapTab = (id: string) => {
    if (id === MAP_TAB) window.dispatchEvent(new Event(MAP_TAB_TAPPED_EVENT));
    selectTab(id);
  };
  const active = TABS.find((t) => t.id === activeId) ?? TABS.find((t) => t.id === MAP_TAB)!;
  const unread = useUnreadMessages();
  const onMap = active.id === MAP_TAB;
  const isDesktop = useIsDesktop();
  const keyboard = useVirtualKeyboard();
  const keyboardOpen = !isDesktop && keyboard.open;
  // Phones, keyboard up on the map (the "Where to?" search): keep the app its full height, so
  // the map doesn't shrink and re-centre and nothing pinned to its bottom (tab bar, map sheet,
  // map controls) rides up above the keyboard; the keyboard simply covers them. Other tabs
  // shrink above the keyboard instead, so a focused field on them stays in view.
  const freezeHeight = keyboardOpen && onMap ? keyboard.fullHeight : null;
  // desktop "Map update" sidebar starts collapsed; its open button sits left of the search bar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mapTab = TABS.find((t) => t.id === MAP_TAB)!;
  const mapPanels = panelsFor(mapTab);

  // swipe left or right between tabs on a phone (edge swipes only on the map)
  const mainRef = useRef<HTMLElement>(null);
  const pageEls = useRef(new Map<string, HTMLElement>());
  const [peekId, setPeekId] = useState<string | null>(null);
  const peekTab = peekId && peekId !== active.id ? (TABS.find((t) => t.id === peekId) ?? null) : null;
  useTabSwipe(mainRef, {
    enabled: !isDesktop,
    tabIds: TAB_IDS,
    activeId: active.id,
    mapId: MAP_TAB,
    pageEl: (id) => pageEls.current.get(id) ?? null,
    setPeek: setPeekId,
    onSwitch: selectTab,
  });

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
    <main
      ref={mainRef}
      className="relative flex h-dvh w-full flex-col overflow-hidden bg-linen"
      style={freezeHeight ? { height: freezeHeight } : undefined}
    >
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
            closeSignal={sheetCloseSignal}
          >
            <div className="space-y-6">
              {mapPanels.map(({ id, Component }) => (
                <Component key={id} />
              ))}
            </div>
          </MapSheet>
        ) : null}

        {/* the current page, and while swiping the neighbour sliding in beside it */}
        {[onMap ? null : active, peekTab].map((tab) =>
          tab ? (
            <div
              key={tab.id}
              ref={(el) => {
                if (el) pageEls.current.set(tab.id, el);
                else pageEls.current.delete(tab.id);
              }}
              aria-hidden={tab.id === active.id ? undefined : true}
              className="absolute inset-0 z-20"
              style={tab.id === active.id ? undefined : { transform: `translate3d(${tabIndex(tab.id) > tabIndex(active.id) ? 100 : -100}%,0,0)` }}
            >
              <Page tab={tab} user={user}>
                {panelsFor(tab).map(({ id, title, Component }, i, all) => (
                  <section
                    key={id}
                    aria-label={title}
                    style={{ animationDelay: `${60 + i * 90}ms` }}
                    className="animate-rise rounded-3xl bg-white p-4 shadow-lg shadow-ink/10 ring-1 ring-ink/5"
                  >
                    {all.length > 1 ? (
                      <SectionTitle
                        title={title}
                        Icon={PANEL_ICONS[id]}
                        accentBg={tab.accent.bg}
                      />
                    ) : null}
                    <Component />
                  </section>
                ))}
              </Page>
            </div>
          ) : null,
        )}
      </div>

      {/* phones: hidden while the on-screen keyboard is up, so it doesn't ride up above it (on the
          map the app keeps its height instead, so the bar stays put under the keyboard) */}
      <TabBar
        activeId={active.id}
        onSelect={tapTab}
        badges={{ friends: unread }}
        hidden={keyboardOpen && !onMap}
      />
    </main>
  );
}

/** Keyboard height below which a viewport shrink is not counted as the on-screen keyboard. */
const KEYBOARD_MIN_PX = 150;
const NON_TEXT_INPUTS = new Set([
  "button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit",
]);

function isTextField(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  if (el instanceof HTMLInputElement) return !el.readOnly && !NON_TEXT_INPUTS.has(el.type);
  return false;
}

/**
 * The on-screen keyboard: `open` when a text field has focus and the visible viewport is well
 * short of its full height, and that full height (px). Covers both the Android WebView (which
 * resizes the page) and mobile browsers (which shrink only the visual viewport). The full height
 * is the largest seen at the current width, so it resets on rotation.
 *
 * While open it also marks `<html data-keyboard="open">`, so anything can react in CSS
 * (globals.css hides `[data-hide-with-keyboard]` on phones) without importing the shell.
 */
/** The current `env(safe-area-inset-bottom)` in px, read from a throwaway element. */
function restingSafeBottom(): number {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)";
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  probe.remove();
  return px;
}

function useVirtualKeyboard(): { open: boolean; fullHeight: number } {
  const [state, setState] = useState({ open: false, fullHeight: 0 });
  useEffect(() => {
    const vv = window.visualViewport;
    const height = () => vv?.height ?? window.innerHeight;
    let width = window.innerWidth;
    let full = height();
    const update = () => {
      if (window.innerWidth !== width) {
        width = window.innerWidth;
        full = height();
      }
      full = Math.max(full, height());
      const open = isTextField(document.activeElement) && full - height() > KEYBOARD_MIN_PX;
      setState((s) => (s.open === open && s.fullHeight === full ? s : { open, fullHeight: full }));
      const root = document.documentElement;
      if (open) {
        root.dataset.keyboard = "open";
      } else {
        delete root.dataset.keyboard;
        // the bottom safe-area inset at rest: Android drops it to 0 while the keyboard is up,
        // which would shrink the tab bar (and so resize the map) under the keyboard
        root.style.setProperty("--safe-bottom-at-rest", `${restingSafeBottom()}px`);
      }
    };
    // on focusout the next field isn't focused yet; wait a frame so moving between fields doesn't flicker
    let frame = 0;
    const updateNextFrame = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    updateNextFrame();
    vv?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", updateNextFrame);
    document.addEventListener("focusout", updateNextFrame);
    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", updateNextFrame);
      document.removeEventListener("focusout", updateNextFrame);
      delete document.documentElement.dataset.keyboard;
    };
  }, []);
  return state;
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
      className="zm-dots absolute inset-0 z-20 flex touch-pan-y flex-col overflow-y-auto bg-linen text-ink"
    >
      {/* navy hero band with the section's colour; the cards overlap its bottom edge */}
      <header className="relative shrink-0 bg-gradient-to-br from-ink via-ink to-yale pb-14 pt-[max(1.25rem,env(safe-area-inset-top))] text-ivory">
        {/* clip only the decorative circles: the header itself must not clip the account menu.
            The header has no z-index on purpose: the cards after it paint over its bottom edge,
            while the menu's own z-index lifts it above those cards. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {/* a soft glow in the section's colour, drifting slowly */}
          <div className={`animate-drift absolute -right-16 -top-24 h-72 w-72 rounded-full opacity-25 blur-3xl ${accent.bg}`} />
          <div className="absolute -bottom-24 right-6 h-40 w-40 rounded-full bg-yale/45" />
          <div className="absolute -bottom-10 -right-10 h-24 w-24 rounded-full bg-yale/70" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-ivory/20 to-transparent" />
        </div>
        {/* data-page-hero / data-page-body: a panel may move these (the friends pull-down code) */}
        <div data-page-hero className="relative mx-auto flex max-w-2xl items-center gap-3 px-4">
          <span
            className={`animate-pop flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-ink shadow-lg shadow-black/25 ring-4 ring-ivory/15 ${accent.bg}`}
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
      <div data-page-body className="relative mx-auto -mt-7 flex w-full max-w-2xl flex-1 flex-col gap-3 px-4 pb-8">
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

/** Unread direct messages, for the Chat tab badge. */
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
  hidden,
}: {
  activeId: string;
  onSelect: (id: string) => void;
  badges: Record<string, number>;
  hidden: boolean;
}) {
  return (
    <nav
      // a sideways swipe anywhere on the bar switches tabs, on the map too (see swipe.ts)
      data-swipe-anywhere
      // keyboard up: keep its resting height (globals.css), so the map above doesn't resize
      data-tab-bar
      aria-label="Sections"
      hidden={hidden}
      className="relative z-30 bg-ink bg-gradient-to-b from-yale/40 to-ink pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.75rem))] shadow-[0_-4px_16px_rgba(21,50,67,0.35)] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-ivory/25 before:to-transparent"
    >
      <div
        role="tablist"
        className="mx-auto flex max-w-2xl items-center justify-between px-6 pt-3"
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
              className={`group relative flex min-w-0 flex-1 items-center justify-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ivory ${
                selected ? accent.text : "text-ivory/60 hover:text-ivory"
              }`}
            >
              {isMap ? (
                <span
                  className={`-my-3 flex h-12 w-12 items-center justify-center rounded-full text-ink shadow-lg shadow-black/30 ring-4 ring-ink transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover:-translate-y-0.5 group-active:scale-95 ${
                    accent.bg
                  } ${selected ? "scale-110" : "opacity-90"}`}
                >
                  <Icon className="h-7 w-7" />
                </span>
              ) : (
                <span className="relative flex h-10 w-10 flex-col items-center justify-center">
                  {/* a soft disc behind the selected symbol */}
                  <span
                    aria-hidden
                    className={`absolute inset-0 rounded-2xl bg-ivory/10 transition-all duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] ${
                      selected ? "scale-100 opacity-100" : "scale-50 opacity-0 group-hover:scale-90 group-hover:opacity-60"
                    }`}
                  />
                  <Icon
                    className={`relative h-6 w-6 transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] group-active:scale-90 ${selected ? "scale-115 -translate-y-px" : ""}`}
                  />
                  {badges[id] ? (
                    <span
                      aria-hidden
                      className="animate-pop absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-ink"
                    >
                      {badges[id] > 9 ? "9+" : badges[id]}
                    </span>
                  ) : null}
                  <span
                    aria-hidden
                    className={`absolute bottom-[-6px] h-1.5 rounded-full transition-all duration-300 ${accent.bg} ${
                      selected ? "w-4 opacity-100" : "w-1.5 opacity-0"
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
        className="zm-press relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-yale to-ink text-sm font-bold text-ivory shadow-md ring-2 ring-ivory/80 before:absolute before:-inset-0.5 before:content-[''] hover:ring-jasmine"
      >
        {initial}
      </button>
      {open ? (
        <div className="animate-pop absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 origin-top-right rounded-2xl bg-white p-4 text-sm text-ink shadow-xl ring-1 ring-ink/10">
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
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-linen px-3 py-2.5 font-semibold text-ink hover:bg-ash/40 max-md:min-h-11"
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
              className="w-full rounded-full bg-ink px-3 py-2.5 font-semibold text-ivory hover:bg-yale max-md:min-h-11"
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
