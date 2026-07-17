import { describe, it, expect } from "vitest";
import {
  seedFaith,
  faithWeight,
  faithInfluence,
  stepFaith,
  faithHeld,
  faithFraction,
  hasFaithVictory,
  FAITH_INERTIA,
  OWNER_FAITH,
} from "@/systems/faith";
import { BARBARIAN_ID, FAITH_VICTORY_FRACTION, type GameState, type Region } from "@/systems/state";

const reg = (over: Partial<Region>): Region => ({
  id: 0, name: "R", terrain: "plains", ownerId: 0, population: 5, unrest: 0,
  fortification: 0, resource: null, buildings: [], construction: null, adjacency: [], x: 0, y: 0, ...over,
});
const gs = (regions: Region[]): GameState => ({ regions } as GameState);

describe("seedFaith", () => {
  it("seeds a realm's own lands to its faith; barbarian & unowned land stays pagan", () => {
    const out = seedFaith([
      reg({ id: 0, ownerId: 0 }),
      reg({ id: 1, ownerId: BARBARIAN_ID }),
      reg({ id: 2, ownerId: null }),
    ]);
    expect(out[0]!.faith).toBe(0);
    expect(out[1]!.faith).toBeUndefined();
    expect(out[2]!.faith).toBeUndefined();
  });
});

describe("faithWeight", () => {
  it("sums the holy-site projection of a region's buildings", () => {
    expect(faithWeight(reg({ buildings: [] }))).toBe(0);
    expect(faithWeight(reg({ buildings: ["workshop", "market"] }))).toBe(0); // secular
    expect(faithWeight(reg({ buildings: ["temple", "cathedral"] }))).toBe(2 + 5);
  });
});

describe("faithInfluence", () => {
  it("credits inertia to the current faith and promotion to the ruler", () => {
    const s = gs([reg({ id: 0, ownerId: 0, faith: 2 })]);
    const inf = faithInfluence(s, s.regions[0]!);
    expect(inf.get(2)).toBe(FAITH_INERTIA); // the standing faith resists
    expect(inf.get(0)).toBe(OWNER_FAITH); // the ruler promotes its own
  });

  it("radiates a neighbour's holy sites at a fraction across the border", () => {
    const s = gs([
      reg({ id: 0, ownerId: 0, faith: 0, buildings: ["cathedral"], adjacency: [1] }),
      reg({ id: 1, ownerId: BARBARIAN_ID, adjacency: [0] }),
    ]);
    const inf = faithInfluence(s, s.regions[1]!);
    expect(inf.get(0)).toBeCloseTo(5 * 0.5, 5); // cathedral 5 × ADJ_SPREAD
  });
});

describe("stepFaith — occupation vs conversion", () => {
  it("occupation alone does NOT convert a just-taken province", () => {
    // Owned by 0, but its people still hold faith 2 and there are no churches.
    const s = gs([reg({ id: 0, ownerId: 0, faith: 2 })]);
    expect(stepFaith(s).regions[0]!.faith).toBe(2); // inertia 3 vs owner 3 → no clear lead
    expect(stepFaith(s)).toBe(s); // nothing changed → same reference
  });

  it("a church converts a held province to the ruler's faith", () => {
    const s = gs([reg({ id: 0, ownerId: 0, faith: 2, buildings: ["temple"] })]);
    expect(stepFaith(s).regions[0]!.faith).toBe(0); // owner 3 + temple 2 = 5 beats inertia 3
  });

  it("a border cathedral converts pagan land across the frontier", () => {
    const s = gs([
      reg({ id: 0, ownerId: 0, faith: 0, buildings: ["cathedral"], adjacency: [1] }),
      reg({ id: 1, ownerId: BARBARIAN_ID, faith: undefined, adjacency: [0] }),
    ]);
    expect(stepFaith(s).regions[1]!.faith).toBe(0); // 2.5 vs pagan 0 → converts
  });

  it("a quiet, church-less homeland keeps its faith (no rival influence)", () => {
    const s = gs([reg({ id: 0, ownerId: 0, faith: 0 })]);
    expect(stepFaith(s).regions[0]!.faith).toBe(0);
  });

  it("a rival cannot rip the faith from a province the owner defends with a cathedral", () => {
    const s = gs([
      reg({ id: 0, ownerId: 2, faith: 2, buildings: ["cathedral"], adjacency: [1] }), // devout, defended
      reg({ id: 1, ownerId: 0, faith: 0, buildings: ["cathedral"], adjacency: [0] }), // your holy site next door
    ]);
    // Incumbent (2): inertia 3 + owner 3 + cathedral 5 = 11; challenger (0): 5×0.5 = 2.5 → no flip.
    expect(stepFaith(s).regions[0]!.faith).toBe(2);
  });
});

describe("faith standings & victory", () => {
  const s = gs([
    reg({ id: 0, ownerId: 0, faith: 0 }),
    reg({ id: 1, ownerId: 2, faith: 0 }), // you hold their people's faith though they rule the land
    reg({ id: 2, ownerId: 2, faith: 2 }),
    reg({ id: 3, ownerId: null, faith: undefined }), // unsettled → out of the count
  ]);

  it("counts faith across all settled land, ownership aside", () => {
    expect(faithHeld(s, 0)).toBe(2);
    expect(faithFraction(s, 0)).toBeCloseTo(2 / 3, 5); // 2 of 3 settled regions
  });

  it("declares a religious victory at the threshold", () => {
    expect(2 / 3 >= FAITH_VICTORY_FRACTION).toBe(true);
    expect(hasFaithVictory(s, 0)).toBe(true);
    expect(hasFaithVictory(s, 2)).toBe(false); // only 1 of 3
  });
});
