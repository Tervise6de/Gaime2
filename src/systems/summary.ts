/**
 * Turn summary — a pure diff of two consecutive game states from the player's
 * point of view, surfacing the strategic changes that are easy to miss in the
 * scrolling log: regions gained/lost, wars and peace, eliminations, techs
 * completed, and the treasury swing.
 *
 * Pure and read-only: it never mutates state and touches no DOM. The UI renders
 * whatever it returns.
 */

import { atWar } from "@/systems/diplomacy";
import type { TechId } from "@/data/techs";
import { PLAYER_ID, type GameState } from "@/systems/state";

const round1 = (v: number): number => Math.round(v * 10) / 10;

export interface TurnSummary {
  goldDelta: number;
  regionsGained: string[];
  regionsLost: string[];
  warsDeclared: string[];
  peaceMade: string[];
  eliminated: string[];
  techsCompleted: TechId[];
  famine: boolean;
  bankrupt: boolean;
  /** True when nothing noteworthy happened (a quiet turn). */
  quiet: boolean;
}

function playerRegionNames(state: GameState): Map<number, string> {
  const m = new Map<number, string>();
  for (const r of state.regions) if (r.ownerId === PLAYER_ID) m.set(r.id, r.name);
  return m;
}

/** Summarise what changed for the player between `before` and `after`. */
export function summarizeTurn(before: GameState, after: GameState): TurnSummary {
  const beforePlayer = before.nations[PLAYER_ID];
  const afterPlayer = after.nations[PLAYER_ID];

  const beforeRegions = playerRegionNames(before);
  const afterRegions = playerRegionNames(after);
  const regionsGained: string[] = [];
  const regionsLost: string[] = [];
  for (const [id, name] of afterRegions) if (!beforeRegions.has(id)) regionsGained.push(name);
  for (const [id, name] of beforeRegions) if (!afterRegions.has(id)) regionsLost.push(name);

  const warsDeclared: string[] = [];
  const peaceMade: string[] = [];
  const eliminated: string[] = [];
  for (const n of after.nations) {
    if (n.isBarbarian || n.isPlayer) continue;
    const wasAlive = before.nations.find((b) => b.id === n.id)?.alive ?? false;
    if (wasAlive && !n.alive) eliminated.push(n.name);
    const wasWar = atWar(before, PLAYER_ID, n.id);
    const isWar = atWar(after, PLAYER_ID, n.id);
    if (!wasWar && isWar) warsDeclared.push(n.name);
    if (wasWar && !isWar && n.alive) peaceMade.push(n.name);
  }

  const beforeTechs = new Set(beforePlayer?.research.done ?? []);
  const techsCompleted = (afterPlayer?.research.done ?? []).filter((t) => !beforeTechs.has(t));

  const goldDelta = round1((afterPlayer?.stocks.gold ?? 0) - (beforePlayer?.stocks.gold ?? 0));
  const famine = !!afterPlayer?.famine;
  const bankrupt = !!afterPlayer?.bankrupt;

  const quiet =
    regionsGained.length === 0 &&
    regionsLost.length === 0 &&
    warsDeclared.length === 0 &&
    peaceMade.length === 0 &&
    eliminated.length === 0 &&
    techsCompleted.length === 0 &&
    !famine &&
    !bankrupt;

  return {
    goldDelta,
    regionsGained,
    regionsLost,
    warsDeclared,
    peaceMade,
    eliminated,
    techsCompleted,
    famine,
    bankrupt,
    quiet,
  };
}
