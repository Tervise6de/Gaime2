import { describe, it, expect, beforeEach } from "vitest";
import { emptyStats, deriveAchievements, recordGameEnd, loadProfile, type ProfileStats } from "@/ui/profile";
import type { GameState } from "@/systems/state";

// Minimal in-memory localStorage so the store is testable in the node env.
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

function endedGame(over: Partial<GameState>): GameState {
  return { outcome: "victory", victoryKind: "domination", turn: 60, difficulty: "normal", ...over } as GameState;
}

describe("deriveAchievements", () => {
  it("unlocks first_crown after a win and keeps prior unlocks", () => {
    const s: ProfileStats = { ...emptyStats(), gamesWon: 1, achievements: ["veteran"] };
    const got = deriveAchievements(s);
    expect(got).toContain("first_crown");
    expect(got).toContain("veteran"); // existing unlocks are preserved
  });

  it("requires conquest and prestige paths for polymath", () => {
    const base = { ...emptyStats(), gamesWon: 3 } as ProfileStats;
    expect(deriveAchievements({ ...base, winsByKind: { domination: 1 } })).not.toContain("polymath");
    expect(
      deriveAchievements({ ...base, winsByKind: { domination: 1, "prestige score": 1 } }),
    ).toContain("polymath");
  });
});

describe("recordGameEnd", () => {
  it("is a no-op while the game is still playing", () => {
    const r = recordGameEnd(endedGame({ outcome: "playing" }));
    expect(r.stats.gamesPlayed).toBe(0);
  });

  it("folds a win into the profile and reports newly-unlocked achievements", () => {
    const r = recordGameEnd(endedGame({ turn: 40, victoryKind: "domination" }));
    expect(r.stats.gamesPlayed).toBe(1);
    expect(r.stats.gamesWon).toBe(1);
    expect(r.stats.winsByKind["domination"]).toBe(1);
    expect(r.stats.fastestWinTurns).toBe(40);
    expect(r.newlyUnlocked).toContain("first_crown");
    expect(r.newlyUnlocked).toContain("blitz"); // 40 <= 45 turns
    // Persisted across loads.
    expect(loadProfile().gamesWon).toBe(1);
  });

  it("counts a loss as a game played but not won, and tracks longest game", () => {
    recordGameEnd(endedGame({ outcome: "victory", turn: 50 }));
    const r = recordGameEnd(endedGame({ outcome: "defeat", victoryKind: "elimination", turn: 90 }));
    expect(r.stats.gamesPlayed).toBe(2);
    expect(r.stats.gamesWon).toBe(1);
    expect(r.stats.longestGameTurns).toBe(90);
  });

  it("keeps the fastest win across multiple wins", () => {
    recordGameEnd(endedGame({ turn: 70 }));
    const r = recordGameEnd(endedGame({ turn: 55 }));
    expect(r.stats.fastestWinTurns).toBe(55);
  });
});
