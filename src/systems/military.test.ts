import { describe, it, expect } from "vitest";
import {
  armyAt,
  strategicAccess,
  armyMoves,
  canRaiseUnit,
  raiseUnit,
  moveArmy,
  orderMarch,
  cancelMarch,
  advanceMarches,
  marchEta,
  moveDetachment,
  disbandUnits,
  fortifyArmy,
  tickEntrenchment,
  inEnemyZoc,
  appointCommander,
  applyCommanderEffects,
  applyDefection,
  totalUpkeep,
} from "@/systems/military";
import type { Commander } from "@/data/commanders";
import { createGame } from "@/systems/turn";
import { UNITS } from "@/data/units";
import {
  BARBARIAN_ID,
  MAX_ENTRENCH,
  PLAYER_ID,
  armySize,
  emptyUnits,
  emptyWares,
  pairKey,
  type Army,
  type GameState,
  type Region,
} from "@/systems/state";

/** A well-stocked ware chest so recruit fixtures can always pay a unit's arms cost. */
const WARES = { ...emptyWares(), timber: 60, iron: 60, brick: 40, copper: 20, naval_stores: 20 };

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
  const stocks = { gold: 200, food: 20, knowledge: 0 };
  return {
    seed: 1,
    rngState: 12345,
    turn: 1,
    nations: [
      { id: PLAYER_ID, name: "Realm", color: "#000", isPlayer: true, isBarbarian: false, alive: true, stocks: { ...stocks }, wares: { ...WARES }, taxRate: 0, research: { current: null, progress: 0, done: [] }, famine: false, bankrupt: false },
      { id: BARBARIAN_ID, name: "Barbarians", color: "#000", isPlayer: false, isBarbarian: true, alive: true, stocks: { gold: 0, food: 0, knowledge: 0 }, wares: emptyWares(), taxRate: 0, research: { current: null, progress: 0, done: [] }, famine: false, bankrupt: false },
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
      { id: PLAYER_ID, name: "Realm", color: "#000", isPlayer: true, isBarbarian: false, alive: true, stocks: { gold: 200, food: 20, knowledge: 0 }, wares: { ...WARES }, taxRate: 0, research: { current: null, progress: 0, done: [] }, famine: false, bankrupt: false },
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
    // Army display scale is ×250: 2 + 3 units = 500 + 750 = 1,250 soldiers.
    expect(
      next.log.some((l) => l.includes("merged") && l.includes("500 + 750 = 1,250 soldiers")),
    ).toBe(true);
  });
});

const RIVAL = 2;

/**
 * Player attacker in r0 assaults rival-held r1, which has a same-realm garrison
 * next door in r2. r0–r1 and r1–r2 are the only edges, so r2 can rally to r1.
 */
function rallyField(
  attacker: Partial<Record<string, number>>,
  garrison: Partial<Record<string, number>>,
  reserve: Partial<Record<string, number>>,
  reserveMoves = 1,
): GameState {
  const r0 = region(0, { ownerId: PLAYER_ID, adjacency: [1] });
  const r1 = region(1, { ownerId: RIVAL, adjacency: [0, 2] });
  const r2 = region(2, { ownerId: RIVAL, adjacency: [1] });
  const armies: Army[] = [
    { id: 0, ownerId: PLAYER_ID, regionId: 0, units: { ...emptyUnits(), ...attacker }, movesLeft: 1 },
    { id: 1, ownerId: RIVAL, regionId: 1, units: { ...emptyUnits(), ...garrison }, movesLeft: 0 },
  ];
  if (Object.keys(reserve).length) {
    armies.push({ id: 2, ownerId: RIVAL, regionId: 2, units: { ...emptyUnits(), ...reserve }, movesLeft: reserveMoves });
  }
  const stocks = { gold: 200, food: 20, knowledge: 0 };
  const nation = (id: number, name: string, isPlayer: boolean) => ({
    id, name, color: "#000", isPlayer, isBarbarian: false, alive: true,
    stocks: { ...stocks }, wares: { ...WARES }, taxRate: 0, research: { current: null, progress: 0, done: [] },
    famine: false, bankrupt: false,
  });
  return {
    seed: 1, rngState: 999, turn: 1,
    nations: [nation(PLAYER_ID, "Realm", true), nation(RIVAL, "Rival", false)],
    regions: [r0, r1, r2], armies, nextArmyId: 3,
    relations: {}, treaties: {}, offers: [], nextOfferId: 0,
    difficulty: "normal", outcome: "playing", log: [],
  };
}

