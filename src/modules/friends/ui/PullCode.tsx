"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { FRIEND_CODE_HELP, canScanInApp, useFriendCode, useQrScanner } from "./overlays";
import { ChevronDownIcon, CloseIcon, QrAddIcon, QrIcon, ScanIcon } from "./icons";

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
/** A swipe down on the code screen that goes back to Friends on release (px). */
const SWIPE_THRESHOLD = 80;
/** Length of the open and close slides. */
const SLIDE_MS = 320;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/** A transparent 1x1 GIF: without a poster, Android's WebView shows a grey placeholder picture
 *  in a video until its first frame. */
const BLANK_POSTER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
/** Extra navy (px) above the card on the Friends page, room for the pull cue... */
const CUE_ROOM = 52;
/** ...which is this tall (icon disc, a gap the bouncing arrow stays below, and the arrow),
 *  sitting this far above the card. */
const CUE_HEIGHT = 60;
const CUE_GAP = 6;

/** The nearest ancestor that scrolls vertically: the shell's page for this tab. */
export function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

/** closed: the Friends page. opening/closing: sliding between it and the code. open: your code fills the screen. */
type Mode = "closed" | "opening" | "open" | "closing";

export interface PullCodeState {
  mode: Mode;
  /** closed: how far the page is pulled down (px). */
  pull: number;
  /** open: how far the finger has swiped down since it touched (px). */
  drag: number;
  /** A finger is moving things, so they follow it without easing. */
  dragging: boolean;
  open: () => void;
  close: () => void;
}

/**
 * The pull-down friend code on the page that `scroller` scrolls. Friends: drag down at the top
 * of the page; letting go past the threshold opens your code. Code: swipe down for Friends, and
 * nothing scrolls under it. Touch only.
 */
export function usePullCode(scroller: HTMLElement | null, enabled: boolean): PullCodeState {
  const [mode, setMode] = useState<Mode>("closed");
  const [pull, setPull] = useState(0);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
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
    const timer = setTimeout(() => setMode("closed"), SLIDE_MS + 40);
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
        startY = m === "open" ? e.touches[0].clientY : null;
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
        if (e.cancelable) e.preventDefault(); // nothing scrolls under the code
        current = Math.max(0, dy); // only a swipe down means anything here
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
        } else if (m === "open" && current >= SWIPE_THRESHOLD) {
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
    open: () => {
      scroller?.scrollTo({ top: 0 });
      setMode((m) => (m === "closed" || m === "closing" ? "opening" : m));
    },
    close: () => setMode("closing"),
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
 * uncovering your code on the bubble backdrop behind it. Open, the body has fallen off screen.
 *
 * The shell's page tags its header row `data-page-hero` and its body `data-page-body`; this
 * moves them with inline styles and clears them when closed. Everything else is portalled into
 * the page's scroll container, under the moved parts, bottom to top: backdrop, code, the
 * falling light background.
 */
export function PullDownLayer({ scroller, state }: { scroller: HTMLElement | null; state: PullCodeState }) {
  const { mode, pull, drag, dragging, close } = state;
  const { screen, header, bodyTop } = usePageMetrics(scroller);
  const active = !(mode === "closed" && pull <= 0);
  const shown = mode === "open";

  /** How far the page body has fallen (px). */
  const fall = mode === "closed" ? pull : shown ? screen : 0;
  /** How far the header row has faded out, 0 to 1. */
  const fade = mode === "closed" ? Math.min(1, pull / PULL_THRESHOLD) : shown ? 1 : 0;
  /** The code screen's title, close button and Scan button: gone as a swipe down starts. */
  const chrome = mode === "open" ? Math.max(0, 1 - drag / SWIPE_THRESHOLD) : 0;
  /** Swiping down on the code: it sinks a little, saying Friends is coming back. */
  const sink = mode === "open" ? drag * 0.35 : 0;
  /** Going back to Friends: the code fades while the page slides back over it, so the real
   *  header is what remains under the returning header row. */
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
 * Right above your profile, in the navy band: the friend-code symbol (a QR with a plus) with an arrow under it, saying your
 * code pulls down. The arrow bounces up by a quarter of its height, so the gap above it keeps it
 * off the disc. Fades out as you pull (`hidden` 0 to 1).
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
        <QrAddIcon className="h-[18px] w-[18px]" />
      </CueDisc>
      <ChevronDownIcon className="mt-2 h-5 w-5 animate-bounce" />
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
 * The title, close button and Scan button appear once it is open. Scan turns the QR tile into
 * the camera, reading a friend's code; the button then turns it back. A fresh code each open.
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
  const [camera, setCamera] = useState(false);
  /** The camera's first frame is showing; until then the tile stays black. */
  const [live, setLive] = useState(false);
  const { video, status } = useQrScanner(open && camera);
  const inApp = canScanInApp();
  const chromeStyle = { opacity: chrome, transition: chromeTransition };
  const toggle = () => {
    setLive(false);
    setCamera((c) => !c);
  };
  return (
    <section
      aria-label={camera ? "Scan a friend code" : "My friend code"}
      className="mx-auto flex h-full max-w-2xl flex-col px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))]"
    >
      <div style={chromeStyle}>
        <ScreenTitle
          Icon={camera ? ScanIcon : QrIcon}
          label={camera ? "Scan a friend code" : "My friend code"}
          onClose={onClose}
          focusable={open}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5">
        {/* the tile: your QR, or the camera */}
        <div className="aspect-square w-full max-w-[16rem] overflow-hidden rounded-3xl shadow-xl shadow-black/40">
          {camera ? (
            <div className="relative h-full w-full bg-black">
              {inApp ? (
                <video
                  ref={video}
                  muted
                  playsInline
                  poster={BLANK_POSTER}
                  onPlaying={() => setLive(true)}
                  className={`h-full w-full object-cover transition-opacity duration-200 ${live ? "opacity-100" : "opacity-0"}`}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-5 text-center">
                  <p className="font-semibold">Use your camera app</p>
                  <p className="text-xs text-ivory/70">
                    This browser can&apos;t scan inside ZooMap. Point your phone&apos;s camera at your friend&apos;s code and tap
                    the link that appears.
                  </p>
                </div>
              )}
            </div>
          ) : svg ? (
            // The SVG comes from the qrcode library, generated here from our own URL. The white
            // tile keeps the dark-on-light contrast scanners need.
            <div
              className="h-full w-full bg-white p-2 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : error ? (
            <div className="flex h-full items-center justify-center bg-ivory/10 p-4 text-center text-red-300">{error}</div>
          ) : (
            <div aria-label="Making your code…" className="h-full w-full animate-pulse bg-ivory/10" />
          )}
        </div>
        <p className="min-h-[3.75rem] max-w-xs text-center text-sm text-ivory/70">
          {camera ? (inApp ? (status ?? "Point the camera at a friend's ZooMap code.") : null) : FRIEND_CODE_HELP}
        </p>
      </div>

      <div className="flex justify-center" style={chromeStyle}>
        <button
          type="button"
          onClick={toggle}
          tabIndex={open ? 0 : -1}
          className="zm-press flex items-center gap-2 rounded-full bg-ivory px-6 py-3 text-sm font-semibold text-ink shadow-lg shadow-black/30 transition-colors hover:bg-white"
        >
          {camera ? <QrIcon className="h-5 w-5" /> : <ScanIcon className="h-5 w-5" />}
          {camera ? "My code" : "Scan"}
        </button>
      </div>
    </section>
  );
}
