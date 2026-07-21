/**
 * Unit types and the rock-paper-scissors counter loop (docs/game-design.md §3.4).
 *
 * The roster is drawn from the Hanseatic era's own land warfare (c. 1250–1550;
 * see `hansa times.md` §10) — the transition from **mail-and-levy** through the
 * **crossbow**, the **pike revolution**, and finally **gunpowder shot**:
 *
 *   Militia → Cavalry → Ranged → Infantry → Militia   (X → Y means "X counters Y")
 *
 * Read in era terms:
 *   Town Militia (spear levy) → Mounted Sergeants (light horse) →
 *   Crossbowmen (windlass crossbow) → Men-at-Arms (mail/plate foot) → Town Militia
 *   Bombards: weak in the field, but batter down a fortress's walls.
 *
 * Each of the four roles has a cheap, always-available **basic** and a
 * doctrine-gated **premium** that counters the same type, so the loop stays a
 * clean 4-cycle while the roster deepens toward the age of pike-and-shot:
 *   counters Cavalry :  Town Militia → Pikemen      (Town Watch doctrine)
 *   counters Militia :  Men-at-Arms  → Swordsmen     (Drilled Infantry + iron)
 *   counters Infantry:  Crossbowmen  → Handgunners   (Gunpowder Shot + iron)
 *   counters Ranged  :  Mounted Sgt  → Knights       (Knightly Orders + horses)
 * The core four are ungated (a realm always has an army); the premiums gate behind
 * a Military doctrine and often a strategic resource, so the late field belongs to
 * the realm that committed to Chivalric Orders (Knights, Bombards) or Town Levies
 * (Pikemen, Swordsmen, Handgunners).
 *
 * Composition matters, so "just spam the strongest unit" is never optimal.
 * Costs are gold + arms wares (timber for the levy; iron/copper for plate and
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
  | "knight"
  // Naval — warships built only at a coastal port; they form coast-locked fleets
  // (the Hansa fought at sea with armed cogs and, later, gun-armed carracks).
  | "war_cog"
  | "hulk"
  | "carrack";

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
  /** Research doctrine node that must be completed to raise this unit (null = ungated core). */
  requiresTech: TechId | null;
  /** A warship: raised only at a coastal port; any army holding one is a fleet,
      locked to the coast (it sails the shore rather than marching inland). */
  naval?: boolean;
}

export const UNITS: Record<UnitType, UnitDef> = {
  // The burgher levy — townsmen with spear and billhook, called out to the walls.
  // Cheap, always available, and a spear hedge that unhorses a charge (counters cavalry).
  militia: {
    id: "militia",
    name: "Town Militia",
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
  // Men-at-arms — professional foot in mail (and, in time, plate); the line that
  // grinds a raw levy down (counters Militia).
  infantry: {
    id: "infantry",
    name: "Men-at-Arms",
    short: "MaA",
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
  // Crossbowmen — the town crossbow guilds' windlass-spanned bows, strong enough
  // to punch armour; a killing opening volley that undoes heavy foot (counters Infantry).
  ranged: {
    id: "ranged",
    name: "Crossbowmen",
    short: "Xbow",
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
  // Mounted sergeants — light and medium horse that ride down loose shot before it
  // can span again (counters Ranged). The everyday cavalry beneath the Knights.
  cavalry: {
    id: "cavalry",
    name: "Mounted Sergeants",
    short: "Srg",
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
  // Bombards — trebuchets giving way to great gunpowder cannon; feeble in the open
  // field, but they batter a fortress's walls to rubble (Siege Trains doctrine + iron).
  siege: {
    id: "siege",
    name: "Bombards",
    short: "Bmb",
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
  // Pikemen — the infantry revolution: a drilled pike block, nearly invincible
  // against cavalry in formation (Town Watch doctrine, no resource) — the premium Militia.
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
  // Handgunners — matchlock arquebus and hand-gonne; a hard-hitting volley that
  // punches through foot, but fragile in the melee (Gunpowder Shot + iron) — the endgame Ranged.
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
  // Swordsmen — Doppelsöldner in full plate with two-handed blade; elite men-at-arms
  // who outclass the levy they hunt (Drilled Infantry + iron) — the premium Infantry.
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
  // Knights — the crusading orders' mailed-and-plated fist (the Teutonic Order in
  // the Baltic). Fast, hard-hitting and dear to field (Knightly Orders + horses) —
  // the premium Cavalry, death to loose shot.
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

  // --- Naval — fleets built at coastal ports ---------------------------------
  // The Hansa's sea war was armed merchant cogs and, later, gun-armed carracks
  // (hansa times.md §8, §10). A War-Cog is the ungated coastal workhorse; the
  // Hulk and Carrack are the payoff of the Maritime **Naval Power** doctrine.
  // Ships fight other ships and batter coastal forts (siege power); they never
  // counter a land type — the sea is its own domain.
  war_cog: {
    id: "war_cog",
    name: "War-Cog",
    short: "Cog",
    cost: { gold: 24, wares: { timber: 6, naval_stores: 6 } },
    upkeep: 2,
    attack: 5,
    defense: 6,
    moves: 2,
    counters: null,
    volley: true,
    siegePower: 1,
    requires: null,
    requiresTech: null,
    naval: true,
  },
  // The larger 15th-century carrier, castled fore and aft — a stronger warship
  // (Maritime → Naval Power: War Cogs).
  hulk: {
    id: "hulk",
    name: "Hulk",
    short: "Hlk",
    cost: { gold: 34, wares: { naval_stores: 10, iron: 4 } },
    upkeep: 3,
    attack: 7,
    defense: 8,
    moves: 2,
    counters: null,
    volley: true,
    siegePower: 1,
    requires: null,
    requiresTech: "war_cogs",
    naval: true,
  },
  // The carvel-built, high-sided gun platform whose stern "bristled with cannon"
  // — the age of naval artillery (Naval Power: Ship Bombards; needs iron for guns).
  carrack: {
    id: "carrack",
    name: "Carrack",
    short: "Crk",
    cost: { gold: 44, wares: { naval_stores: 10, iron: 8 } },
    upkeep: 4,
    attack: 9,
    defense: 7,
    moves: 2,
    counters: null,
    volley: true,
    siegePower: 3,
    requires: "iron",
    requiresTech: "ship_bombards",
    naval: true,
  },
};

export const UNIT_TYPES = Object.keys(UNITS) as UnitType[];

/** The naval unit types (warships) — a fleet is any army holding one of these. */
export const NAVAL_UNIT_TYPES = UNIT_TYPES.filter((t) => UNITS[t].naval);

/** Counter bonus: a unit deals this much extra vs the type it counters. */
export const COUNTER_BONUS = 0.5;
