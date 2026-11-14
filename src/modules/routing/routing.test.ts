import { describe, expect, it } from "vitest";
import { RouteResult } from "@/shared/contracts";
import { haversineM } from "@/shared/geo";
import { getWalkEdgeInfo, getWalkGraph, searchPlaces } from "@/modules/campus";
import { createRouter, type EngineEdgeInfo, type EngineGraph } from "./engine";
import { findRoute } from "./index";

// A small grid, roughly 100 m per step:
//   0 --- 1 --- 2
//   |           |
//   3 --(steps)-4      5 (isolated)
const deg = 100 / 111_000;
const small: EngineGraph = {
  nodes: [
    [0, 0], [deg, 0], [2 * deg, 0],
    [0, -deg], [2 * deg, -deg],
    [5 * deg, 5 * deg],
  ],
  edges: [
    [0, 1, 100], [1, 2, 100], [0, 3, 100], [2, 4, 100], [3, 4, 150],
  ],
};
const smallInfo: EngineEdgeInfo = { names: ["", "Main Walk"], edges: [[0, 1], [0, 1], [0, 0], [0, 0], [1, 0]] };

describe("routing engine on a hand-built graph", () => {
  const router = createRouter(small, smallInfo);

  it("finds the known shortest path", () => {
    const out = router.route({ nodes: [3] }, { nodes: [2] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // 3 -> 0 -> 1 -> 2 is 300 m; 3 -> 4 -> 2 is 250 m but its stairs cost 1.5x (225 + 100 = 325)
    expect(out.result.distanceM).toBe(300);
    expect(out.result.line.coordinates).toEqual([small.nodes[3], small.nodes[0], small.nodes[1], small.nodes[2]]);
    expect(out.result.stairs).toBe(0);
  });

  it("takes the stairs when they are much shorter, and step-free refuses them", () => {
    const fast = router.route({ nodes: [3] }, { nodes: [4] });
    expect(fast.ok && fast.result.stairs).toBe(1);
    const stepfree = router.route({ nodes: [3] }, { nodes: [4] }, "stepfree");
    expect(stepfree.ok && stepfree.result.distanceM).toBe(400);
    expect(stepfree.ok && stepfree.result.stairs).toBe(0);
  });

  it("returns NO_ROUTE between disconnected nodes", () => {
    expect(router.route({ nodes: [0] }, { nodes: [5] })).toEqual({ ok: false, error: "NO_ROUTE" });
  });

  it("picks the best of several entrances", () => {
    const out = router.route({ nodes: [3, 1] }, { nodes: [2] });
    expect(out.ok && out.result.distanceM).toBe(100);
  });

  it("snaps a coordinate start and includes the straight hop", () => {
    const snap = router.nearestNode({ lat: -0.0001, lng: 0 });
    expect(snap?.node).toBe(0);
    expect(router.nearestNode({ lat: 1, lng: 1 })).toBeNull();
    const out = router.route({ nodes: [0], coord: { lat: -0.0001, lng: 0 } }, { nodes: [1] });
    expect(out.ok && out.result.line.coordinates[0]).toEqual([0, -0.0001]);
    expect(out.ok && out.result.distanceM).toBeGreaterThan(100);
  });

  it("writes directions from start to arrival, naming the path", () => {
    const out = router.route({ nodes: [0], name: "Here" }, { nodes: [2], name: "There" });
    if (!out.ok) throw new Error("no route");
    const texts = out.result.steps!.map((s) => s.text);
    expect(texts[0]).toBe("Leave Here heading east");
    expect(texts.at(-1)).toBe("Arrive at There");
  });
});

const PAIRS: [string, string][] = [
  ["Du Bois", "ILC"],
  ["LGRT", "Campus Center"],
  ["Frank", "ISB"],
  ["JQA", "Thompson"],
  ["Berk", "Isenberg"],
  ["Mullins", "Student Union"],
  ["CS Building", "Morrill 2"],
  ["Hasbrouck", "Herter"],
  ["Rec Center", "Bartlett"],
  ["Worcester DC", "Fernald"],
];

describe("findRoute on the real campus", () => {
  const first = async (q: string) => {
    const [p] = await searchPlaces(q);
    if (!p) throw new Error(`no place for ${q}`);
    return p;
  };

  it.each(PAIRS)("routes %s -> %s under 1.6x the straight line", async (a, b) => {
    const [from, to] = [await first(a), await first(b)];
    const result = RouteResult.parse(await findRoute({ from: { placeId: from.id }, to: { placeId: to.id } }));
    const coords = result.line.coordinates;
    const [s, e] = [coords[0], coords[coords.length - 1]];
    const straight = haversineM({ lat: s[1], lng: s[0] }, { lat: e[1], lng: e[0] });
    expect(result.distanceM).toBeGreaterThan(0);
    expect(result.distanceM / straight).toBeLessThan(1.6);
    expect(result.steps!.at(-1)!.text).toBe(`Arrive at ${to.name}`);
  });

  it("routes from a coordinate on campus and refuses one far away", async () => {
    const dubois = await first("Du Bois");
    const ilc = await first("ILC");
    const near = { lat: dubois.center.lat + 0.0008, lng: dubois.center.lng };
    const result = await findRoute({ from: near, to: { placeId: ilc.id } });
    expect(result.line.coordinates[0]).toEqual([near.lng, near.lat]);
    await expect(findRoute({ from: { lat: 42.3, lng: -72.6 }, to: { placeId: ilc.id } })).rejects.toMatchObject({ code: "OFF_CAMPUS" });
    await expect(findRoute({ from: near, to: { placeId: "nope" } })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("computes a route in under 50 ms after warm-up", async () => {
    const router = createRouter(await getWalkGraph(), await getWalkEdgeInfo());
    // one of the longest walks on campus: Southwest to North Apartments
    const from = await first("JQA");
    const to = await first("North Apartments");
    router.route({ nodes: from.entranceNodes }, { nodes: to.entranceNodes });
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) router.route({ nodes: from.entranceNodes }, { nodes: to.entranceNodes });
    const ms = (performance.now() - t0) / 5;
    console.log(`route JQA -> North Apartments: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(50);
  });
});
