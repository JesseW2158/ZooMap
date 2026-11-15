"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { FRIEND_CODE_HELP, canScanInApp, useFriendCode, useQrScanner } from "./overlays";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, QrIcon, ScanIcon } from "./icons";

/** Phones: below the shell's 768 px desktop breakpoint. */
const PHONE_QUERY = "(max-width: 767px)";
function subscribePhone(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}

/** How far the page moves per pixel the finger travels when pulling down; heavier than a scroll. */
const PULL_DAMPING = 0.5;
/** Pull distance (after damping) that opens the code on release, and the most it can stretch. */
const PULL_THRESHOLD = 80;
const PULL_MAX = 200;
/** A swipe on the code or scanner screens that counts on release (px). */
const SWIPE_THRESHOLD = 80;
/** Length of the open and close slides. */
const SLIDE_MS = 320;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/** Extra navy (px) above the card on the Friends page, room for the pull cue... */
const CUE_ROOM = 44;
/** ...which is this tall (icon disc and arrow), sitting this far above the card. */
const CUE_HEIGHT = 50;
const CUE_GAP = 6;

/** The nearest ancestor that scrolls vertically: the shell's page for this tab. */
export function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

/**
 * closed: the Friends page. opening/closing: sliding between it and the code. open: your code
 * fills the screen. scan: the scanner has slid up over the code.
 */
type Mode = "closed" | "opening" | "open" | "scan" | "closing";

export interface PullCodeState {
  mode: Mode;
  /** closed: how far the page is pulled down (px). */
  pull: number;
  /** open/scan: the finger's travel since it touched, up negative (px). */
  drag: number;
  /** A finger is moving things, so they follow it without easing. */
  dragging: boolean;
  /** Closing from the scanner: it stays where it was let go while Friends slides back over it. */
  scanExit: number | null;
  open: () => void;
  close: () => void;
}

/**
 * The pull-down friend code on the page that `scroller` scrolls, and the scanner beyond it.
 * Friends: drag down at the top of the page; letting go past the threshold opens your code.
 * Code: swipe up for the scanner, swipe down for Friends. Scanner: swipe down for Friends.
 * Nothing scrolls under the code or scanner. Touch only.
 */
export function usePullCode(scroller: HTMLElement | null, enabled: boolean): PullCodeState {
  const [mode, setMode] = useState<Mode>("closed");
  const [pull, setPull] = useState(0);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [scanExit, setScanExit] = useState<number | null>(null);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // opened from a button: paint everything at rest first so it slides
  useEffect(() => {
    if (mode !== "opening") return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setMode("open"));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [mode]);

  // unmount once the close slide has finished
  useEffect(() => {
    if (mode !== "closing") return;
    const timer = setTimeout(() => {
      setMode("closed");
      setScanExit(null);
    }, SLIDE_MS + 40);
    return () => clearTimeout(timer);
  }, [mode]);

  useEffect(() => {
    if (!enabled || !scroller) return;
    let startY: number | null = null;
    let current = 0;

    const start = (e: TouchEvent) => {
      current = 0;
      const m = modeRef.current;
      if (e.touches.length !== 1) {
        startY = null;
      } else if (m === "closed") {
        const inField = e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]");
        startY = scroller.scrollTop <= 0 && !inField ? e.touches[0].clientY : null;
      } else {
        startY = m === "open" || m === "scan" ? e.touches[0].clientY : null;
      }
    };
    const move = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      const m = modeRef.current;
      if (m === "closed") {
        if (dy <= 0 && current === 0) {
          startY = null; // an upward drag: let the page scroll
          return;
        }
        if (e.cancelable) e.preventDefault(); // no scroll bounce or browser pull-to-refresh meanwhile
        current = Math.min(PULL_MAX, Math.max(0, dy) * PULL_DAMPING);
        setPull(current);
      } else {
        if (e.cancelable) e.preventDefault(); // nothing scrolls under the code or scanner
        current = m === "scan" ? Math.max(0, dy) : dy; // the scanner only goes down
        setDrag(current);
      }
      setDragging(true);
    };
    const finish = (commit: boolean) => () => {
      if (commit && startY !== null) {
        const m = modeRef.current;
        if (m === "closed") {
          if (current >= PULL_THRESHOLD) setMode("open");
          else if (current > 0) setMode("closing"); // short pull: ease back up
        } else if (m === "open") {
          if (current <= -SWIPE_THRESHOLD) setMode("scan");
          else if (current >= SWIPE_THRESHOLD) setMode("closing");
        } else if (m === "scan" && current >= SWIPE_THRESHOLD) {
          setScanExit(current);
          setMode("closing");
        }
      }
      startY = null;
      current = 0;
      setPull(0);
      setDrag(0);
      setDragging(false);
    };
    const end = finish(true);
    const cancel = finish(false);

    scroller.addEventListener("touchstart", start, { passive: true });
    scroller.addEventListener("touchmove", move, { passive: false });
    scroller.addEventListener("touchend", end);
    scroller.addEventListener("touchcancel", cancel);
    return () => {
      scroller.removeEventListener("touchstart", start);
      scroller.removeEventListener("touchmove", move);
      scroller.removeEventListener("touchend", end);
      scroller.removeEventListener("touchcancel", cancel);
    };
  }, [scroller, enabled]);

  return {
    mode,
    pull,
    drag,
    dragging,
    scanExit,
    open: () => {
      scroller?.scrollTo({ top: 0 });
      setMode((m) => (m === "closed" || m === "closing" ? "opening" : m));
    },
    close: () => {
      if (modeRef.current === "scan") setScanExit(0);
      setMode("closing");
    },
  };
}

