/**
 * The campus look: colours, building materials and tree canopies. Pure
 * data and functions, so `Layer.tsx` only wires them into MapLibre.
 *
 * Buildings that belong to a place are coloured by what they are (CATEGORY_COLORS): soft,
 * light tints that read apart at a glance and never use a strong red, which means crowded and selected.
 * They only show with the crowd heat off: the density layer covers every building otherwise.
 * The rest follow how the campus reads from above: mostly light concrete and pale stone
 * with flat light roofs (the Campus Center, LGRT, the Fine Arts Center), tan precast for the
 * Southwest towers, a granite Old Chapel, the timber Design Building, and the W.E.B. Du Bois
 * Library in pale grey, so it never reads as a crowded red. Unnamed buildings get one of the light neutrals,
 * picked from their position so it stays stable.
 */
import type { ExpressionSpecification } from "maplibre-gl";

// ---------------------------------------------------------------- palette

export const COLORS = {
  /** Paved and built-up ground between everything else. */
  base: "#d2d6c3",
  grass: "#8dc463",
  grassEdge: "#79b252",
  wood: "#5d9a45",
  pitch: "#6cbd4a",
  pitchLines: "#f4fbef",
  track: "#b9553d",
  water: "#3f9bd6",
  waterEdge: "#bfe6fb",
  parking: "#c2bdb2",
  parkingEdge: "#aaa498",
  roadCasing: "#9d978b",
  road: "#f4f1ea",
  path: "#f6e2a8",
  pathCasing: "#d8bd76",
  shadow: "#24331f",
  selected: "#881c1c",
  trees: ["#3e7b36", "#4c8c3b", "#5e9f45"] as const,
} as const;

/** Light from the south-west in late afternoon: warm, and shows two faces of each building. */
export const LIGHT = { anchor: "map", position: [1.4, 215, 38], color: "#ffffff", intensity: 0.35 } as const;

/** The haze the map fades into at its edges, and the sky's fog: one colour, so they meet. */
export const HAZE_COLOR = "#e9eee4";

/** A soft blue sky behind the horizon when the map is tilted, fading into haze. */
export const SKY = {
  "sky-color": "#79b8e8",
  "horizon-color": "#dcecf5",
  "fog-color": HAZE_COLOR,
  "sky-horizon-blend": 0.6,
  "horizon-fog-blend": 0.7,
  "fog-ground-blend": 0.85,
  "atmosphere-blend": 0,
} as const;

// ---------------------------------------------------------------- buildings

const MATERIAL = {
  concrete: ["#d7d3ca", "#cbc7be", "#dedad2"],
  greyConcrete: ["#bfbdb6"],
  limestone: ["#ddd2bf", "#d3c6ae"],
  tan: ["#d3c19f"],
  library: ["#d9d8d3"],
  stone: ["#a99f8e"],
  wood: ["#cfb995"],
  glass: ["#cfe3ea"],
  white: ["#eeede7"],
  shed: ["#aeaba3"],
} as const;
type Material = keyof typeof MATERIAL;

/** By place category; "other" places keep the materials above. Two close shades where a type is common. */
export const CATEGORY_COLORS = {
  academic: ["#d3dcf2", "#c9d4ee"], // light periwinkle: the most common type, so the lightest
  library: ["#86cbbf"], // teal
  residence: ["#f2dfb8", "#ecd5a8"], // warm sand
  dining: ["#f5c46a"], // marigold
  student_life: ["#d9c3f0"], // lavender
  athletic: ["#f4c6d6"], // pale rose: far lighter than the crowd red, and not blue like academic
} as const;
type ColoredCategory = keyof typeof CATEGORY_COLORS;
const isColored = (c: unknown): c is ColoredCategory => typeof c === "string" && c in CATEGORY_COLORS;

