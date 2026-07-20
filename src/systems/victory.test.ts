import { describe, it, expect } from "vitest";
import { checkVictory, endGameSummary, nationScore, victoryProgress, victoryRaces } from "@/systems/victory";
import { createGame } from "@/systems/turn";
import { DOMINATION_FRACTION, PLAYER_ID, TURN_LIMIT } from "@/systems/state";

describe("nationScore", () => {
  it("is positive for a going concern", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    expect(nationScore(g, PLAYER_ID)).toBeGreaterThan(0);
  });

  it("rewards techs", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    const base = nationScore(g, PLAYER_ID);
    g.nations[PLAYER_ID]!.research.done = ["free_trade", "council_oversight"];
    expect(nationScore(g, PLAYER_ID)).toBeGreaterThan(base);
  });

  it("rewards the luxury trade (renown as well as gold)", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    const base = nationScore(g, PLAYER_ID);
    // A flowing furs route (a luxury) lifts prestige; a staple route would not.
    const withLux = {
      ...g,
      routes: [
        ...(g.routes ?? []),
        { id: 999, ownerId: PLAYER_ID, good: "furs" as const, fromRegionId: 0, toKontorId: "novgorod" as const, lane: [0], lastIncome: 10 },
      ],
    };
    expect(nationScore(withLux, PLAYER_ID)).toBeGreaterThan(base);
  });
});

describe("checkVictory", () => {
  it("returns null in a fresh game", () => {
    expect(checkVictory(createGame({ seed: 1, rivals: 2 }))).toBeNull();
  });

  it("declares domination victory when the player holds the threshold", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    const owned = g.regions.filter((r) => r.ownerId !== null);
    owned.forEach((r, i) => {
      r.ownerId = i < Math.ceil(owned.length * 0.7) ? PLAYER_ID : r.ownerId;
    });
    expect(checkVictory(g)).toEqual({ outcome: "victory", kind: "domination" });
  });

  it("resolves by prestige score at the turn limit", () => {
    const g = { ...createGame({ seed: 1, rivals: 2 }), turn: TURN_LIMIT };
    expect(checkVictory(g)?.kind).toBe("prestige score");
  });

  it("a rival reaching domination is the player's defeat", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    const owned = g.regions.filter((r) => r.ownerId !== null);
    owned.forEach((r, i) => {
      r.ownerId = i < Math.ceil(owned.length * 0.7) ? 2 : r.ownerId;
    });
    expect(checkVictory(g)?.outcome).toBe("defeat");
  });
});

describe("endGameSummary", () => {
  it("ranks nations by final prestige, marks the player rank, and names the winner", () => {
    const g = { ...createGame({ seed: 1, rivals: 2 }), outcome: "victory" as const, victoryKind: "domination" };
    const sum = endGameSummary(g);
    expect(sum.outcome).toBe("victory");
    expect(sum.kind).toBe("domination");
    expect(sum.winnerId).toBe(PLAYER_ID);
    expect(sum.rows.length).toBe(g.nations.filter((n) => !n.isBarbarian).length);
    for (let i = 1; i < sum.rows.length; i++) {
      expect(sum.rows[i - 1]!.score).toBeGreaterThanOrEqual(sum.rows[i]!.score);
    }
    expect(sum.playerRank).toBeGreaterThanOrEqual(1);
  });

  it("on a defeat, the winner is the leading living rival", () => {
    let g = createGame({ seed: 2, rivals: 2 });
    g = {
      ...g,
      outcome: "defeat",
      victoryKind: "domination",
      regions: g.regions.map((r) => (r.ownerId !== null ? { ...r, ownerId: 2 } : r)),
      nations: g.nations.map((n) => (n.id === PLAYER_ID ? { ...n, alive: false } : n)),
    };
    const sum = endGameSummary(g);
    expect(sum.outcome).toBe("defeat");
    expect(sum.winnerId).toBe(2);
  });

  it("reports each nation's peak prestige and the turn it peaked from history", () => {
    const base = createGame({ seed: 3, rivals: 2 });
    const g = {
      ...base,
      turn: 5,
      outcome: "victory" as const,
      victoryKind: "prestige score",
      scoreHistory: { ...base.scoreHistory, [PLAYER_ID]: [10, 9999, 40, 30, 25] },
    };
    const row = endGameSummary(g).rows.find((r) => r.id === PLAYER_ID)!;
    expect(row.peakScore).toBe(9999);
    expect(row.peakTurn).toBe(2);
  });
});

describe("victoryProgress", () => {
  it("reports domination progress, reaching 1.0 at the threshold", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    const owned = g.regions.filter((r) => r.ownerId !== null);
    const need = Math.ceil(owned.length * DOMINATION_FRACTION);
    owned.forEach((r, i) => {
      r.ownerId = i < need ? PLAYER_ID : 2;
    });
    const vp = victoryProgress(g, PLAYER_ID);
    expect(vp.kind).toBe("domination");
    expect(vp.fraction).toBeGreaterThanOrEqual(1);
    expect(vp.label).toMatch(/%/);
  });
});

describe("victoryRaces", () => {
  it("reports the live paths with you and the leading rival", () => {
    const races = victoryRaces(createGame({ seed: 3, rivals: 3 }));
    expect(races.map((r) => r.kind)).toEqual(["domination", "prestige"]);
    for (const r of races) {
      expect(r.you.fraction).toBeGreaterThanOrEqual(0);
      expect(r.you.fraction).toBeLessThanOrEqual(1);
      expect(r.rival).not.toBeNull();
    }
  });
});
