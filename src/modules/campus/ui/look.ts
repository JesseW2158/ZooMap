/**
 * The campus look: colours, building materials, tree canopies and landmark labels. Pure
 * data and functions, so `Layer.tsx` only wires them into MapLibre.
 *
 * Buildings follow how the campus reads from above: mostly light concrete and pale stone
 * with flat light roofs (the Campus Center, LGRT, the Fine Arts Center), tan precast for the
 * Southwest towers, a granite Old Chapel, the timber Design Building, and the W.E.B. Du Bois
 * Library as the one red-brick landmark. Unnamed buildings get one of the light neutrals,
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

/** A soft blue sky behind the horizon when the map is tilted, fading into haze. */
export const SKY = {
  "sky-color": "#79b8e8",
  "horizon-color": "#dcecf5",
  "fog-color": "#eef1e6",
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
  library: ["#8b4a38"],
  stone: ["#a99f8e"],
  wood: ["#cfb995"],
  glass: ["#cfe3ea"],
  white: ["#eeede7"],
  shed: ["#aeaba3"],
} as const;
type Material = keyof typeof MATERIAL;

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
      const props = (f.properties ?? {}) as { name?: string; heightM?: number };
      const seed = seedOf(f.geometry);
      const shades = MATERIAL[materialOf(props.name, props.heightM ?? 10, seed)];
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

// ---------------------------------------------------------------- labels

/** A handful of landmarks people navigate by, with the short name students use. */
export const LANDMARKS: [RegExp, string][] = [
  [/^W\.E\.B\. Du Bois Library$/, "Du Bois Library"],
  [/^Murray D\. Lincoln Campus Center$/, "Campus Center"],
  [/^Student Union$/, "Student Union"],
  [/^Integrative Learning Center$/, "ILC"],
  [/^Isenberg School of Management$/, "Isenberg"],
  [/^Old Chapel$/, "Old Chapel"],
  [/^Randolph W\. Bromery Center for the Arts$/, "Fine Arts Center"],
  [/^Lederle Graduate Research Tower$/, "LGRT"],
  [/^Mullins Center$/, "Mullins Center"],
  [/^Recreation Center$/, "Rec Center"],
  [/^Worcester Commons$/, "Worcester"],
  [/^Franklin Dining Commons$/, "Franklin"],
];

/** The centre of a footprint's outer ring (vertex average: fine for a label). */
export function centreOf(geometry: GeoJSON.Geometry): [number, number] | null {
  const ring =
    geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.type === "MultiPolygon" ? geometry.coordinates[0]?.[0] : undefined;
  if (!ring?.length) return null;
  let x = 0;
  let y = 0;
  const n = ring.length - 1 || 1;
  for (let i = 0; i < n; i++) {
    x += ring[i]![0]!;
    y += ring[i]![1]!;
  }
  return [x / n, y / n];
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
