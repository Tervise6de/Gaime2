import { describe, it, expect } from "vitest";
import {
  nationInstability,
  armySize,
  emptyUnits,
  UNREST_REVOLT,
  PLAYER_ID,
  BARBARIAN_ID,
  type GameState,
  type Nation,
  type Region,
} from "@/systems/state";
import { UNIT_TYPES } from "@/data/units";

const RIVAL = 2; // 0 = player, 1 = barbarians, so a rival starts at 2

function nation(over: Partial<Nation> = {}): Nation {
  return {
    id: RIVAL,
    name: "Rival",
    color: "#fff",
    isPlayer: false,
    isBarbarian: false,
    alive: true,
    stocks: { gold: 0, food: 0, materials: 0, knowledge: 0 },
    taxRate: 0.15,
    research: { current: null, progress: 0, done: [] },
    famine: false,
    bankrupt: false,
    ...over,
  } as Nation;
}

function region(over: Partial<Region> = {}): Region {
  return {
    id: 0,
    name: "Prov",
    terrain: "plains",
    ownerId: RIVAL,
    population: 3,
    unrest: 0,
    fortification: 0,
    resource: null,
    buildings: [],
    construction: null,
    adjacency: [],
    x: 0.5,
    y: 0.5,
    ...over,
  } as Region;
}

function stateOf(nations: Nation[], regions: Region[]): GameState {
  return { turn: 30, nations, regions } as unknown as GameState;
}

describe("armySize", () => {
  it("counts every unit type — including the tech-gated premiums", () => {
    // One of each unit type; the total must equal the roster size. This guards the
    // old hand-summed armySize that silently dropped pikemen/handgunners.
    const one = emptyUnits();
    for (const t of UNIT_TYPES) one[t] = 1;
    expect(armySize(one)).toBe(UNIT_TYPES.length);
    // A stack of only a premium unit is not "empty".
    expect(armySize({ ...emptyUnits(), swordsman: 3 })).toBe(3);
    expect(armySize({ ...emptyUnits(), knight: 2 })).toBe(2);
    expect(armySize(emptyUnits())).toBe(0);
  });
});

describe("nationInstability", () => {
  it("reports a fully stable nation as not reeling", () => {
    const s = stateOf([nation()], [region({ unrest: 10 })]);
    const inst = nationInstability(s, RIVAL);
    expect(inst).toEqual({
      famine: false,
      bankrupt: false,
      revolt: false,
      reeling: false,
    });
  });

  it("flags famine", () => {
    const s = stateOf([nation({ famine: true })], [region()]);
    const inst = nationInstability(s, RIVAL);
    expect(inst.famine).toBe(true);
    expect(inst.reeling).toBe(true);
  });

  it("flags bankruptcy", () => {
    const s = stateOf([nation({ bankrupt: true })], [region()]);
    const inst = nationInstability(s, RIVAL);
    expect(inst.bankrupt).toBe(true);
    expect(inst.reeling).toBe(true);
  });

  it("flags an owned region in full revolt (at the revolt threshold)", () => {
    const s = stateOf([nation()], [region({ unrest: UNREST_REVOLT })]);
    const inst = nationInstability(s, RIVAL);
    expect(inst.revolt).toBe(true);
    expect(inst.reeling).toBe(true);
  });

  it("does not count unrest just below the revolt threshold", () => {
    const s = stateOf([nation()], [region({ unrest: UNREST_REVOLT - 1 })]);
    expect(nationInstability(s, RIVAL).revolt).toBe(false);
  });

  it("ignores revolt in a region owned by another nation", () => {
    const s = stateOf(
      [nation()],
      [region({ ownerId: BARBARIAN_ID, unrest: 90 })],
    );
    expect(nationInstability(s, RIVAL).revolt).toBe(false);
  });

  it("treats a missing nation as not famine/bankrupt (legacy safety)", () => {
    const s = stateOf([nation()], [region()]);
    const inst = nationInstability(s, PLAYER_ID); // no such nation in this state
    expect(inst.famine).toBe(false);
    expect(inst.bankrupt).toBe(false);
    expect(inst.reeling).toBe(false);
  });

  it("combines multiple crises", () => {
    const s = stateOf(
      [nation({ famine: true, bankrupt: true })],
      [region({ unrest: UNREST_REVOLT + 5 })],
    );
    expect(nationInstability(s, RIVAL)).toEqual({
      famine: true,
      bankrupt: true,
      revolt: true,
      reeling: true,
    });
  });
});
