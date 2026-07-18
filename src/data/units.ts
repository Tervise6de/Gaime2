/**
 * Unit types and the rock-paper-scissors counter loop (docs/game-design.md §3.4).
 *
 * A 4-cycle counter loop plus siege as the fortification answer:
 *   Militia → Cavalry → Ranged → Infantry → Militia   (X → Y means "X counters Y")
 *   Siege: weak in the field, but strips enemy fortification.
 * Two tech-gated specialists extend the roster into the later ages: Pikemen (a
 * stronger anti-cavalry wall, Feudalism) and Handgunners (a hard late volley
 * unit, Gunpowder). Both counter an existing type, so the loop stays intact.
 *
 * Composition matters, so "just spam the strongest unit" is never optimal.
 * Costs are gold + materials to raise; every unit also draws gold upkeep each
 * turn, so armies are an ongoing economic drag, not a one-time buy. Some units
 * require access to a strategic resource (iron / horses), which makes specific
 * territory worth fighting for.
 *
 * Numbers are illustrative starting values for tuning.
 */

import type { StrategicResource } from "@/data/terrain";
import type { TechId } from "@/data/techs";

export type UnitType = "militia" | "infantry" | "ranged" | "cavalry" | "siege" | "pikeman" | "handgunner";

export interface UnitDef {
  id: UnitType;
  name: string;
  short: string;
  cost: { gold: number; materials: number };
  /** Gold drawn from the treasury each turn per unit. */
  upkeep: number;
  attack: number;
  defense: number;
  /** Region moves per turn (an army moves at its slowest unit's rate). */
  moves: number;
  /** The unit type this one gets a counter bonus against, if any. */
  counters: UnitType | null;
  /** Fires in the opening volley before melee (ranged, siege bombardment). */
  volley: boolean;
  /** Fortification levels this unit strips when attacking (siege). */
  siegePower: number;
  /** Strategic resource access required to raise this unit. */
  requires: StrategicResource | null;
  /** Tech that must be researched to raise this unit (null = available from start). */
  requiresTech: TechId | null;
}

export const UNITS: Record<UnitType, UnitDef> = {
  militia: {
    id: "militia",
    name: "Militia",
    short: "Mil",
    cost: { gold: 10, materials: 5 },
    upkeep: 1,
    attack: 2,
    defense: 4,
    moves: 1,
    counters: "cavalry",
    volley: false,
    siegePower: 0,
    requires: null,
    requiresTech: null,
  },
  infantry: {
    id: "infantry",
    name: "Infantry",
    short: "Inf",
    cost: { gold: 20, materials: 10 },
    upkeep: 2,
    attack: 5,
    defense: 5,
    moves: 1,
    counters: "militia",
    volley: false,
    siegePower: 0,
    requires: null,
    requiresTech: null,
  },
  ranged: {
    id: "ranged",
    name: "Ranged",
    short: "Rng",
    cost: { gold: 20, materials: 8 },
    upkeep: 2,
    attack: 6,
    defense: 2,
    moves: 1,
    counters: "infantry",
    volley: true,
    siegePower: 0,
    requires: null,
    requiresTech: "bronze_working",
  },
  cavalry: {
    id: "cavalry",
    name: "Cavalry",
    short: "Cav",
    cost: { gold: 30, materials: 10 },
    upkeep: 3,
    attack: 7,
    defense: 4,
    moves: 2,
    counters: "ranged",
    volley: false,
    siegePower: 0,
    requires: "horses",
    requiresTech: "horseback",
  },
  siege: {
    id: "siege",
    name: "Siege",
    short: "Sge",
    cost: { gold: 30, materials: 20 },
    upkeep: 3,
    attack: 4,
    defense: 2,
    moves: 1,
    counters: null,
    volley: true,
    siegePower: 2,
    requires: "iron",
    requiresTech: "engineering",
  },
  // Mid-game anti-cavalry wall: a drilled pike block. Cheap, tanky, low bite —
  // a dedicated answer to horse beyond the humble Militia (Feudalism, no resource).
  pikeman: {
    id: "pikeman",
    name: "Pikemen",
    short: "Pik",
    cost: { gold: 16, materials: 10 },
    upkeep: 2,
    attack: 4,
    defense: 7,
    moves: 1,
    counters: "cavalry",
    volley: false,
    siegePower: 0,
    requires: null,
    requiresTech: "feudalism",
  },
  // Late-game firepower: early handguns. A hard-hitting volley unit that punches
  // through foot, but fragile in the melee (Gunpowder + iron) — the endgame Ranged.
  handgunner: {
    id: "handgunner",
    name: "Handgunners",
    short: "Gun",
    cost: { gold: 24, materials: 12 },
    upkeep: 3,
    attack: 8,
    defense: 3,
    moves: 1,
    counters: "infantry",
    volley: true,
    siegePower: 0,
    requires: "iron",
    requiresTech: "gunpowder",
  },
};

export const UNIT_TYPES = Object.keys(UNITS) as UnitType[];

/** Counter bonus: a unit deals this much extra vs the type it counters. */
export const COUNTER_BONUS = 0.5;
