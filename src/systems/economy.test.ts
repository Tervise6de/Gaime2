import { describe, it, expect } from "vitest";
import { regionProduction, nationalProduction, modifierMultipliers } from "@/systems/economy";
import { TERRAIN } from "@/data/terrain";
import { PLAYER_ID, PROSPERITY_GOLD_MULT, WAR_WEARY_GOLD_MULT, type GameState, type Region } from "@/systems/state";

function region(overrides: Partial<Region> = {}): Region {
  return {
    id: 0,
    name: "Test",
    terrain: "plains",
    ownerId: PLAYER_ID,
    population: 0,
    unrest: 0,
    fortification: 0,
    resource: null,
    buildings: [],
    construction: null,
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
      nations: [{ id: PLAYER_ID, taxRate: 0, research: { current: null, progress: 0, done: [] } }],
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

describe("prosperity modifier", () => {
  it("multiplies only gold while active, and is inert once expired", () => {
    expect(modifierMultipliers([{ id: "prosperity", turnsLeft: 3 }])).toEqual({
      food: 1, materials: 1, gold: PROSPERITY_GOLD_MULT, knowledge: 1,
    });
    expect(modifierMultipliers([{ id: "prosperity", turnsLeft: 0 }]).gold).toBe(1);
    expect(modifierMultipliers([]).gold).toBe(1);
    expect(modifierMultipliers(undefined).gold).toBe(1);
  });

  it("war-weariness dents gold; opposing modifiers stack multiplicatively", () => {
    expect(modifierMultipliers([{ id: "war_weary", turnsLeft: 2 }]).gold).toBe(WAR_WEARY_GOLD_MULT);
    expect(
      modifierMultipliers([
        { id: "prosperity", turnsLeft: 2 },
        { id: "war_weary", turnsLeft: 2 },
      ]).gold,
    ).toBeCloseTo(PROSPERITY_GOLD_MULT * WAR_WEARY_GOLD_MULT, 5);
  });

  it("war-weariness compounds per simultaneous war (stacks)", () => {
    // Absent stacks behaves as a single war.
    expect(modifierMultipliers([{ id: "war_weary", turnsLeft: 2 }]).gold).toBe(WAR_WEARY_GOLD_MULT);
    // Two-front war bites twice as hard (multiplicatively).
    expect(modifierMultipliers([{ id: "war_weary", turnsLeft: 2, stacks: 2 }]).gold).toBeCloseTo(
      WAR_WEARY_GOLD_MULT ** 2,
      5,
    );
    expect(modifierMultipliers([{ id: "war_weary", turnsLeft: 2, stacks: 3 }]).gold).toBeCloseTo(
      WAR_WEARY_GOLD_MULT ** 3,
      5,
    );
  });

  it("raises a nation's gold output when active", () => {
    const base = {
      nations: [{ id: PLAYER_ID, taxRate: 0.2, research: { current: null, progress: 0, done: [] } }],
      regions: [region({ id: 0, terrain: "plains", population: 4, ownerId: PLAYER_ID })],
    } as unknown as GameState;
    const boosted = {
      ...base,
      nations: [{ ...base.nations[0], modifiers: [{ id: "prosperity", turnsLeft: 2 }] }],
    } as unknown as GameState;
    expect(nationalProduction(boosted, PLAYER_ID).gold).toBeGreaterThan(nationalProduction(base, PLAYER_ID).gold);
  });
});
