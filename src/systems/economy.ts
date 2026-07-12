/**
 * Economy — pure production functions.
 *
 * These implement the per-region economy of docs/game-design.md §3.2. In
 * Milestone 1 there are no buildings or population growth yet, so output is
 * terrain base + a population-worker contribution, with tax converting trade
 * into treasury gold at a (future) unrest cost.
 *
 *   food_out      = terrain.food      + workers·FOOD_PER_WORKER − pop·FOOD_PER_HEAD
 *   materials_out = terrain.materials + workers·MAT_PER_WORKER
 *   gold_out      = terrain.gold·(1 + tax) + workers·GOLD_PER_WORKER
 *   knowledge_out = terrain.knowledge
 *
 * All functions are pure over their inputs (no globals, no RNG) so the whole
 * turn pipeline is deterministic and unit-testable.
 */

import { TERRAIN } from "@/data/terrain";
import {
  ZERO_FLOW,
  type GameState,
  type Region,
  type ResourceFlow,
} from "@/systems/state";

/** Each unit of population works the land at these per-head rates. */
const FOOD_PER_WORKER = 0.6;
const MAT_PER_WORKER = 0.4;
const GOLD_PER_WORKER = 0.3;
/** Every head of population eats this much food per turn. */
const FOOD_PER_HEAD = 0.5;

/** Per-turn resource flow produced by a single region at a given tax rate. */
export function regionProduction(region: Region, taxRate: number): ResourceFlow {
  const base = TERRAIN[region.terrain].base;
  const pop = region.population;

  const food = base.food + pop * FOOD_PER_WORKER - pop * FOOD_PER_HEAD;
  const materials = base.materials + pop * MAT_PER_WORKER;
  const gold = base.gold * (1 + taxRate) + pop * GOLD_PER_WORKER;
  const knowledge = base.knowledge;

  return {
    food: round1(food),
    materials: round1(materials),
    gold: round1(gold),
    knowledge: round1(knowledge),
  };
}

/** Sum of production across all regions a nation owns. */
export function nationalProduction(
  state: GameState,
  ownerId: number,
): ResourceFlow {
  return state.regions
    .filter((r) => r.ownerId === ownerId)
    .reduce<ResourceFlow>((acc, region) => {
      const flow = regionProduction(region, state.taxRate);
      return {
        food: round1(acc.food + flow.food),
        materials: round1(acc.materials + flow.materials),
        gold: round1(acc.gold + flow.gold),
        knowledge: round1(acc.knowledge + flow.knowledge),
      };
    }, { ...ZERO_FLOW });
}

/** Round to one decimal place to keep the numbers readable and stable. */
export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
