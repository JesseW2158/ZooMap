"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { mapStore } from "@/shared/ui";

const DESKTOP_QUERY = "(min-width: 768px)";
/** Height of the collapsed mobile sheet: the grab handle and the title row. */
const PEEK_PX = 64;
/** How far a drag must travel before it counts as a swipe rather than a tap. */
const SWIPE_PX = 48;
const TAP_PX = 6;

function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/**
 * How much of the map the sheet covers, as CSS variables for the map's own overlays (the
 * density legend, the route card, dev tools) so they can sit beside it instead of under it.
 * Set on the element that contains both the map and the sheet.
 */
export function mapInsetVars(isDesktop: boolean, open: boolean): CSSProperties {
  return {
    "--map-inset-left": isDesktop && open ? "20.75rem" : "0px",
    "--map-inset-bottom": isDesktop ? "0px" : `${PEEK_PX}px`,
  } as CSSProperties;
}

export interface MapSheetProps {
  title: string;
  Icon: ComponentType<{ className?: string }>;
  /** Literal Tailwind class for the badge behind the icon. */
  accentBg: string;
  /** Desktop sidebar open state, owned by the shell so it can set the inset variables. */
  sidebarOpen: boolean;
  onSidebarOpenChange: (open: boolean) => void;
  isDesktop: boolean;
  hidden?: boolean;
  children: ReactNode;
}

/**
 * Panels that live on the map itself: a left sidebar on desktop, and on phones a bottom sheet
 * that peeks above the tab bar and is swiped (or tapped) up to open. Panels stay mounted in
 * both states so their polling and state carry on.
 */
export function MapSheet(props: MapSheetProps) {
  return props.isDesktop ? <Sidebar {...props} /> : <BottomSheet {...props} />;
}

/**
 * Reopens the closed desktop sidebar. The shell puts it in the top bar beside the search, in
 * the flow, so it never floats over the search, the route card or anything else that expands.
 */
export function SidebarOpenButton({
  title,
  Icon,
  accentBg,
  onOpen,
}: Pick<MapSheetProps, "title" | "Icon" | "accentBg"> & { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={false}
      className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-white pl-1.5 pr-3 text-sm font-semibold text-ink shadow-md shadow-ink/20"
    >
      <span className={`flex h-7 w-7 items-center justify-center rounded-full ${accentBg}`}>
        <Icon className="h-4 w-4" />
      </span>
      {title}
      <span aria-hidden>›</span>
    </button>
  );
}

function Sidebar({ title, Icon, accentBg, sidebarOpen, onSidebarOpenChange, hidden, children }: MapSheetProps) {
  // closed, the shell shows SidebarOpenButton in the top bar instead
  if (!sidebarOpen) return null;
  return (
    <aside
      aria-label={title}
      hidden={hidden}
      className="absolute bottom-3 left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[8] flex w-80 flex-col overflow-hidden rounded-2xl bg-white text-ink shadow-lg shadow-ink/20"
    >
      <SheetHeader title={title} Icon={Icon} accentBg={accentBg}>
        <button
          type="button"
          onClick={() => onSidebarOpenChange(false)}
          aria-label={`Hide ${title}`}
          aria-expanded
          className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-yale hover:bg-linen"
        >
          ‹
        </button>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
    </aside>
  );
}

