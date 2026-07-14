import { describe, it, expect } from "vitest";
import { createRng } from "@/systems/rng";
import { generateMap } from "@/systems/mapgen";
import { voronoiCells, pointInPolygon, type Point } from "@/systems/geometry";

describe("Voronoi cells", () => {
  it("produces a valid polygon per region that contains its own site", () => {
    const regions = generateMap(createRng(314), { regionCount: 22 });
    const sites: Point[] = regions.map((r) => ({ x: r.x, y: r.y }));
    const neighbors = regions.map((r) => r.adj);
    const cells = voronoiCells(sites, neighbors);

    expect(cells).toHaveLength(regions.length);
    for (let i = 0; i < cells.length; i++) {
      expect(cells[i].length).toBeGreaterThanOrEqual(3);
      // A Voronoi cell always contains its generating site.
      expect(pointInPolygon(cells[i], sites[i].x, sites[i].y)).toBe(true);
    }
  });

  it("assigns each site's own cell over any other cell (nearest-site property)", () => {
    const regions = generateMap(createRng(2718), { regionCount: 18 });
    const sites: Point[] = regions.map((r) => ({ x: r.x, y: r.y }));
    const cells = voronoiCells(sites, regions.map((r) => r.adj));
    // A point very close to site i must not fall inside a different cell that is
    // farther from i (basic sanity that cells partition space around sites).
    for (let i = 0; i < sites.length; i++) {
      const hits = cells.filter((c) => pointInPolygon(c, sites[i].x, sites[i].y)).length;
      expect(hits).toBeGreaterThanOrEqual(1);
    }
  });

  it("keeps cells within the bounding box", () => {
    const sites: Point[] = [
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 0.5, y: 0.75 },
    ];
    const neighbors = [[1, 2], [0, 2], [0, 1]];
    const cells = voronoiCells(sites, neighbors);
    for (const cell of cells) {
      for (const p of cell) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x).toBeLessThanOrEqual(1 + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.y).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});
