/**
 * Island presentation geometry — deterministic, pure, view-only.
 *
 * Turns the map's region sites into an organic landmass silhouette (one blob
 * for a single island; the archipelago archetype clusters sites into several)
 * plus decorative offshore islets. Presentation only: the region graph,
 * adjacency and Voronoi cells are untouched — the renderer clips terrain to
 * the silhouette and everything else follows from the same projection.
 *
 * Everything derives from (sites, seed): no Math.random, no wall-clock, so a
 * given seed always draws the identical world and screenshots reproduce.
 */

import {
  ARCHIPELAGO_MIN_REGIONS,
  ARCHIPELAGO_ROLL,
  ARCHETYPE_REGION_LIMITS,
  COAST_DETAIL,
  COAST_MAX_SEGMENT,
  COAST_ROUGHNESS,
  EDGE_DETAIL,
  EDGE_MAX_DISP,
  EDGE_ROUGHNESS,
  ISLAND_FRAME,
  type IslandArchetype,
} from "@/data/mapstyle";
import { pointInPolygon, type Bounds, type Point, type VoronoiCell } from "@/systems/voronoi";

export interface IslandShape {
  /** Landmass outlines (normalised space), each a closed polygon. */
  blobs: Point[][];
  /** Tiny decorative rock outlines scattered offshore (never interactive). */
  islets: Point[][];
}

/**
 * Voronoi clipping bounds for the island look: cells extend past the unit
 * square so the coastline (which pads outward from the outer sites) is always
 * covered by some region's cell — no un-filled "lagoons" inside the coast.
 */
export const ISLAND_BOUNDS: Bounds = { minX: -0.15, minY: -0.15, maxX: 1.15, maxY: 1.15 };

/** Hard clamp for silhouette points, safely inside ISLAND_BOUNDS. */
const BLOB_CLAMP = 0.13;

// --- Deterministic hashing ---------------------------------------------------

/** Deterministic uint32 hash of three ints folded with the seed. */
function hash3(seed: number, a: number, b: number, c: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (a | 0), 2654435761) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h ^ (b | 0), 2246822519) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h ^ (c | 0), 3266489917) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** hash3 mapped to a float in [0, 1). */
function rand3(seed: number, a: number, b: number, c: number): number {
  return hash3(seed, a, b, c) / 4294967296;
}

/**
 * Public deterministic hash → [0, 1) for presentation randomness (texture
 * scatter, per-stamp variants). Same inputs, same output, forever — the
 * renderer must never touch Math.random.
 */
export function hashFloat(seed: number, a: number, b: number, c: number): number {
  return rand3(seed, a, b, c);
}

/** Quantise a normalised coordinate for position-stable hashing. */
const qz = (v: number): number => Math.round(v * 8192);

// --- Archetype selection ------------------------------------------------------

/**
 * Which presentation a map gets. Size maps small/medium/large; a qualifying
 * seed (enough regions, 1-in-ARCHIPELAGO_ROLL hash roll) presents as an
 * archipelago instead — variety across games, stable within one.
 */
export function islandArchetype(regionCount: number, seed: number): IslandArchetype {
  if (
    regionCount >= ARCHIPELAGO_MIN_REGIONS &&
    hash3(seed, 0xa5c1, regionCount, 7) % ARCHIPELAGO_ROLL === 0
  ) {
    return "archipelago";
  }
  if (regionCount <= ARCHETYPE_REGION_LIMITS.small) return "small";
  if (regionCount <= ARCHETYPE_REGION_LIMITS.medium) return "medium";
  return "large";
}

// --- Small vector helpers -----------------------------------------------------

