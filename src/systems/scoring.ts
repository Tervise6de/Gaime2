/**
 * Prestige scoring.
 *
 * A single scalar per nation, recorded every turn into `state.scoreHistory`.
 * That history is what the end-game summary screen graphs — the data model is
 * built here so the summary is a pure read of existing state.
 */

import { UNITS } from "@/systems/data";
import type { GameState, ScoreSnapshot } from "@/systems/types";
import { UNIT_TYPES } from "@/systems/types";

const W_REGION = 10;
const W_POP = 0.6;
const W_ARMY = 0.25;
const W_TREASURY = 0.05;
const W_FORT = 2;

/** Compute a nation's current prestige from the live state. */
export function prestige(state: GameState, nationId: number): number {
  const nation = state.nations[nationId];
  if (!nation || !nation.alive) return 0;
  let score = 0;
  for (const region of state.regions) {
    if (region.owner !== nationId) continue;
    score += W_REGION + region.population * W_POP + region.fort * W_FORT;
  }
  for (const army of state.armies) {
    if (army.owner !== nationId) continue;
    for (const type of UNIT_TYPES) {
      score += army.units[type] * (UNITS[type].attack + UNITS[type].defense) * W_ARMY;
    }
  }
  score += Math.max(0, nation.treasury) * W_TREASURY;
  return Math.round(score);
}

/** Snapshot every nation's prestige for the current turn. */
export function snapshotScores(state: GameState): ScoreSnapshot {
  return {
    turn: state.turn,
    scores: state.nations.map((n) => prestige(state, n.id)),
  };
}
