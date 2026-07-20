/**
 * Unit types and the rock-paper-scissors counter loop (docs/game-design.md §3.4).
 *
 * A 4-cycle counter loop plus siege as the fortification answer:
 *   Militia → Cavalry → Ranged → Infantry → Militia   (X → Y means "X counters Y")
 *   Siege: weak in the field, but strips enemy fortification.
 * Each of the four roles has a cheap, early **basic** and a tech-gated **premium**
 * that counters the same type, so the loop stays a clean 4-cycle while the roster
 * deepens over the ages:
 *   counters Cavalry :  Militia   → Pikemen     (Town Watch doctrine)
 *   counters Militia :  Infantry  → Swordsmen   (Drilled Infantry + iron)
 *   counters Infantry:  Ranged    → Handgunners (Gunpowder Shot + iron)
 *   counters Ranged  :  Cavalry   → Knights     (Knightly Orders + horses)
 * Premiums cost more and gate behind tech (and often a strategic resource), so the
 * early game is the tidy four-unit loop and the late game adds heavy specialists.
 *
 * Composition matters, so "just spam the strongest unit" is never optimal.
 * Costs are gold + arms wares (timber for the levy; iron/copper for the heavy and
 * gunpowder troops) to raise; every unit also draws gold upkeep each turn, so
 * armies are an ongoing economic drag, not a one-time buy. Some units require
 * access to a strategic resource (iron / horses), which makes specific territory
 * worth fighting for.
 *
 * Numbers are illustrative starting values for tuning.
 */

import type { StrategicResource } from "@/data/terrain";
import type { GoodId } from "@/data/goods";
import type { TechId } from "@/data/techs";

export type UnitType =
  | "militia"
  | "infantry"
  | "ranged"
  | "cavalry"
  | "siege"
  | "pikeman"
  | "handgunner"
  | "swordsman"
  | "knight";

export interface UnitDef {
  id: UnitType;
  name: string;
  short: string;
  /** Gold plus the arms wares needed to raise one unit (data/goods.ts). */
  cost: { gold: number; wares: Partial<Record<GoodId, number>> };
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
    cost: { gold: 10, wares: { timber: 4 } },
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
    cost: { gold: 20, wares: { timber: 8 } },
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
    cost: { gold: 20, wares: { timber: 6 } },
    upkeep: 2,
    attack: 6,
    defense: 2,
    moves: 1,
    counters: "infantry",
    volley: true,
    siegePower: 0,
    requires: null,
    requiresTech: null,
  },
  cavalry: {
    id: "cavalry",
    name: "Cavalry",
    short: "Cav",
    cost: { gold: 30, wares: { timber: 8 } },
    upkeep: 3,
    attack: 7,
    defense: 4,
    moves: 2,
    counters: "ranged",
    volley: false,
    siegePower: 0,
    requires: "horses",
    requiresTech: null,
  },
  siege: {
    id: "siege",
    name: "Siege",
    short: "Sge",
    cost: { gold: 30, wares: { timber: 10, iron: 4 } },
    upkeep: 3,
    attack: 4,
    defense: 2,
    moves: 1,
    counters: null,
    volley: true,
    siegePower: 2,
    requires: "iron",
    requiresTech: "heavy_horse",
  },
  // Mid-game anti-cavalry wall: a drilled pike block. Cheap, tanky, low bite —
  // a dedicated answer to horse beyond the humble Militia (Town Watch, no resource).
  pikeman: {
    id: "pikeman",
    name: "Pikemen",
    short: "Pik",
    cost: { gold: 16, wares: { timber: 8 } },
    upkeep: 2,
    attack: 4,
    defense: 7,
    moves: 1,
    counters: "cavalry",
    volley: false,
    siegePower: 0,
    requires: null,
    requiresTech: "town_watch",
  },
  // Late-game firepower: early handguns. A hard-hitting volley unit that punches
  // through foot, but fragile in the melee (Gunpowder Shot + iron) — the endgame Ranged.
  handgunner: {
    id: "handgunner",
    name: "Handgunners",
    short: "Gun",
    cost: { gold: 24, wares: { iron: 6, copper: 2 } },
    upkeep: 3,
    attack: 8,
    defense: 3,
    moves: 1,
    counters: "infantry",
    volley: true,
    siegePower: 0,
    requires: "iron",
    requiresTech: "gunpowder_shot",
  },
  // Elite men-at-arms: a hard, well-armoured melee line that outclasses the levy
  // it hunts (Drilled Infantry + iron) — the premium Infantry: more bite, more armour.
  swordsman: {
    id: "swordsman",
    name: "Swordsmen",
    short: "Swd",
    cost: { gold: 26, wares: { iron: 10 } },
    upkeep: 3,
    attack: 7,
    defense: 6,
    moves: 1,
    counters: "militia",
    volley: false,
    siegePower: 0,
    requires: "iron",
    requiresTech: "drilled_infantry",
  },
  // Heavy shock cavalry — the crusading orders' mailed fist. Fast, hard-hitting and
  // dear to field (Knightly Orders + horses) — the premium Cavalry, death to loose shot.
  knight: {
    id: "knight",
    name: "Knights",
    short: "Kni",
    cost: { gold: 40, wares: { timber: 4, iron: 8 } },
    upkeep: 4,
    attack: 9,
    defense: 5,
    moves: 2,
    counters: "ranged",
    volley: false,
    siegePower: 0,
    requires: "horses",
    requiresTech: "knightly_orders",
  },
};

export const UNIT_TYPES = Object.keys(UNITS) as UnitType[];

/** Counter bonus: a unit deals this much extra vs the type it counters. */
export const COUNTER_BONUS = 0.5;
