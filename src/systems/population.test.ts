import { describe, it, expect } from "vitest";
import { regionCapacity, nextPopulation } from "@/systems/population";
import { TERRAIN } from "@/data/terrain";
import { MIN_POPULATION, UNREST_REVOLT, type Region } from "@/systems/state";

function region(overrides: Partial<Region> = {}): Region {
  return {
    id: 0,
    name: "Test",
    terrain: "plains",
    ownerId: 0,
    population: 5,
    unrest: 0,
    fortification: 0,
    buildings: [],
    construction: null,
    adjacency: [],
    x: 0.5,
    y: 0.5,
    ...overrides,
  };
}

describe("regionCapacity", () => {
  it("is the terrain cap with no buildings", () => {
    expect(regionCapacity(region({ terrain: "plains" }))).toBe(TERRAIN.plains.popCapacity);
  });

  it("rises with a farm", () => {
    const base = regionCapacity(region({ buildings: [] }));
    const withFarm = regionCapacity(region({ buildings: ["farm"] }));
    expect(withFarm).toBeGreaterThan(base);
  });
});

describe("nextPopulation", () => {
  it("grows toward capacity when calm and fed", () => {
    const r = region({ population: 5, unrest: 0 });
    expect(nextPopulation(r, false)).toBeGreaterThan(5);
  });

  it("does not exceed capacity", () => {
    const cap = TERRAIN.plains.popCapacity;
    const r = region({ population: cap, unrest: 0 });
    expect(nextPopulation(r, false)).toBeLessThanOrEqual(cap);
  });

  it("starves during famine", () => {
    const r = region({ population: 10, unrest: 0 });
    expect(nextPopulation(r, true)).toBeLessThan(10);
  });

  it("never drops below the minimum", () => {
    const r = region({ population: MIN_POPULATION, unrest: 0 });
    expect(nextPopulation(r, true)).toBeGreaterThanOrEqual(MIN_POPULATION);
  });

  it("drains population during a revolt", () => {
    const r = region({ population: 10, unrest: UNREST_REVOLT });
    expect(nextPopulation(r, false)).toBeLessThan(10);
  });

  it("stalls growth when unrest is high", () => {
    const calm = nextPopulation(region({ population: 5, unrest: 0 }), false);
    const tense = nextPopulation(region({ population: 5, unrest: 50 }), false);
    expect(tense).toBeLessThan(calm);
  });
});