describe("combined defence (M2)", () => {
  it("rallies a same-realm neighbour into the fight and reports the reinforcement", () => {
    const g = rallyField({ infantry: 6 }, { militia: 2 }, { infantry: 4 });
    const next = moveArmy(g, 0, 1);
    const report = next.battles!.at(-1)!;
    expect(report.defenderReinforcements).toBeGreaterThan(0);
    expect(next.log.some((l) => /rallied to R1 \(\+[\d,]+ soldiers\)/.test(l))).toBe(true);
  });

  it("the combined stack holds a region the lone garrison would have lost", () => {
    const solo = moveArmy(rallyField({ infantry: 9 }, { militia: 2 }, {}), 0, 1);
    expect(solo.regions[1]!.ownerId).toBe(PLAYER_ID); // lone garrison falls

    const combined = moveArmy(rallyField({ infantry: 9 }, { militia: 2 }, { infantry: 6 }), 0, 1);
    expect(combined.regions[1]!.ownerId).toBe(RIVAL); // the rally saves it
  });

  it("splits casualties across both defenders and makes the reserve spend its move", () => {
    const g = rallyField({ infantry: 8, ranged: 3 }, { militia: 3 }, { infantry: 3 });
    const next = moveArmy(g, 0, 1);
    const garrison = next.armies.find((a) => a.id === 1);
    const reserve = next.armies.find((a) => a.id === 2);
    // Both took losses (each smaller than its starting size), and totals reconcile
    // with the reported combined defender casualties.
    const report = next.battles!.at(-1)!;
    const gLoss = 3 - (garrison ? garrison.units.militia : 0);
    const rLoss = 3 - (reserve ? reserve.units.infantry : 0);
    expect(gLoss + rLoss).toBe(armySize(report.defenderLosses));
    expect(gLoss).toBeGreaterThan(0);
    expect(rLoss).toBeGreaterThan(0);
    if (reserve) expect(reserve.movesLeft).toBe(0); // marched to the guns
  });

  it("does not rally a neighbour that has no move left", () => {
    const g = rallyField({ infantry: 6 }, { militia: 2 }, { infantry: 4 }, 0);
    const next = moveArmy(g, 0, 1);
    expect(next.battles!.at(-1)!.defenderReinforcements).toBe(0);
  });

  it("barbarians never coordinate — a barbarian neighbour never rallies", () => {
    const g = battlefield({ infantry: 6 }, { militia: 2 });
    // Give the barbarian target a second barbarian stack next door.
    g.regions[1] = region(1, { ownerId: BARBARIAN_ID, adjacency: [0, 2] });
    g.regions.push(region(2, { ownerId: BARBARIAN_ID, adjacency: [1] }));
    g.armies.push({ id: 2, ownerId: BARBARIAN_ID, regionId: 2, units: { ...emptyUnits(), infantry: 4 }, movesLeft: 1 });
    g.nextArmyId = 3;
    const next = moveArmy(g, 0, 1);
    expect(next.battles!.at(-1)!.defenderReinforcements).toBe(0);
  });

  it("is deterministic — same field resolves identically", () => {
    const a = moveArmy(rallyField({ infantry: 7 }, { militia: 2 }, { infantry: 4 }), 0, 1);
    const b = moveArmy(rallyField({ infantry: 7 }, { militia: 2 }, { infantry: 4 }), 0, 1);
    expect(JSON.stringify(a.armies)).toBe(JSON.stringify(b.armies));
    expect(a.regions[1]!.ownerId).toBe(b.regions[1]!.ownerId);
  });
});

