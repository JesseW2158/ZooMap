/**
 * What each walk-graph edge is, stored in `data/campus/walk-edges.json` alongside
 * `walk-graph.json` (same order as its `edges`). Routing uses it to weigh stairs and roads,
 * offer a step-free route and word turn-by-turn directions.
 */
export const WALK_KIND = {
  /** footway, path, pedestrian, cycleway, track */
  walk: 0,
  steps: 1,
  /** residential, service, unclassified, living_street */
  minorRoad: 2,
  /** tertiary */
  majorRoad: 3,
  /** a marked crossing */
  crossing: 4,
  /** short link from a building door (tagged or estimated) to the network */
  door: 5,
} as const;
export type WalkKind = (typeof WALK_KIND)[keyof typeof WALK_KIND];

/** `data/campus/walk-edges.json` */
export interface WalkEdgeInfo {
  /** Street and path names; index 0 is "" (unnamed). */
  names: string[];
  /** One `[kind, nameIndex]` per walk-graph edge, in the same order. */
  edges: [WalkKind, number][];
}
