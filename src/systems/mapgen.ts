/**
 * Procedural region-graph generation (seeded).
 *
 * The world is a graph of regions (docs/game-design.md §4), not a tile grid.
 * We scatter region sites, relax them so they spread out, connect near
 * neighbours into an adjacency graph (guaranteeing the graph is connected),
 * and assign terrain. Everything derives from the seed, so the same seed always
 * produces the same map — reproducible for testing and shareable.
 *
 * Milestone 1 uses the node+edge layout the design doc sanctions as the
 * shippable fallback; the pure adjacency graph is identical to what a later
 * Voronoi renderer would draw, so upgrading the visuals changes no logic.
 */

import { createRng, type Rng } from "@/systems/rng";
import { TERRAIN, terrainFromRoll } from "@/data/terrain";
import { computeVoronoiCells } from "@/systems/voronoi";
import { ISLAND_BOUNDS } from "@/systems/island";
import { scriptedMap } from "@/data/maps/types";
import type { Region } from "@/systems/state";

/** Chance a region whose terrain supports a strategic resource actually has one. */
const RESOURCE_CHANCE = 0.35;

export interface MapGenOptions {
  regionCount: number;
  /** Relaxation passes: more = more evenly spread sites. */
  relaxIterations: number;
  /** Each region links to at most this many nearest neighbours. */
  maxNeighbours: number;
}

export const DEFAULT_MAP_OPTIONS: MapGenOptions = {
  regionCount: 30,
  relaxIterations: 6,
  maxNeighbours: 4,
};

// Real toponyms of the medieval Baltic rim — Livonian, Prussian, Lithuanian,
// Rus, Polish and Norse towns and strongholds (period-anglicised spellings) —
// so the world reads as a real place. Enough for the largest map size; the
// generator shuffles and takes the first N per game.
const REGION_NAMES = [
  "Riga", "Reval", "Dorpat", "Narva", "Pernau", "Wenden", "Fellin", "Memel",
  "Konigsberg", "Danzig", "Elbing", "Thorn", "Kulm", "Vilna", "Kovno", "Troki",
  "Grodno", "Novgorod", "Pskov", "Polotsk", "Ladoga", "Izborsk", "Smolensk",
  "Minsk", "Visby", "Kalmar", "Lubeck", "Wolin", "Stettin", "Gnesen", "Plock",
  "Krakau", "Abo", "Viborg", "Kexholm", "Sigtuna", "Roskilde", "Hedeby",
  "Truso", "Gdov", "Kokenhusen", "Mitau", "Bauska", "Goldingen", "Windau",
  "Libau", "Rakvere", "Weissenstein",
];

interface Site {
  x: number;
  y: number;
}

/** Squared euclidean distance (avoids a sqrt when only comparing). */
function dist2(a: Site, b: Site): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Scatter sites and nudge each away from its nearest neighbour a few times. */
function scatterSites(rng: Rng, count: number, iterations: number): Site[] {
  const sites: Site[] = [];
  for (let i = 0; i < count; i++) {
    sites.push({ x: rng.range(0.05, 0.95), y: rng.range(0.05, 0.95) });
  }

  for (let pass = 0; pass < iterations; pass++) {
    for (let i = 0; i < sites.length; i++) {
      let nearest = -1;
      let nearestD = Infinity;
      for (let j = 0; j < sites.length; j++) {
        if (i === j) continue;
        const d = dist2(sites[i]!, sites[j]!);
        if (d < nearestD) {
          nearestD = d;
          nearest = j;
        }
      }
      if (nearest < 0) continue;
      // Push i a little away from its nearest neighbour.
      const a = sites[i]!;
      const b = sites[nearest]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const len = Math.hypot(dx, dy) || 1;
      const push = 0.02;
      a.x = clamp01(a.x + (dx / len) * push);
      a.y = clamp01(a.y + (dy / len) * push);
    }
  }

  return sites;
}

function clamp01(v: number): number {
  return v < 0.03 ? 0.03 : v > 0.97 ? 0.97 : v;
}

/** Build a symmetric adjacency graph from nearest-neighbour links. */
function buildAdjacency(sites: Site[], maxNeighbours: number): number[][] {
  const adjacency: number[][] = sites.map(() => []);

  const link = (i: number, j: number): void => {
    if (i === j) return;
    if (!adjacency[i]!.includes(j)) adjacency[i]!.push(j);
    if (!adjacency[j]!.includes(i)) adjacency[j]!.push(i);
  };

  // Connect each site to its k nearest neighbours.
  for (let i = 0; i < sites.length; i++) {
    const order = sites
      .map((_, j) => ({ j, d: dist2(sites[i]!, sites[j]!) }))
      .filter((e) => e.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, maxNeighbours);
    for (const { j } of order) link(i, j);
  }

  ensureConnected(sites, adjacency, link);
  return adjacency;
}

/**
 * Guarantee a single connected component by walking every disconnected
 * component and linking its closest pair to the already-connected set.
 */
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
    // Find the nearest pair between the connected set and the rest.
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
    // Absorb the newly-reachable component.
    const stack2 = [best.j];
    while (stack2.length) {
      const n = stack2.pop()!;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const m of adjacency[n]!) if (!seen.has(m)) stack2.push(m);
    }
  }
}

export interface GeneratedMap {
  regions: Region[];
}

/** Longest Voronoi-neighbour link (normalised) kept as adjacency on a scripted
    map — caps cross-water hops to short straits, not sea-spanning teleports. */
const SCRIPTED_ADJ_MAX = 0.24;

/**
 * Adjacency for a fixed set of sites, read from their Voronoi neighbours (so it
 * matches the borders the renderer draws), dropping links longer than `maxDist`,
 * then repaired to a connected graph.
 */
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

/** Build the region graph for a scripted (real-geography) map. Populations are
    still seeded for per-game variety; positions/names/terrain are authored. */
function generateScriptedMap(mapId: string, seed: number): GeneratedMap {
  const map = scriptedMap(mapId)!;
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

/**
 * Generate the region graph for a seed. Pure: same seed → identical map.
 * A `mapId` selects a scripted real-geography map instead of procedural scatter.
 */
export function generateMap(
  seed: number,
  options: MapGenOptions = DEFAULT_MAP_OPTIONS,
  mapId?: string,
): GeneratedMap {
  if (mapId && scriptedMap(mapId)) return generateScriptedMap(mapId, seed);
  const rng = createRng(seed);
  const count = Math.min(options.regionCount, REGION_NAMES.length);

  const sites = scatterSites(rng, count, options.relaxIterations);
  const adjacency = buildAdjacency(sites, options.maxNeighbours);

  const names = shuffledNames(rng, count);

  const regions: Region[] = sites.map((site, i) => {
    const terrain = terrainFromRoll(rng.next());
    const strat = TERRAIN[terrain].strategic;
    const resource = strat && rng.next() < RESOURCE_CHANCE ? strat : null;
    return {
      id: i,
      name: names[i]!,
      terrain,
      // Ownership is assigned by createGame (player start + barbarian regions).
      ownerId: null,
      population: rng.int(3, 7),
      unrest: 0,
      fortification: 0,
      resource,
      buildings: [],
      construction: null,
      adjacency: adjacency[i]!.slice().sort((a, b) => a - b),
      x: site.x,
      y: site.y,
    };
  });

  return { regions };
}

function shuffledNames(rng: Rng, count: number): string[] {
  const pool = REGION_NAMES.slice();
  // Fisher–Yates with the seeded rng.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}
