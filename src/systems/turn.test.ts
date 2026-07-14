import { describe, expect, it } from "vitest";
import { resolveTurn } from "@/systems/turn";
import { computePlayerEconomy } from "@/systems/economy";
import { generateGame } from "@/systems/mapgen";

describe("resolveTurn", () => {
  it("advances the turn counter by one", () => {
    const state = generateGame(2024);
    const { state: next } = resolveTurn(state);
    expect(next.turn).toBe(state.turn + 1);
  });

  it("credits the player's stockpile by the turn's income", () => {
    const state = generateGame(2024);
    const player = state.nations[0]!;
    const income = computePlayerEconomy(state).totals;
    const { state: next } = resolveTurn(state);
    const nextPlayer = next.nations[0]!;

    expect(nextPlayer.stockpile.gold).toBeCloseTo(
      player.stockpile.gold + income.gold,
      1,
    );
    expect(nextPlayer.stockpile.materials).toBeCloseTo(
      player.stockpile.materials + income.materials,
      1,
    );
  });

  it("is pure — the input state is left unchanged", () => {
    const state = generateGame(2024);
    const before = JSON.stringify(state);
    resolveTurn(state);
    expect(JSON.stringify(state)).toEqual(before);
  });

  it("is deterministic — same input yields identical output", () => {
    const a = resolveTurn(generateGame(2024)).state;
    const b = resolveTurn(generateGame(2024)).state;
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("never lets non-gold stockpiles go negative", () => {
    const state = generateGame(2024);
    // Force a large food deficit by inflating population beyond capacity.
    for (const region of state.regions) region.population = 999;
    const { state: next } = resolveTurn(state);
    const player = next.nations[0]!;
    expect(player.stockpile.food).toBeGreaterThanOrEqual(0);
    expect(player.stockpile.materials).toBeGreaterThanOrEqual(0);
    expect(player.stockpile.knowledge).toBeGreaterThanOrEqual(0);
  });

  it("returns a report per nation", () => {
    const state = generateGame(2024);
    const { reports } = resolveTurn(state);
    expect(reports).toHaveLength(state.nations.length);
    expect(reports[0]!.nationId).toBe(state.nations[0]!.id);
  });

  it("accumulates income over multiple turns", () => {
    let state = generateGame(2024);
    const startGold = state.nations[0]!.stockpile.gold;
    for (let i = 0; i < 5; i++) state = resolveTurn(state).state;
    expect(state.turn).toBe(6);
    expect(state.nations[0]!.stockpile.gold).toBeGreaterThan(startGold);
  });
});
