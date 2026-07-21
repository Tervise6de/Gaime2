/**
 * Research — the Doctrines logic (docs/game-design.md §3.6).
 *
 * A nation's research is still a flat list of completed node ids
 * (`research.done`) plus the node in progress. What changed is *availability*:
 * the six categories each hold two or three mutually-exclusive doctrine paths,
 * and taking any node in a category commits that nation to that path (the
 * siblings become "rejected"). Effects then aggregate over `done` exactly as
 * before, so economy/unrest/unlocks need no change.
 *
 * Unknown ids in `done` (an old save from before this overhaul) are ignored
 * everywhere rather than throwing — a save with retired techs still loads.
 *
 * Pure helpers over a nation's `Research` record and the static tables.
 */

import {
  TECHS, TECH_IDS, CATEGORY_IDS, CATEGORIES, PATHS,
  predecessorOf,
  type TechId, type ResearchCategory, type DoctrinePathId,
} from "@/data/techs";
import { BUILDINGS, type BuildingId } from "@/data/buildings";
import { UNITS, type UnitType } from "@/data/units";
import type { ResourceYield } from "@/data/terrain";
import type { Research } from "@/systems/state";

// --- effect aggregation (over a nation's completed nodes) --------------------

/** Combined multiplicative yield modifiers (gold/food/knowledge) from completed nodes. */
export function techMultipliers(done: TechId[]): ResourceYield {
  const mult: ResourceYield = { food: 1, gold: 1, knowledge: 1 };
  for (const id of done) {
    const y = TECHS[id]?.yieldMult;
    if (!y) continue;
    if (y.food) mult.food += y.food;
    if (y.gold) mult.gold += y.gold;
    if (y.knowledge) mult.knowledge += y.knowledge;
  }
  return mult;
}

/** Combined ware-output multiplier from completed nodes. */
export function techWareMult(done: TechId[]): number {
  let mult = 1;
  for (const id of done) mult += TECHS[id]?.wareMult ?? 0;
  return mult;
}

/** Combined trade-route income multiplier from completed nodes (systems/trade.ts). */
export function techTradeMult(done: TechId[]): number {
  let mult = 1;
  for (const id of done) mult += TECHS[id]?.tradeMult ?? 0;
  return Math.max(0, mult);
}

/** Combined extra trade-route capacity from completed nodes (systems/trade.ts). */
export function techTradeCapacity(done: TechId[]): number {
  let cap = 0;
  for (const id of done) cap += TECHS[id]?.tradeCapacity ?? 0;
  return cap;
}

/** Total flat unrest reduction from completed nodes (negative nodes raise unrest). */
export function techUnrestReduction(done: TechId[]): number {
  let r = 0;
  for (const id of done) r += TECHS[id]?.unrestReduction ?? 0;
  return r;
}

export function isBuildingUnlockedFor(done: TechId[], building: BuildingId): boolean {
  // A building's own requiresTech must be met (lets a node share a tech that
  // already lists a different building as its unlockBuilding).
  const own = BUILDINGS[building].requiresTech;
  if (own && !done.includes(own)) return false;
  // …and the node that lists this building as its unlock, if any (the reverse link).
  const req = TECH_IDS.find((t) => TECHS[t].unlockBuilding === building);
  return !req || done.includes(req);
}

export function isUnitUnlockedFor(done: TechId[], unit: UnitType): boolean {
  const req = UNITS[unit].requiresTech ?? TECH_IDS.find((t) => TECHS[t].unlockUnit === unit) ?? null;
  return !req || done.includes(req);
}

// --- doctrine commitment ----------------------------------------------------

/** How many of a path's nodes a nation has completed. */
export function pathDoneCount(done: TechId[], pathId: DoctrinePathId): number {
  const set = new Set(done);
  return PATHS[pathId].nodes.reduce((n, id) => n + (set.has(id) ? 1 : 0), 0);
}

/** The path a nation has committed to in a category (the one with any done
    node), or null if the category is still open. */
export function committedPath(done: TechId[], category: ResearchCategory): DoctrinePathId | null {
  for (const pid of CATEGORIES[category].paths) {
    if (PATHS[pid].nodes.some((n) => done.includes(n))) return pid;
  }
  return null;
}

/** A path is rejected when its category is committed to a *different* path. */
export function isPathRejected(done: TechId[], pathId: DoctrinePathId): boolean {
  const committed = committedPath(done, PATHS[pathId].category);
  return committed !== null && committed !== pathId;
}

