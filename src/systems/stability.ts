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
import { focusCalm } from "@/data/focuses";
import {
  FAMINE_UNREST_SPIKE,
  FREE_REGIONS,
  GARRISON_CALM_MAX,
  GARRISON_CALM_PER_UNIT,
  OVEREXPANSION_UNREST,
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
  calm += focusCalm(region.focus); // a Garrison focus keeps the province calmer
  return calm;
}

/** Unrest from holding more regions than a realm comfortably governs. */
export function overexpansionUnrest(ownedRegionCount: number): number {
  return Math.max(0, ownedRegionCount - FREE_REGIONS) * OVEREXPANSION_UNREST;
}

/** Unrest reduction from a friendly garrison of `garrisonSize` units (design §3.3). */
export function garrisonCalm(garrisonSize: number): number {
  return Math.min(GARRISON_CALM_MAX, Math.max(0, garrisonSize) * GARRISON_CALM_PER_UNIT);
}

/**
 * The steady-state unrest a region trends toward under current policy.
 * `contentReduction` is the realm-wide easing from luxury contentment (R5,
 * systems/prosperity.ts) — the same value for every province, since the burghers'
 * appetite is met from the national stockpile.
 */
export function unrestTarget(
  region: Region,
  taxRate: number,
  ownedRegionCount: number,
  techReduction = 0,
  garrisonSize = 0,
  contentReduction = 0,
): number {
  const taxPressure = (taxRate / TAX_MAX) * UNREST_TAX_MAX;
  const target =
    UNREST_BASE +
    taxPressure +
    overexpansionUnrest(ownedRegionCount) -
    buildingCalm(region) -
    techReduction -
    garrisonCalm(garrisonSize) -
    contentReduction;
  return clampUnrest(target);
}

/**
 * Next unrest for a region: drift toward the tax/expansion/building/tech/garrison/
 * contentment target (capped per turn), then add a famine spike so starvation bites
 * immediately.
 */
export function nextUnrest(
  region: Region,
  taxRate: number,
  famine: boolean,
  ownedRegionCount: number,
  techReduction = 0,
  garrisonSize = 0,
  contentReduction = 0,
): number {
  const target = unrestTarget(region, taxRate, ownedRegionCount, techReduction, garrisonSize, contentReduction);
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
