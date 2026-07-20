import { describe, it, expect } from "vitest";
import {
  luxuryAppetite,
  resolveContentment,
  contentmentUnrest,
  drawFoodReserve,
} from "@/systems/prosperity";
import { GOODS } from "@/data/goods";
import { round1 } from "@/systems/economy";
import { LUXURY_CONTENT_UNREST, LUXURY_DEMAND_PER_POP, emptyWares } from "@/systems/state";

describe("luxuryAppetite", () => {
  it("scales with governed population", () => {
    expect(luxuryAppetite(100)).toBe(100 * LUXURY_DEMAND_PER_POP);
    expect(luxuryAppetite(0)).toBe(0);
    expect(luxuryAppetite(-5)).toBe(0); // never negative
  });
});

describe("resolveContentment", () => {
  it("no appetite is fully content and consumes nothing", () => {
    const c = resolveContentment(emptyWares(), 0);
    expect(c.ratio).toBe(1);
    expect(c.consumed).toBe(0);
    expect(c.spent).toEqual({});
  });

  it("no luxuries means no contentment", () => {
    const c = resolveContentment(emptyWares(), 4);
    expect(c.ratio).toBe(0);
    expect(c.consumed).toBe(0);
  });

  it("draws the pure luxuries proportionally and is fully content when supply covers appetite", () => {
    const c = resolveContentment({ ...emptyWares(), furs: 2, cloth: 2 }, 4);
    expect(c.consumed).toBe(4);
    expect(c.ratio).toBe(1);
    expect(c.spent.furs).toBe(2);
    expect(c.spent.cloth).toBe(2);
  });

  it("is partly content when supply falls short of appetite", () => {
    const c = resolveContentment({ ...emptyWares(), furs: 2, cloth: 2 }, 10);
    expect(c.consumed).toBe(4);
    expect(c.ratio).toBeCloseTo(0.4, 5);
  });

  it("ignores beer/copper/honey — only the export-only luxuries content the burghers", () => {
    const c = resolveContentment({ ...emptyWares(), beer: 5, copper: 5, honey: 5 }, 4);
    expect(c.ratio).toBe(0);
    expect(c.consumed).toBe(0);
  });

  it("never draws more of a ware than is held", () => {
    const c = resolveContentment({ ...emptyWares(), amber: 1 }, 100);
    expect(c.spent.amber!).toBeLessThanOrEqual(1);
  });
});

describe("contentmentUnrest", () => {
  it("runs from 0 at none to the cap at full", () => {
    expect(contentmentUnrest(0)).toBe(0);
    expect(contentmentUnrest(1)).toBe(LUXURY_CONTENT_UNREST);
    expect(contentmentUnrest(0.5)).toBe(LUXURY_CONTENT_UNREST / 2);
    expect(contentmentUnrest(2)).toBe(LUXURY_CONTENT_UNREST); // clamped
  });
});

describe("drawFoodReserve", () => {
  it("taps grain to cover a shortfall, worth its foodValue per unit", () => {
    const need = 1.7; // grain foodValue 0.85 → 2 grain covers it
    const r = drawFoodReserve({ ...emptyWares(), grain: 10 }, need, false);
    expect(r.food).toBeCloseTo(1.7, 5);
    expect(r.wares.grain).toBeCloseTo(8, 5);
  });

  it("returns the stockpile untouched when there is no shortfall", () => {
    const wares = { ...emptyWares(), grain: 5 };
    const r = drawFoodReserve(wares, 0, true);
    expect(r.food).toBe(0);
    expect(r.wares).toBe(wares);
  });

  it("cuts fish without salt to preserve it (the salt→fish chain)", () => {
    // herring foodValue 0.4, unsalted → 0.4 * FISH_UNSALTED_MULT per unit.
    const salted = drawFoodReserve({ ...emptyWares(), herring: 10 }, 0.4, true);
    const unsalted = drawFoodReserve({ ...emptyWares(), herring: 10 }, 0.4, false);
    // Salted needs fewer herring for the same food, so it keeps more in reserve.
    expect(unsalted.wares.herring).toBeLessThan(salted.wares.herring);
  });

  it("produces only what the reserve can, when it runs dry", () => {
    const r = drawFoodReserve({ ...emptyWares(), grain: 1 }, 100, false);
    // 1 grain → its foodValue (0.85), reported to one decimal (0.9); reserve emptied.
    expect(r.food).toBeCloseTo(round1(GOODS.grain.foodValue!), 5);
    expect(r.food).toBeLessThan(100); // could not cover the full shortfall
    expect(r.wares.grain).toBe(0);
  });
});