/** Sizes of the page the code lives on, in CSS px, kept current with a ResizeObserver. */
interface PageMetrics {
  /** The scroller's visible height: one screen. */
  screen: number;
  /** The navy header's height. */
  header: number;
  /** Where the page body (the white card and what follows) starts; it overlaps the header. */
  bodyTop: number;
}

function usePageMetrics(scroller: HTMLElement | null): PageMetrics {
  const [metrics, setMetrics] = useState<PageMetrics>({ screen: 0, header: 0, bodyTop: 0 });
  useEffect(() => {
    if (!scroller) return;
    const header = scroller.querySelector<HTMLElement>("[data-page-hero]")?.parentElement ?? null;
    const body = scroller.querySelector<HTMLElement>("[data-page-body]");
    const measure = () =>
      setMetrics({ screen: scroller.clientHeight, header: header?.offsetHeight ?? 0, bodyTop: body?.offsetTop ?? 0 });
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    if (header) observer.observe(header);
    return () => observer.disconnect();
  }, [scroller]);
  return metrics;
}

function clearMotion(el: HTMLElement) {
  el.style.transition = "";
  el.style.transform = "";
  el.style.opacity = "";
  el.style.zIndex = "";
  el.style.pointerEvents = "";
}

/**
 * The pull-down code on the Friends page. The navy header stays put while its row (title,
 * bell, account) fades upward; the page body (white card and the light background) falls,
 * uncovering your code on the bubble backdrop behind it. Open, the body has fallen off screen,
 * and the scanner waits below the screen to be swiped up.
 *
 * The shell's page tags its header row `data-page-hero` and its body `data-page-body`; this
 * moves them with inline styles and clears them when closed. Everything else is portalled into
 * the page's scroll container, under the moved parts, bottom to top: backdrop, code, scanner,
 * the falling light background.
 */
