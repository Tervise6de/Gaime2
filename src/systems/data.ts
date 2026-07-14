/**
 * Static content tables (terrain + unit definitions).
 *
 * Balancing is editing these numbers, not the systems that read them. Numbers
 * are illustrative starting values chosen so that a single army generally
 * cannot crack a well-fortified defender — which is what makes concentration of
 * force matter (see systems/ai.ts).
 */

import type { Terrain, UnitType, Units } from "@/systems/types";

export const MAX_FORT = 4;
/** Defensive strength contributed per fortification level. */
export const FORT_STRENGTH = 14;

export interface TerrainDef {
  /** Base gold produced per population unit working the region. */
  gold: number;
  food: number;
  materials: number;
  /** Multiplier applied to a defender's strength in this terrain. */
  defenseMod: number;
  /** Multiplier applied to an attacker's strength into this terrain. */
  attackMod: number;
  /** Soft population cap for the region. */
  capacity: number;
  color: string;
}

export const TERRAIN: Record<Terrain, TerrainDef> = {
  plains: { gold: 1.1, food: 1.4, materials: 0.8, defenseMod: 1.0, attackMod: 1.0, capacity: 12, color: "#8ba94a" },
  forest: { gold: 0.9, food: 1.0, materials: 1.3, defenseMod: 1.25, attackMod: 0.9, capacity: 9, color: "#4a7a4e" },
  hills: { gold: 1.0, food: 0.8, materials: 1.4, defenseMod: 1.4, attackMod: 0.85, capacity: 8, color: "#9a8858" },
  mountains: { gold: 0.7, food: 0.5, materials: 1.1, defenseMod: 1.8, attackMod: 0.7, capacity: 5, color: "#7d7f88" },
  coast: { gold: 1.6, food: 1.1, materials: 0.7, defenseMod: 0.95, attackMod: 1.05, capacity: 11, color: "#4f86b0" },
};

export interface UnitDef {
  attack: number;
  defense: number;
  /** Extra attack applied only against a region's fortification. */
  siegeBonus: number;
  goldCost: number;
  materialCost: number;
  upkeep: number;
  /** Which unit type this one is strong against (counter loop). */
  counters: UnitType;
}

// Counter loop: militia > cavalry > ranged > infantry > militia; siege answers forts.
export const UNITS: Record<UnitType, UnitDef> = {
  militia: { attack: 3, defense: 5, siegeBonus: 0, goldCost: 4, materialCost: 3, upkeep: 1, counters: "cavalry" },
  infantry: { attack: 6, defense: 6, siegeBonus: 2, goldCost: 7, materialCost: 5, upkeep: 1, counters: "militia" },
  ranged: { attack: 8, defense: 3, siegeBonus: 0, goldCost: 8, materialCost: 4, upkeep: 2, counters: "infantry" },
  cavalry: { attack: 10, defense: 4, siegeBonus: 0, goldCost: 11, materialCost: 7, upkeep: 2, counters: "ranged" },
  siege: { attack: 4, defense: 2, siegeBonus: 16, goldCost: 12, materialCost: 9, upkeep: 3, counters: "militia" },
};

/** Bonus multiplier when a stack contains the unit that counters the enemy's. */
export const COUNTER_BONUS = 1.35;

export function emptyUnits(): Units {
  return { militia: 0, infantry: 0, ranged: 0, cavalry: 0, siege: 0 };
}

export function totalUnits(units: Units): number {
  return units.militia + units.infantry + units.ranged + units.cavalry + units.siege;
}
