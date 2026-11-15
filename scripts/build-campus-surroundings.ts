/**
 * `npx tsx scripts/build-campus-surroundings.ts [--refresh]`: the town and countryside
 * around campus, so the map does not end at the edge of the campus download.
 *
 * Fetches a wider box from OpenStreetMap once (cached in
 * `data/campus/raw/surroundings-osm.json`) and writes `public/campus/surroundings.geojson`,
 * drawn by the campus layer under and around campus. Display only.
 *
 * - `area`: land use (houses, shops, farms, fields, woods, water, parks), with its fill `color`.
 * - `road`: roads with a `class` (major, minor, service).
 * - `building`: footprints with a height `h` and `color`, only near the bounds.
 * - `tree`: canopies scattered through nearby woods, like `build-campus-decor.ts`.
 *
 * Anything the campus download already has (roads and buildings touching its box, woods it
 * fills with trees) is left out, so nothing is drawn twice. Buildings and trees fade into the
 * haze colour with distance, to match the haze frames the layer draws over the flat ground.
 *
 * Deterministic: the same cached download gives the same file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BBOX } from "./build-campus";
import { EDGE, SURROUND, edgeDistanceM, hazeAt, intoHaze } from "../src/modules/campus/ui/look";

type LngLat = [number, number];
interface Pt { lat: number; lon: number }
interface Way { type: "way"; id: number; tags?: Record<string, string>; geometry?: (Pt | null)[] }
interface Member { type: string; role: string; geometry?: (Pt | null)[] }
interface Relation { type: "relation"; id: number; tags?: Record<string, string>; members?: Member[] }
type El = Way | Relation | { type: "node"; id: number; tags?: Record<string, string> };

const RAW_FILE = path.join(process.cwd(), "data", "campus", "raw", "surroundings-osm.json");
const CAMPUS_RAW = path.join(process.cwd(), "data", "campus", "raw", "osm.json");
const OUT_FILE = path.join(process.cwd(), "public", "campus", "surroundings.geojson");
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/** Buildings and trees are kept up to this far outside the camera bounds (metres). */
const DETAIL_M = 1300;
/** Everything else up to the solid haze, plus a margin. */
const FAR_M = EDGE.hazeEndM + 300;
const WOOD_SPACING_M = 17;
const MAX_TREES = 7_000;
/** Simplification tolerance in metres. */
const SIMPLIFY_M = 1.2;

// ---------------------------------------------------------------- boxes

const KY = 110_540;
const KX = 111_320 * Math.cos((EDGE.centre[1] * Math.PI) / 180);
/** [south, west, north, east] of the bounds grown by `m` metres (a box around the superellipse). */
function boxAround(m: number): [number, number, number, number] {
  const [cx, cy] = EDGE.centre;
  const [hx, hy] = EDGE.halfM;
  return [cy - (hy + m) / KY, cx - (hx + m) / KX, cy + (hy + m) / KY, cx + (hx + m) / KX];
}
const fmt = (b: number[]) => b.map((v) => v.toFixed(5)).join(",");

function query(): string {
  const far = fmt(boxAround(FAR_M));
  const near = fmt(boxAround(DETAIL_M));
  return `[out:json][timeout:300];
(
  way["landuse"](${far});
  relation["landuse"]["type"="multipolygon"](${far});
  way["natural"~"^(wood|scrub|water|wetland|grassland|heath)$"](${far});
  relation["natural"~"^(wood|scrub|water|wetland)$"]["type"="multipolygon"](${far});
  way["leisure"~"^(park|golf_course|nature_reserve|pitch|playground|common|garden|recreation_ground|track)$"](${far});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](${far});
  way["highway"="service"](${near});
  way["building"](${near});
);
out geom qt;`;
}

