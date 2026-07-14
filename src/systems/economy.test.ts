import { describe, expect, it } from "vitest";
import {
  computeNationEconomy,
  computePlayerEconomy,
  computeRegionProduction,
} from "@/systems/economy";
import { generateGame } from "@/systems/mapgen";
import type { Region } from "@/core/types";
import { TERRAIN, COASTAL_GOLD_BONUS } from "@/data/terrain";

function makeRegion(overrides: Partial<Region> = {}): Region {
  return {
    id: 0,
    name: "Test",
    terrain: "plains",
    ownerId: 0,
    population: 6,
    site: { x: 0.5, y: 0.5 },
    adjacency: [],
    coastal: false,
    ...overrides,
  };
}

describe("computeRegionProduction", () => {
  it("matches the documented formula for a plains region at 0% tax", () => {
    const region = makeRegion({ terrain: "plains", population: 6, coastal: false });
    const p = computeRegionProduction(region, 0);
    const t = TERRAIN.plains;
    const workers = Math.min(6, t.popCapacity); // 6

    expect(p.food).toBeCloseTo(t.base.food + workers * 0.5 - 6 * 0.3, 5);
    expect(p.materials).toBeCloseTo(t.base.materials + workers * 0.3, 5);
    expect(p.knowledge).toBeCloseTo(t.base.knowledge + workers * 0.1, 5);
    expect(p.gold).toBeCloseTo(t.base.gold + workers * 0.2, 5);
  });

  it("caps workers at terrain population capacity", () => {
    const t = TERRAIN.mountains; // capacity 4
    const region = makeRegion({ terrain: "mountains", population: 100 });
    const p = computeRegionProduction(region, 0);
    const workers = t.popCapacity; // 4, not 100
    // Materials only grows with workers, so it should reflect the cap.
    expect(p.materials).toBeCloseTo(t.base.materials + workers * 0.3, 5);
  });

  it("applies the coastal trade bonus to gold", () => {
    const inland = computeRegionProduction(makeRegion({ coastal: false }), 0);
    const coastal = computeRegionProduction(makeRegion({ coastal: true }), 0);
    expect(coastal.gold - inland.gold).toBeCloseTo(COASTAL_GOLD_BONUS, 5);
  });

  it("increases gold with the tax rate but leaves other resources unchanged", () => {
    const region = makeRegion();
    const low = computeRegionProduction(region, 0);
    const high = computeRegionProduction(region, 0.4);
    expect(high.gold).toBeGreaterThan(low.gold);
    expect(high.gold).toBeCloseTo(low.gold * 1.4, 5);
    expect(high.food).toBeCloseTo(low.food, 5);
    expect(high.materials).toBeCloseTo(low.materials, 5);
  });
});

describe("computeNationEconomy", () => {
  it("only sums regions the nation owns", () => {
    const state = generateGame(2024);
    const player = state.nations[0]!;
    const econ = computeNationEconomy(state, player);
    const ownedCount = state.regions.filter((r) => r.ownerId === player.id).length;
    expect(econ.perRegion).toHaveLength(ownedCount);
  });

  it("totals equal the sum of per-region production", () => {
    const state = generateGame(2024);
    const player = state.nations[0]!;
    const econ = computeNationEconomy(state, player);
    const sumGold = econ.perRegion.reduce((s, r) => s + r.gold, 0);
    expect(econ.totals.gold).toBeCloseTo(sumGold, 1);
  });

  it("computePlayerEconomy resolves the player nation", () => {
    const state = generateGame(11);
    const viaPlayer = computePlayerEconomy(state);
    const viaNation = computeNationEconomy(state, state.nations[0]!);
    expect(viaPlayer.totals).toEqual(viaNation.totals);
  });

  it("does not mutate the input state", () => {
    const state = generateGame(3);
    const before = JSON.stringify(state);
    computePlayerEconomy(state);
    expect(JSON.stringify(state)).toEqual(before);
  });
});
