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
  // --- Absolute context, so the UI can explain the number rather than just
  //     show a bare percentage (docs/game-design.md §8 M6: understandable UX). ---
  /** Raw share of all in-play regions this nation holds, 0..1. */
  share: number;
  /** Regions this nation holds. */
  held: number;
  /** Regions currently in play (owned by anyone). */
  total: number;
  /** Regions still needed to reach the domination threshold (≥0). */
  regionsToWin: number;
  /** Great Works this nation has completed. */
  wonders: number;
  /** Great Works still needed to win (≥0). */
  wondersToWin: number;
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

  const regionsToWin = Math.max(0, Math.ceil(DOMINATION_FRACTION * total) - held);
  const wondersToWin = Math.max(0, WONDER_GOAL - wonders);
  const context = { share: domShare, held, total, regionsToWin, wonders, wondersToWin };

  if (wonderFraction >= domFraction && wonders > 0) {
    return { kind: "great works", label: `${wonders}/${WONDER_GOAL}★`, fraction: wonderFraction, ...context };
  }
  return { kind: "domination", label: `${Math.round(domShare * 100)}%⬢`, fraction: domFraction, ...context };
}

/**
 * A plain-language, self-explaining description of how close `name` is to
 * winning and by which path — with the concrete numbers behind the percentage,
 * so a player reading it understands *what is happening* and what it takes to
 * win. Pure (no DOM); shared by the alert strip and the standings explainer so
 * they never disagree.
 */
export function victoryThreatText(vp: VictoryProgress, name: string): string {
  // Read naturally in both the second person ("You hold…") and third ("AX holds…").
  const you = name === "You";
  if (vp.kind === "great works") {
    const has = you ? "have" : "has";
    const more = vp.wondersToWin;
    return (
      `${name} ${has} raised ${vp.wonders} of ${WONDER_GOAL} Great Works` +
      (more <= 0 ? " — enough to win." : ` — ${more} more would win the game.`)
    );
  }
  const holds = you ? "hold" : "holds";
  const need = Math.round(DOMINATION_FRACTION * 100);
  const more = vp.regionsToWin;
  return (
    `${name} ${holds} ${vp.held} of ${vp.total} regions (${Math.round(vp.share * 100)}% of the map)` +
    (more <= 0
      ? ` — past the ${need}% needed to dominate.`
      : ` — ${more} more region${more === 1 ? "" : "s"} reaches the ${need}% that wins by domination.`)
  );
}

/** A short counter-play prompt for a rival closing on victory (alert hint). */
export function victoryCounterPlay(vp: VictoryProgress): string {
  return vp.kind === "great works"
    ? "Race your own wonders, or go to war to slow theirs."
    : "Retake regions or rally rivals against them before they hit the threshold.";
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

/** One nation's line in the end-game summary. */
export interface EndSummaryRow {
  id: number;
  score: number;
  regions: number;
  wonders: number;
  techs: number;
  /** Highest prestige this nation ever reached, and the turn it peaked. */
  peakScore: number;
  peakTurn: number;
  alive: boolean;
}

/** The whole-game recap shown on the end screen. */
export interface EndSummary {
  outcome: "victory" | "defeat";
  kind: string | undefined;
  /** Who actually won: the player on a victory, else the leading living rival. */
  winnerId: number;
  turns: number;
  /** Every non-barbarian nation, sorted by final prestige (highest first). */
  rows: EndSummaryRow[];
  /** The player's 1-based finishing rank among all non-barbarian nations. */
  playerRank: number;
}

/**
 * Build the end-of-game recap from final state + the prestige history. Pure and
 * deterministic (no RNG, no DOM) so the UI just renders it. Safe to call at any
 * time, but meaningful once `state.outcome !== "playing"`.
 */
export function endGameSummary(state: GameState): EndSummary {
  const history = state.scoreHistory ?? {};
  const rows: EndSummaryRow[] = state.nations
    .filter((n) => !n.isBarbarian)
    .map((n) => {
      const series = history[n.id] ?? [];
      let peakScore = 0;
      let peakTurn = 1;
      series.forEach((v, i) => {
        if (v > peakScore) {
          peakScore = v;
          peakTurn = i + 1; // history is sampled from turn 1
        }
      });
      const score = nationScore(state, n.id);
      if (score > peakScore) {
        peakScore = score;
        peakTurn = state.turn;
      }
      return {
        id: n.id,
        score,
        regions: state.regions.filter((r) => r.ownerId === n.id).length,
        wonders: n.wonders,
        techs: n.research.done.length,
        peakScore,
        peakTurn,
        alive: n.alive,
      };
    })
    .sort((a, b) => b.score - a.score);

  const outcome = state.outcome === "victory" ? "victory" : "defeat";
  // The winner: the player when they won, otherwise the top-scoring living rival.
  const winnerId =
    outcome === "victory"
      ? PLAYER_ID
      : (rows.find((r) => r.alive && r.id !== PLAYER_ID)?.id ?? rows[0]?.id ?? PLAYER_ID);
  const playerRank = rows.findIndex((r) => r.id === PLAYER_ID) + 1;

  return { outcome, kind: state.victoryKind, winnerId, turns: state.turn, rows, playerRank };
}