async function loadRaw(refresh: boolean): Promise<El[]> {
  if (!refresh && existsSync(RAW_FILE)) {
    console.log(`Using cached ${path.relative(process.cwd(), RAW_FILE)} (pass --refresh to refetch)`);
    return (JSON.parse(readFileSync(RAW_FILE, "utf8")) as { elements: El[] }).elements;
  }
  console.log(`Fetching ${OVERPASS_URL} ...`);
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ZooMap campus build" },
    body: new URLSearchParams({ data: query() }),
  });
  if (!res.ok) throw new Error(`Overpass returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { elements: El[] };
  const order = { node: 0, way: 1, relation: 2 } as const;
  const elements = json.elements.sort((a, b) => order[a.type] - order[b.type] || a.id - b.id);
  mkdirSync(path.dirname(RAW_FILE), { recursive: true });
  writeFileSync(RAW_FILE, JSON.stringify({ elements }));
  return elements;
}

// ---------------------------------------------------------------- geometry helpers

const round5 = (v: number) => Math.round(v * 1e5) / 1e5;
const toLL = (g: (Pt | null)[] | undefined): LngLat[] | null => {
  if (!g?.length || g.some((p) => !p)) return null;
  return (g as Pt[]).map((p) => [p.lon, p.lat]);
};
const xy = ([lng, lat]: LngLat): [number, number] => [lng * KX, lat * KY];

/** Douglas-Peucker in metres; keeps the ends. */
function simplify(line: LngLat[], tol = SIMPLIFY_M): LngLat[] {
  if (line.length <= 3) return line;
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy(line[a]!);
    const [bx, by] = xy(line[b]!);
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let best = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy(line[i]!);
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > best) [best, at] = [d, i];
    }
    if (best > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  const out = line.filter((_, i) => keep[i]).map(([x, y]) => [round5(x), round5(y)] as LngLat);
  return out;
}

/** A closed ring starts and ends on the same point, so split it at the vertex farthest from the start. */
const simplifyRing = (ring: LngLat[]): LngLat[] | null => {
  const [x0, y0] = xy(ring[0]!);
  let far = 1;
  let best = -1;
  for (let i = 1; i < ring.length - 1; i++) {
    const [x, y] = xy(ring[i]!);
    const d = Math.hypot(x - x0, y - y0);
    if (d > best) [best, far] = [d, i];
  }
  const s = [...simplify(ring.slice(0, far + 1)), ...simplify(ring.slice(far)).slice(1)];
  return s.length >= 4 ? s : null;
};

/** Joins open member ways end to end into closed rings. */
function joinRings(parts: LngLat[][]): LngLat[][] {
  const key = (p: LngLat) => `${p[0]},${p[1]}`;
  const open = parts.map((p) => [...p]);
  const rings: LngLat[][] = [];
  while (open.length) {
    let ring = open.shift()!;
    let grew = true;
    while (key(ring[0]!) !== key(ring[ring.length - 1]!) && grew) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const p = open[i]!;
        const end = key(ring[ring.length - 1]!);
        if (key(p[0]!) === end) ring = ring.concat(p.slice(1));
        else if (key(p[p.length - 1]!) === end) ring = ring.concat([...p].reverse().slice(1));
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4 && key(ring[0]!) === key(ring[ring.length - 1]!)) rings.push(ring);
  }
  return rings;
}

function pointInRing([px, py]: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function ringAreaM2(ring: LngLat[]): number {
  let a = 0;
  for (let i = 1; i < ring.length; i++) {
    const [x1, y1] = xy(ring[i - 1]!);
    const [x2, y2] = xy(ring[i]!);
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

function hash01(a: number, b = 0): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const [S, W, N, E] = BBOX;
const inCampusBox = ([lng, lat]: LngLat) => lat >= S && lat <= N && lng >= W && lng <= E;
const touchesCampus = (pts: LngLat[]) => pts.some(inCampusBox);
const nearestEdge = (pts: LngLat[]) => Math.min(...pts.map((p) => edgeDistanceM(p)));

// ---------------------------------------------------------------- classify

function areaColor(t: Record<string, string>): string | null {
  const lu = t.landuse ?? "";
  if (t.natural === "water" || t.waterway === "riverbank" || ["reservoir", "basin"].includes(lu)) return SURROUND.water;
  if (["wood", "scrub"].includes(t.natural ?? "") || lu === "forest") return SURROUND.wood;
  if (t.natural === "wetland") return SURROUND.wetland;
  if (["grassland", "heath"].includes(t.natural ?? "")) return SURROUND.meadow;
  if (["residential", "garages"].includes(lu)) return SURROUND.residential;
  if (["commercial", "retail"].includes(lu)) return SURROUND.commercial;
  if (["industrial", "railway", "quarry", "landfill"].includes(lu)) return SURROUND.industrial;
  if (["farmland", "orchard", "vineyard", "farmyard", "plant_nursery", "greenhouse_horticulture"].includes(lu)) return SURROUND.farmland;
  if (["meadow", "allotments"].includes(lu)) return SURROUND.meadow;
  if (["grass", "village_green", "recreation_ground", "flowerbed"].includes(lu)) return SURROUND.grass;
  if (["cemetery", "religious"].includes(lu)) return SURROUND.cemetery;
  if (["park", "golf_course", "nature_reserve", "pitch", "playground", "common", "garden", "recreation_ground", "track"].includes(t.leisure ?? "")) return SURROUND.park;
  return null; // education, university, construction...: leave the ground as it is
}

const MAJOR = /^(motorway|trunk|primary|secondary|tertiary)(_link)?$/;

function buildingHeight(t: Record<string, string>, id: number): number {
  const h = parseFloat(t.height ?? "");
  if (h > 0) return Math.min(h, 60);
  const lv = parseFloat(t["building:levels"] ?? "");
  if (lv > 0) return Math.min(lv * 3.2 + 1.5, 60);
  const b = t.building ?? "yes";
  if (["garage", "garages", "shed", "carport", "roof", "hut"].includes(b)) return 3;
  if (["house", "detached", "semidetached_house", "residential", "farm"].includes(b)) return 6.5 + hash01(id, 3) * 2;
  if (["apartments", "dormitory"].includes(b)) return 11;
  if (["commercial", "retail", "industrial", "warehouse", "barn"].includes(b)) return 7;
  return 6 + hash01(id, 4) * 2;
}

// ---------------------------------------------------------------- build

async function main() {
  const elements = await loadRaw(process.argv.includes("--refresh"));

  // woods the campus decor already fills with trees
  const campusWoods = new Set<number>();
  if (existsSync(CAMPUS_RAW)) {
    for (const el of (JSON.parse(readFileSync(CAMPUS_RAW, "utf8")) as { elements: Way[] }).elements) {
      const t = el.tags;
      if (el.type === "way" && t && (t.natural === "wood" || t.landuse === "forest")) campusWoods.add(el.id);
    }
  }

  type F = { type: "Feature"; properties: Record<string, string | number>; geometry: GeoJSON.Geometry };
  const areas: { f: F; size: number }[] = [];
  const roads: F[] = [];
  const buildings: F[] = [];
  const trees: F[] = [];

  const scatterTrees = (rings: LngLat[][], id: number) => {
    const outer = rings[0]!;
    if (nearestEdge(outer) > DETAIL_M) return;
    const ringXY = outer.map(xy);
    const holes = rings.slice(1).map((r) => r.map(xy));
    const xs = ringXY.map((p) => p[0]);
    const ys = ringXY.map((p) => p[1]);
    let k = 0;
    for (let x = Math.min(...xs); x < Math.max(...xs); x += WOOD_SPACING_M) {
      for (let y = Math.min(...ys); y < Math.max(...ys); y += WOOD_SPACING_M) {
        k++;
        const p: [number, number] = [x + (hash01(id, k) - 0.5) * WOOD_SPACING_M * 0.8, y + (hash01(k, id) - 0.5) * WOOD_SPACING_M * 0.8];
        const ll: LngLat = [round5(p[0] / KX), round5(p[1] / KY)];
        if (inCampusBox(ll)) continue;
        const d = edgeDistanceM(ll);
        if (d > DETAIL_M || !pointInRing(p, ringXY) || holes.some((h) => pointInRing(p, h))) continue;
        const s = hash01(id + 11, k);
        const t = hash01(k + 5, id);
        trees.push({
          type: "Feature",
          properties: {
            kind: "tree",
            r: Math.round((3 + s * 2) * 10) / 10,
            base: Math.round((1.8 + t * 1.2) * 10) / 10,
            top: Math.round((8 + s * 7) * 10) / 10,
            color: intoHaze(SURROUND.trees[Math.floor(t * 3)]!, hazeAt(d)),
            d: Math.round(d),
          },
          geometry: { type: "Point", coordinates: ll },
        });
      }
    }
  };

  const addArea = (rings: LngLat[][], t: Record<string, string>, id: number) => {
    const color = areaColor(t);
    if (!color || !rings.length) return;
    if (rings[0]!.every(inCampusBox)) return; // campus ground has it
    if (nearestEdge(rings[0]!) > FAR_M) return;
    const simple = rings.map(simplifyRing).filter((r): r is LngLat[] => !!r);
    if (!simple.length) return;
    areas.push({
      f: { type: "Feature", properties: { kind: "area", color }, geometry: { type: "Polygon", coordinates: simple } },
      size: ringAreaM2(simple[0]!),
    });
    if (color === SURROUND.wood && t.natural !== "scrub" && !campusWoods.has(id)) scatterTrees(rings, id);
  };

  for (const el of elements) {
    const t = el.tags;
    if (!t) continue;
    if (el.type === "relation") {
      const outers = joinRings((el.members ?? []).filter((m) => m.role !== "inner").map((m) => toLL(m.geometry)).filter((g): g is LngLat[] => !!g));
      const inners = joinRings((el.members ?? []).filter((m) => m.role === "inner").map((m) => toLL(m.geometry)).filter((g): g is LngLat[] => !!g));
      for (const outer of outers) {
        const o = outer.map(xy);
        addArea([outer, ...inners.filter((r) => pointInRing(xy(r[0]!), o))], t, el.id);
      }
      continue;
    }
    if (el.type !== "way") continue;
    const pts = toLL(el.geometry);
    if (!pts || pts.length < 2) continue;
    const closed = pts.length >= 4 && pts[0]![0] === pts[pts.length - 1]![0] && pts[0]![1] === pts[pts.length - 1]![1];

    if (t.building) {
      if (!closed || touchesCampus(pts)) continue;
      const d = nearestEdge(pts);
      if (d > DETAIL_M) continue;
      const ring = simplifyRing(pts);
      if (!ring) continue;
      const base = SURROUND.houses[Math.floor(hash01(el.id) * SURROUND.houses.length)]!;
      buildings.push({
        type: "Feature",
        properties: { kind: "building", h: Math.round(buildingHeight(t, el.id) * 10) / 10, color: intoHaze(base, hazeAt(d)) },
        geometry: { type: "Polygon", coordinates: [ring] },
      });
    } else if (t.highway) {
      if (touchesCampus(pts) || t.area === "yes") continue; // the campus ground draws these
      if (nearestEdge(pts) > FAR_M) continue;
      const cls = MAJOR.test(t.highway) ? "major" : t.highway === "service" ? "service" : "minor";
      roads.push({ type: "Feature", properties: { kind: "road", class: cls }, geometry: { type: "LineString", coordinates: simplify(pts) } });
    } else if (closed) {
      addArea([pts], t, el.id);
    }
  }

  // big areas first so small ones (a pond in a park) draw on top; water above land
  areas.sort((a, b) => Number(a.f.properties.color === SURROUND.water) - Number(b.f.properties.color === SURROUND.water) || b.size - a.size);
  // nearest trees first, so the cap drops the far, hazy ones
  trees.sort((a, b) => (a.properties.d as number) - (b.properties.d as number));
  const keptTrees = trees.slice(0, MAX_TREES).map((f) => {
    delete f.properties.d;
    return f;
  });
  const order = { minor: 0, service: 0, major: 1 } as const;
  roads.sort((a, b) => order[a.properties.class as keyof typeof order] - order[b.properties.class as keyof typeof order]);

  const features = [...areas.map((a) => a.f), ...roads, ...buildings, ...keptTrees];
  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify({ type: "FeatureCollection", features }));
  const kb = Math.round(JSON.stringify({ features }).length / 1024);
  console.log(
    `Wrote ${path.relative(process.cwd(), OUT_FILE)} (${kb} KB): ${areas.length} areas, ${roads.length} roads, ${buildings.length} buildings, ${keptTrees.length} trees (of ${trees.length})`,
  );
}

void main();
