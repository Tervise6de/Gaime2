/**
 * Procedural map generation.
 *
 * Produces the region-graph world from a single seed (design doc §4). The
 * *logic* layer is a pure graph — `regions[]` with symmetric `adjacency[]`;
 * rendering (nodes+edges now, Voronoi later) reads the same data without
 * changing any rule.
 *
 * Pipeline: place spread-out sites → connect them into a planar-ish adjacency
 * graph (Gabriel graph, repaired to guaranteed connectivity) → assign terrain
 * and coasts → seat the player's starting nation. Everything derives from the
 * seeded RNG, so a given seed always yields an identical map.
 */

import { createRng, type Rng } from "@/core/rng";
import type { GameState, Nation, Point, Region, TerrainType } from "@/core/types";
import { TERRAIN_LIST } from "@/data/terrain";

/** Tuning knobs for generation (kept local; not player-facing). */
const REGION_COUNT = 22;
/** Keep sites off the very edge so the frontier band is meaningful. */
const SITE_MARGIN = 0.06;
/** A region is coastal (frontier) if it sits in this outer band. */
const FRONTIER_BAND = 0.16;
/** Starting treasury for the player nation. */
const STARTING_GOLD = 50;
/** Default tax rate a new game begins at. */
const DEFAULT_TAX_RATE = 0.1;

const PLAYER_COLOR = "#4f9cf0";

const NAME_PREFIX = [
  "Ald", "Bren", "Cor", "Dun", "El", "Far", "Gald", "Hal", "Iron", "Jor",
  "Kel", "Lorn", "Mor", "Nor", "Oster", "Pell", "Quor", "Rav", "Stone", "Thal",
  "Umber", "Vald", "West", "Yor", "Zar",
];
const NAME_SUFFIX = [
  "mark", "wood", "fell", "reach", "vale", "moor", "gard", "holm", "ford",
  "crest", "haven", "watch", "dale", "spire", "hollow", "bourne",
];

function dist2(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Scatter `count` sites across the unit square, spread apart via rejection
 * sampling (a cheap Poisson-disc approximation). The minimum spacing relaxes if
 * placement stalls, so we always return exactly `count` deterministic sites.
 */
function generateSites(rng: Rng, count: number): Point[] {
  const lo = SITE_MARGIN;
  const hi = 1 - SITE_MARGIN;
  const sites: Point[] = [];
  let minDist = 0.16;
  let guard = 0;

  while (sites.length < count) {
    // Hard backstop: if spacing keeps failing, drop remaining points anywhere.
    if (guard++ > 20000) {
      while (sites.length < count) {
        sites.push({ x: rng.range(lo, hi), y: rng.range(lo, hi) });
      }
      break;
    }
    const p: Point = { x: rng.range(lo, hi), y: rng.range(lo, hi) };
    const min2 = minDist * minDist;
    if (sites.every((s) => dist2(s, p) >= min2)) {
      sites.push(p);
    } else if (guard % 400 === 0) {
      // Periodically relax the spacing constraint so we can't deadlock.
      minDist *= 0.9;
    }
  }
  return sites;
}

/**
 * Gabriel-graph test: edge (i, j) exists iff no other site lies inside the
 * circle whose diameter is the segment i–j. A site `k` is inside that circle
 * exactly when angle i·k·j is obtuse, i.e. dot(i−k, j−k) < 0.
 */
function isGabrielEdge(sites: Point[], i: number, j: number): boolean {
  const a = sites[i]!;
  const b = sites[j]!;
  for (let k = 0; k < sites.length; k++) {
    if (k === i || k === j) continue;
    const c = sites[k]!;
    const dot = (a.x - c.x) * (b.x - c.x) + (a.y - c.y) * (b.y - c.y);
    if (dot < 0) return false;
  }
  return true;
}

/** Minimal union-find for connectivity repair. */
class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root]!;
    while (this.parent[x] !== root) {
      const next = this.parent[x]!;
      this.parent[x] = root;
      x = next;
    }
    return root;
  }
  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    this.parent[ra] = rb;
    return true;
  }
}

/**
 * Build symmetric adjacency from the Gabriel graph, then repair any
 * disconnection by linking the nearest cross-component site pair until the
 * whole map is one connected component.
 */
