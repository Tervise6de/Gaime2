import { describe, it, expect } from "vitest";
import { advanceConstruction } from "@/systems/construction";
import { BUILDINGS, BUILD_RATE } from "@/data/buildings";
import type { Region } from "@/systems/state";

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

describe("advanceConstruction", () => {
  it("invests up to BUILD_RATE materials per region", () => {
    const r = region({ construction: { building: "farm", progress: 0 } });
    const res = advanceConstruction([r], 100);
    expect(res.materialsSpent).toBe(BUILD_RATE);
    expect(res.regions[0]!.construction!.progress).toBe(BUILD_RATE);
  });

  it("completes a building and moves it into buildings[]", () => {
    const cost = BUILDINGS.farm.cost;
    const r = region({ construction: { building: "farm", progress: cost - 1 } });
    const res = advanceConstruction([r], 100);
    expect(res.regions[0]!.construction).toBeNull();
    expect(res.regions[0]!.buildings).toContain("farm");
    expect(res.completed).toHaveLength(1);
  });

  it("does not overspend the materials budget", () => {
    const a = region({ id: 0, construction: { building: "farm", progress: 0 } });
    const b = region({ id: 1, construction: { building: "workshop", progress: 0 } });
    const res = advanceConstruction([a, b], BUILD_RATE); // only enough for one
    expect(res.materialsSpent).toBeLessThanOrEqual(BUILD_RATE);
    expect(res.regions[1]!.construction!.progress).toBe(0); // second waits
  });

  it("does nothing for regions without an order", () => {
    const r = region();
    const res = advanceConstruction([r], 100);
    expect(res.materialsSpent).toBe(0);
    expect(res.regions[0]).toEqual(r);
  });

  it("does not mutate the input regions", () => {
    const r = region({ construction: { building: "farm", progress: 0 } });
    const snapshot = JSON.stringify(r);
    advanceConstruction([r], 100);
    expect(JSON.stringify(r)).toBe(snapshot);
  });
});
