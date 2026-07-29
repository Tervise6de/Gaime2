/**
 * Rival strategy — which victory a computer realm is actually playing for, and
 * when it changes its mind.
 *
 * A realm's **personality** (data/personalities.ts) is its temperament: how
 * readily it wars, how far it trusts, how much it builds. That is fixed and
 * historical — Sweden's kings are warlike in every game. Temperament is not a
 * plan, though, and until now it was the only thing rivals had, so every game
 * played out the same way and nobody was ever *going for* anything.
 *
 * A **strategy** is the win condition a realm is chasing. It is rolled fresh
 * each game — weighted by temperament, so a warlord usually reaches for the
 * sword, but never so tightly that Lübeck cannot decide, this game, to take the
 * Baltic by force — and it is **reassessed as the board changes**: a merchant
 * shut out of the Kontore and left with a big army will turn conqueror, and a
 * warlord whose armies are spent but whose ports are rich will turn to trade.
 *
 *   conquest — take the land: the domination win
 *   commerce — take the network: the Hansa-control win
 *   prestige — outlast and outshine: the score at the turn limit
 *
 * Switching is deliberately sticky. A realm that changed course last turn is
 * not a rival, it is a weathervane, so a challenger must beat the incumbent by
 * `SWITCH_MARGIN` and the incumbent gets `MIN_DWELL` turns of grace.
 *
 * Pure over `GameState`; the only randomness is the opening roll, from the
 * game's seeded RNG.
 */

import type { Personality } from "@/systems/state";
import { BARBARIAN_ID, DOMINATION_FRACTION, TURN_LIMIT, landNeighbours, type GameState, type Nation } from "@/systems/state";
import type { Rng } from "@/systems/rng";
import { hansaControl, HANSA_VICTORY } from "@/systems/hansa";
import { nationScore } from "@/systems/victory";
import { atWar } from "@/systems/diplomacy";
import { KONTORE, KONTOR_IDS } from "@/data/kontore";
import { UNITS, UNIT_TYPES } from "@/data/units";

export type AiStrategy = "conquest" | "commerce" | "prestige";

export const AI_STRATEGIES: readonly AiStrategy[] = ["conquest", "commerce", "prestige"];

/** How much better a rival plan must look before a realm changes course. */
export const SWITCH_MARGIN = 0.12;
/** Turns a freshly adopted strategy is protected from being second-guessed. */
export const MIN_DWELL = 8;

export const STRATEGY_LABEL: Record<AiStrategy, string> = {
  conquest: "Conquest",
  commerce: "Commerce",
  prestige: "Prestige",
};

/** What a realm on this course is understood to be doing, for the HUD. */
export const STRATEGY_BLURB: Record<AiStrategy, string> = {
  conquest: "is playing for the land — expect armies on your border",
  commerce: "is playing for the Hansa — expect it to contest the Kontore and the lanes",
  prestige: "is playing the long game — building, learning and hoarding renown",
};

/**
 * Opening odds by temperament. Every strategy stays possible for every realm —
 * the point of rolling it is that this game is not last game — but a warlord
 * reaching for the ledger should be the surprise, not the norm.
 */
const OPENING_ODDS: Record<Personality["archetype"], Record<AiStrategy, number>> = {
  warlord: { conquest: 0.6, commerce: 0.15, prestige: 0.25 },
  merchant: { conquest: 0.15, commerce: 0.6, prestige: 0.25 },
  builder: { conquest: 0.15, commerce: 0.45, prestige: 0.4 },
  opportunist: { conquest: 0.4, commerce: 0.35, prestige: 0.25 },
};

/**
 * Roll each rival's opening plan. Deterministic for a seed: called once from
 * `createGame` with the game's own RNG, in nation order.
 */
export function assignStrategies(nations: Nation[], rng: Rng): Nation[] {
  return nations.map((n) => {
    if (n.isBarbarian || n.isPlayer) return n;
    return { ...n, strategy: rollStrategy(n.personality?.archetype ?? "opportunist", rng), strategySince: 1 };
  });
}

