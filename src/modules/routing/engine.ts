import type { LatLng, RouteProfile, RouteResult, RouteStep } from "@/shared/contracts";

/**
 * Pure routing engine: A* over the campus walk graph with turn-by-turn directions.
 * Ported from the umass-3d-map prototype (router.js). No server imports, so the same code
 * runs in route handlers and in a browser bundle.
 *
 * Edge kinds match `WALK_KIND` in the campus module (duplicated here as plain numbers so this
 * file stays import-free): 0 walk, 1 steps, 2 minor road, 3 major road, 4 crossing, 5 door.
 */

export const WALK_SPEED_M_PER_S = 1.35;
/** Farthest a coordinate start may be from the walk graph. */
export const MAX_SNAP_M = 150;

const K = { walk: 0, steps: 1, minorRoad: 2, majorRoad: 3, crossing: 4, door: 5 } as const;

/** Cost multiplier per edge kind. Distance stays real; cost only steers the choice. */
const PROFILES: Record<RouteProfile, number[]> = {
  fastest: [1, 1.5, 1.04, 1.12, 1, 1],
  stepfree: [1, Infinity, 1.04, 1.12, 1, 1],
};

export interface EngineGraph {
  nodes: [number, number][];
  edges: [number, number, number][];
}
export interface EngineEdgeInfo {
  names: string[];
  edges: [number, number][];
}
export interface Endpoint {
  /** Graph nodes to start from / arrive at (a place's entrances, or one snapped node). */
  nodes: number[];
  /** A coordinate start: drawn as a straight hop to the snapped node. */
  coord?: LatLng;
  /** Used in directions ("Arrive at …"). */
  name?: string;
}
/** A named point used to describe unnamed walkways ("toward Herter Hall"). */
export interface Landmark {
  name: string;
  lat: number;
  lng: number;
}
const LANDMARK_M = 90;

export type RouteOutcome = { ok: true; result: RouteResult } | { ok: false; error: "NO_ROUTE" | "OFF_CAMPUS" };

export interface Router {
  nodeCount: number;
  /** Nearest graph node and its distance in metres, or null if farther than `maxM`. */
  nearestNode(pos: LatLng, maxM?: number): { node: number; distanceM: number } | null;
  route(from: Endpoint, to: Endpoint, profile?: RouteProfile): RouteOutcome;
}