/** Name patterns, checked in order. */
const NAMED: [RegExp, Material][] = [
  [/du bois library/i, "library"],
  [/old chapel/i, "stone"],
  [/olver design/i, "wood"],
  [/conservatory|greenhouse/i, "glass"],
  [/bubble|mullins|recreation center/i, "white"],
  [/coolidge|kennedy hall|john (quincy )?adams|washington hall/i, "tan"],
  [/lederle|lgr[ct]|bromery|whitmore|parking garage|skyway|stadium stands/i, "greyConcrete"],
  [/campus center|thompson hall|tobin|herter|morrill/i, "concrete"],
];

function materialOf(name: string | undefined, heightM: number, seed: number): Material {
  if (name) for (const [re, m] of NAMED) if (re.test(name)) return m;
  if (!name && heightM <= 4) return "shed";
  // everything else: light concrete, with some pale limestone so blocks are not all one tone
  return seed % 3 === 0 ? "limestone" : "concrete";
}

/** A small stable integer from a footprint's first vertex, so shades do not flicker on reload. */
function seedOf(geometry: GeoJSON.Geometry): number {
  const ring =
    geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.type === "MultiPolygon" ? geometry.coordinates[0]?.[0] : undefined;
  const p = ring?.[0];
  if (!p) return 0;
  return Math.abs(Math.round(p[0]! * 1e5) * 31 + Math.round(p[1]! * 1e5));
}

/** Adds a `color` property to every building. */
export function paintBuildings(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    ...fc,
    features: fc.features.map((f) => {
      const props = (f.properties ?? {}) as { name?: string; heightM?: number; category?: string };
      const seed = seedOf(f.geometry);
      const shades: readonly string[] = isColored(props.category)
        ? CATEGORY_COLORS[props.category]
        : MATERIAL[materialOf(props.name, props.heightM ?? 10, seed)];
      return { ...f, properties: { ...props, color: shades[seed % shades.length] } };
    }),
  };
}

export const BUILDING_COLOR: ExpressionSpecification = ["get", "color"];

// ---------------------------------------------------------------- trees

const M_PER_DEG_LAT = 110_540;

/** Turns each tree point into an octagonal canopy polygon of its radius `r` (metres). */
export function treeCanopies(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const f of fc.features) {
    if (f.geometry.type !== "Point" || f.properties?.kind !== "tree") continue;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const r = Number(f.properties.r ?? 3);
    const kx = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
    const ring: [number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const a = ((i % 8) / 8) * Math.PI * 2 + Math.PI / 8;
      ring.push([lng + (r * Math.cos(a)) / kx, lat + (r * Math.sin(a)) / M_PER_DEG_LAT]);
    }
    features.push({ type: "Feature", properties: f.properties, geometry: { type: "Polygon", coordinates: [ring] } });
  }
  return { type: "FeatureCollection", features };
}

/** Line width that doubles with every zoom level, given its width at zoom 15 and 19. */
export const lineWidth = (atZ15: number, atZ19: number): ExpressionSpecification => [
  "interpolate",
  ["exponential", 2],
  ["zoom"],
  15,
  atZ15,
  19,
  atZ19,
];

// ---------------------------------------------------------------- edges

/** South-west and north-east corners the camera may not leave. */
export const MAX_BOUNDS: [[number, number], [number, number]] = [[-72.548, 42.370], [-72.506, 42.406]];

/**
 * How the map ends. Around the camera bounds a band of real surroundings (woods, fields,
 * houses, roads: `public/campus/surroundings.geojson`) fades into haze. Distances are metres
 * outside a rounded rectangle (a superellipse) the size of the camera bounds, so the fade
 * has no corners.
 */
export const EDGE = {
  centre: [(MAX_BOUNDS[0][0] + MAX_BOUNDS[1][0]) / 2, (MAX_BOUNDS[0][1] + MAX_BOUNDS[1][1]) / 2] as [number, number],
  /** Half the size of the camera bounds, east-west and north-south. */
  halfM: [1726, 1990] as [number, number],
  /** The haze starts this far outside the bounds... */
  hazeStartM: 250,
  /** ...and is solid from here. */
  hazeEndM: 2400,
  /** Steps of the fade; each one covers everything farther out. */
  hazeSteps: 20,
  hazeStepOpacity: 0.1,
  /** Superellipse exponent: 2 is an ellipse, higher is squarer. */
  shape: 4,
} as const;

