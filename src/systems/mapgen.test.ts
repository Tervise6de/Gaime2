import { describe, it, expect } from "vitest";
import { generateMap, DEFAULT_MAP_OPTIONS } from "@/systems/mapgen";
import { TERRAIN } from "@/data/terrain";

/** Are all regions reachable from region 0 via adjacency? */
function isConnected(regions: { id: number; adjacency: number[] }[]): boolean {
  const seen = new Set<number>();
  const stack = [0];
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const m of regions[n]!.adjacency) if (!seen.has(m)) stack.push(m);
  }
  return seen.size === regions.length;
}

describe("map generation", () => {
  it("is deterministic: same seed → identical map", () => {
    const a = generateMap(12345);
    const b = generateMap(12345);
    expect(a).toEqual(b);
  });

  it("differs across seeds", () => {
    const a = generateMap(1);
    const b = generateMap(2);
    expect(a).not.toEqual(b);
  });

  it("produces the requested number of regions", () => {
    const { regions } = generateMap(7);
    expect(regions.length).toBe(DEFAULT_MAP_OPTIONS.regionCount);
  });

  it("yields a single connected component", () => {
    for (const seed of [1, 2, 3, 42, 999, 12345]) {
      const { regions } = generateMap(seed);
      expect(isConnected(regions)).toBe(true);
    }
  });

  it("keeps adjacency symmetric", () => {
    const { regions } = generateMap(555);
    for (const region of regions) {
      for (const nid of region.adjacency) {
        expect(regions[nid]!.adjacency).toContain(region.id);
      }
    }
  });

  it("has no self-loops or duplicate edges", () => {
    const { regions } = generateMap(321);
    for (const region of regions) {
      expect(region.adjacency).not.toContain(region.id);
      expect(new Set(region.adjacency).size).toBe(region.adjacency.length);
    }
  });

  it("assigns every region a valid terrain and leaves ownership unset", () => {
    const { regions } = generateMap(88);
    for (const region of regions) {
      expect(TERRAIN[region.terrain]).toBeDefined();
      // Ownership is assigned later by createGame, not by the map generator.
      expect(region.ownerId).toBeNull();
    }
  });

  it("gives every region a unique name", () => {
    const { regions } = generateMap(88);
    const names = new Set(regions.map((r) => r.name));
    expect(names.size).toBe(regions.length);
  });
});