export function createRouter(graph: EngineGraph, info?: EngineEdgeInfo, landmarks: Landmark[] = []): Router {
  const N = graph.nodes.length;
  const E = graph.edges.length;
  const lat0 = N ? graph.nodes.reduce((s, n) => s + n[1], 0) / N : 0;
  const lng0 = N ? graph.nodes.reduce((s, n) => s + n[0], 0) / N : 0;
  const KX = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const KY = 110_540;
  const X = new Float64Array(N);
  const Y = new Float64Array(N);
  graph.nodes.forEach(([lng, lat], i) => {
    X[i] = (lng - lng0) * KX;
    Y[i] = (lat - lat0) * KY;
  });

  // compressed adjacency
  const ea = new Int32Array(E), eb = new Int32Array(E), el = new Float64Array(E), ek = new Uint8Array(E), en = new Int32Array(E);
  const start = new Int32Array(N + 1);
  graph.edges.forEach(([a, b, m], i) => {
    ea[i] = a; eb[i] = b; el[i] = m;
    ek[i] = info?.edges[i]?.[0] ?? K.walk;
    en[i] = info?.edges[i]?.[1] ?? 0;
    start[a + 1]++; start[b + 1]++;
  });
  for (let i = 0; i < N; i++) start[i + 1] += start[i];
  const fill = start.slice(0, N);
  const adjN = new Int32Array(2 * E), adjE = new Int32Array(2 * E);
  for (let i = 0; i < E; i++) {
    adjN[fill[ea[i]]] = eb[i]; adjE[fill[ea[i]]++] = i;
    adjN[fill[eb[i]]] = ea[i]; adjE[fill[eb[i]]++] = i;
  }
  const degree = (n: number) => start[n + 1] - start[n];
  const names = info?.names ?? [""];

  // spatial grid for snapping
  const CELL = 50;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < N; i++) {
    const key = `${Math.floor(X[i] / CELL)},${Math.floor(Y[i] / CELL)}`;
    const cell = grid.get(key);
    if (cell) cell.push(i); else grid.set(key, [i]);
  }
  const toXY = (p: LatLng): [number, number] => [(p.lng - lng0) * KX, (p.lat - lat0) * KY];
  const marks = landmarks.map((m) => ({ name: m.name, xy: toXY(m) }));
  /** The landmark nearest the end of a leg, ahead of the walker, not the start or end place. */
  function landmarkAt(node: number, hOut: number, skip: (string | undefined)[]): string | undefined {
    let best: string | undefined, bestD = LANDMARK_M;
    for (const m of marks) {
      if (skip.includes(m.name)) continue;
      const dx = m.xy[0] - X[node], dy = m.xy[1] - Y[node], d = Math.hypot(dx, dy);
      if (d >= bestD) continue;
      // within 100 degrees of the direction of travel
      const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      if (Math.abs(((bearing - hOut + 540) % 360) - 180) > 100) continue;
      best = m.name; bestD = d;
    }
    return best;
  }

  function nearestNode(pos: LatLng, maxM = MAX_SNAP_M) {
    const [px, py] = toXY(pos);
    const r = Math.ceil(maxM / CELL);
    const gx = Math.floor(px / CELL), gy = Math.floor(py / CELL);
    let best = -1, bestD = Infinity;
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++)
        for (const i of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
          const d = Math.hypot(X[i] - px, Y[i] - py);
          if (d < bestD) { bestD = d; best = i; }
        }
    return best >= 0 && bestD <= maxM ? { node: best, distanceM: bestD } : null;
  }

  // A* state, reused across calls
  const g = new Float64Array(N), prevE = new Int32Array(N), closed = new Uint8Array(N), stamp = new Int32Array(N);
  let run = 0;
  let hf = new Float64Array(1024), hn = new Int32Array(1024), hs = 0;
  const push = (f: number, n: number) => {
    if (hs === hf.length) {
      const f2 = new Float64Array(hs * 2), n2 = new Int32Array(hs * 2);
      f2.set(hf); n2.set(hn); hf = f2; hn = n2;
    }
    let i = hs++;
    while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hn[i] = hn[p]; i = p; }
    hf[i] = f; hn[i] = n;
  };
  const pop = () => {
    const n = hn[0], f = hf[--hs], m = hn[hs];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= hs) break;
      if (c + 1 < hs && hf[c + 1] < hf[c]) c++;
      if (hf[c] >= f) break;
      hf[i] = hf[c]; hn[i] = hn[c]; i = c;
    }
    hf[i] = f; hn[i] = m;
    return n;
  };

  /** Multi-source, multi-target A*. Returns node and edge lists, or null. */
  function search(src: number[], dst: number[], weights: number[]) {
    run++; hs = 0;
    const isDst = new Set(dst);
    const tx = dst.map((d) => X[d]), ty = dst.map((d) => Y[d]);
    // 0.99: edge lengths are rounded to 0.1 m, keep the heuristic admissible
    const h = (n: number) => {
      let m = Infinity;
      for (let i = 0; i < tx.length; i++) m = Math.min(m, Math.hypot(X[n] - tx[i], Y[n] - ty[i]));
      return m * 0.99;
    };
    for (const s of src) { stamp[s] = run; g[s] = 0; prevE[s] = -1; closed[s] = 0; push(h(s), s); }
    let goal = -1;
    while (hs) {
      const u = pop();
      if (stamp[u] === run && closed[u]) continue;
      closed[u] = 1;
      if (isDst.has(u)) { goal = u; break; }
      for (let j = start[u]; j < start[u + 1]; j++) {
        const v = adjN[j], e = adjE[j], w = weights[ek[e]];
        if (w === Infinity) continue;
        const nd = g[u] + el[e] * w;
        if (stamp[v] !== run) { stamp[v] = run; g[v] = Infinity; closed[v] = 0; }
        if (closed[v] || nd >= g[v]) continue;
        g[v] = nd; prevE[v] = e; push(nd + h(v), v);
      }
    }
    if (goal < 0) return null;
    const nodes = [goal], edges: number[] = [];
    for (let u = goal; prevE[u] >= 0; ) {
      const e = prevE[u];
      edges.push(e);
      u = ea[e] === u ? eb[e] : ea[e];
      nodes.push(u);
    }
    return { nodes: nodes.reverse(), edges: edges.reverse() };
  }

  // ---------------------------------------------------------------- directions
  const heading = (a: number, b: number) => ((Math.atan2(X[b] - X[a], Y[b] - Y[a]) * 180) / Math.PI + 360) % 360;
  const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  const compass = (h: number) => COMPASS[Math.round(h / 45) % 8];
  const turnWord = (d: number) => {
    const a = Math.abs(d), side = d > 0 ? "right" : "left";
    if (a < 25) return "Continue";
    if (a < 60) return `Bear ${side}`;
    if (a < 140) return `Turn ${side}`;
    return `Make a sharp ${side}`;
  };
  type Cat = "walk" | "road" | "stairs" | "cross" | "door";
  const catOf = (e: number): Cat =>
    ek[e] === K.steps ? "stairs" : ek[e] === K.crossing ? "cross" : ek[e] === K.door ? "door" : ek[e] === K.minorRoad || ek[e] === K.majorRoad ? "road" : "walk";
  const turnBetween = (hIn: number, hOut: number) => ((hIn - hOut + 540) % 360) - 180;

  interface Group { cat: Cat; name: string; len: number; hIn: number; hOut: number; i0: number; i1: number; flights: number }

  function directions(nodes: number[], edges: number[], offset: number, fromName?: string, toName?: string): RouteStep[] {
    const groups: Group[] = [];
    edges.forEach((e, i) => {
      const cat = catOf(e), name = cat === "walk" || cat === "road" ? names[en[e]] ?? "" : "";
      const a = nodes[i], b = nodes[i + 1], h = heading(a, b);
      const last = groups[groups.length - 1];
      let same = !!last && last.cat === cat && last.name === name;
      if (same && (cat === "walk" || cat === "road")) {
        const junction = degree(a) > 2;
        const limit = cat === "walk" && !name ? 50 : 70;
        if (Math.abs(turnBetween(h, last!.hOut)) > limit && (junction || cat !== "walk")) same = false;
      }
      if (same) { last!.len += el[e]; last!.hOut = h; last!.i1 = i + 1; }
      else groups.push({ cat, name, len: el[e], hIn: h, hOut: h, i0: i, i1: i + 1, flights: cat === "stairs" ? 1 : 0 });
    });
    // fold slivers under 10 m into the previous group, then merge runs that now line up
    const soft = (c: Cat) => c === "walk" || c === "road";
    const folded: Group[] = [];
    for (const gr of groups) {
      const prev = folded[folded.length - 1];
      if (prev && gr.len < 10 && soft(gr.cat) && prev.cat !== "door") { prev.len += gr.len; prev.hOut = gr.hOut; prev.i1 = gr.i1; }
      else folded.push({ ...gr });
    }
    const merged: Group[] = [];
    for (const gr of folded) {
      const prev = merged[merged.length - 1];
      const turn = prev ? Math.abs(turnBetween(gr.hIn, prev.hOut)) : 999;
      if (prev && prev.cat === gr.cat && prev.name === gr.name && (gr.cat === "stairs" || gr.cat === "cross" || turn < 40)) {
        prev.len += gr.len; prev.hOut = gr.hOut; prev.i1 = gr.i1; prev.flights += gr.flights;
      } else merged.push(gr);
    }

    // a short walkway or road leg (< 15 m) is not worth its own instruction: give its
    // length to the next walkway or road leg, which then starts where it started
    for (let k = merged.length - 2; k >= 0; k--) {
      const gr = merged[k], next = merged[k + 1];
      if (soft(gr.cat) && soft(next.cat) && gr.len < 15) {
        next.len += gr.len; next.i0 = gr.i0;
        merged.splice(k, 1);
      }
    }

    const steps: RouteStep[] = [];
    let i = 0;
    let leaveLen = 0;
    if (merged[0]?.cat === "door") { leaveLen = merged[0].len; i = 1; }
    const first = merged[i] ?? merged[0];
    const dir = compass(first ? first.hIn : 0);
    steps.push({
      text: fromName ? `Leave ${fromName} heading ${dir}` : `Head ${dir}`,
      distanceM: Math.round(leaveLen), kind: "start", coordIndex: 0,
    });
    let prevH = merged[i - 1]?.hOut ?? first?.hIn ?? 0;
    for (; i < merged.length; i++) {
      const gr = merged[i];
      if (gr.cat === "door") continue; // the arrival connector is folded into "Arrive"
      const tw = turnWord(turnBetween(gr.hIn, prevH));
      let text: string;
      if (gr.cat === "stairs") text = gr.flights > 1 ? `Take the stairs (${gr.flights} flights)` : "Take the stairs";
      else if (gr.cat === "cross") text = tw === "Continue" ? "Cross at the crosswalk" : `${tw} and cross at the crosswalk`;
      else if (gr.cat === "road") text = `${tw} along ${gr.name || "the road"}`;
      else {
        const mark = gr.name ? undefined : landmarkAt(nodes[gr.i1], gr.hOut, [fromName, toName]);
        const base = gr.name ? `${tw} onto ${gr.name}` : tw === "Continue" ? "Continue on the walkway" : `${tw} onto the walkway`;
        text = mark ? `${base} toward ${mark}` : base;
      }
      steps.push({ text, distanceM: Math.round(gr.len), kind: gr.cat === "walk" ? "walk" : gr.cat, coordIndex: gr.i0 + offset });
      prevH = gr.hOut;
    }
    steps.push({ text: toName ? `Arrive at ${toName}` : "Arrive", distanceM: 0, kind: "end", coordIndex: nodes.length - 1 + offset });
    return steps;
  }

  function route(from: Endpoint, to: Endpoint, profile: RouteProfile = "fastest"): RouteOutcome {
    if (!from.nodes.length || !to.nodes.length) return { ok: false, error: "OFF_CAMPUS" };
    const shared = from.nodes.find((n) => to.nodes.includes(n));
    const found = shared !== undefined ? { nodes: [shared], edges: [] as number[] } : search(from.nodes, to.nodes, PROFILES[profile]);
    if (!found) return { ok: false, error: "NO_ROUTE" };
    const coords: [number, number][] = found.nodes.map((n) => graph.nodes[n]);
    let distanceM = found.edges.reduce((s, e) => s + el[e], 0);
    let offset = 0;
    if (from.coord) {
      const [px, py] = toXY(from.coord);
      const n0 = found.nodes[0];
      distanceM += Math.hypot(X[n0] - px, Y[n0] - py);
      coords.unshift([from.coord.lng, from.coord.lat]);
      offset = 1;
    }
    if (coords.length === 1) coords.push(coords[0]);
    let stairs = 0;
    found.edges.forEach((e, i) => { if (ek[e] === K.steps && (i === 0 || ek[found.edges[i - 1]] !== K.steps)) stairs++; });
    const steps = directions(found.nodes, found.edges, offset, from.name, to.name);
    if (from.coord && offset) steps[0].distanceM += Math.round(Math.hypot(X[found.nodes[0]] - toXY(from.coord)[0], Y[found.nodes[0]] - toXY(from.coord)[1]));
    return {
      ok: true,
      result: {
        line: { type: "LineString", coordinates: coords },
        distanceM: Math.round(distanceM),
        durationS: Math.round(distanceM / WALK_SPEED_M_PER_S),
        steps,
        stairs,
      },
    };
  }

  return { nodeCount: N, nearestNode, route };
}