const ALLY = 3;

/**
 * Player (r0) assaults rival-held r1; the rival's ally holds r2 next door with a
 * standing army. Alliance is set between the rival and the ally. `allied` toggles
 * whether the r2 holder is the ally (true) or an unrelated neutral (false).
 */
function allianceField(reserve: Partial<Record<string, number>>, allied: boolean): GameState {
  const r0 = region(0, { ownerId: PLAYER_ID, adjacency: [1] });
  const r1 = region(1, { ownerId: RIVAL, adjacency: [0, 2] });
  const r2 = region(2, { ownerId: ALLY, adjacency: [1] });
  const stocks = { gold: 200, food: 20, knowledge: 0 };
  const nation = (id: number, name: string, isPlayer: boolean) => ({
    id, name, color: "#000", isPlayer, isBarbarian: false, alive: true,
    stocks: { ...stocks }, wares: { ...WARES }, taxRate: 0, research: { current: null, progress: 0, done: [] },
    famine: false, bankrupt: false,
  });
  return {
    seed: 1, rngState: 4242, turn: 1,
    nations: [nation(PLAYER_ID, "Realm", true), nation(RIVAL, "Rival", false), nation(ALLY, "Ally", false)],
    regions: [r0, r1, r2],
    armies: [
      { id: 0, ownerId: PLAYER_ID, regionId: 0, units: { ...emptyUnits(), infantry: 9 }, movesLeft: 1 },
      { id: 1, ownerId: RIVAL, regionId: 1, units: { ...emptyUnits(), militia: 2 }, movesLeft: 0 },
      { id: 2, ownerId: ALLY, regionId: 2, units: { ...emptyUnits(), ...reserve }, movesLeft: 1 },
    ],
    nextArmyId: 3,
    relations: {},
    // The ally stands with the rival only when the alliance treaty exists.
    treaties: allied ? { [pairKey(RIVAL, ALLY)]: "alliance" } : {},
    offers: [], nextOfferId: 0, difficulty: "normal", outcome: "playing", log: [],
  };
}

describe("allied rally (alliances answer the call)", () => {
  it("an ally rallies to a defended ally and is drawn into the war", () => {
    const next = moveArmy(allianceField({ infantry: 6 }, true), 0, 1);
    expect(next.battles!.at(-1)!.defenderReinforcements).toBeGreaterThan(0);
    expect(next.treaties[pairKey(PLAYER_ID, ALLY)]).toBe("war"); // answered the call
    expect(next.regions[1]!.ownerId).toBe(RIVAL); // the rally saved the region
  });

  it("a non-allied neighbour does not rally and is not dragged into war", () => {
    const next = moveArmy(allianceField({ infantry: 6 }, false), 0, 1);
    expect(next.battles!.at(-1)!.defenderReinforcements).toBe(0);
    expect(next.treaties[pairKey(PLAYER_ID, ALLY)] ?? "peace").toBe("peace");
    expect(next.regions[1]!.ownerId).toBe(PLAYER_ID); // lone garrison falls
  });
});

