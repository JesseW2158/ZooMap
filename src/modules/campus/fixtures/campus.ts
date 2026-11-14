import type {
  BuildingCollection,
  GroundCollection,
  LatLng,
  LngLat,
  Place,
  PlaceCategory,
  WalkGraph,
} from "@/shared/contracts";
import { haversineM, offsetM } from "@/shared/geo";

/**
 * FIXTURE CAMPUS. Hand-made so every stream has places, a map and routes to work with
 * before the real OpenStreetMap data lands (01-campus-map replaces the module's bodies).
 *
 * The building names are real; the positions are NOT survey data. Each building is a
 * rectangle placed by a rough offset in metres from the map centre, and the walk graph is a
 * made-up spine with one spur per building. Place ids are "fx-<slug>" so nothing mistakes
 * them for OSM ids. Do not write tests that depend on these exact coordinates; depend on
 * the shapes (ids, categories, a connected graph, entrance indexes).
 */

export const CAMPUS_CENTER: LatLng = { lat: 42.3868, lng: -72.5301 };

interface FixtureBuilding {
  id: string;
  name: string;
  aliases: string[];
  category: PlaceCategory;
  studyFriendly: boolean;
  /** Metres east / north of CAMPUS_CENTER. */
  east: number;
  north: number;
  /** Footprint size in metres. */
  width: number;
  depth: number;
  heightM: number;
  /** Entrance, metres east / north of CAMPUS_CENTER (on the footprint's edge). */
  entrance: [east: number, north: number];
}

const BUILDINGS: FixtureBuilding[] = [
  {
    id: "fx-dubois",
    name: "W.E.B. Du Bois Library",
    aliases: ["Du Bois", "DuBois", "Du Bois Library", "W.E.B. Du Bois", "library", "lib"],
    category: "library",
    studyFriendly: true,
    east: 120,
    north: 60,
    width: 70,
    depth: 50,
    heightM: 90,
    entrance: [120, 35],
  },
  {
    id: "fx-ilc",
    name: "Integrated Learning Center",
    aliases: ["ILC"],
    category: "academic",
    studyFriendly: true,
    east: 260,
    north: 180,
    width: 80,
    depth: 45,
    heightM: 22,
    entrance: [260, 157],
  },
  {
    id: "fx-lgrt",
    name: "Lederle Graduate Research Tower",
    aliases: ["LGRT", "Lederle", "Lederle Tower"],
    category: "academic",
    studyFriendly: false,
    east: 40,
    north: 210,
    width: 40,
    depth: 30,
    heightM: 60,
    entrance: [40, 195],
  },
  {
    id: "fx-hasbrouck",
    name: "Hasbrouck Laboratory",
    aliases: ["Hasbrouck", "Hasbrouck Lab", "Hasbrouck Laboratory Addition"],
    category: "academic",
    studyFriendly: false,
    east: -120,
    north: 150,
    width: 60,
    depth: 35,
    heightM: 15,
    entrance: [-120, 132],
  },
  {
    id: "fx-campus-center",
    name: "Campus Center",
    aliases: ["Campus Center", "CC", "Student Union"],
    category: "student_life",
    studyFriendly: true,
    east: 60,
    north: -80,
    width: 90,
    depth: 55,
    heightM: 18,
    entrance: [60, -52],
  },
  {
    id: "fx-berkshire",
    name: "Berkshire Dining Commons",
    aliases: ["Berkshire", "Berkshire DC", "Berkshire Dining"],
    category: "dining",
    studyFriendly: false,
    east: -200,
    north: -120,
    width: 60,
    depth: 40,
    heightM: 12,
    entrance: [-200, -100],
  },
  {
    id: "fx-mullins",
    name: "Mullins Center",
    aliases: ["Mullins"],
    category: "athletic",
    studyFriendly: false,
    east: 300,
    north: -160,
    width: 90,
    depth: 70,
    heightM: 25,
    entrance: [300, -125],
  },
  {
    id: "fx-kennedy",
    name: "Kennedy Tower",
    aliases: ["Kennedy", "Southwest"],
    category: "residence",
    studyFriendly: false,
    east: -60,
    north: -260,
    width: 30,
    depth: 30,
    heightM: 60,
    entrance: [-60, -245],
  },
];

