/**
 * The turn pipeline — a pure function `(state) => newState`.
 *
 * Resolution order (design §1): economy → each AI nation acts → fort upkeep →
 * advance turn → record prestige snapshot → victory check → ready the player's
 * armies for the next turn. Determinism comes from threading the RNG cursor
 * through `state.rngState`; the input state is never mutated (we clone first).
 */

import { runNationAi, type AiOptions } from "@/systems/ai";
import { applyEconomy } from "@/systems/economy";
import { resetMovement } from "@/systems/actions";
import { createRng } from "@/systems/rng";
import { snapshotScores } from "@/systems/scoring";
import { checkVictory } from "@/systems/victory";
import type { GameState } from "@/systems/types";

/** Resolve the end of the player's turn and produce the next state. */
export function endTurn(state: GameState, aiOpts?: AiOptions): GameState {
  if (state.phase === "ended") return state;
  const s: GameState = structuredClone(state);
  const rng = createRng(s.seed, s.rngState);

  applyEconomy(s);

  for (const nation of s.nations) {
    if (nation.alive && !nation.isPlayer) runNationAi(s, rng, nation.id, aiOpts);
  }

  regrowForts(s);

  s.turn += 1;
  s.rngState = rng.state();
  s.scoreHistory.push(snapshotScores(s));
  checkVictory(s);

  // Ready the human player's armies for their upcoming turn.
  const player = s.nations.find((n) => n.isPlayer);
  if (player) resetMovement(s, player.id);

  // Cap the event log so the state stays small.
  if (s.log.length > 200) s.log = s.log.slice(-200);

  return s;
}

/** Owned, unthreatened regions slowly regrow one fortification level. */
function regrowForts(s: GameState): void {
  for (const region of s.regions) {
    if (region.owner < 0 || region.fort >= 2) continue;
    const threatened = region.adj.some((n) => {
      const nr = s.regions[n];
      return nr.owner !== region.owner;
    });
    if (!threatened && region.population > 6) region.fort += 1;
  }
}
