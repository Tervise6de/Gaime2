/**
 * Player-available military intelligence.
 *
 * The map exposes enemy presence and the region panel exposes the exact landed
 * garrison when a player inspects that region. Fleets at sea expose presence but
 * not their exact warship count. AI planning follows that same boundary.
 */

import { UNITS, type UnitType } from "@/data/units";
import type { UnitCounts } from "@/systems/combat";
import { emptyUnits, type Army, type GameState } from "@/systems/state";

/** A visible fleet is known to be a fleet, but not its exact warship count. */
export const PUBLIC_FLEET_STACK_ESTIMATE = 1;

/** What a hostile sail on the horizon is worth as an estimate: a fleet is there. */
function estimatedEnemyUnits(): UnitCounts {
  const units = emptyUnits();
  units.war_cog = PUBLIC_FLEET_STACK_ESTIMATE;
  return units;
}

/**
 * Return exactly what an observer can reasonably know about an army.
 *
 * Landed armies are public garrisons in the current UI. A future fog-of-war or
 * scouting feature can narrow this projection without changing AI callers.
 */
export function publicIntelUnits(state: GameState, observerId: number, army: Army): UnitCounts {
  void state;
  if (army.ownerId === observerId || army.seaZoneId === undefined) return { ...army.units };
  return estimatedEnemyUnits();
}

export function publicIntelStrength(state: GameState, observerId: number, army: Army): number {
  const units = publicIntelUnits(state, observerId, army);
  return (Object.keys(units) as UnitType[]).reduce((sum, unit) => {
    return sum + units[unit] * (UNITS[unit].attack + UNITS[unit].defense);
  }, 0);
}

/**
 * A public-power approximation for diplomacy. The observer knows territory and
 * visible army presence and the currently public economy model.
 */
export function publicNationPower(state: GameState, observerId: number, nationId: number): number {
  let army = 0;
  for (const stack of state.armies) {
    if (stack.ownerId === nationId) army += publicIntelStrength(state, observerId, stack);
  }
  const regions = state.regions.filter((region) => region.ownerId === nationId).length;
  const nation = state.nations.find((entry) => entry.id === nationId);
  const treasury = nation ? Math.max(0, nation.stocks.gold) / 40 : 0;
  return army + regions * 6 + treasury;
}
