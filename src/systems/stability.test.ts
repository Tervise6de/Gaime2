import { describe, it, expect } from "vitest";
import { unrestTarget, nextUnrest, garrisonCalm } from "@/systems/stability";
import { unrestPenalty } from "@/systems/economy";
import {
  TAX_MAX,
  UNREST_DRIFT,
  UNREST_PENALTY_START,
  UNREST_REVOLT,
  GARRISON_CALM_MAX,
  GARRISON_CALM_PER_UNIT,
  type Region,
} from "@/systems/state";

function region(overrides: Partial<Region> = {}): Region {
  return {
    id: 0,
    name: "Test",
    terrain: "plains",
    ownerId: 0,
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

const SMALL_REALM = 3; // ≤ FREE_REGIONS, so no overexpansion unrest

describe("unrestTarget", () => {
  it("rises with tax", () => {
    const low = unrestTarget(region(), 0, SMALL_REALM);
    const high = unrestTarget(region(), TAX_MAX, SMALL_REALM);
    expect(high).toBeGreaterThan(low);
  });

  it("is lowered by a temple", () => {
    const plain = unrestTarget(region(), TAX_MAX, SMALL_REALM);
    const templed = unrestTarget(region({ buildings: ["temple"] }), TAX_MAX, SMALL_REALM);
    expect(templed).toBeLessThan(plain);
  });

  it("rises with overexpansion", () => {
    const small = unrestTarget(region(), 0, 3);
    const sprawling = unrestTarget(region(), 0, 20);
    expect(sprawling).toBeGreaterThan(small);
  });

  it("is lowered by a stationed garrison", () => {
    const ungarrisoned = unrestTarget(region(), TAX_MAX, SMALL_REALM, 0, 0);
    const garrisoned = unrestTarget(region(), TAX_MAX, SMALL_REALM, 0, 4);
    expect(garrisoned).toBeLessThan(ungarrisoned);
    expect(ungarrisoned - garrisoned).toBeCloseTo(4 * GARRISON_CALM_PER_UNIT, 5);
  });
});

describe("garrisonCalm", () => {
  it("scales with garrison size, capped at the maximum", () => {
    expect(garrisonCalm(0)).toBe(0);
    expect(garrisonCalm(3)).toBe(3 * GARRISON_CALM_PER_UNIT);
    expect(garrisonCalm(1000)).toBe(GARRISON_CALM_MAX); // huge stack can't zero unrest
    expect(garrisonCalm(-5)).toBe(0); // defensive: never negative
  });
});

describe("nextUnrest", () => {
  it("drifts toward the target, capped per turn", () => {
    const r = region({ unrest: 0 });
    const next = nextUnrest(r, TAX_MAX, false, SMALL_REALM);
    expect(next).toBeGreaterThan(0);
    expect(next - r.unrest).toBeLessThanOrEqual(UNREST_DRIFT + 0.001);
  });

  it("spikes during famine", () => {
    const calm = nextUnrest(region({ unrest: 10 }), 0, false, SMALL_REALM);
    const starving = nextUnrest(region({ unrest: 10 }), 0, true, SMALL_REALM);
    expect(starving).toBeGreaterThan(calm);
  });

  it("stays within [0, 100]", () => {
    const high = nextUnrest(region({ unrest: 95 }), TAX_MAX, true, 25);
    expect(high).toBeLessThanOrEqual(100);
    const low = nextUnrest(region({ unrest: 0, buildings: ["temple"] }), 0, false, SMALL_REALM);
    expect(low).toBeGreaterThanOrEqual(0);
  });
});

describe("unrestPenalty", () => {
  it("is 1 below the penalty threshold", () => {
    expect(unrestPenalty(0)).toBe(1);
    expect(unrestPenalty(UNREST_PENALTY_START)).toBe(1);
  });

  it("is 0 at or above the revolt threshold", () => {
    expect(unrestPenalty(UNREST_REVOLT)).toBe(0);
    expect(unrestPenalty(100)).toBe(0);
  });

  it("decreases monotonically between the thresholds", () => {
    const mid = unrestPenalty((UNREST_PENALTY_START + UNREST_REVOLT) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});
