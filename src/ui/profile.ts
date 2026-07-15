/**
 * Meta-progression — a per-browser player profile persisted to localStorage.
 *
 * It folds the outcome of each finished game into cumulative stats (games,
 * wins by victory type and difficulty, fastest win, longest game) and unlocks
 * achievements from those stats. Purely observational: it reads a finished
 * `GameState` and never changes gameplay. The achievement rules live in
 * `data/achievements.ts`; `deriveAchievements` is a pure function so both the
 * store and its tests share one source of truth.
 */

import type { GameState } from "@/systems/state";
import { ACHIEVEMENTS } from "@/data/achievements";

export interface ProfileStats {
  gamesPlayed: number;
  gamesWon: number;
  /** Wins keyed by victory kind ("domination", "great works", "prestige score", "conquest"). */
  winsByKind: Record<string, number>;
  /** Wins keyed by difficulty ("easy" | "normal" | "hard"). */
  winsByDifficulty: Record<string, number>;
  /** Fewest turns taken to win (null until the first win). */
  fastestWinTurns: number | null;
  /** Most turns any single game has reached. */
  longestGameTurns: number;
  /** Unlocked achievement ids. */
  achievements: string[];
}

const KEY = "gaime2:profile";

export function emptyStats(): ProfileStats {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    winsByKind: {},
    winsByDifficulty: {},
    fastestWinTurns: null,
    longestGameTurns: 0,
    achievements: [],
  };
}

/** Load the saved profile, tolerating absent/garbage storage by returning defaults. */
export function loadProfile(): ProfileStats {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStats();
    const p = JSON.parse(raw) as Partial<ProfileStats>;
    return {
      ...emptyStats(),
      ...p,
      winsByKind: { ...(p.winsByKind ?? {}) },
      winsByDifficulty: { ...(p.winsByDifficulty ?? {}) },
      achievements: Array.isArray(p.achievements) ? [...p.achievements] : [],
    };
  } catch {
    return emptyStats();
  }
}

function saveProfile(s: ProfileStats): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — progression just won't persist this session */
  }
}

/** The unlocked achievement ids for a stats snapshot (existing ∪ newly-earned). Pure. */
export function deriveAchievements(s: ProfileStats): string[] {
  const set = new Set(s.achievements);
  for (const a of ACHIEVEMENTS) if (a.test(s)) set.add(a.id);
  return [...set];
}

/**
 * Fold a finished game into the profile and persist it. A no-op (returns the
 * current profile) while the game is still playing. Returns the updated stats and
 * the ids of any achievements unlocked by this game, so the UI can celebrate them.
 */
export function recordGameEnd(state: GameState): { stats: ProfileStats; newlyUnlocked: string[] } {
  const s = loadProfile();
  if (state.outcome === "playing") return { stats: s, newlyUnlocked: [] };

  s.gamesPlayed += 1;
  s.longestGameTurns = Math.max(s.longestGameTurns, state.turn);
  if (state.outcome === "victory") {
    s.gamesWon += 1;
    const kind = state.victoryKind ?? "unknown";
    s.winsByKind[kind] = (s.winsByKind[kind] ?? 0) + 1;
    const diff = state.difficulty ?? "normal";
    s.winsByDifficulty[diff] = (s.winsByDifficulty[diff] ?? 0) + 1;
    s.fastestWinTurns = s.fastestWinTurns === null ? state.turn : Math.min(s.fastestWinTurns, state.turn);
  }

  const before = new Set(s.achievements);
  s.achievements = deriveAchievements(s);
  const newlyUnlocked = s.achievements.filter((id) => !before.has(id));
  saveProfile(s);
  return { stats: s, newlyUnlocked };
}
