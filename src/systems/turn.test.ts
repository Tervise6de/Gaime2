import { describe, it, expect } from "vitest";
import {
  createGame,
  resolveTurn,
  setTaxRate,
  clampTax,
} from "@/systems/turn";
import { nationalProduction } from "@/systems/economy";
import { PLAYER_ID, TAX_MAX, TAX_MIN } from "@/systems/state";

describe("createGame", () => {
  it("is deterministic for a seed", () => {
    expect(createGame({ seed: 999 })).toEqual(createGame({ seed: 999 }));
  });

  it("starts at turn 1 with the player owning every region", () => {
    const g = createGame({ seed: 1 });
    expect(g.turn).toBe(1);
    expect(g.regions.every((r) => r.ownerId === PLAYER_ID)).toBe(true);
    expect(g.stocks.gold).toBeGreaterThan(0);
  });
});

describe("clampTax", () => {
  it("clamps into the legal band", () => {
    expect(clampTax(-1)).toBe(TAX_MIN);
    expect(clampTax(5)).toBe(TAX_MAX);
    expect(clampTax(0.2)).toBe(0.2);
  });
});

describe("setTaxRate", () => {
  it("returns a new state without mutating the input", () => {
    const g = createGame({ seed: 1 });
    const next = setTaxRate(g, 0.3);
    expect(next.taxRate).toBe(0.3);
    expect(g.taxRate).not.toBe(0.3);
    expect(next).not.toBe(g);
  });
});

describe("resolveTurn", () => {
  it("advances the turn counter", () => {
    const g = createGame({ seed: 1 });
    expect(resolveTurn(g).turn).toBe(g.turn + 1);
  });

  it("adds national production to stocks", () => {
    const g = createGame({ seed: 1 });
    const flow = nationalProduction(g, PLAYER_ID);
    const next = resolveTurn(g);
    expect(next.stocks.gold).toBeCloseTo(g.stocks.gold + flow.gold, 5);
    expect(next.stocks.materials).toBeCloseTo(g.stocks.materials + flow.materials, 5);
  });

  it("does not mutate the input state", () => {
    const g = createGame({ seed: 1 });
    const snapshot = JSON.stringify(g);
    resolveTurn(g);
    expect(JSON.stringify(g)).toBe(snapshot);
  });

  it("is deterministic and reproducible over many turns", () => {
    const run = (): number => {
      let s = createGame({ seed: 2024 });
      for (let i = 0; i < 30; i++) s = resolveTurn(s);
      return s.stocks.gold;
    };
    expect(run()).toBe(run());
  });

  it("higher taxes yield more treasury over time", () => {
    const play = (tax: number): number => {
      let s = setTaxRate(createGame({ seed: 5 }), tax);
      for (let i = 0; i < 10; i++) s = resolveTurn(s);
      return s.stocks.gold;
    };
    expect(play(TAX_MAX)).toBeGreaterThan(play(TAX_MIN));
  });

  it("keeps the log bounded", () => {
    let s = createGame({ seed: 1 });
    for (let i = 0; i < 100; i++) s = resolveTurn(s);
    expect(s.log.length).toBeLessThanOrEqual(50);
  });
});
