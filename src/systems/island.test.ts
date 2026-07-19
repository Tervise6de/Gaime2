import { describe, expect, it } from "vitest";
import { organicCells, polygonCells, pointInIsland, ISLAND_BOUNDS } from "@/systems/island";
import { EDGE_MAX_DISP } from "@/data/mapstyle";
import { computeVoronoiCells, type Point } from "@/systems/voronoi";
import { createRng } from "@/systems/rng";

function makeSites(count: number, seed: number): Point[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => ({ x: rng.range(0.05, 0.95), y: rng.range(0.05, 0.95) }));
}

describe("pointInIsland", () => {
  it("tests authored land blobs", () => {
    const shape = {
      blobs: [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]],
      islets: [],
    };
    expect(pointInIsland(shape, 0.5, 0.5)).toBe(true);
    expect(pointInIsland(shape, 1.5, 0.5)).toBe(false);
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

  it("preserves every original edge's endpoints", () => {
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

  it("gives both neighbours the exact same shared polyline", () => {
    const org = organicCells(cells, 7);
    let checked = 0;
    org.forEach((cell, i) => {
      cell.neighbor.forEach((j, k) => {
        if (j < 0 || j < i) return;
        const back = org[j]!.neighbor.findIndex((n) => n === i);
        if (back < 0) return;
        const mine = cell.edges[k]!;
        const theirs = [...org[j]!.edges[back]!].reverse();
        expect(theirs).toEqual(mine);
        checked++;
      });
    });
    expect(checked).toBeGreaterThan(10);
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
          const d = Math.abs(((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len);
          expect(d).toBeLessThanOrEqual(EDGE_MAX_DISP * 2 + 1e-9);
        }
      });
    });
  });
});

describe("polygonCells", () => {
  const square = (x0: number, y0: number): Point[] => [
    { x: x0, y: y0 },
    { x: x0 + 1, y: y0 },
    { x: x0 + 1, y: y0 + 1 },
    { x: x0, y: y0 + 1 },
  ];
  const seamAt1 = (cell: { edges: Point[][] }): number =>
    cell.edges.findIndex((e) => e[0]!.x === 1 && e[1]!.x === 1);

  it("shares a segment as mutual neighbours; outer edges stay coast", () => {
    const cells = polygonCells([[square(0, 0)], [square(1, 0)]]);
    expect(cells).toHaveLength(2);

    const s0 = seamAt1(cells[0]!);
    const s1 = seamAt1(cells[1]!);
    expect(s0).toBeGreaterThanOrEqual(0);
    expect(s1).toBeGreaterThanOrEqual(0);
    expect(cells[0]!.neighbor[s0]).toBe(1);
    expect(cells[1]!.neighbor[s1]).toBe(0);
    cells[0]!.neighbor.forEach((n, k) => expect(n).toBe(k === s0 ? 1 : -1));
    cells[1]!.neighbor.forEach((n, k) => expect(n).toBe(k === s1 ? 0 : -1));
  });

  it("keeps every ring of a multipart region, with poly staying ring 0", () => {
    const ring0 = square(0, 0);
    const ring1 = square(3, 0);
    const [cell] = polygonCells([[ring0, ring1]]);
    expect(cell!.rings).toEqual([ring0, ring1]);
    expect(cell!.poly).toEqual(ring0);
    expect(cell!.edges).toHaveLength(ring0.length);
    expect(cell!.neighbor.every((n) => n === -1)).toBe(true);
  });
});
