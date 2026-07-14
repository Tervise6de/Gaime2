import { describe, it, expect } from "vitest";
import { generateMap } from "@/systems/mapgen";
import { computeVoronoiCells, pointInPolygon, type Point } from "@/systems/voronoi";

/** Squared distance helper for the nearest-site property. */
function d2(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

describe("Voronoi cells", () => {
  it("is deterministic: same sites → identical polygons", () => {
    const sites = generateMap(4242).regions.map((r) => ({ x: r.x, y: r.y }));
    const a = computeVoronoiCells(sites);
    const b = computeVoronoiCells(sites);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("gives every site a valid polygon that contains its own site", () => {
    const sites = generateMap(77).regions.map((r) => ({ x: r.x, y: r.y }));
    const cells = computeVoronoiCells(sites);
    expect(cells).toHaveLength(sites.length);
    for (let i = 0; i < cells.length; i++) {
      expect(cells[i].poly.length).toBeGreaterThanOrEqual(3);
      expect(cells[i].neighbor.length).toBe(cells[i].poly.length);
      expect(pointInPolygon(cells[i].poly, sites[i].x, sites[i].y)).toBe(true);
    }
  });

  it("hit-tests a point to the site whose cell contains it (nearest-site)", () => {
    const sites = generateMap(2024).regions.map((r) => ({ x: r.x, y: r.y }));
    const cells = computeVoronoiCells(sites);
    // Sample a grid; the containing cell must be the nearest site to the point.
    for (let gx = 1; gx < 10; gx++) {
      for (let gy = 1; gy < 10; gy++) {
        const p = { x: gx / 10, y: gy / 10 };
        const hit = cells.findIndex((c) => pointInPolygon(c.poly, p.x, p.y));
        if (hit < 0) continue; // exactly on a border — ignore
        let nearest = 0;
        for (let k = 1; k < sites.length; k++) if (d2(p, sites[k]) < d2(p, sites[nearest])) nearest = k;
        expect(hit).toBe(nearest);
      }
    }
  });

  it("keeps every cell within the map box", () => {
    const sites = generateMap(9).regions.map((r) => ({ x: r.x, y: r.y }));
    for (const cell of computeVoronoiCells(sites)) {
      for (const p of cell.poly) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x).toBeLessThanOrEqual(1 + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.y).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});