function rollStrategy(archetype: Personality["archetype"], rng: Rng): AiStrategy {
  const odds = OPENING_ODDS[archetype] ?? OPENING_ODDS.opportunist;
  let roll = rng.next();
  for (const strategy of AI_STRATEGIES) {
    roll -= odds[strategy];
    if (roll <= 0) return strategy;
  }
  return "prestige";
}

/**
 * How well each course is going for one realm right now, 0..1. These are
 * *viabilities*, not preferences: how close this path is to paying off given
 * the board, the realm's means, and its temperament.
 */
export function strategyViability(state: GameState, nationId: number): Record<AiStrategy, number> {
  const nation = state.nations.find((n) => n.id === nationId);
  const owned = state.regions.filter((r) => r.ownerId === nationId);
  if (!nation || owned.length === 0) return { conquest: 0, commerce: 0, prestige: 0 };
  const p = nation.personality;
  const total = state.regions.filter((r) => r.ownerId !== null).length || 1;

  // --- conquest: an army, somewhere soft to point it, and land already taken.
  const myLand = owned.length / total;
  const soldiers = state.armies
    .filter((a) => a.ownerId === nationId)
    .reduce((sum, a) => sum + UNIT_TYPES.reduce((n, t) => n + (UNITS[t].naval ? 0 : a.units[t]), 0), 0);
  // Neighbours worth taking: bordering land held by someone weaker than us.
  let soft = 0;
  let borders = 0;
  for (const region of owned) {
    for (const nb of landNeighbours(state, region.id)) {
      const other = state.regions[nb];
      if (!other || other.ownerId === nationId || other.ownerId === null) continue;
      borders += 1;
      const theirs = state.armies
        .filter((a) => a.ownerId === other.ownerId)
        .reduce((sum, a) => sum + UNIT_TYPES.reduce((n, t) => n + (UNITS[t].naval ? 0 : a.units[t]), 0), 0);
      if (other.ownerId === BARBARIAN_ID || theirs < soldiers) soft += 1;
    }
  }
  const softness = borders > 0 ? soft / borders : 0;
  const conquest = clamp01(
    0.45 * Math.min(1, myLand / DOMINATION_FRACTION) +
      0.3 * softness +
      0.25 * Math.min(1, soldiers / 12),
  );

  // --- commerce: the Hansa race, read straight off the control it already has,
  // plus the means to grow it (coasts to sail from, Kontore within reach).
  const control = hansaControl(state, nationId);
  const coastal = owned.filter((r) => r.terrain === "coast").length;
  const kontorReach = KONTOR_IDS.filter((id) => {
    const host = state.regions[KONTORE[id].regionId];
    if (!host) return false;
    if (host.ownerId === nationId) return true;
    // A Kontor is "within reach" if we border it or already trade there.
    return (
      host.adjacency.some((nb) => state.regions[nb]?.ownerId === nationId) ||
      (state.routes ?? []).some((r) => r.ownerId === nationId && r.toKontorId === id)
    );
  }).length;
  const commerce = clamp01(
    0.5 * Math.min(1, control.total / HANSA_VICTORY) +
      0.25 * Math.min(1, coastal / 4) +
      0.25 * (kontorReach / KONTOR_IDS.length),
  );

  // --- prestige: standing in the score, and the deadline drawing in. A realm
  // that is behind on both other paths but rich and learned plays for the bell.
  const limit = state.turnLimit === undefined ? TURN_LIMIT : state.turnLimit;
  const clock = limit === null ? 0.35 : clamp01(state.turn / limit);
  const scores = state.nations
    .filter((n) => !n.isBarbarian && n.alive)
    .map((n) => nationScore(state, n.id));
  const best = Math.max(1, ...scores);
  const standing = nationScore(state, nationId) / best;
  const prestige = clamp01(0.55 * standing + 0.25 * clock + 0.2 * (p?.economy ?? 0.5));

  // Temperament tilts the reading — a warlord genuinely rates a war higher than
  // a merchant does, looking at the same board.
  return {
    conquest: clamp01(conquest * (0.7 + (p?.aggression ?? 0.5) * 0.6)),
    commerce: clamp01(commerce * (0.7 + (p?.economy ?? 0.5) * 0.6)),
    prestige: clamp01(prestige * (0.85 + (1 - (p?.aggression ?? 0.5)) * 0.3)),
  };
}

