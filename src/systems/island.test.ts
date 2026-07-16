import { describe, expect, it } from "vitest";
import {
  clusterSites,
  islandArchetype,
  islandShape,
  organicCells,
  pointInIsland,
  ISLAND_BOUNDS,
} from "@/systems/island";
import { ARCHIPELAGO_MIN_REGIONS, EDGE_MAX_DISP, ISLAND_FRAME } from "@/data/mapstyle";
import { computeVoronoiCells, pointInPolygon, type Point } from "@/systems/voronoi";
import { createRng } from "@/systems/rng";

/** Scatter deterministic pseudo-sites like mapgen does (clamped to [0.03, 0.97]). */
function makeSites(count: number, seed: number): Point[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => ({ x: rng.range(0.05, 0.95), y: rng.range(0.05, 0.95) }));
}

describe("islandArchetype", () => {
  it("maps region counts onto size archetypes", () => {
    // Seeds are chosen arbitrarily; sizes below the archipelago floor never roll it.
    expect(islandArchetype(16, 1)).toBe("small");
    expect(["medium", "archipelago"]).toContain(islandArchetype(22, 1));
    expect(["large", "archipelago"]).toContain(islandArchetype(30, 1));
  });

  it("is deterministic per (count, seed) and varies archipelagos by seed", () => {
    const rolls = new Set<string>();
    for (let seed = 0; seed < 64; seed++) {
      const a = islandArchetype(22, seed);
      expect(islandArchetype(22, seed)).toBe(a); // stable on repeat
      rolls.add(a);
    }
    // Across many seeds a qualifying size must present both ways.
    expect(rolls.has("archipelago")).toBe(true);
    expect(rolls.has("medium")).toBe(true);
  });

  it("never rolls archipelago below the region floor", () => {
    for (let seed = 0; seed < 64; seed++) {
      expect(islandArchetype(ARCHIPELAGO_MIN_REGIONS - 4, seed)).toBe("small");
    }
  });
});

describe("islandShape", () => {
  it("is fully deterministic for a given seed", () => {
    const sites = makeSites(22, 99);
    const a = islandShape(sites, 12345, "medium");
    const b = islandShape(sites, 12345, "medium");
    expect(a).toEqual(b);
  });

  it("changes with the seed", () => {
    const sites = makeSites(22, 99);
    const a = islandShape(sites, 1, "medium");
    const b = islandShape(sites, 2, "medium");
    expect(a.blobs).not.toEqual(b.blobs);
  });

  it("contains every site inside the landmass", () => {
    for (const seed of [1, 7, 42, 12345]) {
      for (const count of [16, 22, 30]) {
        const sites = makeSites(count, seed * 31 + count);
        const shape = islandShape(sites, seed, islandArchetype(count, seed));
        for (const s of sites) {
          expect(pointInIsland(shape, s.x, s.y)).toBe(true);
        }
      }
    }
  });

  it("stays inside the expanded Voronoi bounds (no un-covered coastline)", () => {
    for (const seed of [3, 12345]) {
      const sites = makeSites(30, seed);
      const shape = islandShape(sites, seed, "archipelago");
      for (const blob of shape.blobs) {
        for (const p of blob) {
          expect(p.x).toBeGreaterThan(ISLAND_BOUNDS.minX);
          expect(p.x).toBeLessThan(ISLAND_BOUNDS.maxX);
          expect(p.y).toBeGreaterThan(ISLAND_BOUNDS.minY);
          expect(p.y).toBeLessThan(ISLAND_BOUNDS.maxY);
        }
      }
    }
  });

  it("splits an archipelago into several blobs, each holding its cluster", () => {
    const sites = makeSites(28, 5);
    const shape = islandShape(sites, 5, "archipelago");
    expect(shape.blobs.length).toBeGreaterThanOrEqual(2);
    for (const s of sites) expect(pointInIsland(shape, s.x, s.y)).toBe(true);
  });

  it("keeps decorative islets out of the landmass", () => {
    const sites = makeSites(22, 11);
    const shape = islandShape(sites, 11, "medium");
    expect(shape.islets.length).toBeGreaterThan(0);
    expect(shape.islets.length).toBeLessThanOrEqual(ISLAND_FRAME.medium.isletCount);
    for (const rock of shape.islets) {
      for (const p of rock) {
        for (const blob of shape.blobs) {
          expect(pointInPolygon(blob, p.x, p.y)).toBe(false);
        }
      }
    }
  });
});

describe("organicCells", () => {
  const sites = makeSites(22, 4242);
  const cells = computeVoronoiCells(sites, ISLAND_BOUNDS);

  it("is deterministic per seed and varies across seeds", () => {
    const a = organicCells(cells, 7);
    expect(organicCells(cells, 7)).toEqual(a);
    expect(organicCells(cells, 8)).not.toEqual(a);
  });

  it("preserves every original edge's endpoints (within float epsilon)", () => {
    // The canonical shared polyline carries the endpoint bits of whichever
    // neighbour computed it first, so the other cell may differ by ~1 ulp —
    // shared geometry (gap-free borders) deliberately wins over per-cell bits.
    const org = organicCells(cells, 7);
    org.forEach((cell, i) => {
      const src = cells[i]!;
      cell.edges.forEach((pl, k) => {
        const a = src.poly[k]!;
        const b = src.poly[(k + 1) % src.poly.length]!;
        expect(pl[0]!.x).toBeCloseTo(a.x, 9);
        expect(pl[0]!.y).toBeCloseTo(a.y, 9);
        expect(pl[pl.length - 1]!.x).toBeCloseTo(b.x, 9);
        expect(pl[pl.length - 1]!.y).toBeCloseTo(b.y, 9);
      });
    });
  });

  it("gives both neighbours the exact same shared polyline (no gaps)", () => {
    const org = organicCells(cells, 7);
    let checked = 0;
    org.forEach((cell, i) => {
      cell.neighbor.forEach((j, k) => {
        if (j < 0 || j < i) return;
        // Find the reciprocal edge in cell j that points back at i.
        const back = org[j]!.neighbor.findIndex((n) => n === i);
        if (back < 0) return; // clipped asymmetry — nothing shared to compare
        const mine = cell.edges[k]!;
        const theirs = [...org[j]!.edges[back]!].reverse();
        expect(theirs).toEqual(mine);
        checked++;
      });
    });
    expect(checked).toBeGreaterThan(10); // the map genuinely has shared borders
  });

  it("keeps displacement under the configured cap", () => {
    const org = organicCells(cells, 7);
    org.forEach((cell, i) => {
      const src = cells[i]!;
      cell.edges.forEach((pl, k) => {
        const a = src.poly[k]!;
        const b = src.poly[(k + 1) % src.poly.length]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        for (const p of pl) {
          // Perpendicular distance from the straight segment.
          const d = Math.abs(((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len);
          expect(d).toBeLessThanOrEqual(EDGE_MAX_DISP * 2 + 1e-9); // ≤ cap per round, 2 rounds
        }
      });
    });
  });
});

describe("clusterSites", () => {
  it("assigns every site to one of k groups, deterministically", () => {
    const sites = makeSites(26, 8);
    const groups = clusterSites(sites, 3, 77);
    expect(groups).toHaveLength(sites.length);
    expect(groups.every((g) => g >= 0 && g < 3)).toBe(true);
    expect(clusterSites(sites, 3, 77)).toEqual(groups);
  });
});