/** Junctions along an east-west spine at north = 0, metres from the centre. */
const SPINE: [east: number, north: number][] = [
  [-200, 0],
  [-120, 0],
  [-60, 0],
  [60, 0],
  [120, 0],
  [260, 0],
  [300, 0],
];

/** For each building's id, which spine junction (index in SPINE) its spur hangs off. */
const SPUR_TO_SPINE: Record<string, number> = {
  "fx-dubois": 4,
  "fx-ilc": 5,
  "fx-lgrt": 3,
  "fx-hasbrouck": 1,
  "fx-campus-center": 3,
  "fx-berkshire": 0,
  "fx-mullins": 6,
  "fx-kennedy": 2,
};

const at = (east: number, north: number): LatLng => offsetM(CAMPUS_CENTER, east, north);
const round = (n: number, places = 6) => Math.round(n * 10 ** places) / 10 ** places;
const lngLat = (east: number, north: number): LngLat => {
  const p = at(east, north);
  return [round(p.lng), round(p.lat)];
};

function footprint(b: FixtureBuilding): LngLat[] {
  const w = b.width / 2;
  const d = b.depth / 2;
  const ring: LngLat[] = [
    lngLat(b.east - w, b.north - d),
    lngLat(b.east + w, b.north - d),
    lngLat(b.east + w, b.north + d),
    lngLat(b.east - w, b.north + d),
  ];
  return [...ring, ring[0]];
}

function buildGraph(): WalkGraph {
  // Nodes 0..7: building entrances (same order as BUILDINGS). Nodes 8..14: the spine.
  const nodes: LngLat[] = [...BUILDINGS.map((b) => lngLat(...b.entrance)), ...SPINE.map(([e, n]) => lngLat(e, n))];
  const spineNode = (i: number) => BUILDINGS.length + i;
  const pairs: [number, number][] = [];
  for (let i = 1; i < SPINE.length; i++) pairs.push([spineNode(i - 1), spineNode(i)]);
  BUILDINGS.forEach((b, i) => pairs.push([i, spineNode(SPUR_TO_SPINE[b.id])]));
  // A loop so some routes have two ways round: Du Bois <-> Lederle.
  pairs.push([BUILDINGS.findIndex((b) => b.id === "fx-dubois"), BUILDINGS.findIndex((b) => b.id === "fx-lgrt")]);

  const edges: WalkGraph["edges"] = pairs.map(([a, b]) => {
    const m = haversineM({ lng: nodes[a][0], lat: nodes[a][1] }, { lng: nodes[b][0], lat: nodes[b][1] });
    return [a, b, Math.round(m * 10) / 10];
  });
  return { nodes, edges };
}

export const FIXTURE_GRAPH: WalkGraph = buildGraph();

export const FIXTURE_PLACES: Place[] = BUILDINGS.map((b, i) => ({
  id: b.id,
  name: b.name,
  aliases: b.aliases,
  category: b.category,
  studyFriendly: b.studyFriendly,
  center: { lat: round(at(b.east, b.north).lat), lng: round(at(b.east, b.north).lng) },
  entranceNodes: [i],
  heightM: b.heightM,
}));

export const FIXTURE_BUILDINGS: BuildingCollection = {
  type: "FeatureCollection",
  features: BUILDINGS.map((b) => ({
    type: "Feature" as const,
    properties: { placeId: b.id, name: b.name, heightM: b.heightM },
    geometry: { type: "Polygon" as const, coordinates: [footprint(b)] },
  })),
};

export const FIXTURE_GROUND: GroundCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { kind: "grass", name: "Fixture lawn" },
      geometry: {
        type: "Polygon",
        coordinates: [[lngLat(-280, -320), lngLat(400, -320), lngLat(400, 280), lngLat(-280, 280), lngLat(-280, -320)]],
      },
    },
    ...FIXTURE_GRAPH.edges.map(([a, b]) => ({
      type: "Feature" as const,
      properties: { kind: "path" as const },
      geometry: { type: "LineString" as const, coordinates: [FIXTURE_GRAPH.nodes[a], FIXTURE_GRAPH.nodes[b]] },
    })),
  ],
};
