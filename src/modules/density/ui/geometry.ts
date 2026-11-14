import type { BuildingCollection } from "@/shared/contracts";

type Ring = [number, number][];

/**
 * Push every wall of a polygon outward by `metres`. The density tint is drawn as a second,
 * full-height copy of each busy building; making it a few decimetres larger keeps its walls
 * from sharing a plane with the campus building underneath (which would flicker).
 * Outer rings grow, holes shrink, so courtyards stay open. Works on a local flat projection.
 */
export function growRing(ring: Ring, metres: number, outward: "left" | "right"): Ring {
  const pts = ring.slice(0, -1); // drop the closing point
  const n = pts.length;
  if (n < 3) return ring;
  const kx = 111_320 * Math.cos((pts[0][1] * Math.PI) / 180);
  const ky = 110_540;
  const xy = pts.map(([lng, lat]) => [lng * kx, lat * ky] as const);

  const side = outward === "right" ? 1 : -1;
  // unit normal of edge i -> i+1 pointing outward
  const normal = (i: number) => {
    const [ax, ay] = xy[i];
    const [bx, by] = xy[(i + 1) % n];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    return [(side * dy) / len, (-side * dx) / len] as const;
  };

  const out: Ring = xy.map(([x, y], i) => {
    const [px, py] = normal((i + n - 1) % n);
    const [qx, qy] = normal(i);
    let mx = px + qx, my = py + qy;
    const ml = Math.hypot(mx, my);
    if (ml < 1e-6) return [x / kx, y / ky] as [number, number]; // a spike: leave it
    mx /= ml;
    my /= ml;
    // miter length, capped so sharp corners do not shoot out
    const scale = Math.min(2, 1 / Math.max(0.5, mx * qx + my * qy));
    return [(x + mx * metres * scale) / kx, (y + my * metres * scale) / ky] as [number, number];
  });
  out.push(out[0]);
  return out;
}

const signedArea = (ring: Ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
};

function growPolygon(rings: Ring[], metres: number): Ring[] {
  return rings.map((ring, i) => {
    // positive area = counter-clockwise = interior on the left, so outward is the right
    const ccw = signedArea(ring) > 0;
    const isHole = i > 0;
    // for a hole the solid is outside the ring, so "outward from the solid" is into the hole
    const outwardIsRight = ccw !== isHole;
    return growRing(ring, metres, outwardIsRight ? "right" : "left");
  });
}

export function growBuildings(buildings: BuildingCollection, metres: number): GeoJSON.Feature[] {
  return buildings.features.map((f) => {
    const g = f.geometry;
    const geometry =
      g.type === "Polygon"
        ? { type: "Polygon" as const, coordinates: growPolygon(g.coordinates as Ring[], metres) }
        : { type: "MultiPolygon" as const, coordinates: (g.coordinates as Ring[][]).map((p) => growPolygon(p, metres)) };
    return { type: "Feature" as const, properties: f.properties, geometry };
  });
}