function computeAdjacency(sites: Point[]): number[][] {
  const n = sites.length;
  const sets: Set<number>[] = Array.from({ length: n }, () => new Set());
  const uf = new UnionFind(n);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (isGabrielEdge(sites, i, j)) {
        sets[i]!.add(j);
        sets[j]!.add(i);
        uf.union(i, j);
      }
    }
  }

  // Repair connectivity: while >1 component, add the shortest edge that joins
  // two different components.
  for (;;) {
    let best: { i: number; j: number; d: number } | null = null;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (uf.find(i) === uf.find(j)) continue;
        const d = dist2(sites[i]!, sites[j]!);
        if (!best || d < best.d) best = { i, j, d };
      }
    }
    if (!best) break; // already fully connected
    sets[best.i]!.add(best.j);
    sets[best.j]!.add(best.i);
    uf.union(best.i, best.j);
  }

  return sets.map((s) => Array.from(s).sort((a, b) => a - b));
}

/** Weighted-random terrain pick from the data table. */
function pickTerrain(rng: Rng): TerrainType {
  const total = TERRAIN_LIST.reduce((sum, t) => sum + t.weight, 0);
  let roll = rng.next() * total;
  for (const t of TERRAIN_LIST) {
    roll -= t.weight;
    if (roll < 0) return t.id;
  }
  return TERRAIN_LIST[TERRAIN_LIST.length - 1]!.id;
}

/** A site is coastal if it sits in the outer frontier band of the map. */
function isCoastal(p: Point): boolean {
  return (
    p.x < FRONTIER_BAND ||
    p.x > 1 - FRONTIER_BAND ||
    p.y < FRONTIER_BAND ||
    p.y > 1 - FRONTIER_BAND
  );
}

/** Generate a region name; avoids duplicates within the supplied set. */
function makeName(rng: Rng, used: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = rng.pick(NAME_PREFIX) + rng.pick(NAME_SUFFIX);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  // Fall back to a numbered name if we somehow exhaust combinations.
  let n = 1;
  let name = `Region ${n}`;
  while (used.has(name)) name = `Region ${++n}`;
  used.add(name);
  return name;
}

/** Index of the site closest to the map centre (the player's capital). */
function centralSite(sites: Point[]): number {
  const centre: Point = { x: 0.5, y: 0.5 };
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < sites.length; i++) {
    const d = dist2(sites[i]!, centre);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Generate a complete initial {@link GameState} from a friendly seed. The
 * player nation is seated on a central capital plus its immediate neighbours.
 */
export function generateGame(seed: number): GameState {
  const rng = createRng(seed);

  const sites = generateSites(rng, REGION_COUNT);
  const adjacency = computeAdjacency(sites);

  const usedNames = new Set<string>();
  const regions: Region[] = sites.map((site, id) => {
    const terrain = pickTerrain(rng);
    const terrainDef = TERRAIN_LIST.find((t) => t.id === terrain)!;
    const population = Math.max(
      1,
      Math.round(terrainDef.popCapacity * rng.range(0.35, 0.7)),
    );
    return {
      id,
      name: makeName(rng, usedNames),
      terrain,
      ownerId: null,
      population,
      site,
      adjacency: adjacency[id]!,
      coastal: isCoastal(site),
    };
  });

  // Seat the player: capital (central) + its immediate neighbours.
  const capital = centralSite(sites);
  const playerNationId = 0;
  regions[capital]!.ownerId = playerNationId;
  regions[capital]!.population += 3; // capital starts more populous
  for (const neighbour of regions[capital]!.adjacency) {
    regions[neighbour]!.ownerId = playerNationId;
  }

  const player: Nation = {
    id: playerNationId,
    name: "Your Kingdom",
    color: PLAYER_COLOR,
    isPlayer: true,
    stockpile: { gold: STARTING_GOLD, food: 0, materials: 0, knowledge: 0 },
    taxRate: DEFAULT_TAX_RATE,
  };

  return {
    seed,
    rngState: rng.state(),
    turn: 1,
    regions,
    nations: [player],
    playerNationId,
  };
}
