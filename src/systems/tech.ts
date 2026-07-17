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

import { TECHS, TECH_IDS, type TechId, type TechBranch } from "@/data/techs";
import { BUILDINGS, type BuildingId } from "@/data/buildings";
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
  // A building's own requiresTech must be met (lets focus capstones share a tech
  // that already lists a different building as its unlockBuilding).
  const own = BUILDINGS[building].requiresTech;
  if (own && !done.includes(own)) return false;
  // …and the tech that lists this building as its unlock, if any (legacy link).
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

/**
 * Techs available to research now: prerequisites met, not already done, and —
 * when `era` (the current 0-based age index) is given — not gated to a later
 * age. Omitting `era` ignores the age gate (used where only prereqs matter).
 */
export function researchFrontier(done: TechId[], era?: number): TechId[] {
  const set = new Set(done);
  return TECH_IDS.filter(
    (id) =>
      !set.has(id) &&
      TECHS[id].requires.every((r) => set.has(r)) &&
      (era === undefined || TECHS[id].era <= era),
  );
}

/** Techs whose prerequisites are met but whose age has not yet dawned (locked). */
export function eraLockedTechs(done: TechId[], era: number): TechId[] {
  const set = new Set(done);
  return TECH_IDS.filter(
    (id) => !set.has(id) && TECHS[id].requires.every((r) => set.has(r)) && TECHS[id].era > era,
  );
}

/** Whether a tech can be selected for research right now (prereqs + age gate). */
export function canResearch(done: TechId[], tech: TechId, era?: number): boolean {
  return researchFrontier(done, era).includes(tech);
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

/** Select a tech to research (keeps banked progress; drops it from the queue).
    Age-gated when `era` given. */
export function selectTech(research: Research, tech: TechId, era?: number): Research {
  if (!canResearch(research.done, tech, era)) return research;
  const queue = research.queue?.filter((t) => t !== tech);
  return { ...research, current: tech, queue };
}

/** Append a tech to the research queue (dedup; skips done/current). Pure. */
export function queueResearch(research: Research, tech: TechId): Research {
  if (research.done.includes(tech) || research.current === tech) return research;
  const queue = research.queue ?? [];
  if (queue.includes(tech)) return research;
  return { ...research, queue: [...queue, tech] };
}

/** Clear the research queue. */
export function clearQueue(research: Research): Research {
  return research.queue?.length ? { ...research, queue: [] } : research;
}

/**
 * When nothing is being researched, pull the next still-valid tech off the queue
 * (prereqs met + age reached); drop any that have become invalid. Pure.
 */
export function dequeueResearch(research: Research, era?: number): Research {
  if (research.current || !research.queue?.length) return research;
  const queue = [...research.queue];
  while (queue.length) {
    const next = queue.shift()!;
    if (canResearch(research.done, next, era)) return { ...research, current: next, queue };
  }
  return { ...research, queue: [] };
}

/**
 * The recommended next tech for a realm: the cheapest available tech in its
 * preferred branch, else the cheapest available overall. Null when the frontier
 * is empty (age-gated). Pure.
 */
export function recommendedTech(done: TechId[], era: number, branch: TechBranch): TechId | null {
  const frontier = researchFrontier(done, era);
  if (!frontier.length) return null;
  const inBranch = frontier.filter((t) => TECHS[t].branch === branch);
  const pool = inBranch.length ? inBranch : frontier;
  return pool.reduce((best, t) => (TECHS[t].cost < TECHS[best].cost ? t : best), pool[0]!);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
