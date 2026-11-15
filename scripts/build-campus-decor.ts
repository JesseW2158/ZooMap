/**
 * `npx tsx scripts/build-campus-decor.ts`: decorative map features from the cached
 * OpenStreetMap download (`data/campus/raw/osm.json`, written by `npm run campus:build`).
 *
 * Writes `public/campus/decor.geojson`, served as a static file and drawn by the campus
 * layer. Display only: nothing here is used for places, search or routing.
 *
 * - `tree`: a point per mapped tree, per tree-row step, and scattered through mapped woods,
 *   with a canopy radius, height and tone varied per tree. The layer turns each point into
 *   a small extruded canopy (points keep the file small).
 * - `wood`: wood and scrub outlines, drawn as a darker green under the trees.
 * - `pitch`: sports pitches; `track`: running tracks.
 *
 * Deterministic: the same input gives the same file (positions jitter from a hash of the
 * OSM id, not from Math.random).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

interface OsmNode { type: "node"; id: number; lat: number; lon: number; tags?: Record<string, string> }
interface OsmWay { type: "way"; id: number; nodes: number[]; tags?: Record<string, string> }
type OsmElement = OsmNode | OsmWay | { type: "relation"; id: number; tags?: Record<string, string> };

type LngLat = [number, number];
type XY = [number, number];

const RAW_FILE = path.join(process.cwd(), "data", "campus", "raw", "osm.json");
const OUT_FILE = path.join(process.cwd(), "public", "campus", "decor.geojson");

/** Spacing of scattered trees inside woods, in metres. */
const WOOD_SPACING_M = 13;
/** Spacing of trees along a tree row, in metres. */
const ROW_SPACING_M = 9;
/** Upper bound on scattered trees per wood, so one huge forest polygon cannot dominate. */
const MAX_TREES_PER_WOOD = 400;

const raw = JSON.parse(readFileSync(RAW_FILE, "utf8")) as { elements: OsmElement[] };
const nodes = new Map<number, OsmNode>();
const ways: OsmWay[] = [];
for (const el of raw.elements) {
  if (el.type === "node") nodes.set(el.id, el);
  else if (el.type === "way") ways.push(el);
}

// local metres around the campus, good to well under a metre at this size
const LAT0 = 42.388;
const LON0 = -72.527;
const KX = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110_540;
const toXY = ([lng, lat]: LngLat): XY => [(lng - LON0) * KX, (lat - LAT0) * KY];
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
const toLngLat = ([x, y]: XY): LngLat => [round6(x / KX + LON0), round6(y / KY + LAT0)];

/** A stable number in [0, 1) from two integers. */
function hash01(a: number, b = 0): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function pointInRing(p: XY, ring: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function wayCoords(w: OsmWay): LngLat[] | null {
  const out: LngLat[] = [];
  for (const id of w.nodes) {
    const n = nodes.get(id);
    if (!n) return null;
    out.push([round6(n.lon), round6(n.lat)]);
  }
  return out;
}

const isClosed = (w: OsmWay) => w.nodes.length >= 4 && w.nodes[0] === w.nodes[w.nodes.length - 1];

type Feature = { type: "Feature"; properties: Record<string, string | number>; geometry: GeoJSON.Geometry };
const features: Feature[] = [];

function addTree(c: XY, seedA: number, seedB: number) {
  const s = hash01(seedA, seedB);
  const t = hash01(seedB + 7, seedA);
  features.push({
    type: "Feature",
    properties: {
      kind: "tree",
      r: Math.round((2.6 + s * 1.8) * 10) / 10, // canopy radius, 2.6 to 4.4 m
      // canopy from `base` to `top`, so a short trunk shows under it
      base: Math.round((1.8 + t * 1.2) * 10) / 10,
      top: Math.round((7 + s * 6) * 10) / 10,
      // 0..2: three greens, so a stand of trees is not one flat colour
      tone: Math.floor(t * 3),
    },
    geometry: { type: "Point", coordinates: toLngLat(c) },
  });
}

// single mapped trees
for (const n of nodes.values()) {
  if (n.tags?.natural === "tree") addTree(toXY([n.lon, n.lat]), n.id, 1);
}

for (const w of ways) {
  const t = w.tags;
  if (!t) continue;
  const coords = wayCoords(w);
  if (!coords) continue;

  if (t.natural === "tree_row") {
    const pts = coords.map(toXY);
    let k = 0;
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1]!, pts[i]!];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let d = 0; d < len; d += ROW_SPACING_M) {
        const f = d / len;
        addTree([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], w.id, k++);
      }
    }
    continue;
  }

  if (!isClosed(w)) continue;

  if (t.natural === "wood" || t.landuse === "forest" || t.natural === "scrub") {
    features.push({ type: "Feature", properties: { kind: "wood" }, geometry: { type: "Polygon", coordinates: [coords] } });
    if (t.natural === "scrub") continue;
    // scatter trees on a jittered grid inside the outline
    const ring = coords.map(toXY);
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    let placed = 0;
    let k = 0;
    for (let x = Math.min(...xs); x < Math.max(...xs) && placed < MAX_TREES_PER_WOOD; x += WOOD_SPACING_M) {
      for (let y = Math.min(...ys); y < Math.max(...ys) && placed < MAX_TREES_PER_WOOD; y += WOOD_SPACING_M) {
        k++;
        const p: XY = [x + (hash01(w.id, k) - 0.5) * WOOD_SPACING_M * 0.8, y + (hash01(k, w.id) - 0.5) * WOOD_SPACING_M * 0.8];
        if (pointInRing(p, ring)) {
          addTree(p, w.id, k);
          placed++;
        }
      }
    }
    continue;
  }

  if (t.leisure === "track") {
    features.push({ type: "Feature", properties: { kind: "track" }, geometry: { type: "Polygon", coordinates: [coords] } });
  } else if (t.leisure === "pitch") {
    features.push({
      type: "Feature",
      properties: { kind: "pitch", sport: t.sport ?? "" },
      geometry: { type: "Polygon", coordinates: [coords] },
    });
  }
}

// draw order inside the file: woods, pitches, tracks, then trees
const rank: Record<string, number> = { wood: 0, pitch: 1, track: 2, tree: 3 };
features.sort((a, b) => rank[a.properties.kind as string]! - rank[b.properties.kind as string]!);

mkdirSync(path.dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify({ type: "FeatureCollection", features }));

const count = (k: string) => features.filter((f) => f.properties.kind === k).length;
console.log(
  `Wrote ${path.relative(process.cwd(), OUT_FILE)}: ${count("tree")} trees, ${count("wood")} woods, ${count("pitch")} pitches, ${count("track")} tracks`,
);