/**
 * Re-read the board for every rival and change course where another plan is
 * clearly better. Called once per turn from the turn pipeline.
 *
 * Two brakes stop realms dithering: a challenger must win by `SWITCH_MARGIN`,
 * and a plan adopted less than `MIN_DWELL` turns ago is left alone — except
 * when the realm is *at war and losing the land it needs*, which is exactly the
 * moment a merchant should be allowed to panic and pick up a sword.
 */
export function reassessStrategies(state: GameState): GameState {
  let changed = false;
  const nations = state.nations.map((n) => {
    if (n.isBarbarian || n.isPlayer || !n.alive) return n;
    const current = n.strategy ?? "prestige";
    const since = n.strategySince ?? 0;
    const scores = strategyViability(state, n.id);
    let bestPlan = current;
    let bestScore = scores[current];
    for (const plan of AI_STRATEGIES) {
      if (scores[plan] > bestScore + SWITCH_MARGIN) {
        bestPlan = plan;
        bestScore = scores[plan];
      }
    }
    if (bestPlan === current) return n;
    // The dwell grace, waived for a realm fighting for its life.
    const desperate = state.nations.some(
      (o) => !o.isBarbarian && o.id !== n.id && atWar(state, n.id, o.id),
    ) && scores[current] < 0.25;
    if (state.turn - since < MIN_DWELL && !desperate) return n;
    changed = true;
    return { ...n, strategy: bestPlan, strategySince: state.turn };
  });
  return changed ? { ...state, nations } : state;
}

/**
 * The dials a strategy turns. Everything the AI already decided from
 * temperament alone now reads temperament *and* plan, so a course is a change
 * in play rather than a label: how big a host to keep, how readily to open a
 * war, how much a Kontor town is worth taking, how hard to chase routes, how
 * many hulls to float, and whether a League seat is worth having.
 */
export interface StrategyProfile {
  /** Multiplier on the standing-army target. */
  army: number;
  /** Multiplier on war appetite (higher = declares more readily). */
  warAppetite: number;
  /** Multiplier on how richly a Kontor town scores as a conquest target. */
  kontorPrize: number;
  /** Multiplier on the trade-route target a realm works toward. */
  routes: number;
  /** Extra warships wanted beyond the baseline. */
  navy: number;
  /** Whether this realm wants a League seat even without trade to protect. */
  seeksLeague: boolean;
}

const PROFILES: Record<AiStrategy, StrategyProfile> = {
  conquest: { army: 1.35, warAppetite: 1.3, kontorPrize: 0.8, routes: 0.6, navy: 0, seeksLeague: false },
  commerce: { army: 0.8, warAppetite: 0.7, kontorPrize: 2, routes: 1.4, navy: 1, seeksLeague: true },
  prestige: { army: 0.9, warAppetite: 0.85, kontorPrize: 1, routes: 1.2, navy: 0, seeksLeague: true },
};

/** The dials for a realm's current course (a neutral profile for the player). */
export function strategyProfile(nation: Nation | undefined): StrategyProfile {
  if (!nation || nation.isPlayer || nation.isBarbarian) {
    return { army: 1, warAppetite: 1, kontorPrize: 1, routes: 1, navy: 0, seeksLeague: false };
  }
  return PROFILES[nation.strategy ?? "prestige"];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
