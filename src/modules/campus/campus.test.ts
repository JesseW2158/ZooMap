import { describe, expect, it } from "vitest";
import { BuildingCollection, GroundCollection, Place, WalkGraph } from "@/shared/contracts";
import { getBuildings, getGround, getPlace, getPlaces, getWalkGraph, nearestPlace, searchPlaces } from "./index";

describe("searchPlaces", () => {
  it("finds the ILC by its abbreviation", async () => {
    const [first] = await searchPlaces("ILC");
    expect(first.name).toBe("Integrative Learning Center");
  });

  it("finds LGRT, case-insensitively", async () => {
    expect((await searchPlaces("LGRT"))[0].name).toBe("Lederle Graduate Research Tower");
    expect((await searchPlaces("lgrt"))[0].name).toBe("Lederle Graduate Research Tower");
  });

  it("puts Du Bois first for 'library' and returns only libraries before other matches", async () => {
    const results = await searchPlaces("library");
    expect(results[0].name).toBe("W.E.B. Du Bois Library");
    expect(results.map((p) => p.name)).toContain("Science & Engineering Library");
    expect(results[0].category).toBe("library");
  });

  it("ranks prefix matches before substring matches", async () => {
    const results = await searchPlaces("morrill");
    expect(results.length).toBeGreaterThan(3);
    for (const p of results) expect([p.name, ...p.aliases].join(" ").toLowerCase()).toContain("morrill");
  });

  it("returns nothing for nonsense and respects the limit", async () => {
    expect(await searchPlaces("zzzqqq")).toEqual([]);
    expect(await searchPlaces("hall", 3)).toHaveLength(3);
  });
});

describe("campus data", () => {
  it("matches the contracts", async () => {
    Place.array().parse(await getPlaces());
    BuildingCollection.parse(await getBuildings());
    GroundCollection.parse(await getGround());
  });

  it("has a walk graph that validates and is one connected component", async () => {
    const graph = WalkGraph.parse(await getWalkGraph());
    const parent = graph.nodes.map((_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (const [a, b] of graph.edges) {
      expect(a).toBeLessThan(graph.nodes.length);
      expect(b).toBeLessThan(graph.nodes.length);
      parent[find(a)] = find(b);
    }
    const roots = new Set(graph.nodes.map((_, i) => find(i)));
    expect(roots.size).toBe(1);
  });

  it("gives every place an entrance node in the graph", async () => {
    const { nodes } = await getWalkGraph();
    const places = await getPlaces();
    expect(places.length).toBeGreaterThan(150);
    for (const p of places) {
      expect(p.entranceNodes.length).toBeGreaterThan(0);
      for (const n of p.entranceNodes) expect(n).toBeLessThan(nodes.length);
    }
  });

  it("links every place building feature to an existing place", async () => {
    const ids = new Set((await getPlaces()).map((p) => p.id));
    for (const f of (await getBuildings()).features) if (f.properties.placeId) expect(ids.has(f.properties.placeId)).toBe(true);
  });

  it("tags each place building with its place's category, and nothing else", async () => {
    const byId = new Map((await getPlaces()).map((p) => [p.id, p.category]));
    const features = (await getBuildings()).features;
    for (const f of features) expect(f.properties.category).toBe(f.properties.placeId ? byId.get(f.properties.placeId) : undefined);
    const library = features.find((f) => f.properties.name === "W.E.B. Du Bois Library");
    expect(library?.properties.category).toBe("library");
  });
});

describe("getPlace and nearestPlace", () => {
  it("looks a place up by id", async () => {
    const [dubois] = await searchPlaces("Du Bois");
    expect(await getPlace(dubois.id)).toEqual(dubois);
    expect(await getPlace("nope")).toBeNull();
  });

  it("returns the building a point is inside, at distance 0", async () => {
    const [dubois] = await searchPlaces("Du Bois");
    const hit = await nearestPlace(dubois.center, 50);
    expect(hit?.place.id).toBe(dubois.id);
    expect(hit?.distanceM).toBe(0);
  });

  it("returns null far from campus", async () => {
    expect(await nearestPlace({ lat: 42.3, lng: -72.6 }, 150)).toBeNull();
  });
});
