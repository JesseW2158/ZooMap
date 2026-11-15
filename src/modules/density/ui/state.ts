import { ApiClientError, apiFetch } from "@/shared/http/client";
import { DensityResponse, SharingState } from "@/shared/contracts";
import { createStore } from "@/shared/ui/store";
import { publicEnv } from "@/shared/config/public-env";
import { availableModes, DEFAULT_MODE, type HeatModeId } from "./modes";

/**
 * Client state shared by the map layer (which polls and pings) and the panel (which shows
 * it), so the snapshot is fetched once and both always agree.
 */

export interface DensityUiState {
  snapshot: DensityResponse | null;
  /** null until the server has answered */
  sharing: boolean | null;
  /** placeId to building name, filled by the layer from the campus buildings */
  names: Record<string, string>;
  error: string | null;
  /** which map the user picked: a heat scale, heat over grass, or no heat */
  mode: HeatModeId;
}

export const densityStore = createStore<DensityUiState>({ snapshot: null, sharing: null, names: {}, error: null, mode: DEFAULT_MODE });

export const POLL_MS = 10_000;
export const PING_MS = 60_000;

export async function loadSnapshot(signal?: AbortSignal): Promise<void> {
  try {
    const snapshot = await apiFetch("/api/density", { signal, schema: DensityResponse });
    densityStore.set({ snapshot, error: null });
  } catch (cause) {
    if (signal?.aborted) return;
    densityStore.set({ error: cause instanceof ApiClientError ? cause.message : "Could not load crowd data" });
  }
}

export async function loadSharing(signal?: AbortSignal): Promise<void> {
  try {
    const { enabled } = await apiFetch("/api/presence/sharing", { signal, schema: SharingState });
    densityStore.set({ sharing: enabled });
  } catch {
    // leave it unknown; the panel shows the toggle as off and the next call retries
  }
}

/**
 * Another screen (Settings, the activity card) changed the setting. Without this the layer would
 * not start pinging after "on" and would keep pinging until the server refused after "off".
 * The event name is shared with activities/ui/feed.ts and app/_shell/Settings.tsx.
 */
export const SHARING_CHANGED_EVENT = "zoomap:sharing-changed";
if (typeof window !== "undefined") {
  window.addEventListener(SHARING_CHANGED_EVENT, (e) => {
    const enabled = (e as CustomEvent<{ enabled?: unknown }>).detail?.enabled;
    if (typeof enabled === "boolean") densityStore.set({ sharing: enabled });
  });
}

/** Turn sharing on or off. Turning it off deletes the server's copy of where you are. */
export async function updateSharing(enabled: boolean): Promise<void> {
  const previous = densityStore.get().sharing;
  densityStore.set({ sharing: enabled });
  try {
    const res = await apiFetch("/api/presence/sharing", { method: "PUT", body: { enabled }, schema: SharingState });
    densityStore.set({ sharing: res.enabled });
    window.dispatchEvent(new CustomEvent(SHARING_CHANGED_EVENT, { detail: { enabled: res.enabled } }));
  } catch (cause) {
    densityStore.set({
      sharing: previous,
      error: cause instanceof ApiClientError ? cause.message : "Could not change location sharing",
    });
  }
}

const INTRO_KEY = "zoomap.density.intro";
export const introSeen = (): boolean => typeof localStorage !== "undefined" && localStorage.getItem(INTRO_KEY) === "1";
export const markIntroSeen = (): void => {
  try {
    localStorage.setItem(INTRO_KEY, "1");
  } catch {
    // private mode: the sheet just shows again next time
  }
};

const MODE_KEY = "zoomap.density.mode";
const OLD_HEAT_KEY = "zoomap.density.heat"; // v1 stored "0" for off

/** Pick the map mode. Remembered on this device. */
export function setHeatMode(mode: HeatModeId): void {
  densityStore.set({ mode });
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // private mode: it just resets next visit
  }
}

/** Read the remembered mode. Called after mount so server and client first render agree. */
export function restoreHeatMode(): void {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    // a saved dev-only mode is ignored when dev tools are off
    if (saved && availableModes(publicEnv.devTools).some((m) => m.id === saved)) densityStore.set({ mode: saved as HeatModeId });
    else if (localStorage.getItem(OLD_HEAT_KEY) === "0") densityStore.set({ mode: "off" });
  } catch {
    // keep the default
  }
}
