import { useEffect } from "react";
import type { LatLng } from "@/shared/contracts";
import { publicEnv } from "@/shared/config/public-env";
import { createStore, useStore } from "@/shared/ui/store";

/**
 * One place that answers "where is the user". Sources, highest priority first:
 *   dev   a click-to-set override, only when NEXT_PUBLIC_DEV_TOOLS=1
 *   native the Android shell, which registers itself with `registerLocationSource`
 *   browser navigator.geolocation
 * Panels and the map call `useUserLocation()` and never touch the sources.
 */

export interface UserPosition extends LatLng {
  accuracyM?: number;
  /** Direction of travel in degrees clockwise from north, when the device reports one. */
  heading?: number;
  /** Epoch milliseconds when the fix was taken. */
  at: number;
}

export type LocationStatus = "idle" | "requesting" | "active" | "denied" | "unavailable";
export type LocationSourceName = "dev" | "native" | "browser";

interface LocationState {
  browser: UserPosition | null;
  native: UserPosition | null;
  dev: UserPosition | null;
  status: LocationStatus;
  devPicking: boolean;
}

const store = createStore<LocationState>({
  browser: null,
  native: null,
  dev: null,
  status: "idle",
  devPicking: false,
});

/** Starts native location and returns a stop function. `push` reports each fix. */
export type NativeLocationSource = (push: (pos: LatLng & { accuracyM?: number }) => void) => () => void;

let nativeSource: NativeLocationSource | null = null;
let stopNative: (() => void) | null = null;
let watchId: number | null = null;

export function registerLocationSource(source: NativeLocationSource): () => void {
  nativeSource = source;
  return () => {
    if (nativeSource === source) {
      nativeSource = null;
      stopNative?.();
      stopNative = null;
    }
  };
}

function startBrowserWatch() {
  if (watchId !== null) return;
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    store.set({ status: "unavailable" });
    return;
  }
  store.set({ status: "requesting" });
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      store.set({
        browser: {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracyM: p.coords.accuracy,
          ...(p.coords.heading !== null && Number.isFinite(p.coords.heading) ? { heading: p.coords.heading } : {}),
          at: p.timestamp,
        },
        status: "active",
      });
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        store.set({ status: "denied" });
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        watchId = null;
      } else {
        store.set({ status: "unavailable" });
      }
    },
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
  );
}

/** Ask for location. Safe to call repeatedly. Must come from a user gesture the first time. */
export function startLocation(): void {
  if (nativeSource) {
    if (stopNative) return;
    store.set({ status: "requesting" });
    stopNative = nativeSource((pos) => {
      store.set({ native: { ...pos, at: Date.now() }, status: "active" });
    });
    return;
  }
  startBrowserWatch();
}

/** Dev-only override. Ignored unless NEXT_PUBLIC_DEV_TOOLS=1. Pass null to clear it. */
export function setDevLocation(pos: LatLng | null): void {
  if (!publicEnv.devTools) return;
  store.set({ dev: pos ? { ...pos, at: Date.now() } : null, devPicking: false });
}

export function setDevPicking(picking: boolean): void {
  if (!publicEnv.devTools) return;
  store.set({ devPicking: picking });
}

/** For non-React code such as a map click handler. */
export function isDevPickingNow(): boolean {
  return store.get().devPicking;
}

let autoStartChecked = false;

function autoStartIfGranted() {
  if (autoStartChecked) return;
  autoStartChecked = true;
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
  navigator.permissions
    .query({ name: "geolocation" })
    .then((result) => {
      if (result.state === "granted") startLocation();
    })
    .catch(() => {});
}

export function useUserLocation() {
  const browser = useStore(store, (s) => s.browser);
  const native = useStore(store, (s) => s.native);
  const dev = useStore(store, (s) => s.dev);
  const status = useStore(store, (s) => s.status);
  const devPicking = useStore(store, (s) => s.devPicking);

  useEffect(() => {
    autoStartIfGranted();
  }, []);

  const source: LocationSourceName | null = dev ? "dev" : native ? "native" : browser ? "browser" : null;
  const position = dev ?? native ?? browser;
  return {
    position,
    source,
    status: dev ? ("active" as const) : status,
    isDevPicking: devPicking,
    start: startLocation,
    setDevLocation,
    setDevPicking,
  };
}
