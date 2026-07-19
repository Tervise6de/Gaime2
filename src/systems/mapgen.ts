/**
 * Authored Hanseatic World graph generation.
 *
 * The old random-world mode is retired. The map is the Hansa
 * board: fixed real provinces, authored names/terrain/geometry, and deterministic
 * per-game population seeding.
 */

import { createRng } from "@/systems/rng";
import { computeVoronoiCells } from "@/systems/voronoi";
import { ISLAND_BOUNDS } from "@/systems/island";
import { scriptedMap } from "@/data/maps/types";
import type { Region } from "@/systems/state";

interface Site {
  x: number;
  y: number;
}

export interface GeneratedMap {
  regions: Region[];
}

/** Deprecated compatibility shape; Hansa-only generation ignores these values. */
export interface MapGenOptions {
  regionCount: number;
  relaxIterations: number;
  maxNeighbours: number;
}

/** Deprecated compatibility export for older tests/tooling; not used to shape the Hansa map. */
export const DEFAULT_MAP_OPTIONS: MapGenOptions = {
  regionCount: 74,
  relaxIterations: 0,
  maxNeighbours: 0,
};

const HANSA_MAP_ID = "hansa";
/** Longest Voronoi-neighbour link kept as adjacency: short straits, not sea teleports. */
const SCRIPTED_ADJ_MAX = 0.24;

function dist2(a: Site, b: Site): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function ensureConnected(
  sites: Site[],
  adjacency: number[][],
  link: (i: number, j: number) => void,
): void {
  const seen = new Set<number>();
  const stack = [0];
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const m of adjacency[n]!) if (!seen.has(m)) stack.push(m);
  }

  while (seen.size < sites.length) {
    let best: { i: number; j: number; d: number } | null = null;
    for (let i = 0; i < sites.length; i++) {
      if (!seen.has(i)) continue;
      for (let j = 0; j < sites.length; j++) {
        if (seen.has(j)) continue;
        const d = dist2(sites[i]!, sites[j]!);
        if (!best || d < best.d) best = { i, j, d };
      }
    }
    if (!best) break;
    link(best.i, best.j);
    const stack2 = [best.j];
    while (stack2.length) {
      const n = stack2.pop()!;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const m of adjacency[n]!) if (!seen.has(m)) stack2.push(m);
    }
  }
}

function voronoiAdjacency(sites: Site[], maxDist: number): number[][] {
  const cells = computeVoronoiCells(sites, ISLAND_BOUNDS);
  const adj: Set<number>[] = sites.map(() => new Set<number>());
  cells.forEach((cell, i) => {
    for (const nb of cell.neighbor) {
      if (nb < 0 || nb === i) continue;
      if (Math.sqrt(dist2(sites[i]!, sites[nb]!)) > maxDist) continue;
      adj[i]!.add(nb);
      adj[nb]!.add(i);
    }
  });
  const arr = adj.map((s) => [...s]);
  ensureConnected(sites, arr, (i, j) => {
    if (!arr[i]!.includes(j)) arr[i]!.push(j);
    if (!arr[j]!.includes(i)) arr[j]!.push(i);
  });
  return arr;
}

export function generateMap(seed: number, optionsOrMapId?: MapGenOptions | string, maybeMapId?: string): GeneratedMap {
  const requested = typeof optionsOrMapId === "string" ? optionsOrMapId : maybeMapId;
  const map = scriptedMap(requested ?? HANSA_MAP_ID) ?? scriptedMap(HANSA_MAP_ID);
  if (!map) throw new Error("Hansa map data is missing");
  const rng = createRng(seed);
  const sites: Site[] = map.regions.map((r) => ({ x: r.x, y: r.y }));
  const adjacency = voronoiAdjacency(sites, SCRIPTED_ADJ_MAX);
  const regions: Region[] = map.regions.map((r, i) => ({
    id: i,
    name: r.name,
    terrain: r.terrain,
    ownerId: null,
    population: rng.int(3, 7),
    unrest: 0,
    fortification: 0,
    resource: r.resource ?? null,
    buildings: [],
    construction: null,
    adjacency: adjacency[i]!.slice().sort((a, b) => a - b),
    x: r.x,
    y: r.y,
  }));
  return { regions };
}
