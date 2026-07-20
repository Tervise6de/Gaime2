import { describe, it, expect } from "vitest";
import { advanceConstruction } from "@/systems/construction";
import { BUILDINGS, BUILD_RATE } from "@/data/buildings";
import { emptyWares, type Region, type Wares } from "@/systems/state";

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

function wares(over: Partial<Wares> = {}): Wares {
  return { ...emptyWares(), ...over };
}

describe("advanceConstruction", () => {
  it("invests up to BUILD_RATE of the build ware per region", () => {
    // Farm's build ware is timber (the default).
    const r = region({ construction: { building: "farm", progress: 0 } });
    const res = advanceConstruction([r], wares({ timber: 100 }), 0);
    expect(res.waresSpent.timber).toBe(BUILD_RATE);
    expect(res.regions[0]!.construction!.progress).toBe(BUILD_RATE);
  });

  it("completes a building and moves it into buildings[]", () => {
    const cost = BUILDINGS.farm.cost;
    const r = region({ construction: { building: "farm", progress: cost - 1 } });
    const res = advanceConstruction([r], wares({ timber: 100 }), 0);
    expect(res.regions[0]!.construction).toBeNull();
    expect(res.regions[0]!.buildings).toContain("farm");
    expect(res.completed).toHaveLength(1);
  });

  it("does not overspend a ware budget", () => {
    // Farm and Workshop both build in timber; only enough for one.
    const a = region({ id: 0, construction: { building: "farm", progress: 0 } });
    const b = region({ id: 1, construction: { building: "workshop", progress: 0 } });
    const res = advanceConstruction([a, b], wares({ timber: BUILD_RATE }), 0);
    expect(res.waresSpent.timber ?? 0).toBeLessThanOrEqual(BUILD_RATE);
    expect(res.regions[1]!.construction!.progress).toBe(0); // second waits
  });

  it("waits when the required build ware is absent", () => {
    // City Walls build in brick — with no brick, no progress.
    const r = region({ construction: { building: "fortress", progress: 0 } });
    const res = advanceConstruction([r], wares({ timber: 100 }), 0);
    expect(res.waresSpent.brick ?? 0).toBe(0);
    expect(res.regions[0]!.construction!.progress).toBe(0);
  });

  it("does nothing for regions without an order", () => {
    const r = region();
    const res = advanceConstruction([r], wares({ timber: 100 }), 0);
    expect(res.waresSpent.timber ?? 0).toBe(0);
    expect(res.regions[0]).toEqual(r);
  });

  it("does not mutate the input regions", () => {
    const r = region({ construction: { building: "farm", progress: 0 } });
    const snapshot = JSON.stringify(r);
    advanceConstruction([r], wares({ timber: 100 }), 0);
    expect(JSON.stringify(r)).toBe(snapshot);
  });
});
