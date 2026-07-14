/**
 * Victory conditions and end-game detection (pure).
 *
 * Three ways a game ends: domination (own a share of the map), elimination
 * (last nation standing), or prestige (highest score at the turn limit). The
 * end-game summary screen reads `winner`/`victoryType` set here.
 */

import { prestige } from "@/systems/scoring";
import type { GameState } from "@/systems/types";

/** Fraction of all regions a single nation must hold to win by domination. */
export const DOMINATION_SHARE = 0.6;

export function checkVictory(state: GameState): void {
  if (state.phase === "ended") return;
  const alive = state.nations.filter((n) => n.alive);

  // Elimination — one nation (or none) left standing.
  if (alive.length <= 1) {
    endGame(state, alive[0]?.id ?? null, "elimination");
    return;
  }

  // Domination — a nation controls a decisive share of the map.
  const total = state.regions.length;
  for (const nation of alive) {
    const owned = state.regions.filter((r) => r.owner === nation.id).length;
    if (owned / total >= DOMINATION_SHARE) {
      endGame(state, nation.id, "domination");
      return;
    }
  }

  // Prestige — the turn limit forces a decisive finish.
  if (state.turn >= state.maxTurns) {
    let winner = alive[0].id;
    let bestScore = -Infinity;
    for (const nation of alive) {
      const score = prestige(state, nation.id);
      if (score > bestScore) {
        bestScore = score;
        winner = nation.id;
      }
    }
    endGame(state, winner, "prestige");
  }
}

function endGame(state: GameState, winner: number | null, type: GameState["victoryType"]): void {
  state.phase = "ended";
  state.winner = winner;
  state.victoryType = type;
  const name = winner !== null ? state.nations[winner]?.name ?? "?" : "Keegi";
  const label = type === "domination" ? "domineerimisega" : type === "elimination" ? "hävitamisega" : "prestiižiga";
  state.log.push(`Mäng läbi — ${name} võitis ${label} (${state.turn}. käik)`);
}