function dist2(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function centroid(poly: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

// --- Radial support outline -----------------------------------------------------

/**
 * The organic base outline around a point cloud, built radially from the
 * centroid. For each of N directions the cloud's support (furthest projection)
 * is sampled; smoothing the radii lets the flats between extreme points swell
 * *outward* (corners keep only their guaranteed pad), and two hashed sine
 * harmonics add a slow swell so no two islands share a silhouette. The radius
 * never drops below support + 0.75·pad, so every site stays well inside.
 */
function supportOutline(pts: Point[], pad: number, seed: number, blobIdx: number): Point[] {
  const c = centroid(pts);
  const N = 56;
  const dirs: Point[] = [];
  const base: number[] = [];
  for (let k = 0; k < N; k++) {
    const th = (k / N) * Math.PI * 2;
    const d = { x: Math.cos(th), y: Math.sin(th) };
    dirs.push(d);
    let s = 0;
    for (const p of pts) s = Math.max(s, (p.x - c.x) * d.x + (p.y - c.y) * d.y);
    base.push(s);
  }

  // Circular moving-average smoothing (two passes, window 9).
  let sm = base;
  for (let pass = 0; pass < 2; pass++) {
    const next: number[] = [];
    for (let k = 0; k < N; k++) {
      let sum = 0;
      for (let w = -4; w <= 4; w++) sum += sm[(k + w + N) % N]!;
      next.push(sum / 9);
    }
    sm = next;
  }

  // Slow harmonic swell, hashed per blob — bounded so containment holds.
  const f1 = 2 + (hash3(seed, 21, blobIdx, 1) % 3);
  const f2 = 5 + (hash3(seed, 21, blobIdx, 2) % 3);
  const p1 = rand3(seed, 21, blobIdx, 3) * Math.PI * 2;
  const p2 = rand3(seed, 21, blobIdx, 4) * Math.PI * 2;

  const out: Point[] = [];
  for (let k = 0; k < N; k++) {
    const th = (k / N) * Math.PI * 2;
    let noise = pad * (0.3 * Math.sin(f1 * th + p1) + 0.18 * Math.sin(f2 * th + p2));
    noise = Math.max(-0.25 * pad, Math.min(0.5 * pad, noise));
    const r = Math.max(sm[k]!, base[k]! + 0.3 * pad) + 0.7 * pad + noise;
    out.push({ x: clampBlob(c.x + dirs[k]!.x * r), y: clampBlob(c.y + dirs[k]!.y * r) });
  }
  return out;
}

// --- Organic outline: resample + midpoint displacement --------------------------

/** Split any outline segment longer than maxSeg into equal parts. */
function resample(poly: Point[], maxSeg: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    out.push(a);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const parts = Math.ceil(len / maxSeg);
    for (let k = 1; k < parts; k++) {
      const t = k / parts;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/**
 * Fractal coastline: each round splits every segment at a midpoint displaced
 * along the segment normal. The displacement is hashed from the midpoint's
 * *position* (plus seed and round), so it is stable regardless of traversal
 * order, and clamped to maxDisp so all sites stay strictly inside.
 */
function displace(poly: Point[], seed: number, rounds: number, rough: number, maxDisp: number): Point[] {
  let pts = poly;
  for (let r = 0; r < rounds; r++) {
    const next: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      next.push(a);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-6) continue;
      const nx = (b.y - a.y) / len;
      const ny = -(b.x - a.x) / len;
      let d = (rand3(seed, qz(mx), qz(my), r) - 0.5) * 2 * rough * len;
      if (d > maxDisp) d = maxDisp;
      if (d < -maxDisp) d = -maxDisp;
      next.push({ x: clampBlob(mx + nx * d), y: clampBlob(my + ny * d) });
    }
    pts = next;
  }
  return pts;
}

function clampBlob(v: number): number {
  return v < -BLOB_CLAMP ? -BLOB_CLAMP : v > 1 + BLOB_CLAMP ? 1 + BLOB_CLAMP : v;
}

// --- Archipelago clustering ------------------------------------------------------

/**
 * Split sites into k spatial groups: farthest-point anchor sampling (seeded
 * first pick) then nearest-anchor assignment. Deterministic; k ≤ sites.
 */
export function clusterSites(sites: Point[], k: number, seed: number): number[] {
  const anchors: number[] = [hash3(seed, 11, sites.length, 3) % sites.length];
  while (anchors.length < Math.min(k, sites.length)) {
    let best = 0;
    let bestD = -1;
    for (let i = 0; i < sites.length; i++) {
      let d = Infinity;
      for (const a of anchors) d = Math.min(d, dist2(sites[i]!, sites[a]!));
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    anchors.push(best);
  }
  return sites.map((s) => {
    let bi = 0;
    let bd = Infinity;
    anchors.forEach((a, j) => {
      const d = dist2(s, sites[a]!);
      if (d < bd) {
        bd = d;
        bi = j;
      }
    });
    return bi;
  });
}

// --- Islets ----------------------------------------------------------------------

/** Shortest distance from a point to a polygon's edges (0 if degenerate). */
function distToPoly(p: Point, poly: Point[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby || 1;
    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = p.x - (a.x + abx * t);
    const dy = p.y - (a.y + aby * t);
    best = Math.min(best, dx * dx + dy * dy);
  }
  return Math.sqrt(best);
}

function makeIslets(blobs: Point[][], count: number, seed: number): Point[][] {
  const out: Point[][] = [];
  for (let t = 0; t < count * 40 && out.length < count; t++) {
    const p: Point = {
      x: rand3(seed, 77, t, 1) * 1.12 - 0.06,
      y: rand3(seed, 77, t, 2) * 1.12 - 0.06,
    };
    if (blobs.some((b) => pointInPolygon(b, p.x, p.y))) continue;
    if (blobs.some((b) => distToPoly(p, b) < 0.035)) continue;
    if (out.some((rock) => dist2(p, centroid(rock)) < 0.05 * 0.05)) continue;
    const r = 0.007 + rand3(seed, 77, t, 3) * 0.012;
    const sides = 6 + (hash3(seed, 77, t, 4) % 3);
    const rock: Point[] = [];
    for (let i = 0; i < sides; i++) {
      const ang = (i / sides) * Math.PI * 2;
      const rr = r * (0.65 + rand3(seed, 77, t * 16 + i, 5) * 0.7);
      rock.push({ x: p.x + Math.cos(ang) * rr, y: p.y + Math.sin(ang) * rr * 0.8 });
    }
    out.push(rock);
  }
  return out;
}

// --- Public entry point -------------------------------------------------------------

/**
 * Build the landmass silhouette for the given sites: cluster (archipelago
 * only) → convex hull per cluster → outward offset by the archetype's coast
 * pad → resample → fractal displacement (clamped so every site stays inside)
 * → decorative islets in the remaining water.
 */
export function islandShape(sites: Point[], seed: number, archetype: IslandArchetype): IslandShape {
  const frame = ISLAND_FRAME[archetype];
  const k = archetype === "archipelago" ? (sites.length >= 26 ? 3 : 2) : 1;
  const groups = k === 1 ? sites.map(() => 0) : clusterSites(sites, k, seed);

  const blobs: Point[][] = [];
  for (let g = 0; g < k; g++) {
    const pts = sites.filter((_, i) => groups[i] === g);
    if (pts.length === 0) continue;
    let outline = supportOutline(pts, frame.coastPad, seed, g);
    outline = resample(outline, COAST_MAX_SEGMENT);
    outline = displace(outline, hash3(seed, 1009, g, blobs.length), COAST_DETAIL, COAST_ROUGHNESS, frame.coastPad * 0.35);
    blobs.push(outline);
  }

  return { blobs, islets: makeIslets(blobs, frame.isletCount, seed) };
}

/** Is a normalised point on land (inside any landmass blob)? */
export function pointInIsland(shape: IslandShape, x: number, y: number): boolean {
  return shape.blobs.some((b) => pointInPolygon(b, x, y));
}

// --- Organic region borders ---------------------------------------------------

export interface OrganicCell {
  /** The full distorted cell polygon (edge polylines concatenated). */
  poly: Point[];
  /** One polyline per original cell edge: edges[k] runs vertex k → k+1. */
  edges: Point[][];
  /** Same edge labels as the source VoronoiCell (−1 = clipping bounds). */
  neighbor: number[];
  /**
   * Multi-part (island/archipelago) province: every ring of the region, so the
   * renderer fills and clips all parts. `poly` stays ring 0 (hit-test, label,
   * centroid, terrain). Absent for ordinary single-ring cells.
   */
  rings?: Point[][];
}

/**
 * De-mathify the interior region borders: every *shared* Voronoi edge gets a
 * subtle midpoint-displacement polyline. The polyline is computed once per
 * unordered endpoint pair, in a canonical orientation, and reused (reversed)
 * by the other cell — the two neighbours share the exact same points, so no
 * gaps or overlaps can open. Displacement is hashed from midpoint positions
 * (plus the seed), so it is deterministic and traversal-order independent.
 * Edges on the clipping bounds (neighbor −1) lie far under the ocean and stay
 * straight. The absolute displacement cap keeps every site inside its cell.
 */
export function organicCells(cells: VoronoiCell[], seed: number): OrganicCell[] {
  const cache = new Map<string, Point[]>();

  const displaceEdge = (a: Point, b: Point): Point[] => {
    let pts = [a, b];
    for (let r = 0; r < EDGE_DETAIL; r++) {
      const next: Point[] = [pts[0]!];
      for (let s = 0; s < pts.length - 1; s++) {
        const p = pts[s]!;
        const q = pts[s + 1]!;
        const len = Math.hypot(q.x - p.x, q.y - p.y);
        if (len > 1e-5) {
          const mx = (p.x + q.x) / 2;
          const my = (p.y + q.y) / 2;
          const nx = (q.y - p.y) / len;
          const ny = -(q.x - p.x) / len;
          let d = (rand3(seed, qz(mx) * 2 + 1, qz(my) * 2 + 1, 100 + r) - 0.5) * 2 * EDGE_ROUGHNESS * len;
          const cap = Math.min(EDGE_MAX_DISP, len * 0.3);
          if (d > cap) d = cap;
          if (d < -cap) d = -cap;
          next.push({ x: mx + nx * d, y: my + ny * d });
        }
        next.push(q);
      }
      pts = next;
    }
    return pts;
  };

  return cells.map((cell) => {
    const n = cell.poly.length;
    const edges: Point[][] = [];
    for (let k = 0; k < n; k++) {
      const a = cell.poly[k]!;
      const b = cell.poly[(k + 1) % n]!;
      if ((cell.neighbor[k] ?? -1) < 0) {
        edges.push([a, b]); // bounds edge — invisible under the ocean
        continue;
      }
      const ka = `${qz(a.x)},${qz(a.y)}`;
      const kb = `${qz(b.x)},${qz(b.y)}`;
      const flip = ka > kb;
      const key = flip ? `${kb}|${ka}` : `${ka}|${kb}`;
      let pl = cache.get(key);
      if (!pl) {
        pl = flip ? displaceEdge(b, a) : displaceEdge(a, b);
        cache.set(key, pl);
      }
      edges.push(flip ? [...pl].reverse() : pl);
    }
    const poly = edges.flatMap((e) => e.slice(0, -1));
    return { poly, edges, neighbor: [...cell.neighbor] };
  });
}

/**
 * Cells straight from authored region boundaries — no Voronoi, no midpoint
 * displacement (a real coastline is already organic). Each region supplies one
 * or more rings (extra rings are island/multipart fragments), open (the first
 * vertex is not repeated). Adjacency is recovered exactly like `organicCells`
 * caches its shared edges: every segment is keyed by its UNORDERED quantised
 * endpoint pair (the same `qz` scheme), so a segment authored by two regions —
 * even traversed in opposite directions — collapses to one key and each side
 * learns the other as its neighbour. Coast/outer segments (owned by a single
 * region) stay −1. Deterministic and pure.
 */
export function polygonCells(regionRings: Point[][][]): OrganicCell[] {
  const segKey = (a: Point, b: Point): string => {
    const ka = `${qz(a.x)},${qz(a.y)}`;
    const kb = `${qz(b.x)},${qz(b.y)}`;
    return ka > kb ? `${kb}|${ka}` : `${ka}|${kb}`;
  };

  // Pass 1: which region ids touch each segment key (across every ring).
  const owners = new Map<string, number[]>();
  regionRings.forEach((rings, id) => {
    for (const ring of rings) {
      const n = ring.length;
      for (let k = 0; k < n; k++) {
        const key = segKey(ring[k]!, ring[(k + 1) % n]!);
        const list = owners.get(key);
        if (list) list.push(id);
        else owners.set(key, [id]);
      }
    }
  });

  // Pass 2: ring 0 becomes the cell's poly/edges/neighbor; extra rings ride
  // along in `rings` so all island parts still fill.
  return regionRings.map((rings, id) => {
    const ring0 = rings[0] ?? [];
    const n = ring0.length;
    const edges: Point[][] = [];
    const neighbor: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = ring0[k]!;
      const b = ring0[(k + 1) % n]!;
      edges.push([a, b]);
      const list = owners.get(segKey(a, b));
      const other = list?.find((rid) => rid !== id);
      neighbor.push(other ?? -1);
    }
    const poly = edges.flatMap((e) => e.slice(0, -1));
    const cell: OrganicCell = { poly, edges, neighbor };
    if (rings.length > 1) cell.rings = rings;
    return cell;
  });
}
