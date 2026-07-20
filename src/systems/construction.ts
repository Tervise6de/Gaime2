/**
 * Construction — advancing the buildings queued in region slots (M2).
 *
 * Each region has a single construction slot. Every turn the nation's ware
 * stockpiles fund in-progress builds at up to BUILD_RATE units of that building's
 * `buildWare` (timber by default; brick for masonry, naval stores for ports) per
 * region, processed in region-id order; when a ware runs out, builds needing it
 * wait. That scarcity is the point — you cannot build everywhere at once, and a
 * realm short of brick cannot raise walls (docs/game-design.md §3.7).
 *
 * Pure function: returns new regions + the wares actually spent (per ware) + a
 * list of completions for the turn log. Input is not mutated.
 */

import { BUILDINGS, BUILD_RATE, type BuildingId } from "@/data/buildings";
import type { GoodId } from "@/data/goods";
import { round1 } from "@/systems/economy";
import type { Region, Wares } from "@/systems/state";

export interface ConstructionResult {
  regions: Region[];
  /** Units of each ware actually spent on construction this turn. */
  waresSpent: Partial<Record<GoodId, number>>;
  completed: { regionName: string; building: BuildingId }[];
}

export function advanceConstruction(
  regions: Region[],
  wares: Wares,
  ownerId: number,
): ConstructionResult {
  // A running per-ware budget, drawn down as sites fund in region-id order.
  const budget: Wares = { ...wares };
  const waresSpent: Partial<Record<GoodId, number>> = {};
  const completed: { regionName: string; building: BuildingId }[] = [];

  const nextRegions = regions.map((region) => {
    const order = region.construction;
    if (!order || region.ownerId !== ownerId) return region;

    const def = BUILDINGS[order.building];
    const ware: GoodId = def.buildWare ?? "timber";
    const avail = budget[ware];
    const remaining = def.cost - order.progress;
    const invest = Math.min(BUILD_RATE, remaining, avail);
    if (invest <= 0) return region;

    budget[ware] = round1(avail - invest);
    waresSpent[ware] = round1((waresSpent[ware] ?? 0) + invest);
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

  return { regions: nextRegions, waresSpent, completed };
}
