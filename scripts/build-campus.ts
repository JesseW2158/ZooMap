/**
 * `npm run campus:build [-- --refresh]`: regenerate `data/campus/` from OpenStreetMap.
 *
 * 1. Fetch everything in BBOX from the Overpass API into `data/campus/raw/osm.json`, reused
 *    unless `--refresh` is passed, so rebuilds work offline.
 * 2. Buildings (polygons and multipolygons) with a height, places (named buildings and named
 *    amenities, merged with `overrides.json`), display ground, and a pedestrian walk graph.
 * 3. Entrances: tagged doors joined to the graph by a short connector, plus estimated access
 *    points around buildings with too few mapped doors (ported from umass-3d-map/build_nav.py).
 *    Connectors never cross a building, fence, wall or water.
 *
 * Deterministic: elements are processed in (type, id) order and every coordinate is rounded,
 * so the same raw file gives byte-identical output.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BuildingCollection, GroundCollection, GroundKind, Place, PlaceCategory, WalkGraph } from "../src/shared/contracts";

// ---------------------------------------------------------------- configuration

/** south, west, north, east */
export const BBOX = [42.376, -72.541, 42.401, -72.514] as const;
/** The OSM "University of Massachusetts Amherst" area. Places farther than CAMPUS_MARGIN_M outside it are dropped. */
const CAMPUS_RELATION_ID = 9361144;
const CAMPUS_MARGIN_M = 150;
/** Named buildings with the same name this close together are one place (e.g. a tower and its podium). */
const SAME_PLACE_M = 150;
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OUT_DIR = path.join(process.cwd(), "data", "campus");
const RAW_FILE = path.join(OUT_DIR, "raw", "osm.json");
const OVERRIDES_FILE = path.join(OUT_DIR, "overrides.json");

const WALKABLE = new Set([
  "footway", "path", "pedestrian", "steps", "cycleway", "living_street",
  "residential", "service", "unclassified", "tertiary", "tertiary_link", "track",
]);
const PATH_KINDS = new Set(["footway", "path", "pedestrian", "steps", "cycleway", "track", "bridleway", "corridor"]);
const SKIP_HIGHWAY = new Set(["proposed", "construction", "elevator", "platform", "bus_stop", "corridor"]);
/** Named amenities that are infrastructure, not destinations. */
const SKIP_AMENITY = new Set([
  "parking", "parking_entrance", "parking_space", "bicycle_parking", "motorcycle_parking", "bench", "waste_basket",
  "waste_disposal", "recycling", "vending_machine", "post_box", "atm", "telephone", "drinking_water", "fountain",
  "bicycle_repair_station", "charging_station", "fuel", "shelter", "toilets", "loading_dock", "car_sharing",
  "bicycle_rental", "clock", "grit_bin", "letter_box", "bus_station", "taxi",
]);
const BLOCKING_BARRIERS = new Set(["fence", "wall", "hedge", "retaining_wall", "city_wall", "guard_rail"]);

const DEFAULT_HEIGHT_M = 10;
const METRES_PER_LEVEL = 3.5;
const DOOR_SNAP_M = 45;
const ACCESS_SNAP_M = 60;
const ENTRANCE_REPORT_M = 80;

// ---------------------------------------------------------------- OSM types

interface OsmNode { type: "node"; id: number; lat: number; lon: number; tags?: Record<string, string> }
interface OsmWay { type: "way"; id: number; nodes: number[]; tags?: Record<string, string> }
interface OsmMember { type: "node" | "way" | "relation"; ref: number; role: string }
interface OsmRelation { type: "relation"; id: number; members: OsmMember[]; tags?: Record<string, string> }
type OsmElement = OsmNode | OsmWay | OsmRelation;
interface OsmResponse { osm3s?: { timestamp_osm_base?: string }; elements: OsmElement[] }

type LngLat = [number, number];
type XY = [number, number];

interface Overrides {
  [placeId: string]: {
    name?: string;
    aliases?: string[];
    category?: PlaceCategory;
    studyFriendly?: boolean;
    exclude?: boolean;
    /**
     * The building is a tall tower on a low base, and OSM gives only the base (with an inner
     * ring), so extruding it whole draws one tall block. Draw the outer ring (with its holes) at
     * `baseHeightM` and a solid tower at full height with each inner ring's footprint.
     * `mirror`: the inner ring is a courtyard on the far side of the plot from the tower, so the
     * tower goes at the inner ring rotated 180 degrees about the plot's centre, and the hole stays.
     */
    towerFromInner?: { baseHeightM: number; mirror?: boolean };
  };
}

// ---------------------------------------------------------------- fetch

function overpassQuery(): string {
  const [s, w, n, e] = BBOX;
  return `[out:json][timeout:180][bbox:${s},${w},${n},${e}];
(
  nwr["building"];
  way["highway"];
  nwr["landuse"];
  nwr["leisure"];
  nwr["natural"];
  nwr["amenity"];
  node["entrance"];
  node["door"];
  way["barrier"];
);
out body;
>;
out skel qt;`;
}