const KX_EDGE = 111_320 * Math.cos((EDGE.centre[1] * Math.PI) / 180);

/** Metres east and north of the edge centre. */
export function edgeXY([lng, lat]: [number, number]): [number, number] {
  return [(lng - EDGE.centre[0]) * KX_EDGE, (lat - EDGE.centre[1]) * M_PER_DEG_LAT];
}

/** How far outside the bounds' rounded rectangle a point is, in metres (negative inside). */
export function edgeDistanceM(lngLat: [number, number]): number {
  const [x, y] = edgeXY(lngLat);
  const [hx, hy] = EDGE.halfM;
  const inside = (d: number) => Math.abs(x / (hx + d)) ** EDGE.shape + Math.abs(y / (hy + d)) ** EDGE.shape <= 1;
  let lo = -Math.min(hx, hy) + 1;
  let hi = 50_000;
  if (inside(lo)) return lo;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (inside(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Where the fade steps sit, metres outside the bounds; the last one is solid. */
export function hazeStepDistances(): number[] {
  const { hazeStartM, hazeEndM, hazeSteps } = EDGE;
  return Array.from({ length: hazeSteps + 1 }, (_, i) => hazeStartM + ((hazeEndM - hazeStartM) * i) / hazeSteps);
}

/** How much haze covers ground this far outside the bounds, 0 to 1 (matches the frames). */
export function hazeAt(distanceM: number): number {
  const steps = hazeStepDistances();
  if (distanceM >= steps[steps.length - 1]!) return 1;
  const n = steps.filter((d) => d <= distanceM).length;
  return 1 - (1 - EDGE.hazeStepOpacity) ** n;
}

/** One frame per fade step: a huge square with a rounded-rectangle hole. */
export function hazeFrames(): GeoJSON.FeatureCollection {
  const [cx, cy] = EDGE.centre;
  const [hx, hy] = EDGE.halfM;
  const steps = hazeStepDistances();
  const outer: [number, number][] = [[cx - 2, cy - 2], [cx + 2, cy - 2], [cx + 2, cy + 2], [cx - 2, cy + 2], [cx - 2, cy - 2]];
  return {
    type: "FeatureCollection",
    features: steps.map((d, i) => {
      const hole: [number, number][] = [];
      const n = 128;
      for (let k = 0; k <= n; k++) {
        const a = -((k % n) / n) * Math.PI * 2; // clockwise, opposite to the outer ring
        const c = Math.cos(a);
        const s = Math.sin(a);
        const x = (hx + d) * Math.sign(c) * Math.abs(c) ** (2 / EDGE.shape);
        const y = (hy + d) * Math.sign(s) * Math.abs(s) ** (2 / EDGE.shape);
        hole.push([cx + x / KX_EDGE, cy + y / M_PER_DEG_LAT]);
      }
      return {
        type: "Feature",
        properties: { opacity: i === steps.length - 1 ? 1 : EDGE.hazeStepOpacity },
        geometry: { type: "Polygon", coordinates: [outer, hole] },
      };
    }),
  };
}

/** Mixes a `#rrggbb` colour towards the haze by `t` (0 to 1). */
export function intoHaze(hex: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(p(hex, i) + (p(HAZE_COLOR, i) - p(hex, i)) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Colours of the surroundings: quieter than campus, so campus stays the subject. */
export const SURROUND = {
  residential: "#d9dbc9",
  commercial: "#dcd5c6",
  industrial: "#d0ccc2",
  farmland: "#c3d999",
  meadow: "#acd182",
  grass: "#9fcb74",
  park: "#97c76c",
  wood: "#679d50",
  wetland: "#94bf86",
  water: "#4aa0d8",
  cemetery: "#a5c98a",
  houses: ["#e7e3da", "#dcd7cc", "#d2cbbd", "#ebe7de", "#cdc4b3", "#c9cdd0"],
  trees: ["#467f3a", "#538f40", "#609c48"],
} as const;