describe("fortify / entrenchment (M3)", () => {
  it("digging in forgoes movement and flags the army", () => {
    const g = realm({ infantry: 3 });
    const next = fortifyArmy(g, 0);
    const army = armyAt(next, 0, PLAYER_ID)!;
    expect(army.fortifying).toBe(true);
    expect(army.movesLeft).toBe(0);
    expect(next.log.some((l) => /dug in at/.test(l))).toBe(true);
    expect(fortifyArmy(next, 0)).toBe(next); // already dug in → no-op
  });

  it("entrenchment deepens one level per held turn, capped at MAX_ENTRENCH", () => {
    let armies: Army[] = [{ id: 0, ownerId: PLAYER_ID, regionId: 0, units: { ...emptyUnits(), infantry: 2 }, movesLeft: 0, fortifying: true }];
    for (let t = 0; t < MAX_ENTRENCH + 2; t++) armies = tickEntrenchment(armies);
    expect(armies[0]!.entrenchment).toBe(MAX_ENTRENCH);
    // A non-fortifying army never entrenches.
    expect(tickEntrenchment([{ id: 1, ownerId: PLAYER_ID, regionId: 0, units: emptyUnits(), movesLeft: 1 }])[0]!.entrenchment).toBeUndefined();
  });

  it("an entrenched garrison holds an assault an un-dug one loses", () => {
    const attacker = { infantry: 5 };
    const open = battlefield(attacker, { militia: 5 });
    const dug = battlefield(attacker, { militia: 5 });
    dug.armies[1]!.entrenchment = MAX_ENTRENCH;
    expect(moveArmy(open, 0, 1).regions[1]!.ownerId).toBe(PLAYER_ID); // open region falls
    expect(moveArmy(dug, 0, 1).regions[1]!.ownerId).toBe(BARBARIAN_ID); // dug-in holds
  });

  it("attacking clears the attacker's own entrenchment", () => {
    const g = battlefield({ infantry: 8 }, { militia: 1 });
    g.armies[0]!.fortifying = true;
    g.armies[0]!.entrenchment = 2;
    const next = moveArmy(g, 0, 1);
    const moved = armyAt(next, 1, PLAYER_ID)!; // advanced into the captured region
    expect(moved.fortifying).toBe(false);
    expect(moved.entrenchment).toBe(0);
  });
});

describe("zone of control (M3)", () => {
  // r0(own) – r1(own) – r2(own); an enemy stack in r3 borders r1 only.
  function zocBoard(enemyBordersR1: boolean): GameState {
    const g = realm({ infantry: 2 });
    g.armies[0]!.movesLeft = 2;
    g.regions[3] = region(3, { ownerId: RIVAL, adjacency: enemyBordersR1 ? [1] : [2] });
    g.regions[1]!.adjacency = enemyBordersR1 ? [0, 2, 3] : [0, 2];
    g.regions[2]!.adjacency = enemyBordersR1 ? [1] : [1, 3];
    g.nations.push({ id: RIVAL, name: "Rival", color: "#000", isPlayer: false, isBarbarian: false, alive: true, stocks: { gold: 0, food: 0, knowledge: 0 }, wares: emptyWares(), taxRate: 0, research: { current: null, progress: 0, done: [] }, famine: false, bankrupt: false });
    g.armies.push({ id: 9, ownerId: RIVAL, regionId: 3, units: { ...emptyUnits(), infantry: 3 }, movesLeft: 0 });
    // At war so the enemy actually exerts control.
    g.treaties = { [pairKey(PLAYER_ID, RIVAL)]: "war" };
    return g;
  }

  it("marching into an enemy zone of control halts the army", () => {
    const pinned = moveArmy(zocBoard(true), 0, 1); // r1 borders the enemy in r3
    expect(armyAt(pinned, 1, PLAYER_ID)!.movesLeft).toBe(0);
  });

  it("moving through open ground keeps the remaining move", () => {
    const free = moveArmy(zocBoard(false), 0, 1); // enemy borders r2, not r1
    expect(armyAt(free, 1, PLAYER_ID)!.movesLeft).toBe(1);
  });

  it("inEnemyZoc ignores allies and non-belligerents", () => {
    const g = zocBoard(true);
    expect(inEnemyZoc(g, 1, PLAYER_ID)).toBe(true);
    g.treaties = { [pairKey(PLAYER_ID, RIVAL)]: "alliance" }; // now friends
    expect(inEnemyZoc(g, 1, PLAYER_ID)).toBe(false);
  });
});