async function loadRaw(refresh: boolean): Promise<OsmResponse> {
  if (!refresh && existsSync(RAW_FILE)) {
    console.log(`Using cached ${path.relative(process.cwd(), RAW_FILE)} (pass --refresh to refetch)`);
    return JSON.parse(readFileSync(RAW_FILE, "utf8")) as OsmResponse;
  }
  console.log(`Fetching ${OVERPASS_URL} ...`);
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ZooMap campus build" },
    body: new URLSearchParams({ data: overpassQuery() }),
  });
  if (!res.ok) throw new Error(`Overpass returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as OsmResponse;
  // Merge duplicates (a way can come back both tagged and as a skeleton) and sort, so the
  // cached file is stable.
  const byKey = new Map<string, OsmElement>();
  for (const el of json.elements) {
    const key = `${el.type}/${el.id}`;
    const prev = byKey.get(key);
    if (!prev || (!prev.tags && el.tags)) byKey.set(key, el);
  }
  const order = { node: 0, way: 1, relation: 2 } as const;
  const elements = [...byKey.values()].sort((a, b) => order[a.type] - order[b.type] || a.id - b.id);
  const raw: OsmResponse = { osm3s: { timestamp_osm_base: json.osm3s?.timestamp_osm_base }, elements };
  mkdirSync(path.dirname(RAW_FILE), { recursive: true });
  writeFileSync(RAW_FILE, JSON.stringify(raw));
  return raw;
}

// ---------------------------------------------------------------- geometry

const LAT0 = (BBOX[0] + BBOX[2]) / 2;
const LON0 = (BBOX[1] + BBOX[3]) / 2;
const KX = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110_540;
const toXY = ([lng, lat]: LngLat): XY => [(lng - LON0) * KX, (lat - LAT0) * KY];
const toLngLat = ([x, y]: XY): LngLat => [round7(x / KX + LON0), round7(y / KY + LAT0)];
const round7 = (v: number) => Math.round(v * 1e7) / 1e7;
const round1 = (v: number) => Math.round(v * 10) / 10;
const dist = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function projectOnSegment(p: XY, a: XY, b: XY): { t: number; q: XY; d: number } {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  const q: XY = [a[0] + t * dx, a[1] + t * dy];
  return { t, q, d: dist(p, q) };
}

function pointInRing(p: XY, ring: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[j];
    if (ay > p[1] !== by > p[1] && p[0] < ax + ((p[1] - ay) * (bx - ax)) / (by - ay)) inside = !inside;
  }
  return inside;
}

/** Parameter along p->q where it crosses a->b, or null. */
function segmentCross(p: XY, q: XY, a: XY, b: XY): number | null {
  const rx = q[0] - p[0], ry = q[1] - p[1], sx = b[0] - a[0], sy = b[1] - a[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((a[0] - p[0]) * sy - (a[1] - p[1]) * sx) / den;
  const u = ((a[0] - p[0]) * ry - (a[1] - p[1]) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** Area centroid of a simple ring. */
function ringCentroid(ring: XY[]): XY {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += cross;
    cx += (ring[j][0] + ring[i][0]) * cross;
    cy += (ring[j][1] + ring[i][1]) * cross;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

function ringArea(ring: XY[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return a / 2;
}

/** Area centroid, or an interior point on the horizontal line through it when the centroid falls outside. */
function interiorPoint(ring: XY[]): XY {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f; a += f;
  }
  const c: XY = a === 0 ? ring[0] : [cx / (3 * a), cy / (3 * a)];
  if (pointInRing(c, ring)) return c;
  const xs: number[] = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[j];
    if (ay > c[1] !== by > c[1]) xs.push(ax + ((c[1] - ay) * (bx - ax)) / (by - ay));
  }
  xs.sort((m, n) => m - n);
  let best: XY = ring[0], bestW = -1;
  for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] - xs[k] > bestW) { bestW = xs[k + 1] - xs[k]; best = [(xs[k] + xs[k + 1]) / 2, c[1]]; }
  return best;
}

function perimeter(ring: XY[]): number {
  let p = 0;
  for (let i = 0; i < ring.length; i++) p += dist(ring[i], ring[(i + 1) % ring.length]);
  return p;
}

function distToRing(p: XY, ring: XY[]): number {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) d = Math.min(d, projectOnSegment(p, ring[i], ring[(i + 1) % ring.length]).d);
  return d;
}

/** A uniform grid over the local metre plane for nearby lookups. */
class Grid<T> {
  private cells = new Map<string, T[]>();
  constructor(private size: number) {}
  private key(gx: number, gy: number) { return `${gx},${gy}`; }
  insertBox(minX: number, minY: number, maxX: number, maxY: number, item: T) {
    for (let gx = Math.floor(minX / this.size); gx <= Math.floor(maxX / this.size); gx++)
      for (let gy = Math.floor(minY / this.size); gy <= Math.floor(maxY / this.size); gy++) {
        const k = this.key(gx, gy);
        const cell = this.cells.get(k);
        if (cell) cell.push(item); else this.cells.set(k, [item]);
      }
  }
  queryBox(minX: number, minY: number, maxX: number, maxY: number): Set<T> {
    const out = new Set<T>();
    for (let gx = Math.floor(minX / this.size); gx <= Math.floor(maxX / this.size); gx++)
      for (let gy = Math.floor(minY / this.size); gy <= Math.floor(maxY / this.size); gy++)
        for (const item of this.cells.get(this.key(gx, gy)) ?? []) out.add(item);
    return out;
  }
}

// ---------------------------------------------------------------- tag helpers

function num(s: string | undefined): number | null {
  if (!s) return null;
  const m = /[\d.]+/.exec(s.replace(",", "."));
  const v = m ? Number.parseFloat(m[0]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

function heightOf(tags: Record<string, string>): number {
  const h = num(tags.height);
  if (h) return round1(h);
  const levels = num(tags["building:levels"]);
  if (levels) return round1(levels * METRES_PER_LEVEL);
  return DEFAULT_HEIGHT_M;
}

function categoryOf(tags: Record<string, string>, name: string): PlaceCategory {
  const { amenity, building, leisure } = tags;
  if (amenity === "library") return "library";
  if (["restaurant", "cafe", "fast_food", "food_court", "bar", "pub", "ice_cream"].includes(amenity ?? "")) return "dining";
  if (/\bdining\b|dining commons/i.test(name)) return "dining";
  if (building === "dormitory" || tags.residential === "university") return "residence";
  if (["sports_centre", "stadium", "fitness_centre", "sports_hall", "ice_rink", "swimming_pool"].includes(leisure ?? "")) return "athletic";
  if (["sports_hall", "stadium", "sports_centre", "grandstand"].includes(building ?? "")) return "athletic";
  if (["theatre", "arts_centre", "community_centre", "place_of_worship", "cinema", "events_venue", "social_centre", "student_centre"].includes(amenity ?? "")) return "student_life";
  if (building === "university" || building === "college" || amenity === "university" || amenity === "college") return "academic";
  return "other";
}

// ---------------------------------------------------------------- build

interface BuildingRec {
  osmId: string; // "w123" / "r123"
  tags: Record<string, string>;
  rings: XY[][][]; // polygons -> rings (first outer) in local metres
  heightM: number;
}

export interface BuildResult {
  buildings: BuildingCollection;
  ground: GroundCollection;
  places: Place[];
  graph: WalkGraph;
  report: string[];
}

export function buildCampus(raw: OsmResponse, overrides: Overrides): BuildResult {
  const nodes = new Map<number, OsmNode>();
  const ways = new Map<number, OsmWay>();
  const relations: OsmRelation[] = [];
  const order = { node: 0, way: 1, relation: 2 } as const;
  const elements = [...raw.elements].sort((a, b) => order[a.type] - order[b.type] || a.id - b.id);
  for (const el of elements) {
    if (el.type === "node") nodes.set(el.id, el);
    else if (el.type === "way") ways.set(el.id, el);
    else relations.push(el);
  }
  const nodeLngLat = (id: number): LngLat | null => {
    const n = nodes.get(id);
    return n ? [n.lon, n.lat] : null;
  };
  const wayCoords = (w: OsmWay): LngLat[] => w.nodes.map(nodeLngLat).filter((c): c is LngLat => c !== null);
  const isClosed = (w: OsmWay) => w.nodes.length >= 4 && w.nodes[0] === w.nodes[w.nodes.length - 1];

  /** Join member ways of a multipolygon into closed rings of node ids. */
  function assembleRings(memberWays: OsmWay[]): number[][] {
    const pieces = memberWays.map((w) => [...w.nodes]).filter((p) => p.length >= 2);
    const rings: number[][] = [];
    while (pieces.length) {
      let ring = pieces.shift()!;
      let grew = true;
      while (ring[0] !== ring[ring.length - 1] && grew) {
        grew = false;
        for (let i = 0; i < pieces.length; i++) {
          const p = pieces[i], end = ring[ring.length - 1];
          if (p[0] === end) ring = ring.concat(p.slice(1));
          else if (p[p.length - 1] === end) ring = ring.concat([...p].reverse().slice(1));
          else if (p[p.length - 1] === ring[0]) ring = p.concat(ring.slice(1));
          else if (p[0] === ring[0]) ring = [...p].reverse().concat(ring.slice(1));
          else continue;
          pieces.splice(i, 1); grew = true; break;
        }
      }
      if (ring.length >= 4 && ring[0] === ring[ring.length - 1]) rings.push(ring);
    }
    return rings;
  }

  const ringXY = (ids: number[]): XY[] => {
    const pts = ids.map(nodeLngLat).filter((c): c is LngLat => c !== null).map(toXY);
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    return pts;
  };

  /** Polygons (outer then inners) for an area way or multipolygon relation. */
  function areaPolygons(el: OsmWay | OsmRelation): XY[][][] {
    if (el.type === "way") {
      if (!isClosed(el)) return [];
      const ring = ringXY(el.nodes);
      return ring.length >= 3 ? [[ring]] : [];
    }
    if (el.tags?.type !== "multipolygon") return [];
    const members = (role: string) =>
      el.members.filter((m) => m.type === "way" && (m.role || "outer") === role).map((m) => ways.get(m.ref)).filter((w): w is OsmWay => !!w);
    const outers = assembleRings(members("outer")).map(ringXY).filter((r) => r.length >= 3);
    const inners = assembleRings(members("inner")).map(ringXY).filter((r) => r.length >= 3);
    return outers.map((outer) => [outer, ...inners.filter((inner) => pointInRing(inner[0], outer))]);
  }

  const toGeometry = (polys: XY[][][]): BuildingCollection["features"][number]["geometry"] => {
    const close = (ring: XY[]) => { const ll = ring.map(toLngLat); return [...ll, ll[0]]; };
    const coords = polys.map((rings) => rings.map(close));
    return coords.length === 1 ? { type: "Polygon", coordinates: coords[0] } : { type: "MultiPolygon", coordinates: coords };
  };

  // ------------------------------------------------ buildings
  const buildings: BuildingRec[] = [];
  const consumedOuterWays = new Set<number>();
  for (const rel of relations) {
    if (!rel.tags?.building || rel.tags.building === "no") continue;
    const rings = areaPolygons(rel);
    if (!rings.length) continue;
    for (const m of rel.members) if (m.type === "way" && (m.role || "outer") === "outer") consumedOuterWays.add(m.ref);
    buildings.push({ osmId: `r${rel.id}`, tags: rel.tags, rings, heightM: heightOf(rel.tags) });
  }
  for (const w of ways.values()) {
    if (!w.tags?.building || w.tags.building === "no" || consumedOuterWays.has(w.id)) continue;
    const rings = areaPolygons(w);
    if (!rings.length) continue;
    buildings.push({ osmId: `w${w.id}`, tags: w.tags, rings, heightM: heightOf(w.tags) });
  }
  buildings.sort((a, b) => (a.osmId < b.osmId ? -1 : a.osmId > b.osmId ? 1 : 0));
  const buildingGrid = new Grid<number>(50);
  buildings.forEach((b, i) => {
    const pts = b.rings.flatMap((r) => r[0]);
    buildingGrid.insertBox(Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])), i);
  });
  const outerRings = (b: BuildingRec) => b.rings.map((r) => r[0]);
  function buildingAt(p: XY, tol: number): number | null {
    let best: { d: number; i: number } | null = null;
    for (const i of buildingGrid.queryBox(p[0] - tol, p[1] - tol, p[0] + tol, p[1] + tol)) {
      for (const ring of outerRings(buildings[i])) {
        if (pointInRing(p, ring)) return i;
        const d = distToRing(p, ring);
        if (d <= tol && (!best || d < best.d)) best = { d, i };
      }
    }
    return best ? best.i : null;
  }

  // ------------------------------------------------ obstacles for connectors
  const blockers: [XY, XY][] = [];
  const blockerGrid = new Grid<number>(25);
  const addBlocker = (a: XY, b: XY) => {
    blockerGrid.insertBox(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), blockers.length);
    blockers.push([a, b]);
  };
  const addRingBlockers = (ring: XY[]) => { for (let i = 0; i < ring.length; i++) addBlocker(ring[i], ring[(i + 1) % ring.length]); };
  for (const b of buildings) for (const poly of b.rings) for (const ring of poly) addRingBlockers(ring);
  for (const w of ways.values()) {
    const t = w.tags ?? {};
    if (BLOCKING_BARRIERS.has(t.barrier ?? "") || t.natural === "cliff") {
      const pts = wayCoords(w).map(toXY);
      for (let i = 1; i < pts.length; i++) addBlocker(pts[i - 1], pts[i]);
    }
    if (t.natural === "water") for (const poly of areaPolygons(w)) for (const ring of poly) addRingBlockers(ring);
  }
  for (const rel of relations) if (rel.tags?.natural === "water") for (const poly of areaPolygons(rel)) for (const ring of poly) addRingBlockers(ring);

  /** True when p->q crosses no obstacle, ignoring the first and last `trim` metres. */
  function clear(p: XY, q: XY, trim = 1): boolean {
    const L = dist(p, q);
    if (L <= 2 * trim) return true;
    for (const i of blockerGrid.queryBox(Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1]))) {
      const t = segmentCross(p, q, blockers[i][0], blockers[i][1]);
      if (t !== null && t * L > trim && (1 - t) * L > trim) return false;
    }
    return true;
  }

  // ------------------------------------------------ walk graph
  const coords: XY[] = [];
  const graphIdOf = new Map<number, number>();
  const edgeSet = new Map<string, [number, number]>();
  const gnode = (osmId: number): number => {
    let g = graphIdOf.get(osmId);
    if (g === undefined) { g = coords.length; graphIdOf.set(osmId, g); coords.push(toXY(nodeLngLat(osmId)!)); }
    return g;
  };
  const addEdge = (a: number, b: number) => {
    if (a === b) return;
    const [x, y] = a < b ? [a, b] : [b, a];
    edgeSet.set(`${x},${y}`, [x, y]);
  };
  for (const w of ways.values()) {
    const t = w.tags ?? {};
    if (!WALKABLE.has(t.highway ?? "")) continue;
    if (t.foot === "no" || t.access === "private" || (t.access === "no" && !["yes", "designated", "permissive"].includes(t.foot ?? ""))) continue;
    const ids = w.nodes.filter((id) => nodes.has(id));
    for (let i = 1; i < ids.length; i++) addEdge(gnode(ids[i - 1]), gnode(ids[i]));
  }
  const walkableNodeCount = coords.length;

  // edges indexed for snapping
  const edgeList = () => [...edgeSet.values()];
  let edgeGrid = new Grid<string>(25);
  const indexEdges = () => {
    edgeGrid = new Grid<string>(25);
    for (const [a, b] of edgeList()) {
      const p = coords[a], q = coords[b];
      edgeGrid.insertBox(Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1]), `${a},${b}`);
    }
  };
  indexEdges();

  /** Nearest graph edge reachable from p in a straight, unobstructed line, not passing through `ownRings`. */
  function nearestReachable(p: XY, radius: number, ownRings: XY[][] = []) {
    const cands: { d: number; key: string; t: number; q: XY }[] = [];
    for (const key of edgeGrid.queryBox(p[0] - radius, p[1] - radius, p[0] + radius, p[1] + radius)) {
      const e = edgeSet.get(key);
      if (!e) continue;
      const { t, q, d } = projectOnSegment(p, coords[e[0]], coords[e[1]]);
      if (d <= radius) cands.push({ d, key, t, q });
    }
    cands.sort((m, n) => m.d - n.d || (m.key < n.key ? -1 : 1));
    for (const c of cands) {
      if (c.d < 0.4) return c;
      const mid: XY = [(p[0] + c.q[0]) / 2, (p[1] + c.q[1]) / 2];
      if (ownRings.some((r) => pointInRing(mid, r))) continue;
      if (clear(p, c.q)) return c;
    }
    return null;
  }

  const splits = new Map<string, { t: number; node: number }[]>();
  /** Join a new node at p to the graph; returns the new node or null. */
  function connect(p: XY, radius: number, ownRings: XY[][]): number | null {
    const hit = nearestReachable(p, radius, ownRings);
    if (!hit) return null;
    const [a, b] = edgeSet.get(hit.key)!;
    const L = dist(coords[a], coords[b]);
    let target: number;
    if (hit.t * L < 0.6) target = a;
    else if ((1 - hit.t) * L < 0.6) target = b;
    else {
      const existing = splits.get(hit.key)?.find((s) => Math.abs(s.t - hit.t) * L < 0.6);
      if (existing) target = existing.node;
      else {
        target = coords.length; coords.push(hit.q);
        const list = splits.get(hit.key) ?? [];
        list.push({ t: hit.t, node: target });
        splits.set(hit.key, list);
      }
    }
    const door = coords.length; coords.push(p);
    addEdge(door, target);
    return door;
  }

  // access points per building index
  const access = new Map<number, number[]>();
  const addAccess = (bi: number, node: number) => { const l = access.get(bi) ?? []; if (!l.includes(node)) l.push(node); access.set(bi, l); };

  // tagged doors
  let taggedDoors = 0;
  for (const n of nodes.values()) {
    const t = n.tags;
    if (!t) continue;
    const kind = t.entrance ?? (t.door ? "yes" : undefined);
    if (!kind || ["emergency", "garage", "no", "service"].includes(kind)) continue;
    const p = toXY([n.lon, n.lat]);
    const bi = buildingAt(p, 2.5);
    if (bi === null) continue;
    const inGraph = graphIdOf.get(n.id);
    if (inGraph !== undefined) { addAccess(bi, inGraph); taggedDoors++; continue; }
    const door = connect(p, DOOR_SNAP_M, outerRings(buildings[bi]));
    if (door !== null) { addAccess(bi, door); taggedDoors++; }
  }

  // ------------------------------------------------ places
  const placeBuildings = new Map<string, number>(); // place id -> building index
  interface PlaceDraft { id: string; name: string; tags: Record<string, string>; point: XY; building: number | null }
  const drafts: PlaceDraft[] = [];
  buildings.forEach((b, i) => {
    const name = b.tags.name?.trim();
    if (!name) return;
    const biggest = [...b.rings].sort((m, n) => Math.abs(ringArea(n[0])) - Math.abs(ringArea(m[0])))[0];
    drafts.push({ id: b.osmId, name, tags: b.tags, point: interiorPoint(biggest[0]), building: i });
    placeBuildings.set(b.osmId, i);
  });
  const amenityEls: (OsmNode | OsmWay | OsmRelation)[] = [
    ...[...nodes.values()].filter((n) => n.tags),
    ...[...ways.values()].filter((w) => w.tags),
    ...relations,
  ];
  for (const el of amenityEls) {
    const t = el.tags ?? {};
    const name = t.name?.trim();
    if (!name || t.building) continue; // named buildings are already places
    const isAmenity = t.amenity && !SKIP_AMENITY.has(t.amenity);
    const isSport = ["sports_centre", "stadium", "fitness_centre", "ice_rink"].includes(t.leisure ?? "");
    if (!isAmenity && !isSport) continue;
    const id = `${el.type[0]}${el.id}`;
    let point: XY | null = null;
    if (el.type === "node") point = toXY([el.lon, el.lat]);
    else {
      const polys = areaPolygons(el);
      if (polys.length) point = interiorPoint(polys[0][0]);
      else if (el.type === "way") { const pts = wayCoords(el).map(toXY); if (pts.length) point = pts[Math.floor(pts.length / 2)]; }
    }
    if (!point) continue;
    drafts.push({ id, name, tags: t, point, building: buildingAt(point, 0) });
  }

  // keep only places on campus
  const campusRel = relations.find((r) => r.id === CAMPUS_RELATION_ID);
  const campusRings = campusRel ? areaPolygons(campusRel).map((poly) => poly[0]) : [];
  const onCampus = (p: XY) =>
    !campusRings.length || campusRings.some((r) => pointInRing(p, r) || distToRing(p, r) <= CAMPUS_MARGIN_M);
  for (let i = drafts.length - 1; i >= 0; i--) {
    const d = drafts[i];
    if (d.id === `r${CAMPUS_RELATION_ID}` || !onCampus(d.point)) {
      drafts.splice(i, 1);
      placeBuildings.delete(d.id);
    }
  }
  // merge same-name buildings that are close together into the tallest one
  const extraBuildings = new Map<string, number[]>(); // place id -> other building indexes that select it
  for (let i = 0; i < drafts.length; i++) {
    const a = drafts[i];
    if (a.building === null || !placeBuildings.has(a.id)) continue;
    for (let j = drafts.length - 1; j > i; j--) {
      const b = drafts[j];
      if (b.building === null || !placeBuildings.has(b.id) || b.name !== a.name || dist(a.point, b.point) > SAME_PLACE_M) continue;
      const [keepD, dropD] = buildings[b.building].heightM > buildings[a.building].heightM ? [b, a] : [a, b];
      const merged = [dropD.building!, ...(extraBuildings.get(dropD.id) ?? []), ...(extraBuildings.get(keepD.id) ?? [])];
      extraBuildings.set(keepD.id, merged);
      extraBuildings.delete(dropD.id);
      placeBuildings.delete(dropD.id);
      drafts[i] = keepD;
      drafts.splice(j, 1);
    }
  }
  const placeOfBuilding = new Map<number, string>();
  for (const [id, bi] of placeBuildings) placeOfBuilding.set(bi, id);
  for (const [id, list] of extraBuildings) for (const bi of list) placeOfBuilding.set(bi, id);

  // estimated access points for place buildings with too few doors
  let estimated = 0;
  for (const bi of [...placeOfBuilding.keys()].sort((a, b) => a - b)) {
    const rings = outerRings(buildings[bi]);
    const ring = [...rings].sort((m, n) => Math.abs(ringArea(n)) - Math.abs(ringArea(m)))[0];
    const tagged = access.get(bi)?.length ?? 0;
    const P = perimeter(ring);
    if (tagged >= 2 || (tagged === 1 && P < 220)) continue;
    let want = (P < 60 ? 1 : P < 160 ? 2 : P < 400 ? 3 : 4) - tagged;
    const samples: XY[] = [];
    for (let j = 0; j < ring.length; j++) {
      const a = ring[j], b = ring[(j + 1) % ring.length];
      const m = Math.max(1, Math.floor(dist(a, b) / 6));
      for (let s = 0; s < m; s++) { const tt = (s + 0.5) / m; samples.push([a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt]); }
    }
    const opts = samples
      .map((sp) => ({ sp, hit: nearestReachable(sp, ACCESS_SNAP_M, rings) }))
      .filter((o): o is { sp: XY; hit: NonNullable<typeof o.hit> } => o.hit !== null)
      .sort((m, n) => m.hit.d - n.hit.d);
    const chosen = (access.get(bi) ?? []).map((n) => coords[n]);
    const spacing = Math.max(15, P / (want + tagged) / 2.2);
    const bestD = opts[0]?.hit.d ?? 0;
    for (const { sp, hit } of opts) {
      if (want <= 0 || hit.d > bestD + 30) break;
      if (chosen.some((c) => dist(sp, c) < spacing)) continue;
      const door = connect(sp, ACCESS_SNAP_M, rings);
      if (door === null) continue;
      addAccess(bi, door); chosen.push(sp); want--; estimated++;
    }
  }

  // apply edge splits
  for (const [key, list] of splits) {
    const e = edgeSet.get(key);
    if (!e) continue;
    edgeSet.delete(key);
    list.sort((m, n) => m.t - n.t);
    const chain = [e[0], ...list.map((s) => s.node), e[1]];
    for (let i = 1; i < chain.length; i++) addEdge(chain[i - 1], chain[i]);
  }

  // largest connected component
  const adj = new Map<number, number[]>();
  for (const [a, b] of edgeSet.values()) {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  }
  const comp = new Map<number, number>();
  const sizes: number[] = [];
  for (const s of [...adj.keys()].sort((a, b) => a - b)) {
    if (comp.has(s)) continue;
    const id = sizes.length; let size = 0; const stack = [s]; comp.set(s, id);
    while (stack.length) {
      const u = stack.pop()!; size++;
      for (const v of adj.get(u)!) if (!comp.has(v)) { comp.set(v, id); stack.push(v); }
    }
    sizes.push(size);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  const keep = [...adj.keys()].filter((n) => comp.get(n) === main).sort((a, b) => a - b);
  const remap = new Map(keep.map((n, i) => [n, i]));
  const graph: WalkGraph = {
    nodes: keep.map((n) => toLngLat(coords[n])),
    edges: [...edgeSet.values()]
      .filter(([a, b]) => remap.has(a) && remap.has(b))
      .map(([a, b]): [number, number, number] => [remap.get(a)!, remap.get(b)!, round1(dist(coords[a], coords[b]))])
      .sort((m, n) => m[0] - n[0] || m[1] - n[1]),
  };
  const keptXY = keep.map((n) => coords[n]);
  const nodeGrid = new Grid<number>(50);
  keptXY.forEach((p, i) => nodeGrid.insertBox(p[0], p[1], p[0], p[1], i));
  function nearestNode(p: XY): number {
    for (let r = 50; ; r *= 2) {
      let best = -1, bestD = Infinity;
      for (const i of nodeGrid.queryBox(p[0] - r, p[1] - r, p[0] + r, p[1] + r)) {
        const d = dist(p, keptXY[i]);
        if (d < bestD || (d === bestD && i < best)) { bestD = d; best = i; }
      }
      if (best >= 0 && bestD <= r) return best;
      if (r > 1e5) return 0;
    }
  }
  function nearestNodeToRings(rings: XY[][]): number {
    let best = -1, bestD = Infinity;
    for (const ring of rings) for (const v of ring) {
      const n = nearestNode(v);
      const d = distToRing(keptXY[n], ring);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  // ------------------------------------------------ places output
  const places: Place[] = [];
  const report: string[] = [];
  const farFromEntrance: string[] = [];
  const seen = new Set<string>();
  for (const d of drafts) {
    const o = overrides[d.id] ?? {};
    if (o.exclude || seen.has(d.id)) continue;
    seen.add(d.id);
    const b = d.building !== null ? buildings[d.building] : null;
    const ownBuildings = d.building === null ? [] : [d.building, ...(extraBuildings.get(d.id) ?? [])];
    let entranceNodes = ownBuildings.flatMap((bi) => access.get(bi) ?? [])
      .map((n) => remap.get(n))
      .filter((n): n is number => n !== undefined);
    if (!entranceNodes.length) entranceNodes = [b ? nearestNodeToRings(outerRings(b)) : nearestNode(d.point)];
    entranceNodes = [...new Set(entranceNodes)].sort((m, n) => m - n);
    const name = o.name ?? d.name;
    const place: Place = {
      id: d.id,
      name,
      aliases: o.aliases ?? [],
      category: o.category ?? categoryOf(b && d.building !== null && placeBuildings.get(d.id) === d.building ? { ...d.tags, ...b.tags } : d.tags, name),
      studyFriendly: o.studyFriendly ?? false,
      center: (() => { const [lng, lat] = toLngLat(d.point); return { lat, lng }; })(),
      entranceNodes,
      heightM: b ? b.heightM : DEFAULT_HEIGHT_M,
    };
    places.push(place);
    const gap = Math.min(...entranceNodes.map((n) => (b ? Math.min(...outerRings(b).map((r) => (pointInRing(keptXY[n], r) ? 0 : distToRing(keptXY[n], r)))) : dist(keptXY[n], d.point))));
    if (gap > ENTRANCE_REPORT_M) farFromEntrance.push(`  ${place.id} ${place.name} (${Math.round(gap)} m)`);
  }
  places.sort((a, b) => a.name.localeCompare(b.name, "en") || (a.id < b.id ? -1 : 1));
  for (const id of Object.keys(overrides)) if (!seen.has(id)) report.push(`WARNING: override ${id} matches no place`);
  for (const b of buildings) {
    if (overrides[b.osmId]?.towerFromInner && !b.rings.some((poly) => poly.length > 1)) {
      report.push(`WARNING: override ${b.osmId} sets towerFromInner but the building has no inner ring`);
    }
  }

  // ------------------------------------------------ buildings output
  const buildingsOut: BuildingCollection = {
    type: "FeatureCollection",
    features: buildings.flatMap((b, bi) => {
      const placeId = placeOfBuilding.get(bi);
      const place = placeId && !overrides[placeId]?.exclude ? places.find((p) => p.id === placeId) : undefined;
      const feature = (heightM: number, rings: XY[][][]): BuildingCollection["features"][number] => {
        const props: BuildingCollection["features"][number]["properties"] = { heightM };
        if (place) { props.placeId = place.id; props.name = place.name; }
        return { type: "Feature", properties: props, geometry: toGeometry(rings) };
      };
      const tower = overrides[b.osmId]?.towerFromInner;
      if (!tower || !b.rings.some((poly) => poly.length > 1)) return [feature(b.heightM, b.rings)];
      const towers = b.rings.flatMap(([outer, ...inners]) => {
        if (!tower.mirror) return inners;
        const [cx, cy] = ringCentroid(outer);
        return inners.map((ring) => ring.map(([x, y]): XY => [2 * cx - x, 2 * cy - y]));
      });
      return [feature(tower.baseHeightM, b.rings), ...towers.map((ring) => feature(b.heightM, [[ring]]))];
    }),
  };

  // ------------------------------------------------ ground output
  const groundOut: GroundCollection = { type: "FeatureCollection", features: [] };
  const addGround = (kind: GroundKind, geometry: GroundCollection["features"][number]["geometry"], name?: string) =>
    groundOut.features.push({ type: "Feature", properties: name ? { kind, name } : { kind }, geometry });
  const areaKind = (t: Record<string, string>): GroundKind | null => {
    if (t.natural === "water" || t.waterway === "riverbank" || t.landuse === "reservoir" || t.landuse === "basin") return "water";
    if (t.amenity === "parking" && t.parking !== "underground" && !t.building) return "parking";
    if (["grass", "meadow", "recreation_ground", "village_green", "forest", "cemetery", "orchard", "farmland", "allotments"].includes(t.landuse ?? "")) return "grass";
    if (["park", "pitch", "garden", "golf_course", "playground", "dog_park", "common", "track", "stadium", "nature_reserve"].includes(t.leisure ?? "")) return "grass";
    if (["wood", "scrub", "grassland", "heath", "wetland"].includes(t.natural ?? "")) return "grass";
    return null;
  };
  // grass first, then parking, then water, so later kinds draw on top
  const areaRank: Record<string, number> = { grass: 0, parking: 1, water: 2 };
  const areas: { kind: GroundKind; el: OsmWay | OsmRelation }[] = [];
  for (const w of ways.values()) { const k = w.tags && !w.tags.building ? areaKind(w.tags) : null; if (k) areas.push({ kind: k, el: w }); }
  for (const r of relations) { const k = r.tags && !r.tags.building ? areaKind(r.tags) : null; if (k) areas.push({ kind: k, el: r }); }
  areas.sort((a, b) => areaRank[a.kind] - areaRank[b.kind]);
  for (const { kind, el } of areas) {
    const polys = areaPolygons(el);
    if (polys.length) addGround(kind, toGeometry(polys), el.tags?.name);
  }
  for (const w of ways.values()) {
    const t = w.tags ?? {};
    if (!t.highway || SKIP_HIGHWAY.has(t.highway) || t.area === "yes") continue;
    const coordsLL = wayCoords(w).map((c) => toLngLat(toXY(c)));
    if (coordsLL.length < 2) continue;
    addGround(PATH_KINDS.has(t.highway) ? "path" : "road", { type: "LineString", coordinates: coordsLL }, t.name);
  }

  // ------------------------------------------------ report
  const placesWithEntrance = places.length - farFromEntrance.length;
  report.unshift(
    `OSM data: ${raw.osm3s?.timestamp_osm_base ?? "unknown date"}`,
    `Buildings: ${buildingsOut.features.length}`,
    `Places: ${places.length}`,
    `Ground features: ${groundOut.features.length}`,
    `Walk graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges (from ${walkableNodeCount} walkable nodes; ${sizes.length} components, kept the largest of ${sizes[main]})`,
    `Doors: ${taggedDoors} tagged, ${estimated} estimated access points`,
    `Places with an entrance within ${ENTRANCE_REPORT_M} m: ${placesWithEntrance}/${places.length} (${((100 * placesWithEntrance) / Math.max(1, places.length)).toFixed(1)}%)`,
  );
  if (farFromEntrance.length) report.push(`Places with no entrance within ${ENTRANCE_REPORT_M} m:`, ...farFromEntrance);

  return { buildings: buildingsOut, ground: groundOut, places, graph, report };
}

// ---------------------------------------------------------------- write

/** One array item per line: readable diffs, still compact. */
function writeLines(file: string, head: string, items: unknown[], tail: string) {
  const body = items.map((i) => JSON.stringify(i)).join(",\n");
  writeFileSync(path.join(OUT_DIR, file), `${head}\n${body}\n${tail}\n`);
}

async function main() {
  const raw = await loadRaw(process.argv.includes("--refresh"));
  const overrides: Overrides = existsSync(OVERRIDES_FILE) ? JSON.parse(readFileSync(OVERRIDES_FILE, "utf8")) : {};
  delete (overrides as Record<string, unknown>)["$comment"];
  const out = buildCampus(raw, overrides);
  mkdirSync(OUT_DIR, { recursive: true });
  writeLines("buildings.geojson", `{"type":"FeatureCollection","features":[`, out.buildings.features, `]}`);
  writeLines("ground.geojson", `{"type":"FeatureCollection","features":[`, out.ground.features, `]}`);
  writeFileSync(path.join(OUT_DIR, "places.json"), JSON.stringify(out.places, null, 2) + "\n");
  writeFileSync(
    path.join(OUT_DIR, "walk-graph.json"),
    `{"nodes":[\n${out.graph.nodes.map((n) => JSON.stringify(n)).join(",\n")}\n],"edges":[\n${out.graph.edges.map((e) => JSON.stringify(e)).join(",\n")}\n]}\n`,
  );
  console.log(out.report.join("\n"));
}

if (process.argv[1]?.endsWith("build-campus.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
