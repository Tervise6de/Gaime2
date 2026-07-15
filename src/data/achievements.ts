/**
 * Achievement definitions (content). Each names a milestone and a pure predicate
 * over the cumulative profile stats. Kept out of `profile.ts` so the awards list is
 * edited as a table; the type-only import of `ProfileStats` creates no runtime cycle.
 */

import type { ProfileStats } from "@/ui/profile";

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  /** Unlocked when this returns true for the player's stats. */
  test: (s: ProfileStats) => boolean;
}

const winsOf = (s: ProfileStats, kind: string): number => s.winsByKind[kind] ?? 0;

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_crown", name: "First Crown", desc: "Win your first game.", test: (s) => s.gamesWon >= 1 },
  {
    id: "conqueror",
    name: "Conqueror",
    desc: "Win by domination or by eliminating every rival.",
    test: (s) => winsOf(s, "domination") + winsOf(s, "conquest") >= 1,
  },
  {
    id: "wonder_of_the_age",
    name: "Wonder of the Age",
    desc: "Win by completing your Great Works.",
    test: (s) => winsOf(s, "great works") >= 1,
  },
  {
    id: "enlightened",
    name: "Enlightened",
    desc: "Win on prestige at the turn limit.",
    test: (s) => winsOf(s, "prestige score") >= 1,
  },
  {
    id: "polymath",
    name: "Polymath",
    desc: "Win by each of the three paths at least once.",
    test: (s) =>
      winsOf(s, "domination") + winsOf(s, "conquest") >= 1 &&
      winsOf(s, "great works") >= 1 &&
      winsOf(s, "prestige score") >= 1,
  },
  { id: "veteran", name: "Veteran", desc: "Play 10 games.", test: (s) => s.gamesPlayed >= 10 },
  { id: "warlord", name: "Warlord", desc: "Win 5 games.", test: (s) => s.gamesWon >= 5 },
  {
    id: "blitz",
    name: "Blitz",
    desc: "Win in 45 turns or fewer.",
    test: (s) => s.fastestWinTurns !== null && s.fastestWinTurns <= 45,
  },
  { id: "the_long_game", name: "The Long Game", desc: "Reach turn 130 in a single game.", test: (s) => s.longestGameTurns >= 130 },
  { id: "iron_blood", name: "Iron Blood", desc: "Win a game on Hard difficulty.", test: (s) => (s.winsByDifficulty["hard"] ?? 0) >= 1 },
];
