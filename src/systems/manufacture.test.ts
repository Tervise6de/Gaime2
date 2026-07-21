/**
 * Production chains (systems/manufacture.ts) and trade capacity (systems/trade.ts)
 * — the "merchant's chain" trade milestone (docs/game-design.md §Trade).
 */

import { describe, it, expect } from "vitest";
import { manufactureWares } from "@/systems/manufacture";
import { tradeCapacity, BASE_TRADE_CAPACITY, MAX_TRADE_CAPACITY } from "@/systems/trade";
import { createGame, resolveTurn } from "@/systems/turn";
import { PLAYER_ID, emptyWares, type GameState, type Region, type Wares } from "@/systems/state";
import type { BuildingId } from "@/data/buildings";

function reg(id: number, over: Partial<Region> = {}): Region {
  return {
    id, name: `R${id}`, terrain: "plains", ownerId: PLAYER_ID, population: 5, unrest: 0,
    fortification: 0, resource: null, buildings: [], construction: null, adjacency: [], x: 0, y: 0, ...over,
  };
}
const wares = (over: Partial<Wares>): Wares => ({ ...emptyWares(), ...over });

describe("manufactureWares — production chains", () => {
  it("weaves wool into cloth, consuming the wool", () => {
    const regions = [reg(0, { buildings: ["weaving_works"] })];
    const out = manufactureWares(wares({ wool: 5 }), regions, PLAYER_ID);
    expect(out.wares.wool).toBe(2); // 3 of 5 wool consumed
    expect(out.wares.cloth).toBe(3); // 1:1 into cloth (the dearer ware)
    expect(out.flows).toEqual([{ from: "wool", to: "cloth", amount: 3 }]);
  });

  it("refines only what is in stock — a converter with no feedstock idles", () => {
    const regions = [reg(0, { buildings: ["weaving_works"] })];
    const out = manufactureWares(wares({ wool: 2 }), regions, PLAYER_ID);
    expect(out.wares.wool).toBe(0);
    expect(out.wares.cloth).toBe(2); // capped by the 2 wool available, not the per-3 capacity
    const dry = manufactureWares(wares({ wool: 0 }), regions, PLAYER_ID);
    expect(dry.wares.cloth).toBe(0);
    expect(dry.flows).toEqual([]);
  });

  it("pools capacity across multiple converters of the same chain", () => {
    const regions = [reg(0, { buildings: ["weaving_works"] }), reg(1, { buildings: ["weaving_works"] })];
    const out = manufactureWares(wares({ wool: 10 }), regions, PLAYER_ID);
    expect(out.wares.wool).toBe(4); // two works → 6 wool consumed
    expect(out.wares.cloth).toBe(6);
  });

  it("runs several distinct chains together (grain→beer, timber→naval stores)", () => {
    const regions = [reg(0, { buildings: ["brewery", "ropewalk"] })];
    const out = manufactureWares(wares({ grain: 9, timber: 9 }), regions, PLAYER_ID);
    expect(out.wares.grain).toBe(6); // brewery: 3 grain → beer
    expect(out.wares.beer).toBe(3);
    expect(out.wares.timber).toBe(7); // ropewalk: 2 timber → naval stores
    expect(out.wares.naval_stores).toBe(2);
  });

  it("only converts for the queried nation and leaves other stock untouched", () => {
    const regions = [reg(0, { ownerId: 2, buildings: ["weaving_works"] })];
    const out = manufactureWares(wares({ wool: 5 }), regions, PLAYER_ID); // works belong to nation 2
    expect(out.wares).toEqual(wares({ wool: 5 }));
    expect(out.flows).toEqual([]);
  });
});

describe("tradeCapacity — trade as built infrastructure", () => {
  const only = (buildings: BuildingId[]): GameState =>
    ({
      regions: [reg(0, { buildings })],
      nations: [{ id: PLAYER_ID, research: { done: [] } }],
    } as unknown as GameState);

  it("starts at the base with no trade buildings", () => {
    expect(tradeCapacity(only([]), PLAYER_ID)).toBe(BASE_TRADE_CAPACITY);
  });

  it("warehouses and harbours raise it", () => {
    expect(tradeCapacity(only(["harbor"]), PLAYER_ID)).toBe(BASE_TRADE_CAPACITY + 1);
    expect(tradeCapacity(only(["salzspeicher"]), PLAYER_ID)).toBe(BASE_TRADE_CAPACITY + 2);
    expect(tradeCapacity(only(["salzspeicher", "harbor", "charter_fair"]), PLAYER_ID)).toBe(BASE_TRADE_CAPACITY + 4);
  });

  it("the Merchant-Marine doctrine adds capacity too", () => {
    const s = {
      regions: [reg(0, {})],
      nations: [{ id: PLAYER_ID, research: { done: ["cog_fleets", "bulk_shipping"] } }],
    } as unknown as GameState;
    expect(tradeCapacity(s, PLAYER_ID)).toBe(BASE_TRADE_CAPACITY + 2); // +1 each
  });

  it("is capped however much a realm develops", () => {
    const many: BuildingId[] = ["salzspeicher", "salzspeicher", "salzspeicher", "salzspeicher", "salzspeicher", "salzspeicher", "salzspeicher", "salzspeicher"];
    expect(tradeCapacity(only(many), PLAYER_ID)).toBe(MAX_TRADE_CAPACITY);
  });
});

describe("chains in the live turn pipeline", () => {
  it("a Weaving Works converts the realm's wool into cloth over a turn", () => {
    let g = createGame({ seed: 3 });
    // Give the player a wool stock and a Weaving Works in an owned region.
    const mine = g.regions.find((r) => r.ownerId === PLAYER_ID)!;
    g = {
      ...g,
      nations: g.nations.map((n) => (n.id === PLAYER_ID ? { ...n, wares: { ...n.wares, wool: 6 } } : n)),
      regions: g.regions.map((r) => (r.id === mine.id ? { ...r, buildings: [...r.buildings, "weaving_works"] } : r)),
    };
    const before = g.nations.find((n) => n.id === PLAYER_ID)!.wares;
    const after = resolveTurn(g).nations.find((n) => n.id === PLAYER_ID)!.wares;
    expect(after.cloth).toBeGreaterThan(before.cloth); // cloth was woven
  });
});
