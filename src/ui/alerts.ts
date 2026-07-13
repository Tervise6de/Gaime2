/**
 * Alerts — a concise, prioritised list of the critical, player-relevant events
 * from the last turn, for a compact HUD banner. It folds the {@link TurnSummary}
 * diff together with the live {@link GameState} (to catch ongoing revolts that a
 * one-turn diff would miss) into at most a handful of entries, ordered
 * danger → warn → good so the scariest thing is always first.
 *
 * Pure and read-only: no DOM, no RNG, no mutation. The UI renders whatever it
 * returns.
 */

import { TECHS } from "@/data/techs";
import { PLAYER_ID, UNREST_REVOLT, type GameState } from "@/systems/state";
import type { TurnSummary } from "@/systems/summary";

export interface Alert {
  severity: "danger" | "warn" | "good";
  text: string;
}

/** Most alerts we ever show at once; excess (lowest priority) is dropped. */
const MAX_ALERTS = 6;

/**
 * Derive the player's critical alerts for the current state and (optional) last
 * turn summary. When `summary` is null (e.g. turn 1, before any turn resolved)
 * only the state-derived alerts — active revolts — are surfaced.
 */
export function deriveAlerts(state: GameState, summary: TurnSummary | null): Alert[] {
  const danger: Alert[] = [];
  const warn: Alert[] = [];
  const good: Alert[] = [];

  if (summary) {
    for (const name of summary.regionsLost) danger.push({ severity: "danger", text: `Lost ${name}` });
    for (const name of summary.warsDeclared)
      danger.push({ severity: "danger", text: `Now at war with ${name}` });
    if (summary.famine) danger.push({ severity: "danger", text: "Famine — population starving" });
    if (summary.bankrupt) danger.push({ severity: "danger", text: "Bankruptcy — troops disbanded" });
  }

  // Active revolts come straight from state, so they surface even with no summary.
  for (const region of state.regions) {
    if (region.ownerId === PLAYER_ID && region.unrest >= UNREST_REVOLT) {
      warn.push({ severity: "warn", text: `Revolt in ${region.name}` });
    }
  }

  if (summary) {
    for (const name of summary.regionsGained) good.push({ severity: "good", text: `Captured ${name}` });
    for (const name of summary.eliminated) good.push({ severity: "good", text: `${name} eliminated` });
    for (const id of summary.techsCompleted)
      good.push({ severity: "good", text: `Researched ${TECHS[id].name}` });
  }

  return [...danger, ...warn, ...good].slice(0, MAX_ALERTS);
}
