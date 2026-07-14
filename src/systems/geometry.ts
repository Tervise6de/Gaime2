/**
 * Pure geometry helpers: point sampling, relaxation, and a compact
 * Bowyer–Watson Delaunay triangulation.
 *
 * Delaunay adjacency defines the logic graph's edges (systems/mapgen.ts); the
 * same triangulation's circumcentres yield Voronoi cells for the polygon
 * renderer. Keeping this pure and deterministic means the map is reproducible
 * from a seed and the geometry is unit-testable without a canvas.
 */

import type { Rng } from "@/systems/rng";

export interface Point {
  x: number;
  y: number;
}

export interface Triangle {
  /** Indices into the sites array. */
  a: number;
  b: number;
  c: number;
}

/**
 * Sample `count` points in [0,1]² with light Poisson-ish rejection so sites are
 * reasonably spaced. Falls back to accepting a point after enough tries so the
 * function always terminates and always returns `count` points.
 */
export function samplePoints(rng: Rng, count: number, minDist: number): Point[] {
  const points: Point[] = [];
  let guard = 0;
  const maxGuard = count * 200;
  while (points.length < count && guard < maxGuard) {
    guard++;
    const p = { x: rng.range(0.06, 0.94), y: rng.range(0.08, 0.92) };
    const ok = points.every((q) => dist2(p, q) >= minDist * minDist);
    if (ok || guard > maxGuard - count) points.push(p);
  }
  return points;
}

/**
 * Lloyd-style relaxation using triangle-circumcentre neighbourhoods to spread
 * sites more evenly. A couple of passes is plenty for a pleasant map.
 */
export function relax(points: Point[], passes: number): Point[] {
  let pts = points.map((p) => ({ ...p }));
  for (let pass = 0; pass < passes; pass++) {
    const tris = triangulate(pts);
    const sum: Point[] = pts.map(() => ({ x: 0, y: 0 }));
    const n = pts.map(() => 0);
    for (const t of tris) {
      const cx = (pts[t.a].x + pts[t.b].x + pts[t.c].x) / 3;
      const cy = (pts[t.a].y + pts[t.b].y + pts[t.c].y) / 3;
      for (const i of [t.a, t.b, t.c]) {
        sum[i].x += cx;
        sum[i].y += cy;
        n[i]++;
      }
    }
    pts = pts.map((p, i) =>
      n[i] === 0
        ? p
        : {
            x: clamp(0.05, 0.95, (p.x + sum[i].x / n[i]) / 2),
            y: clamp(0.07, 0.93, (p.y + sum[i].y / n[i]) / 2),
          },
    );
  }
  return pts;
}

/** Bowyer–Watson Delaunay triangulation. Returns triangles as site-index triples. */
export function triangulate(sites: Point[]): Triangle[] {
  if (sites.length < 3) return [];

  // Super-triangle enclosing all points (indices sites.length, +1, +2).
  const pts = sites.slice();
  const st0 = pts.length;
  pts.push({ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 0, y: 10 });

  type Tri = { a: number; b: number; c: number };
  let triangles: Tri[] = [{ a: st0, b: st0 + 1, c: st0 + 2 }];

  for (let i = 0; i < st0; i++) {
    const p = pts[i];
    const bad: Tri[] = [];
    for (const t of triangles) {
      if (inCircumcircle(p, pts[t.a], pts[t.b], pts[t.c])) bad.push(t);
    }
    // Boundary of the cavity = edges belonging to exactly one bad triangle.
    const edges: Array<[number, number]> = [];
    for (const t of bad) {
      for (const e of [
        [t.a, t.b],
        [t.b, t.c],
        [t.c, t.a],
      ] as Array<[number, number]>) {
        const shared = bad.some(
          (o) => o !== t && hasEdge(o, e[0], e[1]),
        );
        if (!shared) edges.push(e);
      }
    }
    triangles = triangles.filter((t) => !bad.includes(t));
    for (const [u, v] of edges) triangles.push({ a: u, b: v, c: i });
  }

  // Drop triangles touching the super-triangle vertices.
  return triangles.filter((t) => t.a < st0 && t.b < st0 && t.c < st0);
}

/** Unique undirected edges (adjacency) derived from a triangulation. */
export function edgesFromTriangles(tris: Triangle[]): Array<[number, number]> {
  const seen = new Set<string>();
  const out: Array<[number, number]> = [];
  for (const t of tris) {
    for (const [u, v] of [
      [t.a, t.b],
      [t.b, t.c],
      [t.c, t.a],
    ] as Array<[number, number]>) {
      const key = u < v ? `${u},${v}` : `${v},${u}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(u < v ? [u, v] : [v, u]);
      }
    }
  }
  return out;
}

export function circumcenter(a: Point, b: Point, c: Point): Point {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  return {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
}

function inCircumcircle(p: Point, a: Point, b: Point, c: Point): boolean {
  const cc = circumcenter(a, b, c);
  const r2 = dist2(cc, a);
  return dist2(cc, p) < r2 - 1e-12;
}

function hasEdge(t: { a: number; b: number; c: number }, u: number, v: number): boolean {
  return (
    (t.a === u || t.b === u || t.c === u) && (t.a === v || t.b === v || t.c === v)
  );
}

function dist2(p: Point, q: Point): number {
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  return dx * dx + dy * dy;
}

function clamp(lo: number, hi: number, v: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
