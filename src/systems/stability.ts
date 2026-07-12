/**
 * Stability / unrest — the anti-snowball brake (M2, docs/game-design.md §3.3).
 *
 * Each region trends toward an unrest *target* set by tax pressure (minus the
 * calming effect of buildings such as temples), plus a transient spike during
 * famine. Unrest drifts toward that target a little each turn, so policy
 * changes bite gradually. High unrest throttles production (economy.ts) and,
 * past the revolt threshold, stops the region.
 *
 * Pure functions over region data — no RNG, no globals.
 */

import { BUILDINGS } from "@/data/buildings";
import {
  FAMINE_UNREST_SPIKE,
  TAX_MAX,
  UNREST_BASE,
  UNREST_DRIFT,
  UNREST_MAX,
  UNREST_TAX_MAX,
  type Region,
} from "@/systems/state";

/** Sum of unrest reduction from a region's buildings (e.g. temples). */
function buildingCalm(region: Region): number {
  let calm = 0;
  for (const id of region.buildings) calm += BUILDINGS[id].unrest;
  return calm;
}

/** The steady-state unrest a region trends toward under current policy. */
export function unrestTarget(region: Region, taxRate: number): number {
  const taxPressure = (taxRate / TAX_MAX) * UNREST_TAX_MAX;
  const target = UNREST_BASE + taxPressure - buildingCalm(region);
  return clampUnrest(target);
}

/**
 * Next unrest for a region: drift toward the tax/building target (capped per
 * turn), then add a famine spike on top so starvation bites immediately.
 */
export function nextUnrest(
  region: Region,
  taxRate: number,
  famine: boolean,
): number {
  const target = unrestTarget(region, taxRate);
  const delta = clamp(target - region.unrest, -UNREST_DRIFT, UNREST_DRIFT);
  let next = region.unrest + delta;
  if (famine) next += FAMINE_UNREST_SPIKE;
  return clampUnrest(next);
}

function clampUnrest(v: number): number {
  return clamp(Math.round(v * 10) / 10, 0, UNREST_MAX);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
