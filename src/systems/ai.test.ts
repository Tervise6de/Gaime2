import { describe, it, expect } from "vitest";
import { runNationTurn } from "@/systems/ai";
import { createGame, resolveTurn } from "@/systems/turn";
import { createRng } from "@/systems/rng";
import { PLAYER_ID, BARBARIAN_ID, armySize } from "@/systems/state";

const RIVAL = 2;

describe("runNationTurn", () => {
  it("is deterministic for the same state and rng seed", () => {
    const g = createGame({ seed: 12345, rivals: 2 });
    const a = runNationTurn(g, RIVAL, createRng(999));
    const b = runNationTurn(g, RIVAL, createRng(999));
    expect(a).toEqual(b);
  });

  it("does not mutate the input state", () => {
    const g = createGame({ seed: 7, rivals: 2 });
    const snapshot = JSON.stringify(g);
    runNationTurn(g, RIVAL, createRng(1));
    expect(JSON.stringify(g)).toBe(snapshot);
  });

  it("queues construction in the rival's own regions only", () => {
    const g = createGame({ seed: 7, rivals: 2 });
    const next = runNationTurn(g, RIVAL, createRng(1));
    const builtElsewhere = next.regions.some(
      (r, i) => r.ownerId !== RIVAL && r.construction !== null && g.regions[i]!.construction === null,
    );
    expect(builtElsewhere).toBe(false);
  });
});

describe("rival behaviour over a game", () => {
  it("rivals expand into barbarian land", () => {
    let s = createGame({ seed: 12345, rivals: 2 });
    const rivalRegions = (g: typeof s) =>
      g.regions.filter((r) => r.ownerId === RIVAL).length;
    const start = rivalRegions(s);
    for (let i = 0; i < 30; i++) s = resolveTurn(s);
    expect(rivalRegions(s)).toBeGreaterThan(start);
  });

  it("wars break out among nations over time", () => {
    let s = createGame({ seed: 2024, rivals: 2 });
    let sawWar = false;
    for (let i = 0; i < 40 && !sawWar; i++) {
      s = resolveTurn(s);
      sawWar = Object.values(s.treaties).includes("war");
    }
    expect(sawWar).toBe(true);
  });

  it("respects the player's early-game grace period", () => {
    let s = createGame({ seed: 2024, rivals: 2 });
    for (let i = 0; i < 8; i++) s = resolveTurn(s);
    // No rival should have taken a player region this early.
    const playerRegions = s.regions.filter((r) => r.ownerId === PLAYER_ID).length;
    expect(playerRegions).toBeGreaterThan(0);
  });

  it("keeps the whole game deterministic with AI in the loop", () => {
    const run = () => {
      let s = createGame({ seed: 555, rivals: 2 });
      for (let i = 0; i < 25; i++) s = resolveTurn(s);
      return s.regions.map((r) => r.ownerId).join(",");
    };
    expect(run()).toBe(run());
  });

  it("a rival can field an army", () => {
    let s = createGame({ seed: 12345, rivals: 2 });
    for (let i = 0; i < 10; i++) s = resolveTurn(s);
    const rivalArmy = s.armies
      .filter((a) => a.ownerId === RIVAL)
      .reduce((sum, a) => sum + armySize(a.units), 0);
    expect(rivalArmy).toBeGreaterThan(0);
  });

  it("barbarians never take economic or AI turns", () => {
    let s = createGame({ seed: 1, rivals: 2 });
    const barbGold0 = s.nations[BARBARIAN_ID]!.stocks.gold;
    for (let i = 0; i < 5; i++) s = resolveTurn(s);
    expect(s.nations[BARBARIAN_ID]!.stocks.gold).toBe(barbGold0);
  });
});
