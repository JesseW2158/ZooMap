import { ApiClientError, apiFetch } from "@/shared/http/client";
import { DensityResponse, SharingState } from "@/shared/contracts";
import { createStore } from "@/shared/ui/store";

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
  /** the heatmap and coloured buildings; on by default */
  heatOn: boolean;
}

export const densityStore = createStore<DensityUiState>({ snapshot: null, sharing: null, names: {}, error: null, heatOn: true });

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

/** Turn sharing on or off. Turning it off deletes the server's copy of where you are. */
export async function updateSharing(enabled: boolean): Promise<void> {
  const previous = densityStore.get().sharing;
  densityStore.set({ sharing: enabled });
  try {
    const res = await apiFetch("/api/presence/sharing", { method: "PUT", body: { enabled }, schema: SharingState });
    densityStore.set({ sharing: res.enabled });
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

const HEAT_KEY = "zoomap.density.heat";

/** Show or hide the heatmap (and with it the green-to-red campus and its coloured buildings). Remembered on this device. */
export function setHeatOn(on: boolean): void {
  densityStore.set({ heatOn: on });
  try {
    localStorage.setItem(HEAT_KEY, on ? "1" : "0");
  } catch {
    // private mode: it just resets next visit
  }
}

/** Read the remembered choice. Called after mount so server and client first render agree. */
export function restoreHeatPref(): void {
  try {
    if (localStorage.getItem(HEAT_KEY) === "0") densityStore.set({ heatOn: false });
  } catch {
    // keep the default
  }
}