function BottomSheet({ title, Icon, accentBg, hidden, children }: MapSheetProps) {
  const [expanded, setExpanded] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const start = useRef<{ y: number; travel: number } | null>(null);

  // anything that asks the map to show something closes the sheet so the map is visible
  useEffect(() => {
    let { routeRequest, flyRequest, selectedPlaceId } = mapStore.get();
    return mapStore.subscribe(() => {
      const s = mapStore.get();
      if (
        (s.routeRequest && s.routeRequest !== routeRequest) ||
        (s.flyRequest && s.flyRequest !== flyRequest) ||
        (s.selectedPlaceId && s.selectedPlaceId !== selectedPlaceId)
      ) {
        setExpanded(false);
      }
      ({ routeRequest, flyRequest, selectedPlaceId } = s);
    });
  }, []);

  // Swiping down on the open sheet's content drags the sheet down like the header does, and closes
  // it past SWIPE_PX, but only for a swipe that starts with the content scrolled to the top: a
  // swipe that begins mid-list just scrolls, even if it reaches the top on the way.
  // Native listeners: touchmove must be non-passive to stop the browser's own overscroll.
  useEffect(() => {
    const el = content.current;
    if (!el || !expanded) return;
    let startY = 0;
    let travel = 0;
    let pulling = false;
    let pulled = 0;
    let atTopAtStart = false;
    const onStart = (e: TouchEvent) => {
      startY = e.touches[0]!.clientY;
      atTopAtStart = el.scrollTop <= 0;
      travel = Math.max(0, (sheet.current?.offsetHeight ?? 0) - PEEK_PX);
      pulling = false;
      pulled = 0;
    };
    const onMove = (e: TouchEvent) => {
      const dy = e.touches[0]!.clientY - startY;
      if (!pulling) {
        if (!atTopAtStart || dy <= TAP_PX || el.scrollTop > 0) return;
        pulling = true;
        startY = e.touches[0]!.clientY; // start the drag from here, so the sheet does not jump
      }
      e.preventDefault();
      pulled = Math.min(Math.max(e.touches[0]!.clientY - startY, 0), travel);
      setDrag(pulled);
    };
    const onEnd = () => {
      if (!pulling) return;
      pulling = false;
      setDrag(null);
      if (pulled > SWIPE_PX) setExpanded(false);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [expanded]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const height = sheet.current?.offsetHeight ?? 0;
    start.current = { y: e.clientY, travel: Math.max(0, height - PEEK_PX) };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(0);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const dy = e.clientY - start.current.y;
    const { travel } = start.current;
    // collapsed sheets only move up, open ones only down
    setDrag(expanded ? Math.min(Math.max(dy, 0), travel) : Math.max(Math.min(dy, 0), -travel));
  };

  const onPointerUp = () => {
    const dy = drag ?? 0;
    start.current = null;
    setDrag(null);
    if (Math.abs(dy) < TAP_PX) setExpanded((x) => !x);
    else if (!expanded && dy < -SWIPE_PX) setExpanded(true);
    else if (expanded && dy > SWIPE_PX) setExpanded(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setExpanded((x) => !x);
    } else if (e.key === "Escape") {
      setExpanded(false);
    }
  };

  const base = expanded ? "0px" : `calc(100% - ${PEEK_PX}px)`;
  const transform = `translateY(calc(${base} + ${drag ?? 0}px))`;

  return (
    <div
      ref={sheet}
      hidden={hidden}
      aria-label={title}
      role="region"
      style={{ transform, transition: drag === null ? "transform 260ms cubic-bezier(.2,.8,.2,1)" : "none" }}
      className="absolute inset-x-0 bottom-0 z-[8] flex h-[80%] flex-col rounded-t-3xl bg-white text-ink shadow-[0_-8px_24px_rgba(21,50,67,0.25)]"
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? `Close ${title}` : `Open ${title}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="shrink-0 cursor-grab touch-none select-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink active:cursor-grabbing"
        style={{ height: PEEK_PX }}
      >
        <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-ash" />
        <SheetHeader title={title} Icon={Icon} accentBg={accentBg} compact>
          <span className="text-xs font-medium text-yale">{expanded ? "Swipe down" : "Swipe up"}</span>
        </SheetHeader>
      </div>
      <div
        ref={content}
        inert={!expanded}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {children}
      </div>
    </div>
  );
}

function SheetHeader({
  title,
  Icon,
  accentBg,
  compact = false,
  children,
}: {
  title: string;
  Icon: ComponentType<{ className?: string }>;
  accentBg: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`flex items-center gap-2.5 px-4 ${compact ? "pt-1.5" : "py-3"}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink ${accentBg}`}>
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h2>
      {children}
    </div>
  );
}