/** The next undone node of a path (its lowest unfinished tier), or null when the
    path is complete. Because nodes are only ever taken in tier order, the first
    undone node is always the next available rung. */
export function nextNodeInPath(done: TechId[], pathId: DoctrinePathId): TechId | null {
  for (const id of PATHS[pathId].nodes) if (!done.includes(id)) return id;
  return null;
}

/**
 * Nodes researchable right now: for each category, the next rung of its
 * committed path, or — if the category is still open — the tier-0 opener of
 * every path in it (picking one commits). Age-gated when `era` is given.
 */
export function researchFrontier(done: TechId[], era?: number): TechId[] {
  const out: TechId[] = [];
  const doneSet = new Set(done);
  const eraOk = (id: TechId) => era === undefined || TECHS[id].era <= era;
  for (const cat of CATEGORY_IDS) {
    const committed = committedPath(done, cat);
    if (committed) {
      const next = nextNodeInPath(done, committed);
      if (next && eraOk(next)) out.push(next);
    } else {
      for (const pid of CATEGORIES[cat].paths) {
        const opener = PATHS[pid].nodes[0]!;
        if (!doneSet.has(opener) && eraOk(opener)) out.push(opener);
      }
    }
  }
  return out;
}

/** Nodes whose path is open and whose predecessor is done, but whose age has not
    yet dawned (shown "awaits its age" in the UI). */
export function eraLockedTechs(done: TechId[], era: number): TechId[] {
  const out: TechId[] = [];
  const doneSet = new Set(done);
  for (const cat of CATEGORY_IDS) {
    const committed = committedPath(done, cat);
    if (committed) {
      const next = nextNodeInPath(done, committed);
      if (next && TECHS[next].era > era) out.push(next);
    } else {
      for (const pid of CATEGORIES[cat].paths) {
        const opener = PATHS[pid].nodes[0]!;
        if (!doneSet.has(opener) && TECHS[opener].era > era) out.push(opener);
      }
    }
  }
  return out;
}

/** Whether a node can be selected for research right now (open path + tier + age). */
export function canResearch(done: TechId[], tech: TechId, era?: number): boolean {
  return researchFrontier(done, era).includes(tech);
}

export interface ResearchStep {
  research: Research;
  /** The node completed this step, if any. */
  completed: TechId | null;
}

/**
 * Invest `knowledge` into the current node. Completes it (and clears `current`)
 * when the cost is met, rolling any surplus over as banked progress toward the
 * next pick — a large stockpile is never burned to zero by finishing one cheap
 * node. If nothing is selected, knowledge is banked into progress the same way.
 */
export function advanceResearch(research: Research, knowledge: number): ResearchStep {
  if (!research.current || !TECHS[research.current]) {
    return { research: { ...research, progress: round1(research.progress + knowledge) }, completed: null };
  }
  const cost = TECHS[research.current].cost;
  const progress = research.progress + knowledge;
  if (progress >= cost) {
    return {
      research: { current: null, progress: round1(progress - cost), done: [...research.done, research.current] },
      completed: research.current,
    };
  }
  return { research: { ...research, progress: round1(progress) }, completed: null };
}

/** Select a node to research (keeps banked progress; drops it from the queue).
    Age- and commitment-gated when `era` given. */
export function selectTech(research: Research, tech: TechId, era?: number): Research {
  if (!canResearch(research.done, tech, era)) return research;
  const queue = research.queue?.filter((t) => t !== tech);
  return { ...research, current: tech, queue };
}

/** Append a node to the research queue (dedup; skips done/current). Pure. */
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
 * When nothing is being researched, pull the next still-valid node off the queue
 * (path open + predecessor done + age reached); drop any that have become
 * invalid (e.g. a queued sibling of a path you later committed away from). Pure.
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
 * The recommended next node for a realm: the cheapest available node in its
 * preferred category, else the cheapest available overall. Null when the
 * frontier is empty. Pure.
 */
export function recommendedTech(done: TechId[], era: number, category: ResearchCategory): TechId | null {
  const frontier = researchFrontier(done, era);
  if (!frontier.length) return null;
  const inCat = frontier.filter((t) => TECHS[t].category === category);
  const pool = inCat.length ? inCat : frontier;
  return pool.reduce((best, t) => (TECHS[t].cost < TECHS[best].cost ? t : best), pool[0]!);
}

/** Re-export for callers that reason about a node's place in its path. */
export { predecessorOf };

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