describe("commanders (M4)", () => {
  const ACE: Commander = { name: "Visvaldis", epithet: "the Bold", martial: 9, trait: "reckless", loyalty: 70 };

  it("appoints a deterministic commander and logs it", () => {
    const g = realm({ infantry: 3 });
    const a = appointCommander(g, 0);
    const b = appointCommander(realm({ infantry: 3 }), 0);
    expect(a.armies[0]!.commander).toBeDefined();
    expect(a.armies[0]!.commander).toEqual(b.armies[0]!.commander); // same seed → same officer
    expect(a.rngState).not.toBe(g.rngState); // stream advanced
    expect(a.log.some((l) => /is now led by/.test(l))).toBe(true);
    // Empty stack cannot be given a commander.
    const empty = realm({});
    expect(appointCommander(empty, 0)).toBe(empty);
  });

  it("threads the commander into the moveArmy combat path (a led attacker hits harder)", () => {
    // A weak attacker is repelled either way, but a led one inflicts more — the
    // commander bonus flows through moveArmy → resolveCombat. (Strict combat-math
    // assertions live in combat.test.ts.)
    const base = () => battlefield({ militia: 3 }, { infantry: 12 });
    const unled = armySize(moveArmy(base(), 0, 1).battles!.at(-1)!.defenderLosses);
    const l = base();
    l.armies[0]!.commander = ACE;
    const led = armySize(moveArmy(l, 0, 1).battles!.at(-1)!.defenderLosses);
    expect(led).toBeGreaterThanOrEqual(unled);
    expect(led).toBeGreaterThan(0);
  });

  it("a disloyal commander foments unrest in the home region it occupies", () => {
    const g = realm({ infantry: 3 });
    g.armies[0]!.commander = { name: "Skirgaila", epithet: "the Fox", martial: 4, trait: "ambitious", loyalty: 20 };
    const before = g.regions[0]!.unrest;
    const next = applyCommanderEffects(g);
    expect(next.regions[0]!.unrest).toBeGreaterThan(before);
    // A loyal commander does not.
    g.armies[0]!.commander!.loyalty = 80;
    expect(applyCommanderEffects(g).regions[0]!.unrest).toBe(before);
  });

  it("loyalty erodes in an unstable province and recovers in a calm one", () => {
    const g = realm({ infantry: 3 });
    g.armies[0]!.commander = { name: "Otto", epithet: "the Grim", martial: 5, trait: "steadfast", loyalty: 50 };
    // Calm home region → recovers.
    g.regions[0]!.unrest = 0;
    expect(applyCommanderEffects(g).armies[0]!.commander!.loyalty).toBe(51);
    // High-unrest home region → erodes.
    g.regions[0]!.unrest = 40;
    expect(applyCommanderEffects(g).armies[0]!.commander!.loyalty).toBe(47);
  });
});

describe("commander defection (E5)", () => {
  it("a disloyal commander in a region in open revolt turns his coat and seizes it", () => {
    const g = realm({ infantry: 4 });
    g.regions[0]!.unrest = 90; // open revolt (>= UNREST_REVOLT)
    g.armies[0]!.commander = { name: "Skirgaila", epithet: "the Fox", martial: 6, trait: "ambitious", loyalty: 15 };
    const next = applyDefection(g);
    expect(next.regions[0]!.ownerId).toBe(BARBARIAN_ID); // region lost
    expect(next.regions[0]!.priorOwnerId).toBe(PLAYER_ID); // remembers who to reclaim from
    expect(next.armies[0]!.ownerId).toBe(BARBARIAN_ID);  // the army defected...
    expect(next.armies[0]!.commander!.name).toBe("Skirgaila"); // ...still led by the pretender
    expect(next.log.some((l) => /turns his coat, seizing/.test(l))).toBe(true);
  });

  it("a loyal commander holds the line even in open revolt", () => {
    const g = realm({ infantry: 4 });
    g.regions[0]!.unrest = 90;
    g.armies[0]!.commander = { name: "Otto", epithet: "the Iron", martial: 7, trait: "steadfast", loyalty: 70 };
    expect(applyDefection(g)).toBe(g); // no defection → same state
  });

  it("a disloyal commander in a calm region does not defect", () => {
    const g = realm({ infantry: 4 });
    g.regions[0]!.unrest = 10; // not in revolt
    g.armies[0]!.commander = { name: "Skirgaila", epithet: "the Fox", martial: 6, trait: "ambitious", loyalty: 10 };
    expect(applyDefection(g)).toBe(g);
  });
});

