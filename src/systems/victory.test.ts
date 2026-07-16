import { describe, it, expect } from "vitest";
import {
  checkVictory,
  nationScore,
  victoryProgress,
  victoryThreatText,
  victoryCounterPlay,
  endGameSummary,
} from "@/systems/victory";
import { createGame } from "@/systems/turn";
import { DOMINATION_FRACTION, PLAYER_ID, WONDER_GOAL, TURN_LIMIT } from "@/systems/state";

describe("nationScore", () => {
  it("is positive for a going concern", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    expect(nationScore(g, PLAYER_ID)).toBeGreaterThan(0);
  });

  it("rewards wonders and techs", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    const base = nationScore(g, PLAYER_ID);
    g.nations[PLAYER_ID]!.wonders = 2;
    g.nations[PLAYER_ID]!.research.done = ["agriculture", "currency"];
    expect(nationScore(g, PLAYER_ID)).toBeGreaterThan(base);
  });
});

describe("checkVictory", () => {
  it("returns null in a fresh game", () => {
    expect(checkVictory(createGame({ seed: 1, rivals: 2 }))).toBeNull();
  });

  it("declares domination victory when the player holds ≥60% of regions", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    // Give the player 60%+ of owned regions.
    const owned = g.regions.filter((r) => r.ownerId !== null);
    owned.forEach((r, i) => {
      r.ownerId = i < Math.ceil(owned.length * 0.7) ? PLAYER_ID : r.ownerId;
    });
    const v = checkVictory(g);
    expect(v?.outcome).toBe("victory");
    expect(v?.kind).toBe("domination");
  });

  it("declares a Great Works victory at the wonder goal", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    g.nations[PLAYER_ID]!.wonders = WONDER_GOAL;
    expect(checkVictory(g)?.kind).toBe("great works");
  });

  it("resolves by prestige score at the turn limit", () => {
    const g = { ...createGame({ seed: 1, rivals: 2 }), turn: TURN_LIMIT };
    const v = checkVictory(g);
    expect(v).not.toBeNull();
    expect(v?.kind).toBe("prestige score");
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
    expect(sum.winnerId).toBe(PLAYER_ID); // the player won
    // rows are sorted highest-score-first, and cover every non-barbarian nation.
    expect(sum.rows.length).toBe(3); // player + 2 rivals
    for (let i = 1; i < sum.rows.length; i++) {
      expect(sum.rows[i - 1]!.score).toBeGreaterThanOrEqual(sum.rows[i]!.score);
    }
    expect(sum.playerRank).toBeGreaterThanOrEqual(1);
    expect(sum.rows.find((r) => r.id === PLAYER_ID)).toBeTruthy();
  });

  it("on a defeat, the winner is the leading living rival (not the player)", () => {
    let g = createGame({ seed: 2, rivals: 2 });
    // Rival 2 sweeps the map; player is dead.
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
    expect(sum.winnerId).not.toBe(PLAYER_ID);
  });

  it("reports each nation's peak prestige and the turn it peaked from the history", () => {
    const base = createGame({ seed: 3, rivals: 2 });
    const g = {
      ...base,
      turn: 5,
      outcome: "victory" as const,
      victoryKind: "prestige score",
      scoreHistory: { ...base.scoreHistory, [PLAYER_ID]: [10, 90, 40, 30, 25] }, // peaked turn 2
    };
    const row = endGameSummary(g).rows.find((r) => r.id === PLAYER_ID)!;
    expect(row.peakScore).toBeGreaterThanOrEqual(90);
    expect(row.peakTurn).toBe(2);
  });
});

describe("victoryProgress", () => {
  it("reports the domination path by default, reaching 1.0 at the threshold", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    const owned = g.regions.filter((r) => r.ownerId !== null);
    // Give the player exactly the domination share.
    const need = Math.ceil(owned.length * DOMINATION_FRACTION);
    owned.forEach((r, i) => { r.ownerId = i < need ? PLAYER_ID : 2; });
    const vp = victoryProgress(g, PLAYER_ID);
    expect(vp.kind).toBe("domination");
    expect(vp.fraction).toBeGreaterThanOrEqual(1);
    expect(vp.label).toMatch(/%⬢$/);
  });

  it("switches to the Great Works path when wonders are the closer win", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    g.nations[PLAYER_ID]!.wonders = 3; // 3/4 = 0.75, likely above early domination share
    const vp = victoryProgress(g, PLAYER_ID);
    expect(vp.kind).toBe("great works");
    expect(vp.label).toBe(`3/${WONDER_GOAL}★`);
    expect(vp.fraction).toBeCloseTo(3 / WONDER_GOAL, 5);
  });

  it("clamps fraction to at most 1", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    g.nations[PLAYER_ID]!.wonders = WONDER_GOAL + 2;
    expect(victoryProgress(g, PLAYER_ID).fraction).toBe(1);
  });

  it("reports the absolute context behind the percentage", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    const owned = g.regions.filter((r) => r.ownerId !== null);
    const held = 3;
    owned.forEach((r, i) => { r.ownerId = i < held ? PLAYER_ID : 2; });
    const vp = victoryProgress(g, PLAYER_ID);
    expect(vp.held).toBe(held);
    expect(vp.total).toBe(owned.length);
    // Regions still needed to reach the domination threshold.
    expect(vp.regionsToWin).toBe(Math.ceil(DOMINATION_FRACTION * owned.length) - held);
    expect(vp.wondersToWin).toBe(WONDER_GOAL);
  });
});

describe("victoryThreatText", () => {
  it("explains a domination lead with concrete region counts", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    const owned = g.regions.filter((r) => r.ownerId !== null);
    owned.forEach((r, i) => { r.ownerId = i < 4 ? 2 : r.ownerId; });
    const vp = victoryProgress(g, 2);
    const text = victoryThreatText(vp, "Rurik");
    expect(text).toContain("Rurik");
    expect(text).toMatch(/\d+ of \d+ regions/);
    expect(text).toContain(`${Math.round(DOMINATION_FRACTION * 100)}%`);
  });

  it("reads in the second person for the player", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    g.nations[PLAYER_ID]!.wonders = 3;
    const vp = victoryProgress(g, PLAYER_ID);
    const text = victoryThreatText(vp, "You");
    expect(text).toMatch(/^You have raised 3 of/);
  });

  it("offers a path-appropriate counter-play prompt", () => {
    const dom = { kind: "domination" } as ReturnType<typeof victoryProgress>;
    const gw = { kind: "great works" } as ReturnType<typeof victoryProgress>;
    expect(victoryCounterPlay(dom)).toMatch(/region|rall/i);
    expect(victoryCounterPlay(gw)).toMatch(/wonder|war/i);
  });
});
