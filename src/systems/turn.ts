/**
 * Turn resolution pipeline.
 *
 * The heart of the deterministic sim: `resolveTurn` is a pure transform
 * `GameState -> GameState` (design doc §1, §7). It clones the input, runs the
 * fixed resolution order, and returns a fresh state plus the per-nation economy
 * reports (handy for the turn summary UI). The original state is never mutated.
 *
 * M1 order (later milestones insert stages between these):
 *   income & upkeep  →  (production, population, unrest, research, AI, combat,
 *                        events — added M2+)  →  advance turn counter.
 */

import type { GameState, Resources } from "@/core/types";
import { computeNationEconomy, type NationEconomy } from "@/systems/economy";

export interface TurnResult {
  /** The new state after resolution. */
  state: GameState;
  /** Economy report per nation for this turn (index-aligned with nations). */
  reports: NationEconomy[];
}

/** Deep clone of state so resolution stays pure. */
function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Apply a turn of income to a nation's stockpile. Gold may go negative (debt is
 * a real failure state; penalties arrive in later milestones); the other
 * resources are clamped at zero — you cannot hold a negative larder.
 */
function applyIncome(stockpile: Resources, totals: Resources): Resources {
  return {
    gold: round2(stockpile.gold + totals.gold),
    food: round2(Math.max(0, stockpile.food + totals.food)),
    materials: round2(Math.max(0, stockpile.materials + totals.materials)),
    knowledge: round2(Math.max(0, stockpile.knowledge + totals.knowledge)),
  };
}

/**
 * Resolve one full turn. Pure: returns a new state, leaves `state` untouched.
 */
export function resolveTurn(state: GameState): TurnResult {
  const next = cloneState(state);
  const reports: NationEconomy[] = [];

  // Income & upkeep — compute each nation's economy from the *incoming* state,
  // then credit its stockpile in the new state.
  for (const nation of next.nations) {
    const report = computeNationEconomy(state, nation);
    reports.push(report);
    nation.stockpile = applyIncome(nation.stockpile, report.totals);
  }

  next.turn = state.turn + 1;

  return { state: next, reports };
}
