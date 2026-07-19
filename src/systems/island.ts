/**
 * Hansa map presentation geometry.
 *
 * The live game uses authored real-geography land and province polygons. This
 * module keeps only the deterministic helpers still needed by that renderer:
 * stable hash noise, land hit-testing, Voronoi fallback cells for authored
 * maps without region polygons, and polygon cells for the Hansa provinces.
 */

import { EDGE_DETAIL, EDGE_MAX_DISP, EDGE_ROUGHNESS } from "@/data/mapstyle";
import { pointInPolygon, type Bounds, type Point, type VoronoiCell } from "@/systems/voronoi";

export interface IslandShape {
  /** Landmass outlines in normalised map space. */
  blobs: Point[][];
  /** Decorative offshore islets, never interactive. */
  islets: Point[][];
}

/**
 * Voronoi clipping bounds: cells extend past the unit square so authored
 * coastlines never reveal unfilled gaps at the edges.
 */
export const ISLAND_BOUNDS: Bounds = { minX: -0.15, minY: -0.15, maxX: 1.15, maxY: 1.15 };

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

function rand3(seed: number, a: number, b: number, c: number): number {
  return hash3(seed, a, b, c) / 4294967296;
}

/** Stable presentation noise in [0, 1). */
export function hashFloat(seed: number, a: number, b: number, c: number): number {
  return rand3(seed, a, b, c);
}

/** Quantise a normalised coordinate for stable segment keys. */
const qz = (v: number): number => Math.round(v * 8192);

/** Is a normalised point on authored land? */
export function pointInIsland(shape: IslandShape, x: number, y: number): boolean {
  return shape.blobs.some((b) => pointInPolygon(b, x, y));
}

export interface OrganicCell {
  /** The full cell polygon. */
  poly: Point[];
  /** One polyline per original cell edge. */
  edges: Point[][];
  /** Same edge labels as the source VoronoiCell (-1 = clipping bounds/coast). */
  neighbor: number[];
  /**
   * Multi-part province: every ring of the region. `poly` stays ring 0 for
   * hit-test, label and terrain placement.
   */
  rings?: Point[][];
}

/**
 * De-mathify interior Voronoi borders for authored maps that do not provide
 * province polygons. Shared edges are cached by unordered endpoint key so both
 * neighbours reuse the exact same polyline.
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
        edges.push([a, b]);
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
 * Cells straight from authored region boundaries. Adjacency is recovered from
 * shared segments, keyed by unordered quantised endpoints.
 */
export function polygonCells(regionRings: Point[][][]): OrganicCell[] {
  const segKey = (a: Point, b: Point): string => {
    const ka = `${qz(a.x)},${qz(a.y)}`;
    const kb = `${qz(b.x)},${qz(b.y)}`;
    return ka > kb ? `${kb}|${ka}` : `${ka}|${kb}`;
  };

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
