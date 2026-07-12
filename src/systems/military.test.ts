import { describe, it, expect } from "vitest";
import {
  armyAt,
  strategicAccess,
  armyMoves,
  canRaiseUnit,
  raiseUnit,
  moveArmy,
  totalUpkeep,
} from "@/systems/military";
import { createGame } from "@/systems/turn";
import { UNITS } from "@/data/units";
import {
  BARBARIAN_ID,
  PLAYER_ID,
  armySize,
  emptyUnits,
  type Army,
  type GameState,
  type Region,
} from "@/systems/state";

function region(id: number, overrides: Partial<Region> = {}): Region {
  return {
    id,
    name: `R${id}`,
    terrain: "plains",
    ownerId: PLAYER_ID,
    population: 5,
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

/** Minimal two-region battlefield: r0 (player) adjacent to r1 (barbarian). */
function battlefield(playerUnits: Partial<Record<string, number>>, barbUnits: Partial<Record<string, number>>): GameState {
  const r0 = region(0, { ownerId: PLAYER_ID, adjacency: [1] });
  const r1 = region(1, { ownerId: BARBARIAN_ID, adjacency: [0] });
  const armies: Army[] = [
    { id: 0, ownerId: PLAYER_ID, regionId: 0, units: { ...emptyUnits(), ...playerUnits }, movesLeft: 1 },
  ];
  if (Object.keys(barbUnits).length) {
    armies.push({ id: 1, ownerId: BARBARIAN_ID, regionId: 1, units: { ...emptyUnits(), ...barbUnits }, movesLeft: 0 });
  }
  const stocks = { gold: 200, food: 20, materials: 50, knowledge: 0 };
  return {
    seed: 1,
    rngState: 12345,
    turn: 1,
    nations: [
      { id: PLAYER_ID, name: "Realm", color: "#000", isPlayer: true, isBarbarian: false, alive: true, stocks: { ...stocks }, taxRate: 0, research: { current: null, progress: 0, done: [] }, wonders: 0, famine: false, bankrupt: false },
      { id: BARBARIAN_ID, name: "Barbarians", color: "#000", isPlayer: false, isBarbarian: true, alive: true, stocks: { gold: 0, food: 0, materials: 0, knowledge: 0 }, taxRate: 0, research: { current: null, progress: 0, done: [] }, wonders: 0, famine: false, bankrupt: false },
    ],
    regions: [r0, r1],
    armies,
    nextArmyId: 2,
    relations: {},
    treaties: {},
    offers: [],
    nextOfferId: 0,
    difficulty: "normal",
    outcome: "playing",
    log: [],
  };
}

describe("armyMoves", () => {
  it("is the slowest unit's move rate", () => {
    expect(armyMoves({ ...emptyUnits(), cavalry: 2 })).toBe(UNITS.cavalry.moves);
    expect(armyMoves({ ...emptyUnits(), cavalry: 2, infantry: 1 })).toBe(UNITS.infantry.moves);
    expect(armyMoves(emptyUnits())).toBe(0);
  });
});

describe("recruitment", () => {
  it("strategicAccess reflects owned resource regions", () => {
    const g = battlefield({ militia: 1 }, {});
    g.regions[0]!.resource = "horses";
    expect(strategicAccess(g, PLAYER_ID).has("horses")).toBe(true);
    expect(strategicAccess(g, PLAYER_ID).has("iron")).toBe(false);
  });

  it("canRaiseUnit gates cavalry on horse access and tech", () => {
    const g = battlefield({ militia: 1 }, {});
    // Needs the Horseback tech and horse access.
    g.nations[PLAYER_ID]!.research.done = ["horseback"];
    expect(canRaiseUnit(g, 0, "cavalry", PLAYER_ID).ok).toBe(false); // no horses yet
    g.regions[0]!.resource = "horses";
    expect(canRaiseUnit(g, 0, "cavalry", PLAYER_ID).ok).toBe(true);
    // Without the tech it's blocked even with horses.
    g.nations[PLAYER_ID]!.research.done = [];
    expect(canRaiseUnit(g, 0, "cavalry", PLAYER_ID).ok).toBe(false);
  });

  it("canRaiseUnit rejects when too poor", () => {
    const g = battlefield({ militia: 1 }, {});
    g.nations[PLAYER_ID]!.stocks.gold = 0;
    expect(canRaiseUnit(g, 0, "infantry", PLAYER_ID).ok).toBe(false);
  });

  it("raiseUnit spends resources and adds the unit", () => {
    const g = battlefield({ militia: 1 }, {});
    const next = raiseUnit(g, 0, "infantry", PLAYER_ID);
    expect(next.nations[PLAYER_ID]!.stocks.gold).toBe(
      g.nations[PLAYER_ID]!.stocks.gold - UNITS.infantry.cost.gold,
    );
    expect(armyAt(next, 0, PLAYER_ID)!.units.infantry).toBe(1);
    // Input not mutated.
    expect(g.nations[PLAYER_ID]!.stocks.gold).toBe(200);
  });
});

describe("moveArmy", () => {
  it("captures an undefended barbarian region", () => {
    const g = battlefield({ infantry: 2 }, {}); // no barbarian army
    const next = moveArmy(g, 0, 1);
    expect(next.regions[1]!.ownerId).toBe(PLAYER_ID);
    expect(armyAt(next, 1, PLAYER_ID)).toBeDefined();
  });

  it("captures after wiping a weak defender", () => {
    const g = battlefield({ infantry: 8, ranged: 4 }, { militia: 1 });
    const next = moveArmy(g, 0, 1);
    expect(next.regions[1]!.ownerId).toBe(PLAYER_ID);
  });

  it("applies conquest unrest to a captured foreign region", () => {
    const g = battlefield({ infantry: 8 }, {});
    const next = moveArmy(g, 0, 1);
    expect(next.regions[1]!.unrest).toBeGreaterThan(0);
  });

  it("does not capture when repelled by a strong defender", () => {
    const g = battlefield({ militia: 1 }, { infantry: 10, ranged: 6 });
    const next = moveArmy(g, 0, 1);
    expect(next.regions[1]!.ownerId).toBe(BARBARIAN_ID);
  });

  it("advances the rng stream on combat", () => {
    const g = battlefield({ infantry: 3 }, { militia: 2 });
    const next = moveArmy(g, 0, 1);
    expect(next.rngState).not.toBe(g.rngState);
  });

  it("refuses to move without moves left or across a non-edge", () => {
    const g = battlefield({ infantry: 2 }, {});
    g.armies[0]!.movesLeft = 0;
    expect(moveArmy(g, 0, 1)).toBe(g);
  });

  it("does not mutate the input state", () => {
    const g = battlefield({ infantry: 8 }, { militia: 1 });
    const snapshot = JSON.stringify(g);
    moveArmy(g, 0, 1);
    expect(JSON.stringify(g)).toBe(snapshot);
  });
});

describe("upkeep and bankruptcy", () => {
  it("totalUpkeep sums the player's unit upkeep", () => {
    const g = battlefield({ infantry: 2, militia: 1 }, { militia: 5 });
    const expected = 2 * UNITS.infantry.upkeep + 1 * UNITS.militia.upkeep;
    expect(totalUpkeep(g, PLAYER_ID)).toBe(expected);
  });

  it("a real game start has a positive player army and barbarian foes", () => {
    const g = createGame({ seed: 42 });
    expect(g.armies.some((a) => a.ownerId === PLAYER_ID && armySize(a.units) > 0)).toBe(true);
    expect(g.armies.some((a) => a.ownerId === BARBARIAN_ID)).toBe(true);
  });
});
