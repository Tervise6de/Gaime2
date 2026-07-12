/**
 * Construction — advancing the buildings queued in region slots (M2).
 *
 * Each region has a single construction slot. Every turn the nation's materials
 * stockpile funds in-progress builds at up to BUILD_RATE materials per region,
 * processed in region-id order; when materials run out, the rest wait. That
 * scarcity is the point — you cannot build everywhere at once
 * (docs/game-design.md §3.7, guns-vs-butter minus guns).
 *
 * Pure function: returns new regions + the materials actually spent + a list of
 * completions for the turn log. Input is not mutated.
 */

import { BUILDINGS, BUILD_RATE, type BuildingId } from "@/data/buildings";
import { round1 } from "@/systems/economy";
import type { Region } from "@/systems/state";

export interface ConstructionResult {
  regions: Region[];
  materialsSpent: number;
  completed: { regionName: string; building: BuildingId }[];
}

export function advanceConstruction(
  regions: Region[],
  availableMaterials: number,
  ownerId: number,
): ConstructionResult {
  let budget = availableMaterials;
  const completed: { regionName: string; building: BuildingId }[] = [];

  const nextRegions = regions.map((region) => {
    const order = region.construction;
    if (!order || budget <= 0 || region.ownerId !== ownerId) return region;

    const def = BUILDINGS[order.building];
    const remaining = def.cost - order.progress;
    const invest = Math.min(BUILD_RATE, remaining, budget);
    if (invest <= 0) return region;

    budget = round1(budget - invest);
    const progress = round1(order.progress + invest);

    if (progress >= def.cost) {
      completed.push({ regionName: region.name, building: order.building });
      return {
        ...region,
        buildings: [...region.buildings, order.building],
        construction: null,
        fortification: region.fortification + (def.fortification ?? 0),
      };
    }
    return { ...region, construction: { building: order.building, progress } };
  });

  return {
    regions: nextRegions,
    materialsSpent: round1(availableMaterials - budget),
    completed,
  };
}
