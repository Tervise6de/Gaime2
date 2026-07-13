/**
 * Victory conditions and prestige score (docs/game-design.md §6).
 *
 * Three paths, so different strategies win from the same systems:
 *   1. Domination — hold ≥ DOMINATION_FRACTION of all regions (or, via
 *      elimination in turn.ts, be the last realm standing).
 *   2. Great Works — complete WONDER_GOAL wonders (a builder/turtle path).
 *   3. Prestige — at TURN_LIMIT, the highest score wins (a decisive fallback).
 *
 * Pure over `GameState`.
 */

import {
  DOMINATION_FRACTION,
  PLAYER_ID,
  TURN_LIMIT,
  WONDER_GOAL,
  type GameState,
} from "@/systems/state";

/** Prestige score — territory, tech, wonders, treasury and population. */
export function nationScore(state: GameState, id: number): number {
  const regions = state.regions.filter((r) => r.ownerId === id);
  const nation = state.nations.find((n) => n.id === id);
  if (!nation) return 0;
  const population = regions.reduce((s, r) => s + r.population, 0);
  return Math.round(
    regions.length * 10 +
      nation.research.done.length * 15 +
      nation.wonders * 40 +
      Math.max(0, nation.stocks.gold) / 10 +
      population,
  );
}

export interface VictoryProgress {
  /** The path this nation is closest to completing. */
  kind: "domination" | "great works";
  /** A compact label, e.g. "42%⬢" (territory share) or "2/4★" (wonders). */
  label: string;
  /** How far toward that win, 0..1 (1 = would trigger it). */
  fraction: number;
}

/**
 * The victory path a nation is nearest to winning, as a 0..1 threat gauge for
 * the standings. Compares its territory share (toward domination) against its
 * wonders (toward Great Works) and reports whichever is closer. Pure.
 */
export function victoryProgress(state: GameState, id: number): VictoryProgress {
  const nation = state.nations.find((n) => n.id === id);
  const total = state.regions.filter((r) => r.ownerId !== null).length || 1;
  const held = state.regions.filter((r) => r.ownerId === id).length;
  const domShare = held / total;
  const domFraction = Math.min(1, domShare / DOMINATION_FRACTION);
  const wonders = nation?.wonders ?? 0;
  const wonderFraction = Math.min(1, wonders / WONDER_GOAL);

  if (wonderFraction >= domFraction && wonders > 0) {
    return { kind: "great works", label: `${wonders}/${WONDER_GOAL}★`, fraction: wonderFraction };
  }
  return { kind: "domination", label: `${Math.round(domShare * 100)}%⬢`, fraction: domFraction };
}

export interface VictoryCheck {
  outcome: "victory" | "defeat";
  kind: string;
}

/**
 * Decide the game if a condition is met, else return null. Domination and Great
 * Works can trigger any turn; the score tiebreak triggers at the turn limit.
 */
export function checkVictory(state: GameState): VictoryCheck | null {
  const total = state.regions.filter((r) => r.ownerId !== null).length || 1;
  const contenders = state.nations.filter((n) => !n.isBarbarian && n.alive);

  for (const n of contenders) {
    const held = state.regions.filter((r) => r.ownerId === n.id).length;
    if (held / total >= DOMINATION_FRACTION) {
      return decide(n.id, "domination");
    }
    if (n.wonders >= WONDER_GOAL) {
      return decide(n.id, "great works");
    }
  }

  if (state.turn >= TURN_LIMIT) {
    const ranked = contenders
      .map((n) => ({ id: n.id, score: nationScore(state, n.id) }))
      .sort((a, b) => b.score - a.score);
    const leader = ranked[0];
    if (leader) return decide(leader.id, "prestige score");
  }

  return null;
}

function decide(winnerId: number, kind: string): VictoryCheck {
  return { outcome: winnerId === PLAYER_ID ? "victory" : "defeat", kind };
}