export function PullDownLayer({ scroller, state }: { scroller: HTMLElement | null; state: PullCodeState }) {
  const { mode, pull, drag, dragging, scanExit, close } = state;
  const { screen, header, bodyTop } = usePageMetrics(scroller);
  const active = !(mode === "closed" && pull <= 0);
  const shown = mode === "open" || mode === "scan";

  /** How far the page body has fallen (px). */
  const fall = mode === "closed" ? pull : shown ? screen : 0;
  /** How far the header row has faded out, 0 to 1. */
  const fade = mode === "closed" ? Math.min(1, pull / PULL_THRESHOLD) : shown ? 1 : 0;
  /** The code screen's title, close button and cue: gone as soon as a swipe starts. */
  const chrome = mode === "open" ? Math.max(0, 1 - Math.abs(drag) / SWIPE_THRESHOLD) : 0;
  /** Swiping down on the code: it sinks a little, saying Friends is coming back. */
  const sink = mode === "open" ? Math.max(0, drag) * 0.35 : 0;
  /** Where the scanner's top edge is (px down from the top of the screen). */
  const scanY =
    mode === "scan"
      ? Math.max(0, drag)
      : mode === "open"
        ? Math.max(0, screen + Math.min(0, drag))
        : mode === "closing" && scanExit !== null
          ? scanExit
          : screen;
  const scanMounted = active && (mode !== "closing" || scanExit !== null);
  /** Going back to Friends: the code and scanner fade while the page slides back over them, so
   *  the real header is what remains under the returning header row. */
  const leaving = mode === "closing";

  const transition = (props: string[]) =>
    dragging ? "none" : props.map((p) => `${p} ${SLIDE_MS}ms ${EASE}`).join(", ");

  useEffect(() => {
    if (!scroller) return;
    const hero = scroller.querySelector<HTMLElement>("[data-page-hero]");
    const body = scroller.querySelector<HTMLElement>("[data-page-body]");
    if (!hero || !body) return;
    if (!active) {
      clearMotion(hero);
      clearMotion(body);
      return;
    }
    // both above the backdrop while moving (only then: the account menu must otherwise
    // stack above the cards)
    hero.style.zIndex = "1";
    hero.style.transition = transition(["transform", "opacity"]);
    hero.style.transform = `translateY(${-fade * 32}px)`;
    hero.style.opacity = String(1 - fade);
    hero.style.pointerEvents = fade > 0.5 ? "none" : "";
    body.style.zIndex = "1";
    body.style.transition = transition(["transform"]);
    body.style.transform = `translateY(${fall}px)`;
  });

  // phones: deepen the navy band above the card so the pull cue fits between the header row
  // and your profile; put it (and anything moved mid-pull) back when the panel goes away
  useEffect(() => {
    if (!scroller) return;
    const header = scroller.querySelector<HTMLElement>("[data-page-hero]")?.parentElement;
    if (header) header.style.paddingBottom = `calc(3.5rem + ${CUE_ROOM}px)`;
    return () => {
      if (header) header.style.paddingBottom = "";
      for (const sel of ["[data-page-hero]", "[data-page-body]"]) {
        const el = scroller.querySelector<HTMLElement>(sel);
        if (el) clearMotion(el);
      }
    };
  }, [scroller]);

  if (!scroller) return null;
  return createPortal(
    <>
      {active ? (
        <>
          {/* the header crossfades into the bubble backdrop as its row fades */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden"
            style={{ height: header, opacity: fade, transition: transition(["opacity"]) }}
          >
            <Bubbles top={0} height={screen} />
          </div>
          {/* the gap the body leaves as it falls: the same backdrop, opaque */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 overflow-hidden"
            style={{ top: header, height: fall, transition: transition(["height"]) }}
          >
            <Bubbles top={-header} height={screen} />
          </div>
          <div
            className={`absolute inset-x-0 top-0 text-ivory ${mode === "open" ? "" : "pointer-events-none"}`}
            style={{
              height: screen,
              transform: `translateY(${sink}px)`,
              opacity: leaving ? 0 : 1,
              transition: transition(["transform", "opacity"]),
            }}
          >
            <PulledCode open={mode === "open"} chrome={chrome} chromeTransition={transition(["opacity"])} onClose={close} />
          </div>
          {scanMounted ? (
            <div
              className={`absolute inset-x-0 top-0 overflow-hidden text-ivory ${mode === "scan" ? "" : "pointer-events-none"}`}
              style={{
                height: screen,
                transform: `translateY(${scanY}px)`,
                opacity: leaving ? 0 : 1,
                transition: transition(["transform", "opacity"]),
              }}
            >
              <ScanScreen height={screen} scanning={mode === "scan"} onClose={close} />
            </div>
          ) : null}
          {/* the light background, falling with the body: the body itself is see-through
              between and below its cards, and the code must stay hidden behind it */}
          <div
            aria-hidden
            className="zm-dots pointer-events-none absolute inset-x-0 bg-linen"
            style={{
              top: header,
              height: screen,
              transform: `translateY(${fall}px)`,
              transition: transition(["transform"]),
            }}
          />
        </>
      ) : null}
      <PullCue top={bodyTop - CUE_HEIGHT - CUE_GAP} hidden={fade} transition={transition(["opacity"])} />
    </>,
    scroller,
  );
}

/**
 * The Friends header's look, one screen tall: navy fading to blue at the bottom right, translucent
 * blue circles and the drifting pink glow. `top` shifts it so clipped copies line up as one.
 */
function Bubbles({ top, height }: { top: number; height: number }) {
  return (
    <div
      className="absolute inset-x-0 overflow-hidden bg-gradient-to-br from-ink via-ink to-yale"
      style={{ top, height }}
    >
      <div className="animate-drift absolute -right-16 -top-24 h-72 w-72 rounded-full bg-rose opacity-25 blur-3xl" />
      <div className="absolute -bottom-24 right-6 h-40 w-40 rounded-full bg-yale/45" />
      <div className="absolute -bottom-10 -right-10 h-24 w-24 rounded-full bg-yale/70" />
      <div className="absolute -left-20 top-1/3 h-48 w-48 rounded-full bg-yale/25" />
    </div>
  );
}

/** A symbol in a soft ringed disc, as the swipe cues use. */
function CueDisc({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ivory/15 ring-1 ring-ivory/30">
      {children}
    </span>
  );
}

/**
 * Right above your profile, in the navy band: a QR symbol with an arrow under it, saying your
 * code pulls down. Fades out as you pull (`hidden` 0 to 1).
 */
function PullCue({ top, hidden, transition }: { top: number; hidden: number; transition: string }) {
  if (top <= 0) return null;
  return (
    <div
      aria-hidden
      className="animate-fade pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center text-ivory"
      style={{ top, opacity: Math.max(0, 1 - hidden * 2), transition }}
    >
      <CueDisc>
        <QrIcon className="h-[18px] w-[18px]" />
      </CueDisc>
      <ChevronDownIcon className="-mt-0.5 h-5 w-5 animate-bounce" />
    </div>
  );
}

/** Title row for the code and scanner screens: a symbol, a label and a close button. */
function ScreenTitle({
  Icon,
  label,
  onClose,
  focusable,
}: {
  Icon: (p: { className?: string }) => React.ReactNode;
  label: string;
  onClose: () => void;
  focusable: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ivory/70">
        <Icon className="h-4 w-4" />
        {label}
      </h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="Back to Friends"
        tabIndex={focusable ? 0 : -1}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-ivory/10 text-ivory hover:bg-ivory/20"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Your friend code: one screen tall, behind the page body, so the body uncovers it as it falls.
 * The title, close button and swipe-up-to-scan cue appear once it is open. A fresh code each time.
 */
function PulledCode({
  open,
  chrome,
  chromeTransition,
  onClose,
}: {
  open: boolean;
  chrome: number;
  chromeTransition: string;
  onClose: () => void;
}) {
  const { svg, error } = useFriendCode();
  const chromeStyle = { opacity: chrome, transition: chromeTransition };
  return (
    <section
      aria-label="My friend code"
      className="mx-auto flex h-full max-w-2xl flex-col px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]"
    >
      <div style={chromeStyle}>
        <ScreenTitle Icon={QrIcon} label="My friend code" onClose={onClose} focusable={open} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5">
        {error ? <p className="text-red-300">{error}</p> : null}
        {svg ? (
          // The SVG comes from the qrcode library, generated here from our own URL. The white
          // tile keeps the dark-on-light contrast scanners need.
          <div
            className="w-full max-w-[16rem] overflow-hidden rounded-3xl bg-white p-2 shadow-xl shadow-black/40 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : !error ? (
          <div aria-label="Making your code…" className="aspect-square w-full max-w-[16rem] animate-pulse rounded-3xl bg-ivory/10" />
        ) : null}
        <p className="max-w-xs text-center text-sm text-ivory/70">{FRIEND_CODE_HELP}</p>
      </div>

      {/* swipe up for the scanner: an arrow above the scan symbol */}
      <div aria-hidden className="flex flex-col items-center gap-1 text-xs font-semibold text-ivory" style={chromeStyle}>
        <ChevronUpIcon className="-mb-0.5 h-5 w-5 animate-bounce" />
        <CueDisc>
          <ScanIcon className="h-[18px] w-[18px]" />
        </CueDisc>
        <span className="text-ivory/70">Swipe up to scan</span>
      </div>
    </section>
  );
}

/**
 * The scanner, slid up over your code: the camera (once fully up) reading a friend's code, on
 * the same bubble backdrop. Swipe down or close to go back to Friends.
 */
function ScanScreen({ height, scanning, onClose }: { height: number; scanning: boolean; onClose: () => void }) {
  const { video, status } = useQrScanner(scanning);
  const inApp = canScanInApp();
  return (
    <div className="relative h-full shadow-[0_-12px_32px_rgba(0,0,0,0.35)]">
      <Bubbles top={0} height={height} />
      <section
        aria-label="Scan a friend code"
        className="relative mx-auto flex h-full max-w-2xl flex-col px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]"
      >
        <ScreenTitle Icon={ScanIcon} label="Scan a friend code" onClose={onClose} focusable={scanning} />

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5">
          {inApp ? (
            <>
              <video
                ref={video}
                muted
                playsInline
                className="aspect-square w-full max-w-[16rem] rounded-3xl bg-black/40 object-cover shadow-xl shadow-black/40 ring-2 ring-ivory/20"
              />
              <p className="max-w-xs text-center text-sm text-ivory/70">
                {status ?? "Point the camera at a friend's ZooMap code."}
              </p>
            </>
          ) : (
            <div className="max-w-xs space-y-3 text-center">
              <p className="text-lg font-semibold">Use your camera app</p>
              <p className="text-sm text-ivory/70">
                This browser can&apos;t scan inside ZooMap. Open your phone&apos;s camera, point it at your friend&apos;s
                code and tap the link that appears. It opens ZooMap to add them.
              </p>
            </div>
          )}
        </div>

        <div aria-hidden className="flex flex-col items-center gap-0.5 text-xs font-semibold text-ivory/70">
          Swipe down to go back
          <ChevronDownIcon className="h-5 w-5 animate-bounce text-ivory" />
        </div>
      </section>
    </div>
  );
}
