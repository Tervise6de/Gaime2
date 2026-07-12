import { describe, it, expect } from "vitest";
import { checkVictory, nationScore } from "@/systems/victory";
import { createGame } from "@/systems/turn";
import { PLAYER_ID, WONDER_GOAL, TURN_LIMIT } from "@/systems/state";

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
