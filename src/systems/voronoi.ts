/**
 * Voronoi region polygons — pure geometry over the map's region sites.
 *
 * A *view* over existing data: each region already has normalised coordinates
 * (systems/mapgen.ts). This computes, for every region, the Voronoi cell around
 * its site — the area closer to that site than to any other — as a convex
 * polygon clipped to the map box. The polygon renderer fills these cells; the
 * sim, map generation, and adjacency graph are untouched.
 *
 * Method: intersect the half-planes of the perpendicular bisector against
 * *every* other site (not just graph neighbours — the k-nearest adjacency is not
 * the Delaunay graph, so a subset would leave cells too large). O(n²) per site,
 * trivial at ~20–30 regions, and fully deterministic: same sites → same cells.
 * Each cell edge is labelled with the neighbouring site that created it (or -1
 * for a map-box edge), so shared borders — including war fronts — can be drawn
 * exactly.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface VoronoiCell {
  /** Convex polygon vertices in normalised space, counter-clockwise. */
  poly: Point[];
  /**
   * `neighbor[i]` is the site index whose bisector produced the edge
   * `poly[i] → poly[(i+1) % n]`, or -1 for a map-box edge.
   */
  neighbor: number[];
}

const UNIT_BOUNDS: Bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };

interface LabelledVertex {
  p: Point;
  /** Label of the edge leaving this vertex. */
  edge: number;
}

/** Compute a Voronoi cell for every site. Deterministic and pure. */
export function computeVoronoiCells(sites: Point[], bounds: Bounds = UNIT_BOUNDS): VoronoiCell[] {
  return sites.map((site, i) => {
    let poly: LabelledVertex[] = [
      { p: { x: bounds.minX, y: bounds.minY }, edge: -1 },
      { p: { x: bounds.maxX, y: bounds.minY }, edge: -1 },
      { p: { x: bounds.maxX, y: bounds.maxY }, edge: -1 },
      { p: { x: bounds.minX, y: bounds.maxY }, edge: -1 },
    ];

    for (let j = 0; j < sites.length; j++) {
      if (j === i) continue;
      const other = sites[j];
      const nx = site.x - other.x;
      const ny = site.y - other.y;
      if (nx * nx + ny * ny < 1e-12) continue; // coincident sites — skip
      const mx = (site.x + other.x) / 2;
      const my = (site.y + other.y) / 2;
      poly = clipHalfPlane(poly, nx, ny, mx, my, j);
      if (poly.length === 0) break;
    }

    if (poly.length < 3) {
      // Degenerate fallback: a tiny box around the site so the region still hits.
      const e = 0.008;
      return {
        poly: [
          { x: site.x - e, y: site.y - e },
          { x: site.x + e, y: site.y - e },
          { x: site.x + e, y: site.y + e },
          { x: site.x - e, y: site.y + e },
        ],
        neighbor: [-1, -1, -1, -1],
      };
    }

    return {
      poly: poly.map((v) => v.p),
      neighbor: poly.map((v) => v.edge),
    };
  });
}

/**
 * Sutherland–Hodgman clip of a labelled convex polygon to the half-plane
 * n·(p − m) ≥ 0, keeping the side that contains the site. Edges created by the
 * clip line are labelled `clipLabel`; surviving edges keep their labels.
 */
function clipHalfPlane(
  poly: LabelledVertex[],
  nx: number,
  ny: number,
  mx: number,
  my: number,
  clipLabel: number,
): LabelledVertex[] {
  const out: LabelledVertex[] = [];
  const side = (p: Point) => nx * (p.x - mx) + ny * (p.y - my);
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const cur = poly[i];
    const nxt = poly[(i + 1) % n];
    const dCur = side(cur.p);
    const dNxt = side(nxt.p);
    const curIn = dCur >= 0;
    const nxtIn = dNxt >= 0;
    if (curIn) {
      out.push(cur);
      if (!nxtIn) {
        // Leaving the half-plane: intersection vertex starts the clip-line edge.
        out.push({ p: intersect(cur.p, nxt.p, dCur, dNxt), edge: clipLabel });
      }
    } else if (nxtIn) {
      // Entering: intersection vertex continues the original edge's label.
      out.push({ p: intersect(cur.p, nxt.p, dCur, dNxt), edge: cur.edge });
    }
  }
  return out;
}

function intersect(a: Point, b: Point, da: number, db: number): Point {
  const t = da / (da - db);
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(poly: Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
