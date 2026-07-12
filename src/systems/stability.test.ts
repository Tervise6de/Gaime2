import { describe, it, expect } from "vitest";
import { unrestTarget, nextUnrest } from "@/systems/stability";
import { unrestPenalty } from "@/systems/economy";
import {
  TAX_MAX,
  UNREST_DRIFT,
  UNREST_PENALTY_START,
  UNREST_REVOLT,
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
    buildings: [],
    construction: null,
    adjacency: [],
    x: 0.5,
    y: 0.5,
    ...overrides,
  };
}

describe("unrestTarget", () => {
  it("rises with tax", () => {
    const low = unrestTarget(region(), 0);
    const high = unrestTarget(region(), TAX_MAX);
    expect(high).toBeGreaterThan(low);
  });

  it("is lowered by a temple", () => {
    const plain = unrestTarget(region(), TAX_MAX);
    const templed = unrestTarget(region({ buildings: ["temple"] }), TAX_MAX);
    expect(templed).toBeLessThan(plain);
  });
});

describe("nextUnrest", () => {
  it("drifts toward the target, capped per turn", () => {
    const r = region({ unrest: 0 });
    const next = nextUnrest(r, TAX_MAX, false);
    expect(next).toBeGreaterThan(0);
    expect(next - r.unrest).toBeLessThanOrEqual(UNREST_DRIFT + 0.001);
  });

  it("spikes during famine", () => {
    const calm = nextUnrest(region({ unrest: 10 }), 0, false);
    const starving = nextUnrest(region({ unrest: 10 }), 0, true);
    expect(starving).toBeGreaterThan(calm);
  });

  it("stays within [0, 100]", () => {
    const high = nextUnrest(region({ unrest: 95 }), TAX_MAX, true);
    expect(high).toBeLessThanOrEqual(100);
    const low = nextUnrest(region({ unrest: 0, buildings: ["temple"] }), 0, false);
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
