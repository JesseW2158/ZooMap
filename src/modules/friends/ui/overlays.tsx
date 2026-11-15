"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { FriendCode, type Profile } from "@/shared/contracts";
import { apiFetch } from "@/shared/http/client";
import { errorText } from "./feed";
import { CloseIcon } from "./icons";
import { Avatar } from "./parts";

/**
 * Full-screen layer used by "My code" and "Scan". Portalled to <body>: the bottom sheet is its
 * own stacking context, so anything rendered inside it can't cover the invite banner or map controls.
 */
function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex flex-col bg-white text-ink">
      <div className="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full bg-linen text-ink">
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * "My code": a fresh code each time it opens (only its hash is stored, so the previous code
 * stops working), shown as a large QR that another phone's camera or Scan button can read.
 */
export function MyCodeOverlay({ me, onClose }: { me: Profile | null; onClose: () => void }) {
  const { code, svg, error } = useFriendCode();

  return (
    <Overlay title="My friend code" onClose={onClose}>
      {me ? (
        <div className="flex items-center gap-3">
          <Avatar person={me} size={48} />
          <div>
            <p className="text-lg font-semibold">{me.name}</p>
            {me.pronouns ? <p className="text-neutral-600">{me.pronouns}</p> : null}
          </div>
        </div>
      ) : null}
      <FriendCodeView code={code} svg={svg} error={error} />
    </Overlay>
  );
}

export const FRIEND_CODE_HELP =
  "Let a friend scan this with their camera or the Scan button in ZooMap. Opening your code again makes a new one, and this one stops working.";

/** The QR, the code under it and how to use it, from `useFriendCode()`. */
function FriendCodeView({ code, svg, error }: ReturnType<typeof useFriendCode>) {
  return (
    <>
      {error ? <p className="text-red-600">{error}</p> : null}
      {!svg && !error ? <p className="text-neutral-500">Making your code…</p> : null}
      {svg ? (
        // The SVG comes from the qrcode library, generated here from our own URL.
        <div className="w-full max-w-xs [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : null}
      {code ? <p className="font-mono text-sm tracking-wider text-neutral-500">{code.code}</p> : null}
      <p className="max-w-xs text-center text-sm text-neutral-600">{FRIEND_CODE_HELP}</p>
    </>
  );
}

/** Issues a fresh friend code on mount (the previous one stops working) and renders it as a QR SVG. */
export function useFriendCode(): { code: FriendCode | null; svg: string | null; error: string | null } {
  const [code, setCode] = useState<FriendCode | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const issued = await apiFetch("/api/friends/code", { method: "POST", schema: FriendCode });
        const markup = await QRCode.toString(issued.url, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
        if (!cancelled) {
          setCode(issued);
          setSvg(markup);
        }
      } catch (cause) {
        if (!cancelled) setError(errorText(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { code, svg, error };
}

/** The browser's built-in barcode reader (Chrome on Android, the Android shell); absent on iPhone browsers and most desktops. */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

export function canScanInApp(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;
}

/** The /add/<code> path in a scanned QR (or a bare code), kept on this site whatever host the QR names. */
export function addPathFromScan(raw: string): string | null {
  const text = raw.trim();
  try {
    const match = /^\/add\/([A-Za-z0-9-]{16,40})\/?$/.exec(new URL(text).pathname);
    if (match) return `/add/${match[1]}`;
  } catch {
    // not a URL
  }
  return /^[A-Za-z0-9-]{20,29}$/.test(text) ? `/add/${text.replaceAll("-", "")}` : null;
}

/** "Scan": the camera with the built-in barcode reader where it exists, otherwise how to use the camera app. */
/**
 * The in-app QR reader: while `enabled`, runs the back camera into `video` and, on a ZooMap
 * friend code, opens its /add page. `status` says what is happening (null when this browser
 * can't scan in-app; see `canScanInApp`).
 */
export function useQrScanner(enabled: boolean) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !canScanInApp()) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    (async () => {
      try {
        setStatus("Starting the camera…");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped || !video.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.current.srcObject = stream;
        await video.current.play();
        setStatus("Point the camera at a friend's ZooMap code.");
        const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector;
        const detector = new Detector({ formats: ["qr_code"] });
        timer = setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return;
          const found = await detector.detect(video.current).catch(() => []);
          for (const code of found) {
            const path = addPathFromScan(code.rawValue);
            if (path) {
              stopped = true;
              clearInterval(timer);
              window.location.assign(path);
              return;
            }
          }
          if (found.length) setStatus("That QR isn't a ZooMap friend code.");
        }, 300);
      } catch {
        if (!stopped) setStatus("Camera access was blocked. Allow it in the browser, or scan with your camera app.");
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [enabled]);

  return { video, status };
}

export function ScanOverlay({ onClose }: { onClose: () => void }) {
  const { video, status } = useQrScanner(true);

  return (
    <Overlay title="Scan a friend code" onClose={onClose}>
      {canScanInApp() ? (
        <>
          <video ref={video} muted playsInline className="aspect-square w-full max-w-sm rounded-2xl bg-neutral-900 object-cover" />
          {status ? <p className="text-center text-neutral-700">{status}</p> : null}
        </>
      ) : (
        <div className="max-w-xs space-y-3 text-center">
          <p className="text-lg font-semibold">Use your camera app</p>
          <p className="text-neutral-700">
            This browser can&apos;t scan inside ZooMap. Open your phone&apos;s camera, point it at your friend&apos;s code and tap
            the link that appears. It opens ZooMap to add them.
          </p>
        </div>
      )}
    </Overlay>
  );
}
