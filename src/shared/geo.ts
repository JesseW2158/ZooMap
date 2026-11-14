import type { LatLng, LngLat } from "@/shared/contracts";

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. Accurate to well under a metre at campus scale. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The point `eastM` metres east and `northM` metres north of `origin` (flat-earth, fine under 10 km). */
export function offsetM(origin: LatLng, eastM: number, northM: number): LatLng {
  const dLat = northM / EARTH_RADIUS_M;
  const dLng = eastM / (EARTH_RADIUS_M * Math.cos(rad(origin.lat)));
  return { lat: origin.lat + (dLat * 180) / Math.PI, lng: origin.lng + (dLng * 180) / Math.PI };
}

export const toLngLat = (p: LatLng): LngLat => [p.lng, p.lat];
export const fromLngLat = ([lng, lat]: LngLat): LatLng => ({ lat, lng });

/** Length of a [lng, lat] path in metres. */
export function pathLengthM(path: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += haversineM(fromLngLat(path[i - 1]), fromLngLat(path[i]));
  return total;
}
