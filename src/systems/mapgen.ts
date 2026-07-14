/**
 * Seeded procedural map generation.
 *
 * Sites are sampled and relaxed, adjacency comes from a Delaunay triangulation,
 * terrain is assigned with a light clustering pass, and nations are seeded far
 * apart for fair-ish starts. Everything derives from the seed, so a map is fully
 * reproducible for testing and shareable.
 */

import type { Rng } from "@/systems/rng";
import type { Region, Terrain } from "@/systems/types";
import {
  edgesFromTriangles,
  relax,
  samplePoints,
  triangulate,
  type Point,
} from "@/systems/geometry";

const TERRAINS: Terrain[] = ["plains", "forest", "hills", "mountains", "coast"];

const REGION_NAMES = [
  "Aland", "Belmar", "Corveth", "Dunmoor", "Eskil", "Fenwick", "Galwyn",
  "Harlow", "Ironvale", "Jorund", "Kestrel", "Lorne", "Marrow", "Norvik",
  "Ostmark", "Pellen", "Quorra", "Rensfeld", "Silvat", "Thornby", "Ulmark",
  "Vardan", "Westreach", "Ynnis", "Zorril", "Ashford", "Brimhold", "Cindral",
];

export interface MapConfig {
  regionCount: number;
}

/** Build the region graph (owners left neutral; nations placed separately). */
export function generateMap(rng: Rng, config: MapConfig): Region[] {
  const count = config.regionCount;
  const sites: Point[] = relax(samplePoints(rng, count, 0.13 / Math.sqrt(count / 20)), 2);
  const tris = triangulate(sites);
  const edges = edgesFromTriangles(tris);

  const adj: number[][] = sites.map(() => []);
  for (const [u, v] of edges) {
    if (!adj[u].includes(v)) adj[u].push(v);
    if (!adj[v].includes(u)) adj[v].push(u);
  }
  ensureConnected(sites, adj);

  const names = rng.shuffle(REGION_NAMES.slice());
  const regions: Region[] = sites.map((s, i) => ({
    id: i,
    name: names[i % names.length] ?? `Region ${i}`,
    x: s.x,
    y: s.y,
    terrain: pickTerrain(rng, s),
    owner: -1,
    population: rng.int(3, 6),
    fort: 0,
    adj: adj[i].slice().sort((a, b) => a - b),
  }));

  return regions;
}

/** Assign each nation a well-separated home region and a starting fort. */
export function placeNations(
  rng: Rng,
  regions: Region[],
  nationIds: number[],
): void {
  const chosen: number[] = [];
  const candidates = rng.shuffle(regions.map((r) => r.id));
  for (const nationId of nationIds) {
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const id of candidates) {
      if (chosen.includes(id)) continue;
      const minDist = chosen.length
        ? Math.min(...chosen.map((c) => hop(regions, c, id)))
        : Infinity;
      const score = minDist === Infinity ? 999 : minDist + rng.range(0, 0.5);
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
    chosen.push(best);
    const home = regions[best];
    home.owner = nationId;
    home.population = 8;
    home.fort = 2;
  }
}

/** Breadth-first hop distance between two regions (Infinity if unreachable). */
function hop(regions: Region[], from: number, to: number): number {
  if (from === to) return 0;
  const seen = new Set<number>([from]);
  let frontier = [from];
  let d = 0;
  while (frontier.length) {
    d++;
    const next: number[] = [];
    for (const r of frontier) {
      for (const n of regions[r].adj) {
        if (n === to) return d;
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return Infinity;
}

function pickTerrain(rng: Rng, site: Point): Terrain {
  // Coasts hug the hull; mountains cluster toward the interior edges.
  const edgeDist = Math.min(site.x, 1 - site.x, site.y, 1 - site.y);
  if (edgeDist < 0.12 && rng.next() < 0.7) return "coast";
  const roll = rng.next();
  if (roll < 0.34) return "plains";
  if (roll < 0.56) return "forest";
  if (roll < 0.74) return "hills";
  if (roll < 0.9) return "mountains";
  return TERRAINS[rng.int(0, TERRAINS.length - 1)];
}

/** Guarantee the graph is a single connected component by linking components. */
function ensureConnected(sites: Point[], adj: number[][]): void {
  const comp = new Array(sites.length).fill(-1);
  let components = 0;
  for (let i = 0; i < sites.length; i++) {
    if (comp[i] !== -1) continue;
    const stack = [i];
    comp[i] = components;
    while (stack.length) {
      const cur = stack.pop()!;
      for (const n of adj[cur]) {
        if (comp[n] === -1) {
          comp[n] = components;
          stack.push(n);
        }
      }
    }
    components++;
  }
  if (components <= 1) return;
  // Link each extra component to component 0 via the nearest cross pair.
  for (let c = 1; c < components; c++) {
    let bestA = -1;
    let bestB = -1;
    let bestD = Infinity;
    for (let a = 0; a < sites.length; a++) {
      if (comp[a] !== 0) continue;
      for (let b = 0; b < sites.length; b++) {
        if (comp[b] !== c) continue;
        const dx = sites[a].x - sites[b].x;
        const dy = sites[a].y - sites[b].y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          bestA = a;
          bestB = b;
        }
      }
    }
    if (bestA >= 0) {
      adj[bestA].push(bestB);
      adj[bestB].push(bestA);
      for (let k = 0; k < sites.length; k++) if (comp[k] === c) comp[k] = 0;
    }
  }
}
