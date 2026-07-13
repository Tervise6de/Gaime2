/**
 * Economy — pure production functions.
 *
 * Implements the per-region economy of docs/game-design.md §3.2. Output is
 * terrain base + population workers + completed buildings, scaled by an unrest
 * production penalty, with tax converting trade into treasury gold.
 *
 *   food_out      = terrain.food      + workers·FOOD_PER_WORKER − pop·FOOD_PER_HEAD + buildings
 *   materials_out = terrain.materials + workers·MAT_PER_WORKER  + buildings
 *   gold_out      = (terrain.gold + buildings)·(1 + tax) + workers·GOLD_PER_WORKER
 *   knowledge_out = terrain.knowledge + buildings
 *   → each ×unrestPenalty(region.unrest)
 *
 * All functions are pure over their inputs (no globals, no RNG) so the whole
 * turn pipeline is deterministic and unit-testable.
 */

import { BUILDINGS } from "@/data/buildings";
import { TERRAIN, type ResourceYield } from "@/data/terrain";
import {
  UNREST_PENALTY_START,
  UNREST_REVOLT,
  ZERO_FLOW,
  type GameState,
  type Nation,
  type Region,
  type ResourceFlow,
} from "@/systems/state";
import { techMultipliers } from "@/systems/tech";
import { traitYield } from "@/data/traits";

const NO_MULT: ResourceYield = { food: 1, materials: 1, gold: 1, knowledge: 1 };

/** Each unit of population works the land at these per-head rates. */
const FOOD_PER_WORKER = 0.6;
const MAT_PER_WORKER = 0.4;
const GOLD_PER_WORKER = 0.3;
/** Every head of population eats this much food per turn. */
const FOOD_PER_HEAD = 0.5;

/**
 * Production multiplier from unrest. 1.0 below the penalty threshold, falling
 * linearly to 0 at full unrest; a revolting region produces nothing.
 */
export function unrestPenalty(unrest: number): number {
  if (unrest >= UNREST_REVOLT) return 0;
  if (unrest <= UNREST_PENALTY_START) return 1;
  const span = 100 - UNREST_PENALTY_START;
  return Math.max(0, 1 - (unrest - UNREST_PENALTY_START) / span);
}

/** Sum the flat yields of a region's completed buildings. */
function buildingYield(region: Region): ResourceFlow {
  const acc: ResourceFlow = { ...ZERO_FLOW };
  for (const id of region.buildings) {
    const y = BUILDINGS[id].yield;
    acc.food += y.food ?? 0;
    acc.materials += y.materials ?? 0;
    acc.gold += y.gold ?? 0;
    acc.knowledge += y.knowledge ?? 0;
  }
  return acc;
}

/**
 * Per-turn resource flow produced by a single region at a given tax rate, with
 * optional research yield multipliers (defaults to none).
 */
export function regionProduction(
  region: Region,
  taxRate: number,
  mult: ResourceYield = NO_MULT,
): ResourceFlow {
  const base = TERRAIN[region.terrain].base;
  const b = buildingYield(region);
  const pop = region.population;
  const m = unrestPenalty(region.unrest);

  const food = (base.food + b.food + pop * FOOD_PER_WORKER - pop * FOOD_PER_HEAD) * m * mult.food;
  const materials = (base.materials + b.materials + pop * MAT_PER_WORKER) * m * mult.materials;
  const gold = ((base.gold + b.gold) * (1 + taxRate) + pop * GOLD_PER_WORKER) * m * mult.gold;
  const knowledge = (base.knowledge + b.knowledge) * m * mult.knowledge;

  return {
    food: round1(food),
    materials: round1(materials),
    gold: round1(gold),
    knowledge: round1(knowledge),
  };
}

/**
 * A nation's combined yield multiplier: research bonuses × its national trait.
 * Used for its own production and for the HUD's region breakdown so both agree.
 */
export function nationYieldMult(nation: Nation): ResourceYield {
  const t = techMultipliers(nation.research.done);
  const tr = traitYield(nation.trait);
  return {
    food: t.food * tr.food,
    materials: t.materials * tr.materials,
    gold: t.gold * tr.gold,
    knowledge: t.knowledge * tr.knowledge,
  };
}

/** Sum of production across all regions a nation owns (at its own tax rate). */
export function nationalProduction(
  state: GameState,
  ownerId: number,
): ResourceFlow {
  const nation = state.nations.find((n) => n.id === ownerId);
  const taxRate = nation?.taxRate ?? 0;
  const mult = nation ? nationYieldMult(nation) : NO_MULT;
  return state.regions
    .filter((r) => r.ownerId === ownerId)
    .reduce<ResourceFlow>((acc, region) => {
      const flow = regionProduction(region, taxRate, mult);
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
