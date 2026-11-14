import type { LatLng } from "@/shared/contracts";
import { createStore, useStore } from "./store";

/**
 * The seam between panels and the map. A panel never touches the MapLibre instance: it
 * asks here (`flyTo`, `requestRoute`, `selectPlace`) and the map shell and layers react.
 */

export interface RouteRequest {
  toPlaceId: string;
  /** Omitted means "from my location". */
  fromPlaceId?: string;
  /** Changes on every request so repeating the same one re-fires. */
  nonce: number;
}

export interface FlyRequest {
  pos: LatLng;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  nonce: number;
}

interface MapState {
  selectedPlaceId: string | null;
  routeRequest: RouteRequest | null;
  flyRequest: FlyRequest | null;
}

const store = createStore<MapState>({ selectedPlaceId: null, routeRequest: null, flyRequest: null });
let nonce = 0;

export const mapActions = {
  selectPlace(placeId: string | null) {
    store.set({ selectedPlaceId: placeId });
  },
  requestRoute(placeId: string, opts: { fromPlaceId?: string } = {}) {
    store.set({ routeRequest: { toPlaceId: placeId, fromPlaceId: opts.fromPlaceId, nonce: ++nonce } });
  },
  clearRoute() {
    store.set({ routeRequest: null });
  },
  flyTo(pos: LatLng, opts: { zoom?: number; pitch?: number; bearing?: number } = {}) {
    store.set({ flyRequest: { pos, ...opts, nonce: ++nonce } });
  },
};

export const mapStore = store;

export function useMapStore() {
  const selectedPlaceId = useStore(store, (s) => s.selectedPlaceId);
  const routeRequest = useStore(store, (s) => s.routeRequest);
  const flyRequest = useStore(store, (s) => s.flyRequest);
  return { selectedPlaceId, routeRequest, flyRequest, ...mapActions };
}
