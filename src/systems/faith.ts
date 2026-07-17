/**
 * Faith — the religious layer and its victory path (docs/game-design.md §6, §9.6).
 *
 * Every settled region has a `faith`: the realm whose church holds its people.
 * Faith is *not* ownership — conquest occupies a province, but its people keep
 * their faith until a rival's religious influence overcomes it. Influence comes
 * from three places, summed per nation on each region:
 *
 *   - **Inertia** — the faith already there resists change (FAITH_INERTIA), so a
 *     freshly-taken province is occupied, not converted.
 *   - **The ruler** — a realm promotes its faith in the lands it owns (OWNER_FAITH).
 *   - **Holy sites** — temples, monasteries and cathedrals (their `faith` weight)
 *     radiate to their region in full and to *neighbouring* regions at a fraction
 *     (ADJ_SPREAD), so a border cathedral converts across the frontier.
 *
 * Each turn a region flips to the nation whose influence leads the current
 * holder's by at least CONVERT_MARGIN — a clear lead, so borders don't flap. The
 * result: taking land is not enough; you must plant churches to win hearts, and
 * a dedicated missionary can hold the faith of lands they do not rule. A nation
 * whose faith holds FAITH_VICTORY_FRACTION of the settled world wins.
 *
 * Pure over `GameState` — no RNG (fully deterministic), no DOM.
 */

import { BUILDINGS } from "@/data/buildings";
import {
  BARBARIAN_ID,
  FAITH_VICTORY_FRACTION,
  type GameState,
  type Region,
} from "@/systems/state";

// --- tuning -----------------------------------------------------------------

/** The standing faith resists change — occupation alone never converts. */
export const FAITH_INERTIA = 3;
/** A realm promotes its faith in the regions it rules. */
export const OWNER_FAITH = 3;
/** Fraction of a holy site's weight that reaches each *adjacent* region. */
export const ADJ_SPREAD = 0.5;
/** A challenger must lead the incumbent faith by this much to convert a region. */
export const CONVERT_MARGIN = 1;

// --- influence & conversion -------------------------------------------------

/** Total faith-projection weight of the holy sites built in a region. */
export function faithWeight(region: Region): number {
  let w = 0;
  for (const b of region.buildings) w += BUILDINGS[b].faith ?? 0;
  return w;
}

/** Whether an owner id is a real, faith-bearing realm (not barbarian / neutral). */
function realOwner(ownerId: number | null): ownerId is number {
  return ownerId !== null && ownerId !== BARBARIAN_ID;
}

/**
 * Faith influence exerted on region `r` by each nation this turn: inertia for the
 * current faith, the ruler's promotion at home, and holy sites in `r` and its
 * neighbours. Pure; keyed by nation id. Used by conversion and the UI breakdown.
 */
export function faithInfluence(state: GameState, r: Region): Map<number, number> {
  const inf = new Map<number, number>();
  const add = (id: number, v: number) => inf.set(id, (inf.get(id) ?? 0) + v);

  if (r.faith !== undefined) add(r.faith, FAITH_INERTIA);
  if (realOwner(r.ownerId)) add(r.ownerId, OWNER_FAITH);

  // Holy sites here (full) and in neighbours (a fraction) push their owner's faith.
  const here = faithWeight(r);
  if (here > 0 && realOwner(r.ownerId)) add(r.ownerId, here);
  for (const nId of r.adjacency) {
    const nb = state.regions[nId];
    if (!nb || !realOwner(nb.ownerId)) continue;
    const w = faithWeight(nb);
    if (w > 0) add(nb.ownerId, w * ADJ_SPREAD);
  }
  return inf;
}

/** The nation with the strongest faith influence on `r`, or null on an empty tie. */
function leader(inf: Map<number, number>): { id: number; v: number } | null {
  let best: { id: number; v: number } | null = null;
  for (const [id, v] of inf) {
    // Ties resolve to the lower id, so conversion is deterministic and order-free.
    if (!best || v > best.v || (v === best.v && id < best.id)) best = { id, v };
  }
  return best;
}

/**
 * Advance every region's faith one turn: a region converts to the leading nation
 * only when that nation's influence beats the current holder's by CONVERT_MARGIN.
 * Barbarian/unowned regions are convertible pagan ground; regions with no
 * influence at all keep whatever faith they had. Pure — returns new state.
 */
export function stepFaith(state: GameState): GameState {
  let changed = false;
  const regions = state.regions.map((r) => {
    const inf = faithInfluence(state, r);
    const top = leader(inf);
    if (!top) return r;
    const incumbent = r.faith;
    const incumbentInf = incumbent !== undefined ? (inf.get(incumbent) ?? 0) : 0;
    if (top.id !== incumbent && top.v >= incumbentInf + CONVERT_MARGIN) {
      changed = true;
      return { ...r, faith: top.id };
    }
    return r;
  });
  return changed ? { ...state, regions } : state;
}

/**
 * Seed each region's faith at game start: a realm's own lands begin devout in its
 * faith; barbarian and unowned land begins pagan (undefined). Pure — new regions.
 */
export function seedFaith(regions: Region[]): Region[] {
  return regions.map((r) => (realOwner(r.ownerId) ? { ...r, faith: r.ownerId } : { ...r, faith: undefined }));
}

// --- standings --------------------------------------------------------------

/** Regions counted toward the religious race: all settled (owned) land. */
function settledCount(state: GameState): number {
  return state.regions.filter((r) => r.ownerId !== null).length || 1;
}

/** How many settled regions hold nation `id`'s faith. */
export function faithHeld(state: GameState, id: number): number {
  return state.regions.filter((r) => r.faith === id).length;
}

/** Share of the settled world that holds nation `id`'s faith (0..1). */
export function faithFraction(state: GameState, id: number): number {
  return faithHeld(state, id) / settledCount(state);
}

/** Whether nation `id` has reached the religious victory threshold. */
export function hasFaithVictory(state: GameState, id: number): boolean {
  return faithFraction(state, id) >= FAITH_VICTORY_FRACTION;
}
