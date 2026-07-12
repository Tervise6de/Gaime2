/**
 * Research — the tech tree logic (docs/game-design.md §3.6).
 *
 * Research is a multiplier on the other systems, which is why it lands after
 * they exist. Knowledge produced each turn is invested into the current tech;
 * on completion the tech's effects apply for the rest of the game: yield
 * multipliers, unrest tools, and unlocks for the advanced units and buildings.
 *
 * Pure helpers over a nation's `Research` record and the static `TECHS` table.
 */

import { TECHS, TECH_IDS, type TechId } from "@/data/techs";
import type { BuildingId } from "@/data/buildings";
import type { UnitType } from "@/data/units";
import type { ResourceYield } from "@/data/terrain";
import type { Nation, Research } from "@/systems/state";

/** Combined multiplicative yield modifiers from a nation's completed techs. */
export function techMultipliers(done: TechId[]): ResourceYield {
  const mult: ResourceYield = { food: 1, materials: 1, gold: 1, knowledge: 1 };
  for (const id of done) {
    const y = TECHS[id].yieldMult;
    if (!y) continue;
    if (y.food) mult.food += y.food;
    if (y.materials) mult.materials += y.materials;
    if (y.gold) mult.gold += y.gold;
    if (y.knowledge) mult.knowledge += y.knowledge;
  }
  return mult;
}

/** Total flat unrest reduction from a nation's completed techs. */
export function techUnrestReduction(done: TechId[]): number {
  let r = 0;
  for (const id of done) r += TECHS[id].unrestReduction ?? 0;
  return r;
}

/** Whether a building has been unlocked (no tech requirement, or tech is done). */
export function isBuildingUnlocked(nation: Nation, building: BuildingId): boolean {
  return isBuildingUnlockedFor(nation.research.done, building);
}

export function isBuildingUnlockedFor(done: TechId[], building: BuildingId): boolean {
  // Find the tech that unlocks this building, if any.
  const req = TECH_IDS.find((t) => TECHS[t].unlockBuilding === building);
  return !req || done.includes(req);
}

/** Whether a unit type has been unlocked. */
export function isUnitUnlocked(nation: Nation, unit: UnitType): boolean {
  return isUnitUnlockedFor(nation.research.done, unit);
}

export function isUnitUnlockedFor(done: TechId[], unit: UnitType): boolean {
  const req = TECH_IDS.find((t) => TECHS[t].unlockUnit === unit);
  return !req || done.includes(req);
}

/** Techs available to research now: prerequisites met, not already done. */
export function researchFrontier(done: TechId[]): TechId[] {
  const set = new Set(done);
  return TECH_IDS.filter(
    (id) => !set.has(id) && TECHS[id].requires.every((r) => set.has(r)),
  );
}

/** Whether a tech can be selected for research right now. */
export function canResearch(done: TechId[], tech: TechId): boolean {
  return researchFrontier(done).includes(tech);
}

export interface ResearchStep {
  research: Research;
  /** The tech completed this step, if any. */
  completed: TechId | null;
}

/**
 * Invest `knowledge` into the current tech. Completes it (and clears `current`)
 * when the cost is met, carrying any surplus is discarded for simplicity.
 * If no tech is selected, knowledge is banked into progress for the next pick.
 */
export function advanceResearch(research: Research, knowledge: number): ResearchStep {
  if (!research.current) {
    // Bank knowledge so a freshly-picked tech starts with a head-start.
    return { research: { ...research, progress: round1(research.progress + knowledge) }, completed: null };
  }
  const cost = TECHS[research.current].cost;
  const progress = research.progress + knowledge;
  if (progress >= cost) {
    return {
      research: { current: null, progress: 0, done: [...research.done, research.current] },
      completed: research.current,
    };
  }
  return { research: { ...research, progress: round1(progress) }, completed: null };
}

/** Select a tech to research (keeps banked progress). */
export function selectTech(research: Research, tech: TechId): Research {
  if (!canResearch(research.done, tech)) return research;
  return { ...research, current: tech };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
