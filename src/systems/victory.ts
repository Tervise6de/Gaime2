/**
 * Victory conditions and prestige score (docs/game-design.md §6).
 *
 * Two live paths:
 *   1. Domination — hold ≥ DOMINATION_FRACTION of all regions (or, via
 *      elimination in turn.ts, be the last realm standing).
 *   2. Prestige — at TURN_LIMIT, the highest score wins (a decisive fallback).
 *
 * Pure over `GameState`.
 */

import {
  DOMINATION_FRACTION,
  PLAYER_ID,
  TURN_LIMIT,
  type GameState,
} from "@/systems/state";
import { GOODS } from "@/data/goods";
import { luxuryAppetite, resolveContentment } from "@/systems/prosperity";

/** Prestige earned per gold of luxury-ware trade income — the Hansa's wealth as renown. */
const LUXURY_PRESTIGE_WEIGHT = 2;
/**
 * Prestige per head of a *content* burgher population (R5.1). A realm that keeps its
 * towns in furs, cloth, wax, amber and wool flaunts that comfort as renown — so
 * luxuries matter for winning even when unrest is already low (where the unrest
 * easing does nothing). Naturally capped at full contentment (ratio ≤ 1), so it is
 * a bounded gold→luxuries→prestige sink, not a money pump.
 */
const CONTENT_PRESTIGE_PER_POP = 1.0;

/** Prestige score — territory, tech, treasury, population, luxury trade, and burgher contentment. */
export function nationScore(state: GameState, id: number): number {
  const regions = state.regions.filter((r) => r.ownerId === id);
  const nation = state.nations.find((n) => n.id === id);
  if (!nation) return 0;
  const population = regions.reduce((s, r) => s + r.population, 0);
  // The luxury trade (furs, wax, amber, cloth, copper, honey, wool) is renown as
  // well as gold: a realm carrying luxuries to the Kontore earns prestige for it.
  const luxuryIncome = (state.routes ?? [])
    .filter((r) => r.ownerId === id && GOODS[r.good].roles.includes("luxury"))
    .reduce((s, r) => s + (r.lastIncome ?? 0), 0);
  // Burgher contentment: keeping the towns supplied with luxuries is itself renown.
  const contentment = resolveContentment(nation.wares, luxuryAppetite(population)).ratio;
  return Math.round(
    regions.length * 10 +
      nation.research.done.length * 15 +
      Math.max(0, nation.stocks.gold) / 10 +
      population +
      luxuryIncome * LUXURY_PRESTIGE_WEIGHT +
      contentment * population * CONTENT_PRESTIGE_PER_POP +
      // Lasting renown bought with surplus treasury over the ages (R6) — already in
      // prestige points, so it counts one-for-one.
      (nation.renown ?? 0),
  );
}

export interface VictoryProgress {
  /** The path this nation is closest to completing. */
  kind: "domination";
  /** A compact territory label, e.g. "42%⬢". */
  label: string;
  /** How far toward that win, 0..1 (1 = would trigger it). */
  fraction: number;
}

/**
 * The domination threat gauge for the standings. Pure.
 */
export function victoryProgress(state: GameState, id: number): VictoryProgress {
  const total = state.regions.filter((r) => r.ownerId !== null).length || 1;
  const held = state.regions.filter((r) => r.ownerId === id).length;
  const domShare = held / total;
  const domFraction = Math.min(1, domShare / DOMINATION_FRACTION);
  return { kind: "domination", label: `${Math.round(domShare * 100)}%⬢`, fraction: domFraction };
}

/** One victory path as a legible race: your standing vs the leading rival's. */
export interface VictoryRace {
  kind: "domination" | "prestige";
  title: string;
  /** What winning this path takes. */
  goal: string;
  you: { value: string; fraction: number };
  /** The rival nearest to winning this path (null if no living rival). */
  rival: { name: string; value: string; fraction: number } | null;
  /** A rival is dangerously close to this win — surface a warning. */
  alarm: boolean;
}

/**
 * The live victory paths as side-by-side races (you vs the leading rival on
 * each), for the Politics readout. Pure; fractions are 0..1 toward the win.
 */
export function victoryRaces(state: GameState): VictoryRace[] {
  const living = state.nations.filter((n) => !n.isBarbarian && n.alive);
  const rivals = living.filter((n) => !n.isPlayer);
  const total = state.regions.filter((r) => r.ownerId !== null).length || 1;
  const held = (id: number): number => state.regions.filter((r) => r.ownerId === id).length;
  const topRival = (val: (n: (typeof rivals)[number]) => number): { n: (typeof rivals)[number]; v: number } | null => {
    let best: { n: (typeof rivals)[number]; v: number } | null = null;
    for (const n of rivals) {
      const v = val(n);
      if (!best || v > best.v) best = { n, v };
    }
    return best;
  };

  const domShare = (id: number): number => held(id) / total;
  const pDom = domShare(PLAYER_ID);
  const rDom = topRival((n) => domShare(n.id));

  const pScore = nationScore(state, PLAYER_ID);
  const rScore = topRival((n) => nationScore(state, n.id));
  const maxScore = Math.max(pScore, rScore?.v ?? 0, 1);

  // Effective turn limit for this game (Game-length setting): a number, or null
  // for an endless game (no deadline — the "∞" shown below, no alarm).
  const limit = state.turnLimit === undefined ? TURN_LIMIT : state.turnLimit;
  const endless = limit === null;

  return [
    {
      kind: "domination",
      title: "Domination",
      goal: `Hold ${Math.round(DOMINATION_FRACTION * 100)}% of the land`,
      you: { value: `${Math.round(pDom * 100)}%`, fraction: Math.min(1, pDom / DOMINATION_FRACTION) },
      rival: rDom
        ? { name: rDom.n.name, value: `${Math.round(rDom.v * 100)}%`, fraction: Math.min(1, rDom.v / DOMINATION_FRACTION) }
        : null,
      alarm: !!rDom && rDom.v >= DOMINATION_FRACTION - 0.12,
    },
    {
      kind: "prestige",
      title: endless ? `Prestige · turn ${state.turn}/∞` : `Prestige · turn ${state.turn}/${limit}`,
      goal: endless ? "Lead in score — no turn limit" : `Lead in score when turn ${limit} ends`,
      you: { value: `${pScore}`, fraction: pScore / maxScore },
      rival: rScore ? { name: rScore.n.name, value: `${rScore.v}`, fraction: rScore.v / maxScore } : null,
      // Endless games never raise the deadline alarm (there is no deadline).
      alarm: !endless && !!rScore && rScore.v > pScore && state.turn >= (limit as number) - 25,
    },
  ];
}

export interface VictoryCheck {
  outcome: "victory" | "defeat";
  kind: string;
}

/**
 * Decide the game if a condition is met, else return null. Domination can
 * trigger any turn; the score tiebreak triggers at the turn limit.
 */
export function checkVictory(state: GameState): VictoryCheck | null {
  const total = state.regions.filter((r) => r.ownerId !== null).length || 1;
  const contenders = state.nations.filter((n) => !n.isBarbarian && n.alive);

  for (const n of contenders) {
    const held = state.regions.filter((r) => r.ownerId === n.id).length;
    if (held / total >= DOMINATION_FRACTION) {
      return decide(n.id, "domination");
    }
  }

  // Effective turn limit for this game (Game-length setting): a number, or null
  // for an endless game — which never resolves on the score tiebreak.
  const limit = state.turnLimit === undefined ? TURN_LIMIT : state.turnLimit;
  if (limit !== null && state.turn >= limit) {
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
