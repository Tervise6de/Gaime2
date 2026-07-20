import { describe, it, expect } from "vitest";
import { summarizeTurn } from "@/systems/summary";
import { createGame, resolveTurn } from "@/systems/turn";
import { setTreaty } from "@/systems/diplomacy";
import { PLAYER_ID, type GameState } from "@/systems/state";

describe("summarizeTurn", () => {
  it("reports a quiet turn when nothing notable changes", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    const s = summarizeTurn(g, g);
    expect(s.quiet).toBe(true);
    expect(s.goldDelta).toBe(0);
  });

  it("captures the treasury swing", () => {
    const before = createGame({ seed: 1, rivals: 2 });
    const after: GameState = {
      ...before,
      nations: before.nations.map((n) =>
        n.id === PLAYER_ID ? { ...n, stocks: { ...n.stocks, gold: n.stocks.gold + 12 } } : n,
      ),
    };
    expect(summarizeTurn(before, after).goldDelta).toBeCloseTo(12, 5);
    // Gold moves every turn from income, so a gold-only change stays "quiet".
    expect(summarizeTurn(before, after).quiet).toBe(true);
  });

  it("lists regions gained and lost", () => {
    const before = createGame({ seed: 1, rivals: 2 });
    // Flip one barbarian region to the player (gain) and one player region away (loss).
    const playerRegion = before.regions.find((r) => r.ownerId === PLAYER_ID)!;
    const barbRegion = before.regions.find((r) => r.ownerId !== PLAYER_ID)!;
    const after: GameState = {
      ...before,
      regions: before.regions.map((r) => {
        if (r.id === barbRegion.id) return { ...r, ownerId: PLAYER_ID };
        if (r.id === playerRegion.id) return { ...r, ownerId: barbRegion.ownerId };
        return r;
      }),
    };
    const s = summarizeTurn(before, after);
    expect(s.regionsGained).toContain(barbRegion.name);
    expect(s.regionsLost).toContain(playerRegion.name);
  });

  it("flags a newly declared war and a peace made", () => {
    const before = createGame({ seed: 1, rivals: 2 });
    const rival = before.nations.find((n) => !n.isPlayer && !n.isBarbarian)!;
    const atWarState = setTreaty(before, PLAYER_ID, rival.id, "war");
    const warSummary = summarizeTurn(before, atWarState);
    expect(warSummary.warsDeclared).toContain(rival.name);

    const backToPeace = setTreaty(atWarState, PLAYER_ID, rival.id, "peace");
    const peaceSummary = summarizeTurn(atWarState, backToPeace);
    expect(peaceSummary.peaceMade).toContain(rival.name);
  });

  it("lists a completed tech", () => {
    const before = createGame({ seed: 1, rivals: 2 });
    const after: GameState = {
      ...before,
      nations: before.nations.map((n) =>
        n.id === PLAYER_ID
          ? { ...n, research: { ...n.research, done: [...n.research.done, "free_trade"] } }
          : n,
      ),
    };
    expect(summarizeTurn(before, after).techsCompleted).toContain("free_trade");
  });

  it("is a pure read (does not mutate its inputs)", () => {
    const before = createGame({ seed: 3, rivals: 2 });
    const after = resolveTurn(before);
    const beforeSnap = JSON.stringify(before);
    const afterSnap = JSON.stringify(after);
    summarizeTurn(before, after);
    expect(JSON.stringify(before)).toBe(beforeSnap);
    expect(JSON.stringify(after)).toBe(afterSnap);
  });
});
