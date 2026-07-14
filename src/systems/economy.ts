/**
 * Economy system.
 *
 * Pure functions that compute per-turn production from the map and tax policy
 * (design doc §3.2). No mutation, no DOM, no randomness — given the same state
 * they always return the same numbers, so the UI can call them to *preview*
 * next turn's income and the turn pipeline can call them to *apply* it.
 *
 * Per owned region, before tax:
 *   workers        = min(population, terrain capacity)
 *   food_out       = terrain.food     + workers*0.5 − population*0.3   (pop eats)
 *   materials_out  = terrain.materials + workers*0.3
 *   knowledge_out  = terrain.knowledge + workers*0.1
 *   trade_gold     = terrain.gold + (coastal ? COASTAL_GOLD_BONUS : 0) + workers*0.2
 *
 * Tax multiplies only the gold/trade output: `gold = trade × (1 + taxRate)`.
 * Higher tax → more gold now, at an unrest cost that lands in M2.
 */

import type {
  GameState,
  Nation,
  Region,
  Resources,
} from "@/core/types";
import { COASTAL_GOLD_BONUS, TERRAIN } from "@/data/terrain";

/** Per-worker output coefficients (illustrative tuning values). */
const WORKER_FOOD = 0.5;
const WORKER_MATERIALS = 0.3;
const WORKER_KNOWLEDGE = 0.1;
const WORKER_TRADE = 0.2;
/** Food each unit of population consumes per turn. */
const POP_FOOD_CONSUMPTION = 0.3;

/** Production breakdown for a single region in a single turn (post-tax gold). */
export interface RegionProduction {
  regionId: number;
  food: number;
  materials: number;
  knowledge: number;
  /** Trade gold after the tax multiplier is applied. */
  gold: number;
}

/** A nation's full economic result for one turn. */
export interface NationEconomy {
  nationId: number;
  perRegion: RegionProduction[];
  /** Net production summed across all owned regions (gold is post-tax). */
  totals: Resources;
}

/** Round to 2 decimals to keep stockpiles tidy and stable. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute a single region's production at a given tax rate. Exposed for tests
 * and per-region UI breakdowns.
 */
export function computeRegionProduction(
  region: Region,
  taxRate: number,
): RegionProduction {
  const terrain = TERRAIN[region.terrain];
  const workers = Math.min(region.population, terrain.popCapacity);

  const food =
    terrain.base.food +
    workers * WORKER_FOOD -
    region.population * POP_FOOD_CONSUMPTION;
  const materials = terrain.base.materials + workers * WORKER_MATERIALS;
  const knowledge = terrain.base.knowledge + workers * WORKER_KNOWLEDGE;

  const trade =
    terrain.base.gold +
    (region.coastal ? COASTAL_GOLD_BONUS : 0) +
    workers * WORKER_TRADE;
  const gold = trade * (1 + taxRate);

  return {
    regionId: region.id,
    food: round2(food),
    materials: round2(materials),
    knowledge: round2(knowledge),
    gold: round2(gold),
  };
}

/**
 * Compute a nation's economy for the current turn: production from every region
 * it owns, plus the summed totals. Pure — does not modify state.
 */
export function computeNationEconomy(
  state: GameState,
  nation: Nation,
): NationEconomy {
  const perRegion: RegionProduction[] = [];
  const totals: Resources = { gold: 0, food: 0, materials: 0, knowledge: 0 };

  for (const region of state.regions) {
    if (region.ownerId !== nation.id) continue;
    const prod = computeRegionProduction(region, nation.taxRate);
    perRegion.push(prod);
    totals.gold += prod.gold;
    totals.food += prod.food;
    totals.materials += prod.materials;
    totals.knowledge += prod.knowledge;
  }

  return {
    nationId: nation.id,
    perRegion,
    totals: {
      gold: round2(totals.gold),
      food: round2(totals.food),
      materials: round2(totals.materials),
      knowledge: round2(totals.knowledge),
    },
  };
}

/** Convenience: the player nation's economy for the current state. */
export function computePlayerEconomy(state: GameState): NationEconomy {
  const player = state.nations.find((n) => n.id === state.playerNationId);
  if (!player) throw new Error("Player nation not found in state");
  return computeNationEconomy(state, player);
}
