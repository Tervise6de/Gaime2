import { describe, it, expect } from "vitest";
import {
  armyAt,
  strategicAccess,
  armyMoves,
  canRaiseUnit,
  raiseUnit,
  moveArmy,
  moveDetachment,
  disbandUnits,
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

/** Three owned player regions in a line (0–1–2), one army in region 0. */
function realm(r0Army: Partial<Record<string, number>>): GameState {
  const r0 = region(0, { ownerId: PLAYER_ID, adjacency: [1] });
  const r1 = region(1, { ownerId: PLAYER_ID, adjacency: [0, 2] });
  const r2 = region(2, { ownerId: PLAYER_ID, adjacency: [1] });
  const armies: Army[] = [
    { id: 0, ownerId: PLAYER_ID, regionId: 0, units: { ...emptyUnits(), ...r0Army }, movesLeft: 2 },
  ];
  return {
    seed: 1,
    rngState: 123,
    turn: 1,
    nations: [
      { id: PLAYER_ID, name: "Realm", color: "#000", isPlayer: true, isBarbarian: false, alive: true, stocks: { gold: 200, food: 20, materials: 50, knowledge: 0 }, taxRate: 0, research: { current: null, progress: 0, done: [] }, wonders: 0, famine: false, bankrupt: false },
    ],
    regions: [r0, r1, r2],
    armies,
    nextArmyId: 1,
    relations: {},
    treaties: {},
    offers: [],
    nextOfferId: 0,
    difficulty: "normal",
    outcome: "playing",
    log: [],
  };
}

describe("moveDetachment (split / detach / reinforce)", () => {
  it("splits a subset into an empty own region, leaving the remainder in place", () => {
    const g = realm({ infantry: 3, cavalry: 2 });
    const next = moveDetachment(g, 0, 1, { cavalry: 2 });
    const parent = armyAt(next, 0, PLAYER_ID)!;
    const detach = armyAt(next, 1, PLAYER_ID)!;
    expect(parent.units.infantry).toBe(3);
    expect(parent.units.cavalry).toBe(0);
    expect(detach.units.cavalry).toBe(2);
    expect(detach.units.infantry).toBe(0);
    expect(detach.movesLeft).toBe(1); // spent one step arriving
    expect(parent.movesLeft).toBe(2); // the parent never moved
  });

  it("reinforces a friendly stack instead of creating a second one", () => {
    const g = realm({ infantry: 3, cavalry: 2 });
    g.armies.push({ id: 5, ownerId: PLAYER_ID, regionId: 1, units: { ...emptyUnits(), militia: 1 }, movesLeft: 1 });
    g.nextArmyId = 6;
    const next = moveDetachment(g, 0, 1, { cavalry: 2 });
    const atR1 = next.armies.filter((a) => a.regionId === 1 && a.ownerId === PLAYER_ID);
    expect(atR1).toHaveLength(1);
    expect(atR1[0]!.units.militia).toBe(1);
    expect(atR1[0]!.units.cavalry).toBe(2);
  });

  it("refuses to detach into foreign territory (attacking uses moveArmy)", () => {
    const g = realm({ infantry: 3 });
    g.regions[1]!.ownerId = 2; // a rival owns the neighbour
    expect(moveDetachment(g, 0, 1, { infantry: 1 })).toBe(g);
  });

  it("selecting the whole stack degrades to a normal relocate", () => {
    const g = realm({ infantry: 2 });
    const next = moveDetachment(g, 0, 1, { infantry: 2 });
    expect(next.armies.filter((a) => a.regionId === 0)).toHaveLength(0);
    expect(armyAt(next, 1, PLAYER_ID)!.units.infantry).toBe(2);
  });

  it("clamps an over-request and no-ops an empty selection", () => {
    const g = realm({ infantry: 2 });
    expect(armyAt(moveDetachment(g, 0, 1, { infantry: 9 }), 1, PLAYER_ID)!.units.infantry).toBe(2);
    expect(moveDetachment(g, 0, 1, { cavalry: 1 })).toBe(g); // no cavalry to send
  });

  it("no-ops without moves left and never mutates the input", () => {
    const g = realm({ infantry: 3 });
    g.armies[0]!.movesLeft = 0;
    expect(moveDetachment(g, 0, 1, { infantry: 1 })).toBe(g);
    const g2 = realm({ infantry: 3, cavalry: 2 });
    const snap = JSON.stringify(g2);
    moveDetachment(g2, 0, 1, { cavalry: 1 });
    expect(JSON.stringify(g2)).toBe(snap);
  });
});

describe("disbandUnits", () => {
  it("disbands a subset and cuts upkeep", () => {
    const g = realm({ infantry: 3, cavalry: 2 });
    const before = totalUpkeep(g, PLAYER_ID);
    const next = disbandUnits(g, 0, { cavalry: 2 });
    expect(armyAt(next, 0, PLAYER_ID)!.units.cavalry).toBe(0);
    expect(armyAt(next, 0, PLAYER_ID)!.units.infantry).toBe(3);
    expect(totalUpkeep(next, PLAYER_ID)).toBe(before - 2 * UNITS.cavalry.upkeep);
  });

  it("removes the army when everything is disbanded (clamping an over-request)", () => {
    const g = realm({ militia: 2 });
    expect(disbandUnits(g, 0, { militia: 9 }).armies.filter((a) => a.ownerId === PLAYER_ID)).toHaveLength(0);
  });
});

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

  it("canRaiseUnit gates pikemen on Feudalism, but needs no strategic resource", () => {
    const g = battlefield({ militia: 1 }, {});
    expect(canRaiseUnit(g, 0, "pikeman", PLAYER_ID).ok).toBe(false); // no tech yet
    g.nations[PLAYER_ID]!.research.done = ["feudalism"];
    // Unlike cavalry/siege, pikemen draw on no resource — the tech alone unlocks them.
    expect(canRaiseUnit(g, 0, "pikeman", PLAYER_ID).ok).toBe(true);
  });

  it("canRaiseUnit gates handgunners on Gunpowder and iron access", () => {
    const g = battlefield({ militia: 1 }, {});
    g.nations[PLAYER_ID]!.research.done = ["gunpowder"];
    expect(canRaiseUnit(g, 0, "handgunner", PLAYER_ID).ok).toBe(false); // no iron yet
    g.regions[0]!.resource = "iron";
    expect(canRaiseUnit(g, 0, "handgunner", PLAYER_ID).ok).toBe(true);
    // Without the tech it's blocked even with iron.
    g.nations[PLAYER_ID]!.research.done = [];
    expect(canRaiseUnit(g, 0, "handgunner", PLAYER_ID).ok).toBe(false);
  });

  it("canRaiseUnit gates swordsmen on Standing Army and iron access", () => {
    const g = battlefield({ militia: 1 }, {});
    g.nations[PLAYER_ID]!.research.done = ["standing_army"];
    expect(canRaiseUnit(g, 0, "swordsman", PLAYER_ID).ok).toBe(false); // no iron yet
    g.regions[0]!.resource = "iron";
    expect(canRaiseUnit(g, 0, "swordsman", PLAYER_ID).ok).toBe(true);
    g.nations[PLAYER_ID]!.research.done = []; // tech removed → blocked even with iron
    expect(canRaiseUnit(g, 0, "swordsman", PLAYER_ID).ok).toBe(false);
  });

  it("canRaiseUnit gates knights on Feudalism and horse access", () => {
    const g = battlefield({ militia: 1 }, {});
    g.nations[PLAYER_ID]!.research.done = ["feudalism"];
    expect(canRaiseUnit(g, 0, "knight", PLAYER_ID).ok).toBe(false); // no horses yet
    g.regions[0]!.resource = "horses";
    expect(canRaiseUnit(g, 0, "knight", PLAYER_ID).ok).toBe(true);
    g.nations[PLAYER_ID]!.research.done = []; // tech removed → blocked even with horses
    expect(canRaiseUnit(g, 0, "knight", PLAYER_ID).ok).toBe(false);
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

  it("raises a tech-unlocked pikeman into the field", () => {
    const g = battlefield({ militia: 1 }, {});
    g.nations[PLAYER_ID]!.research.done = ["feudalism"];
    const next = raiseUnit(g, 0, "pikeman", PLAYER_ID);
    expect(armyAt(next, 0, PLAYER_ID)!.units.pikeman).toBe(1);
    // A gate miss is a no-op: without the tech the state is returned untouched.
    expect(raiseUnit(battlefield({ militia: 1 }, {}), 0, "pikeman", PLAYER_ID).armies[0]!.units.pikeman).toBe(0);
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

  it("logs both sides' casualties after a defended battle (in soldiers)", () => {
    const g = battlefield({ infantry: 8, ranged: 4 }, { militia: 3, infantry: 1 });
    const next = moveArmy(g, 0, 1);
    expect(next.log.some((l) => /\(losses [\d,]+ vs [\d,]+ soldiers\)/.test(l))).toBe(true);
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

  it("merges when moving onto a friendly stack, and logs it", () => {
    const g = battlefield({ infantry: 2 }, {});
    g.regions[1] = region(1, { ownerId: PLAYER_ID, adjacency: [0] });
    g.armies.push({
      id: 1,
      ownerId: PLAYER_ID,
      regionId: 1,
      units: { ...emptyUnits(), militia: 3 },
      movesLeft: 1,
    });
    const next = moveArmy(g, 0, 1);
    expect(next.armies).toHaveLength(1);
    const merged = armyAt(next, 1, PLAYER_ID)!;
    expect(armySize(merged.units)).toBe(5);
    expect(merged.units.infantry).toBe(2);
    expect(merged.units.militia).toBe(3);
    expect(
      next.log.some((l) => l.includes("merged") && l.includes("2,000 + 3,000 = 5,000 soldiers")),
    ).toBe(true);
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
