import { describe, it, expect } from "vitest";
import { createGame } from "@/systems/turn";
import { nationYieldMult, regionProduction } from "@/systems/economy";
import { unitCost } from "@/systems/military";
import { traitYield, traitUnitCostMult, TRAIT_IDS, TRAITS } from "@/data/traits";
import { factionByName } from "@/data/factions";
import { UNITS } from "@/data/units";
import { PLAYER_ID, emptyResearch, type Nation, type Region } from "@/systems/state";

function nation(over: Partial<Nation> = {}): Nation {
  return {
    id: 0,
    name: "N",
    color: "#fff",
    isPlayer: true,
    isBarbarian: false,
    alive: true,
    stocks: { gold: 100, food: 0, materials: 100, knowledge: 0 },
    taxRate: 0,
    research: emptyResearch(),
    famine: false,
    bankrupt: false,
    ...over,
  };
}

function plains(pop = 6): Region {
  return {
    id: 0,
    name: "R",
    terrain: "plains",
    ownerId: 0,
    population: pop,
    unrest: 0,
    fortification: 0,
    resource: null,
    buildings: [],
    construction: null,
    adjacency: [],
    x: 0.5,
    y: 0.5,
  };
}

describe("trait data", () => {
  it("exposes five distinct traits, each a valid multiplier set", () => {
    expect(TRAIT_IDS.length).toBe(5);
    for (const id of TRAIT_IDS) {
      const y = TRAITS[id].yield;
      for (const k of ["food", "materials", "gold", "knowledge"] as const) {
        expect(y[k]).toBeGreaterThan(0);
      }
      expect(TRAITS[id].unitCostMult).toBeGreaterThan(0);
    }
  });

  it("identity multipliers when no trait is set", () => {
    expect(traitYield(undefined)).toEqual({ food: 1, materials: 1, gold: 1, knowledge: 1 });
    expect(traitUnitCostMult(undefined)).toBe(1);
  });
});

describe("trait production effects", () => {
  it("Fertile boosts only food output", () => {
    const base = regionProduction(plains(), 0, nationYieldMult(nation({ trait: undefined })));
    const fertile = regionProduction(plains(), 0, nationYieldMult(nation({ trait: "fertile" })));
    expect(fertile.food).toBeGreaterThan(base.food);
    expect(fertile.materials).toBeCloseTo(base.materials, 5);
    expect(fertile.gold).toBeCloseTo(base.gold, 5);
  });

  it("Mercantile boosts gold, Scholarly boosts knowledge, Industrious boosts materials", () => {
    const base = nationYieldMult(nation({ trait: undefined }));
    expect(nationYieldMult(nation({ trait: "mercantile" })).gold).toBeGreaterThan(base.gold);
    expect(nationYieldMult(nation({ trait: "scholarly" })).knowledge).toBeGreaterThan(base.knowledge);
    expect(nationYieldMult(nation({ trait: "industrious" })).materials).toBeGreaterThan(base.materials);
  });

  it("Martial leaves production untouched", () => {
    expect(nationYieldMult(nation({ trait: "martial" }))).toEqual({
      food: 1,
      materials: 1,
      gold: 1,
      knowledge: 1,
    });
  });
});

describe("trait military effects", () => {
  it("Martial discounts unit cost; other traits do not", () => {
    const plain = unitCost(nation({ trait: undefined }), "infantry");
    const martial = unitCost(nation({ trait: "martial" }), "infantry");
    expect(martial.gold).toBeLessThan(plain.gold);
    expect(martial.materials).toBeLessThan(plain.materials);
    expect(plain).toEqual({ gold: UNITS.infantry.cost.gold, materials: UNITS.infantry.cost.materials });
    expect(unitCost(nation({ trait: "fertile" }), "infantry")).toEqual(plain);
  });
});

describe("trait draw", () => {
  it("assigns a trait to the player and every rival, deterministically", () => {
    const a = createGame({ seed: 42, rivals: 3 });
    const b = createGame({ seed: 42, rivals: 3 });
    for (const n of a.nations) {
      if (n.isBarbarian) expect(n.trait).toBeUndefined();
      else expect(n.trait).toBeDefined();
    }
    // Same seed → same traits.
    expect(a.nations.map((n) => n.trait)).toEqual(b.nations.map((n) => n.trait));
  });

  it("draws each realm's trait from its faction's signature trait", () => {
    // Traits are now a faction identity (data/factions.ts), not a per-game draw,
    // so realms may share a trait — but each must match its faction's.
    const s = createGame({ seed: 7, rivals: 3 });
    for (const n of s.nations) {
      if (n.isBarbarian) continue;
      const faction = factionByName(n.name);
      if (faction) expect(n.trait).toBe(faction.trait);
    }
  });

  it("varies traits across seeds (opening variety)", () => {
    const traitsFor = (seed: number) =>
      createGame({ seed, rivals: 2 }).nations[PLAYER_ID]!.trait;
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(traitsFor));
    expect(seen.size).toBeGreaterThan(1);
  });
});
