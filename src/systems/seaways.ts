/**
 * Seaways — which region adjacencies cross OPEN WATER (docs/game-design.md §Military).
 *
 * The board is one land-adjacency graph, but a scripted map's provinces carry
 * real border polygons and "the sea is the gaps" (data/maps/types.ts). So an
 * adjacency is a **sea crossing** when the midpoint between the two provinces'
 * sites lies in open water — inside no land polygon. Land armies cannot cross a
 * sea crossing; only a FLEET (an army holding a warship, incl. an amphibious
 * troops+ships stack) can sail it. Maps without polygon data (procedural boards,
 * test fixtures) have no sea crossings, so land movement there is unrestricted —
 * exactly as before.
 *
 * Pure and memoised per map — the geometry never changes within a map.
 */

import { pointInPolygon, type Point } from "@/systems/voronoi";
import { scriptedMap } from "@/data/maps/types";
import { pairKey, type GameState } from "@/systems/state";

const cache = new Map<string, Set<string>>();

/** The set of `pairKey`-encoded adjacency pairs that cross open water. Memoised. */
export function seaCrossings(state: GameState): Set<string> {
  const mapId = state.mapId ?? "";
  let set = cache.get(mapId);
  if (!set) {
    set = compute(state);
    cache.set(mapId, set);
  }
  return set;
}

/** Whether the adjacency between regions `a` and `b` crosses open water. */
export function isSeaCrossing(state: GameState, a: number, b: number): boolean {
  return seaCrossings(state).has(pairKey(a, b));
}

function compute(state: GameState): Set<string> {
  const set = new Set<string>();
  const provinces = scriptedMap(state.mapId ?? "")?.regions;
  if (!provinces) return set; // no polygons (procedural / test maps) → treat all borders as land
  const rings: Point[][] = [];
  const verts: Point[][] = provinces.map((p) => {
    const vs: Point[] = [];
    for (const ring of p.polygon ?? []) {
      const r = ring.map(([x, y]) => ({ x, y }));
      rings.push(r);
      for (const v of r) vs.push(v);
    }
    return vs;
  });
  if (rings.length === 0) return set;
  const inLand = (x: number, y: number): boolean => {
    for (const ring of rings) if (pointInPolygon(ring, x, y)) return true;
    return false;
  };
  // Two provinces share a LAND border when their polygons meet — some vertex of
  // one lies (near-)coincident with a vertex of the other (Natural Earth admin
  // units are topological, so neighbours share border points). If they don't
  // touch, and the midpoint between their sites sits in open water, the border
  // is a **sea crossing** (an island link or a strait). Border-sharing keeps
  // coastal land neighbours (Lübeck–Rostock) as land; the water check guards
  // against any diagonal non-touching land pair.
  const EPS = 0.006;
  const shareBorder = (a: number, b: number): boolean => {
    const va = verts[a], vb = verts[b];
    if (!va || !vb) return false;
    for (const p of va) for (const q of vb) {
      if (Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS) return true;
    }
    return false;
  };
  for (const r of state.regions) {
    for (const nb of r.adjacency) {
      if (nb <= r.id) continue; // each undirected pair once
      const o = state.regions[nb];
      if (!o) continue;
      if (!shareBorder(r.id, nb) && !inLand((r.x + o.x) / 2, (r.y + o.y) / 2)) {
        set.add(pairKey(r.id, nb));
      }
    }
  }
  return set;
}
