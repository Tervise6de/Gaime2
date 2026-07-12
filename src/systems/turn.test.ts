import { describe, it, expect } from "vitest";
import {
  createGame,
  resolveTurn,
  setTaxRate,
  clampTax,
  queueBuilding,
  cancelConstruction,
  canQueueBuilding,
} from "@/systems/turn";
import { nationalProduction } from "@/systems/economy";
import { BUILDINGS } from "@/data/buildings";
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

  it("grows population over a calm game", () => {
    let s = setTaxRate(createGame({ seed: 3 }), 0);
    const start = s.regions.reduce((a, r) => a + r.population, 0);
    for (let i = 0; i < 20; i++) s = resolveTurn(s);
    const end = s.regions.reduce((a, r) => a + r.population, 0);
    expect(end).toBeGreaterThan(start);
  });

  it("raises unrest under sustained high taxes", () => {
    let s = setTaxRate(createGame({ seed: 3 }), TAX_MAX);
    for (let i = 0; i < 15; i++) s = resolveTurn(s);
    const avgUnrest = s.regions.reduce((a, r) => a + r.unrest, 0) / s.regions.length;
    expect(avgUnrest).toBeGreaterThan(10);
  });
});

describe("construction", () => {
  it("canQueueBuilding rejects a duplicate", () => {
    const g = createGame({ seed: 1 });
    const r = { ...g.regions[0]!, buildings: ["farm" as const] };
    expect(canQueueBuilding(r, "farm")).toBe(false);
    expect(canQueueBuilding(r, "market")).toBe(true);
  });

  it("queueBuilding sets a construction order without mutating input", () => {
    const g = createGame({ seed: 1 });
    const next = queueBuilding(g, 0, "market");
    expect(next.regions[0]!.construction).toEqual({ building: "market", progress: 0 });
    expect(g.regions[0]!.construction).toBeNull();
  });

  it("cancelConstruction clears the slot", () => {
    let g = queueBuilding(createGame({ seed: 1 }), 0, "market");
    g = cancelConstruction(g, 0);
    expect(g.regions[0]!.construction).toBeNull();
  });

  it("completes a queued building over enough turns", () => {
    let s = setTaxRate(createGame({ seed: 1 }), 0);
    s = queueBuilding(s, 0, "market");
    const turns = Math.ceil(BUILDINGS.market.cost / 6) + 3;
    for (let i = 0; i < turns; i++) s = resolveTurn(s);
    expect(s.regions[0]!.buildings).toContain("market");
  });

  it("a completed market increases that region's gold output", () => {
    const seed = 1;
    let plain = setTaxRate(createGame({ seed }), 0);
    let built = queueBuilding(plain, 0, "market");
    for (let i = 0; i < 8; i++) {
      plain = resolveTurn(plain);
      built = resolveTurn(built);
    }
    // With identical seed/tax, the only difference is the market in region 0.
    expect(built.regions[0]!.buildings).toContain("market");
    // National gold income should be higher in the built game.
    const goldPlain = nationalProduction(plain, PLAYER_ID).gold;
    const goldBuilt = nationalProduction(built, PLAYER_ID).gold;
    expect(goldBuilt).toBeGreaterThan(goldPlain);
  });
});
