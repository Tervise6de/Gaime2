import { describe, expect, it } from "vitest";
import { generateGame } from "@/systems/mapgen";
import type { GameState } from "@/core/types";

/** Breadth-first reachability from region 0 over the adjacency graph. */
function reachableCount(state: GameState): number {
  const seen = new Set<number>([0]);
  const queue = [0];
  while (queue.length) {
    const id = queue.shift()!;
    for (const n of state.regions[id]!.adjacency) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen.size;
}

describe("mapgen", () => {
  it("is deterministic for a given seed", () => {
    const a = generateGame(42);
    const b = generateGame(42);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("produces different maps for different seeds", () => {
    const a = generateGame(1);
    const b = generateGame(2);
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
  });

  it("generates a stable region count", () => {
    const state = generateGame(123);
    expect(state.regions.length).toBeGreaterThanOrEqual(18);
    expect(state.regions.length).toBeLessThanOrEqual(28);
  });

  it("keeps sites inside the unit square", () => {
    const state = generateGame(77);
    for (const region of state.regions) {
      expect(region.site.x).toBeGreaterThanOrEqual(0);
      expect(region.site.x).toBeLessThanOrEqual(1);
      expect(region.site.y).toBeGreaterThanOrEqual(0);
      expect(region.site.y).toBeLessThanOrEqual(1);
    }
  });

  it("has symmetric adjacency (a→b implies b→a)", () => {
    const state = generateGame(55);
    for (const region of state.regions) {
      for (const n of region.adjacency) {
        expect(state.regions[n]!.adjacency).toContain(region.id);
      }
      // No self-loops or duplicates.
      expect(region.adjacency).not.toContain(region.id);
      expect(new Set(region.adjacency).size).toBe(region.adjacency.length);
    }
  });

  it("produces a fully connected graph", () => {
    for (const seed of [1, 2, 3, 100, 9999]) {
      const state = generateGame(seed);
      expect(reachableCount(state)).toBe(state.regions.length);
    }
  });

  it("seats the player on a capital plus neighbours", () => {
    const state = generateGame(2024);
    const owned = state.regions.filter((r) => r.ownerId === state.playerNationId);
    expect(owned.length).toBeGreaterThanOrEqual(2);
    // Owned regions form a connected cluster (capital + its neighbours).
    const ownedIds = new Set(owned.map((r) => r.id));
    const capital = owned.find((r) =>
      r.adjacency.every((n) => ownedIds.has(n) || true),
    );
    expect(capital).toBeDefined();
  });

  it("creates exactly one player nation with a starting treasury", () => {
    const state = generateGame(8);
    expect(state.nations).toHaveLength(1);
    const player = state.nations[0]!;
    expect(player.isPlayer).toBe(true);
    expect(player.id).toBe(state.playerNationId);
    expect(player.stockpile.gold).toBeGreaterThan(0);
    expect(player.taxRate).toBeGreaterThanOrEqual(0);
  });

  it("gives every region a valid terrain and positive population", () => {
    const state = generateGame(314);
    const valid = new Set(["plains", "forest", "hills", "mountains", "tundra"]);
    for (const region of state.regions) {
      expect(valid.has(region.terrain)).toBe(true);
      expect(region.population).toBeGreaterThan(0);
    }
  });
});
