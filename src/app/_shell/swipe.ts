"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Swiping between bottom tabs on a phone. The page follows the finger, the neighbouring tab
 * slides in beside it, and on release it either snaps to that tab or springs back. Past the
 * first or last tab the page resists and bounces back.
 *
 * On the map, where a drag pans the map, only a swipe that starts at the screen's edge counts,
 * or one that starts on something marked `data-swipe-anywhere` (the tab bar), which is never map.
 * A touch inside an input, a sideways scroller or anything marked `data-no-swipe` is left alone.
 * Overlays (chat, friend code) are portalled outside the shell, so they never see these listeners.
 *
 * Positions are written straight to the page elements while dragging, so the map and the
 * panels don't re-render on every touchmove.
 */

/** How far from the left or right edge a swipe on the map must start, in px. */
export const EDGE_PX = 28;
/** Movement before deciding whether a touch is a sideways swipe or a scroll. */
const LOCK_PX = 10;
const SETTLE_MS = 240;

export type Axis = "x" | "y" | null;

/** Which way a touch is going, once it has moved far enough to tell. */
export function lockAxis(dx: number, dy: number): Axis {
  if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return null;
  return Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
}

/** Whether a released swipe goes to the neighbouring tab: far enough, or a quick flick. */
export function shouldCommit({ dx, ms, width, hasNeighbor }: { dx: number; ms: number; width: number; hasNeighbor: boolean }): boolean {
  if (!hasNeighbor) return false;
  const speed = Math.abs(dx) / Math.max(ms, 1); // px per ms
  return Math.abs(dx) > width * 0.33 || (speed > 0.45 && Math.abs(dx) > 40);
}

/** Past the first or last tab the page moves a third as far as the finger. */
export function resist(dx: number, hasNeighbor: boolean): number {
  return hasNeighbor ? dx : dx / 3;
}

function inNoSwipeZone(target: EventTarget | null, root: HTMLElement): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== root; el = el.parentElement) {
    if (el instanceof HTMLElement) {
      if (el.dataset.noSwipe !== undefined) return true;
      if (el.matches("input, textarea, select, [contenteditable='true']")) return true;
      const ox = getComputedStyle(el).overflowX;
      if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth) return true;
    }
  }
  return false;
}

export interface TabSwipeOptions {
  enabled: boolean;
  tabIds: readonly string[];
  activeId: string;
  /** The tab whose page is the map itself (no page element; only edge swipes start there). */
  mapId: string;
  /** The page element for a tab, when it is rendered. */
  pageEl: (id: string) => HTMLElement | null;
  /** Render (or stop rendering) the neighbour's page beside the current one. */
  setPeek: (id: string | null) => void;
  onSwitch: (id: string) => void;
}

export function useTabSwipe(rootRef: RefObject<HTMLElement | null>, opts: TabSwipeOptions): void {
  // the latest options, read inside long-lived listeners
  const live = useRef(opts);
  useEffect(() => {
    live.current = opts;
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !opts.enabled) return;

    let start: { x: number; y: number; t: number; edge: boolean } | null = null;
    let axis: Axis = null;
    let dx = 0;
    let peekId: string | null = null;
    let settling = false;

    const width = () => root.clientWidth || window.innerWidth;
    const neighbor = (dir: number) => {
      const { tabIds, activeId } = live.current;
      return tabIds[tabIds.indexOf(activeId) + dir] ?? null;
    };

    const place = (offset: number, animate: boolean) => {
      const { activeId, pageEl } = live.current;
      const w = width();
      const style = (el: HTMLElement | null, x: number) => {
        if (!el) return;
        el.style.transition = animate ? `transform ${SETTLE_MS}ms cubic-bezier(.2,.8,.2,1)` : "none";
        el.style.transform = `translate3d(${x}px,0,0)`;
      };
      style(pageEl(activeId), offset);
      if (peekId) style(pageEl(peekId), offset + (offset < 0 ? w : -w));
    };

    const clear = () => {
      const { tabIds, pageEl } = live.current;
      for (const id of tabIds) {
        const el = pageEl(id);
        if (el) {
          el.style.transition = "";
          el.style.transform = "";
        }
      }
    };

    const reset = () => {
      start = null;
      axis = null;
      dx = 0;
    };

    const onStart = (e: TouchEvent) => {
      if (settling || e.touches.length !== 1) return reset();
      const t = e.touches[0];
      const { activeId, mapId } = live.current;
      const w = width();
      const edge = t.clientX < EDGE_PX || t.clientX > w - EDGE_PX;
      const anywhere = e.target instanceof Element && e.target.closest("[data-swipe-anywhere]") !== null;
      if (activeId === mapId && !edge && !anywhere) return reset();
      if (inNoSwipeZone(e.target, root)) return reset();
      start = { x: t.clientX, y: t.clientY, t: performance.now(), edge };
      axis = null;
      dx = 0;
      // keep the map from panning on an edge swipe
      if (activeId === mapId) e.stopPropagation();
    };

    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const t = e.touches[0];
      const mx = t.clientX - start.x;
      const my = t.clientY - start.y;
      const onMap = live.current.activeId === live.current.mapId;
      if (onMap) e.stopPropagation();
      if (axis === null) {
        axis = lockAxis(mx, my);
        if (axis === "y") return reset();
        if (axis === null) return;
      }
      if (e.cancelable) e.preventDefault();
      const dir = mx < 0 ? 1 : -1; // swipe left → the next tab
      const next = neighbor(dir);
      const wanted = next && next !== live.current.mapId ? next : null;
      if (wanted !== peekId) {
        peekId = wanted;
        live.current.setPeek(wanted);
      }
      dx = resist(mx, next !== null);
      place(dx, false);
    };

    const finish = (e: TouchEvent, cancelled: boolean) => {
      if (!start) return;
      if (live.current.activeId === live.current.mapId) e.stopPropagation();
      if (axis !== "x") return reset();
      const dir = dx < 0 ? 1 : -1;
      const next = neighbor(dir);
      const go = !cancelled && shouldCommit({ dx, ms: performance.now() - start.t, width: width(), hasNeighbor: next !== null });
      reset();
      settling = true;
      const w = width();
      place(go ? (dir === 1 ? -w : w) : 0, true);
      window.setTimeout(() => {
        const { pageEl, activeId } = live.current;
        if (go && next) {
          // the old page is unmounted by the switch; only the arriving one keeps a transform to drop
          live.current.onSwitch(next);
          const el = next ? pageEl(next) : null;
          if (el) {
            el.style.transition = "";
            el.style.transform = "";
          }
        } else {
          const el = pageEl(activeId);
          if (el) {
            el.style.transition = "";
            el.style.transform = "";
          }
        }
        peekId = null;
        live.current.setPeek(null);
        settling = false;
      }, SETTLE_MS);
    };
    const onEnd = (e: TouchEvent) => finish(e, false);
    const onCancel = (e: TouchEvent) => finish(e, true);

    // capture, so an edge swipe on the map is seen (and stopped) before the map gets it
    const capture = { capture: true } as const;
    const active = { capture: true, passive: false } as const;
    root.addEventListener("touchstart", onStart, capture);
    root.addEventListener("touchmove", onMove, active);
    root.addEventListener("touchend", onEnd, capture);
    root.addEventListener("touchcancel", onCancel, capture);
    return () => {
      root.removeEventListener("touchstart", onStart, capture);
      root.removeEventListener("touchmove", onMove, active);
      root.removeEventListener("touchend", onEnd, capture);
      root.removeEventListener("touchcancel", onCancel, capture);
      clear();
    };
  }, [rootRef, opts.enabled]);
}
