import { z } from "zod";
import {
  GeoJsonLineString,
  GeoJsonMultiLineString,
  GeoJsonMultiPolygon,
  GeoJsonPolygon,
  Id,
  LatLng,
  LngLat,
} from "./common";

export const PlaceCategory = z.enum([
  "academic",
  "library",
  "dining",
  "residence",
  "athletic",
  "student_life",
  "other",
]);
export type PlaceCategory = z.infer<typeof PlaceCategory>;

/** Entry in `data/campus/places.json`. */
export const Place = z.object({
  /** Stable, from the OSM id, for example "w123456". Fixture places use "fx-<slug>". */
  id: Id,
  name: z.string().min(1),
  /** "ILC", "LGRT", "DuBois": what students and course listings call it. */
  aliases: z.array(z.string()),
  category: PlaceCategory,
  studyFriendly: z.boolean(),
  center: LatLng,
  /** Indexes into `WalkGraph.nodes`. */
  entranceNodes: z.array(z.number().int().nonnegative()),
  heightM: z.number().positive(),
});
export type Place = z.infer<typeof Place>;

/** `data/campus/walk-graph.json`: undirected; edge = [fromIndex, toIndex, meters]. */
export const WalkGraph = z.object({
  nodes: z.array(LngLat),
  edges: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().nonnegative()])),
});
export type WalkGraph = z.infer<typeof WalkGraph>;

/** `buildings.geojson` feature properties. */
export const BuildingProps = z.object({
  placeId: Id.optional(),
  name: z.string().optional(),
  heightM: z.number().positive(),
});
export type BuildingProps = z.infer<typeof BuildingProps>;

export const BuildingFeature = z.object({
  type: z.literal("Feature"),
  properties: BuildingProps,
  geometry: z.union([GeoJsonPolygon, GeoJsonMultiPolygon]),
});
export const BuildingCollection = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(BuildingFeature),
});
export type BuildingCollection = z.infer<typeof BuildingCollection>;

export const GroundKind = z.enum(["path", "road", "grass", "water", "parking"]);
export type GroundKind = z.infer<typeof GroundKind>;

/** `ground.geojson`: display-only features. */
export const GroundFeature = z.object({
  type: z.literal("Feature"),
  properties: z.object({ kind: GroundKind, name: z.string().optional() }),
  geometry: z.union([GeoJsonPolygon, GeoJsonMultiPolygon, GeoJsonLineString, GeoJsonMultiLineString]),
});
export const GroundCollection = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(GroundFeature),
});
export type GroundCollection = z.infer<typeof GroundCollection>;

/** What `nearestPlace` returns. The distance is to the footprint where known, else the centre. */
export const NearestPlace = z.object({ place: Place, distanceM: z.number().nonnegative() });
export type NearestPlace = z.infer<typeof NearestPlace>;
