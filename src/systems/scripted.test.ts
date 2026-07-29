import { describe, it, expect } from "vitest";
import { playScriptedTurn } from "@/systems/scripted";
import { createGame, resolveTurn } from "@/systems/turn";
import { createRng } from "@/systems/rng";
import { hansaControl } from "@/systems/hansa";
import { hansaStrands } from "@/systems/victory";
import { armyIsFleet } from "@/systems/military";
import { atWar, declareWar } from "@/systems/diplomacy";
import { MAX_ROUTES_PER_NATION, PLAYER_ID, inLeague, type GameState } from "@/systems/state";

/** Play `turns` turns of a scripted trade realm against the live rival AI. */
function play(seed: number, turns: number): GameState {
  let g = createGame({ seed });
  const rng = createRng(seed * 7919);
  for (let t = 0; t < turns; t++) {
    g = playScriptedTurn(g, PLAYER_ID, rng);
    g = resolveTurn(g);
    if (g.outcome !== "playing") break;
  }
  return g;
}

describe("the scripted trade realm", () => {
  it("fills its route book in the opening turns", () => {
    const g = play(5, 6);
    const routes = (g.routes ?? []).filter((r) => r.ownerId === PLAYER_ID);
    expect(routes.length).toBe(MAX_ROUTES_PER_NATION);
    // ...and they are real routes, earning real gold.
    expect(routes.some((r) => (r.lastIncome ?? 0) > 0)).toBe(true);
  }, 20_000);

  it("gets into the League and puts a hull to sea", () => {
    const g = play(3, 60);
    expect(inLeague(g, PLAYER_ID)).toBe(true);
    expect(g.armies.some((a) => a.ownerId === PLAYER_ID && armyIsFleet(a.units))).toBe(true);
  }, 40_000);

  it("ends its wars rather than fight them — a war bars it from the League", () => {
    const base = createGame({ seed: 5 });
    const warring = declareWar({ ...base, turn: 20 }, 3, PLAYER_ID);
    expect(atWar(warring, PLAYER_ID, 3)).toBe(true);
    expect(atWar(playScriptedTurn(warring, PLAYER_ID, createRng(1)), PLAYER_ID, 3)).toBe(false);
  });

  it("is a yardstick, not a conqueror — it wins ground on the ledger, not the map", () => {
    const g = play(5, 60);
    const before = createGame({ seed: 5 }).regions.filter((r) => r.ownerId === PLAYER_ID).length;
    const after = g.regions.filter((r) => r.ownerId === PLAYER_ID).length;
    expect(after).toBeLessThanOrEqual(before + 1);
    // What it does buy is a place in the trading world.
    expect(hansaControl(g, PLAYER_ID).total).toBeGreaterThan(0.2);
  }, 40_000);

  it("plays the same game twice from the same seed", () => {
    const a = play(7, 25);
    const b = play(7, 25);
    expect(hansaControl(a, PLAYER_ID).total).toBe(hansaControl(b, PLAYER_ID).total);
    expect((a.routes ?? []).length).toBe((b.routes ?? []).length);
  }, 40_000);
});

describe("the strand readout", () => {
  it("adds up to the control total, and says what would move each strand", () => {
    const g = play(3, 40);
    const strands = hansaStrands(g, PLAYER_ID);
    expect(strands.map((s) => s.label)).toEqual(["Kontore", "Wares", "League", "Sea lanes"]);
    const summed = strands.reduce((sum, s) => sum + s.contribution, 0);
    expect(summed).toBeCloseTo(hansaControl(g, PLAYER_ID).total, 5);
    // The ceilings are the strand weights, so "23 / 35" reads as points of the race.
    expect(strands.reduce((sum, s) => sum + s.ceiling, 0)).toBeCloseTo(1, 5);
    for (const strand of strands) {
      expect(strand.contribution).toBeLessThanOrEqual(strand.ceiling + 1e-9);
      expect(strand.hint.length).toBeGreaterThan(10);
    }
  }, 40_000);
});
