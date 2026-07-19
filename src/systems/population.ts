/**
 * Population — growth, capacity, and starvation (M2).
 *
 * Population works the land (economy.ts) and grows toward a terrain+building
 * capacity when there is a food surplus and stability is decent; it falls
 * during a national famine or an open revolt (docs/game-design.md §3.3). Growth
 * past capacity stalls, creating pressure to build farms or expand.
 *
 * Pure functions over region data — no RNG, no globals.
 */

import { BUILDINGS } from "@/data/buildings";
import { focusPopCapacity } from "@/data/focuses";
import { TERRAIN } from "@/data/terrain";
import {
  GROWTH_BASE,
  GROWTH_UNREST_CEILING,
  MIN_POPULATION,
  STARVE_FRACTION,
  UNREST_REVOLT,
  type Region,
} from "@/systems/state";
import { round1 } from "@/systems/economy";

/** Sustainable population cap = town-size (or terrain) base + building bonuses.
 *  A scripted map that sizes its towns sets `baseCapacity` per region so hubs
 *  out-scale hinterland; absent it, the terrain capacity is the base as before. */
export function regionCapacity(region: Region): number {
  let cap = region.baseCapacity ?? TERRAIN[region.terrain].popCapacity;
  for (const id of region.buildings) cap += BUILDINGS[id].popCapacity;
  cap += focusPopCapacity(region.focus); // Farmland focus raises the ceiling
  return cap;
}

/**
 * Next population for a region given the national food situation.
 *   - famine → starve toward MIN_POPULATION
 *   - revolt (unrest ≥ threshold) → population drains
 *   - otherwise grow toward capacity, slower as unrest rises and as the region
 *     approaches its cap; no growth at or above the unrest ceiling.
 */
export function nextPopulation(region: Region, famine: boolean): number {
  const pop = region.population;

  if (region.unrest >= UNREST_REVOLT || famine) {
    return round1(Math.max(MIN_POPULATION, pop * (1 - STARVE_FRACTION)));
  }

  const cap = regionCapacity(region);
  if (pop >= cap || region.unrest >= GROWTH_UNREST_CEILING) {
    return round1(Math.min(cap, pop));
  }

  const headroom = 1 - pop / cap;
  const calm = 1 - region.unrest / 100;
  const growth = GROWTH_BASE * headroom * calm;
  return round1(Math.min(cap, pop + growth));
}
