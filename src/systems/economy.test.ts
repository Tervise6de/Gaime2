import { describe, it, expect } from "vitest";
import { regionProduction, nationalProduction } from "@/systems/economy";
import { TERRAIN } from "@/data/terrain";
import { PLAYER_ID, type GameState, type Region } from "@/systems/state";

function region(overrides: Partial<Region> = {}): Region {
  return {
    id: 0,
    name: "Test",
    terrain: "plains",
    ownerId: PLAYER_ID,
    population: 0,
    unrest: 0,
    fortification: 0,
    buildings: [],
    adjacency: [],
    x: 0.5,
    y: 0.5,
    ...overrides,
  };
}

describe("region production", () => {
  it("with zero population equals the terrain base (untaxed)", () => {
    const flow = regionProduction(region({ terrain: "plains", population: 0 }), 0);
    expect(flow).toEqual(TERRAIN.plains.base);
  });

  it("tax multiplies only gold, not other resources", () => {
    const untaxed = regionProduction(region({ population: 0 }), 0);
    const taxed = regionProduction(region({ population: 0 }), 0.4);
    expect(taxed.gold).toBeGreaterThan(untaxed.gold);
    expect(taxed.food).toBe(untaxed.food);
    expect(taxed.materials).toBe(untaxed.materials);
    expect(taxed.knowledge).toBe(untaxed.knowledge);
  });

  it("population increases food, materials, and gold output", () => {
    const empty = regionProduction(region({ population: 0 }), 0);
    const peopled = regionProduction(region({ population: 6 }), 0);
    expect(peopled.food).toBeGreaterThan(empty.food);
    expect(peopled.materials).toBeGreaterThan(empty.materials);
    expect(peopled.gold).toBeGreaterThan(empty.gold);
  });

  it("mountains with no population run a food deficit is impossible at pop 0", () => {
    // Mountains base food is 0; with population they consume more than they work
    // only past a point — sanity check the formula stays finite and rounded.
    const flow = regionProduction(region({ terrain: "mountains", population: 4 }), 0);
    expect(Number.isFinite(flow.food)).toBe(true);
    expect(Math.round(flow.food * 10) / 10).toBe(flow.food);
  });
});

describe("national production", () => {
  it("sums only regions the nation owns", () => {
    const state = {
      taxRate: 0,
      regions: [
        region({ id: 0, terrain: "plains", population: 0, ownerId: PLAYER_ID }),
        region({ id: 1, terrain: "plains", population: 0, ownerId: PLAYER_ID }),
        region({ id: 2, terrain: "plains", population: 0, ownerId: 1 }),
      ],
    } as unknown as GameState;

    const flow = nationalProduction(state, PLAYER_ID);
    // Two owned plains regions, base food 4 each.
    expect(flow.food).toBe(TERRAIN.plains.base.food * 2);
  });
});