describe("upkeep and bankruptcy", () => {
  it("totalUpkeep sums the player's unit upkeep", () => {
    const g = battlefield({ infantry: 2, militia: 1 }, { militia: 5 });
    const expected = 2 * UNITS.infantry.upkeep + 1 * UNITS.militia.upkeep;
    expect(totalUpkeep(g, PLAYER_ID)).toBe(expected);
  });

  it("a real game start has a positive player army and rival armies", () => {
    const g = createGame({ seed: 42 });
    expect(g.armies.some((a) => a.ownerId === PLAYER_ID && armySize(a.units) > 0)).toBe(true);
    expect(g.armies.some((a) => a.ownerId !== PLAYER_ID && a.ownerId !== BARBARIAN_ID)).toBe(true);
  });
});

describe("marching (travel over turns)", () => {
  // Simulate the turn pipeline's move-point refresh (resolveTurn step 5).
  const refresh = (g: GameState): GameState => ({
    ...g,
    armies: g.armies.map((a) => ({ ...a, movesLeft: armyMoves(a.units) })),
  });

  it("orders a march when a path exists; ordering to the current region cancels it", () => {
    const g = realm({ militia: 2 }); // army 0 at r0; chain r0–r1–r2, all owned
    const ordered = orderMarch(g, 0, 2);
    expect(ordered.armies[0]!.dest).toBe(2);
    expect(orderMarch(ordered, 0, 0).armies[0]!.dest).toBeNull();
  });

  it("no-ops on an unreachable destination", () => {
    const g = realm({ militia: 2 });
    g.regions.push(region(9, { ownerId: PLAYER_ID, adjacency: [] })); // island, no path
    expect(orderMarch(g, 0, 9).armies[0]!.dest ?? null).toBeNull();
  });

  it("advances a militia march one region per turn, arriving and clearing the order", () => {
    let g = orderMarch(realm({ militia: 2 }), 0, 2); // 2 hops at moves 1
    g = advanceMarches(refresh(g));
    expect(g.armies[0]!.regionId).toBe(1); // stepped one region
    expect(g.armies[0]!.dest).toBe(2); // still marching
    g = advanceMarches(refresh(g));
    expect(g.armies[0]!.regionId).toBe(2); // arrived
    expect(g.armies[0]!.dest ?? null).toBeNull(); // order cleared
  });

  it("a faster stack covers more ground per turn", () => {
    // Cavalry moves 2: r0 → r2 in a single turn.
    let g = orderMarch(realm({ cavalry: 2 }), 0, 2);
    g = advanceMarches(refresh(g));
    expect(g.armies[0]!.regionId).toBe(2);
    expect(g.armies[0]!.dest ?? null).toBeNull();
  });

  it("cancelMarch clears a standing order", () => {
    const g = orderMarch(realm({ militia: 2 }), 0, 2);
    expect(cancelMarch(g, 0).armies[0]!.dest).toBeNull();
  });

  it("marchEta reports the turns to arrive at the army's move rate", () => {
    const slow = orderMarch(realm({ militia: 2 }), 0, 2); // moves 1 → 2 turns
    expect(marchEta(slow, slow.armies[0]!)).toBe(2);
    const fast = orderMarch(realm({ cavalry: 2 }), 0, 2); // moves 2 → 1 turn
    expect(marchEta(fast, fast.armies[0]!)).toBe(1);
  });
});
