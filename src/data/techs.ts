/**
 * Technology tree — a branching tree across the five Hanseatic ages (data/eras.ts:
 * Gotland Network → The Turning). Techs grant economic multipliers, unlock advanced
 * units and buildings, provide unrest tools, and shape a realm's strategic identity.
 * Names and flavour are grounded in the League era (see `hansa times.md`).
 *
 * **Era-gated:** every tech belongs to an `era` (0-based age index, data/eras.ts).
 * A tech cannot be researched before its age has dawned, so progress is
 * historically plausible — no cannon in the Gotland Network age. The frontier
 * only offers age-appropriate techs; reaching the next age opens its branch.
 *
 * Effects are declarative data so balancing is editing this table, not code.
 */

import type { BuildingId } from "@/data/buildings";
import type { UnitType } from "@/data/units";
import type { ResourceYield } from "@/data/terrain";

export type TechId =
  // Age of Founding (era 0)
  | "agriculture"
  | "currency"
  | "bronze_working"
  | "writing"
  | "pottery"
  | "warcraft"
  // Age of Banners (era 1)
  | "irrigation"
  | "banking"
  | "horseback"
  | "husbandry"
  | "masonry"
  | "mathematics"
  | "civil_service"
  | "cartography"
  | "scholasticism"
  // Age of Crowns (era 2)
  | "engineering"
  | "metallurgy"
  | "economics"
  | "philosophy"
  | "feudalism"
  | "castles"
  | "common_law"
  | "guilds"
  | "lubeck_law"
  // Age of Conquest (era 3)
  | "nationalism"
  | "printing"
  | "mercantilism"
  | "standing_army"
  // Age of Legacy (era 4)
  | "theology"
  | "absolutism"
  | "gunpowder";

export type TechBranch = "economy" | "military" | "civics";

export interface TechDef {
  id: TechId;
  name: string;
  blurb: string;
  /** Knowledge required to research. */
  cost: number;
  requires: TechId[];
  branch: TechBranch;
  tier: number;
  /** The age (0-based era index) this tech becomes researchable in. */
  era: number;
  /** Multiplicative yield bonus, e.g. { gold: 0.15 } = +15% gold. */
  yieldMult?: Partial<ResourceYield>;
  unlockBuilding?: BuildingId;
  unlockUnit?: UnitType;
  /** Flat reduction to every owned region's unrest target. */
  unrestReduction?: number;
}

export const TECHS: Record<TechId, TechDef> = {
  // --- Gotland Network (era 0) ---------------------------------------------
  agriculture: {
    id: "agriculture", name: "Three-Field Farming", branch: "economy", tier: 0, era: 0, cost: 20,
    requires: [], yieldMult: { food: 0.2 }, blurb: "+20% food — the manorial crop rotation that feeds the growing towns.",
  },
  currency: {
    id: "currency", name: "The Lübeck Mark", branch: "economy", tier: 0, era: 0, cost: 20,
    requires: [], yieldMult: { gold: 0.15 }, blurb: "+15% gold — a trusted silver mark, common coin of the Wendish towns.",
  },
  bronze_working: {
    id: "bronze_working", name: "The Crossbow", branch: "military", tier: 0, era: 0, cost: 22,
    requires: [], unlockUnit: "ranged", blurb: "Unlock Crossbowmen — the town militia's armour-piercing bolt.",
  },
  writing: {
    id: "writing", name: "Town Charters", branch: "civics", tier: 0, era: 0, cost: 18,
    requires: [], yieldMult: { knowledge: 0.25 }, blurb: "+25% knowledge — written charters, records and burgher law.",
  },
  pottery: {
    id: "pottery", name: "Grain Stores", branch: "economy", tier: 0, era: 0, cost: 24,
    requires: [], unlockBuilding: "granary", yieldMult: { food: 0.1 },
    blurb: "+10% food; unlocks the Granary (food + population).",
  },
  warcraft: {
    id: "warcraft", name: "Town Levy", branch: "military", tier: 0, era: 0, cost: 26,
    requires: [], unlockBuilding: "barracks", blurb: "Unlock the Barracks — a drilled, calmer muster town.",
  },

  // --- Lübeck Ascendant (era 1) --------------------------------------------
  irrigation: {
    id: "irrigation", name: "Dykes & Polders", branch: "economy", tier: 1, era: 1, cost: 34,
    requires: ["agriculture"], unlockBuilding: "aqueduct", blurb: "Unlock the Aqueduct — Low-Country land drainage and clean water.",
  },
  banking: {
    id: "banking", name: "Merchant Banking", branch: "economy", tier: 1, era: 1, cost: 38,
    requires: ["currency"], unlockBuilding: "bank", blurb: "Unlock the Bank — bills of exchange and merchant credit.",
  },
  horseback: {
    id: "horseback", name: "Mounted Retinue", branch: "military", tier: 1, era: 1, cost: 34,
    requires: ["bronze_working"], unlockUnit: "cavalry", blurb: "Unlock Cavalry (needs horses).",
  },
  husbandry: {
    id: "husbandry", name: "Stock Breeding", branch: "economy", tier: 1, era: 1, cost: 32,
    requires: ["agriculture"], yieldMult: { food: 0.1 }, unlockBuilding: "stable",
    blurb: "+10% food; unlocks the Stable — develop your horse country (materials + gold).",
  },
  masonry: {
    id: "masonry", name: "Brick Gothic", branch: "military", tier: 1, era: 1, cost: 30,
    requires: ["bronze_working"], unrestReduction: 4, unlockBuilding: "mine",
    blurb: "-4 unrest everywhere — the Baltic's fired-brick walls; unlocks the Mine (mountains).",
  },
  mathematics: {
    id: "mathematics", name: "Reckoning Schools", branch: "civics", tier: 1, era: 1, cost: 36,
    requires: ["writing"], unlockBuilding: "university", blurb: "Unlock the University — reckoning masters and the calculating board.",
  },
  civil_service: {
    id: "civil_service", name: "Town Council", branch: "civics", tier: 1, era: 1, cost: 40,
    requires: ["writing"], unrestReduction: 6, blurb: "-6 unrest everywhere — a sworn council of aldermen governs the town.",
  },
  cartography: {
    id: "cartography", name: "Portolan Charts", branch: "economy", tier: 1, era: 1, cost: 32,
    requires: ["currency"], unlockBuilding: "lighthouse", yieldMult: { gold: 0.1 },
    blurb: "+10% gold; unlocks the Lighthouse — coastal sea-charts and safer lanes.",
  },
  scholasticism: {
    id: "scholasticism", name: "Monastic Schools", branch: "civics", tier: 1, era: 1, cost: 34,
    requires: ["writing"], unlockBuilding: "monastery", blurb: "Unlock the Monastery (knowledge + order).",
  },
  lubeck_law: {
    id: "lubeck_law", name: "Lübeck Law", branch: "civics", tier: 1, era: 1, cost: 44,
    requires: ["civil_service"], unlockBuilding: "hanse_hall",
    blurb: "The towns' shared charter — unlocks the Hanse Hall, seat from which the Hanseatic League is founded.",
  },

  // --- League Takes Shape (era 2) ------------------------------------------
  engineering: {
    id: "engineering", name: "Siegecraft", branch: "military", tier: 2, era: 2, cost: 52,
    requires: ["masonry", "mathematics"], unlockUnit: "siege", unlockBuilding: "fortress",
    blurb: "Unlock the Siege train (needs iron) and the Fortress.",
  },
  metallurgy: {
    id: "metallurgy", name: "Ironworking", branch: "military", tier: 2, era: 2, cost: 50,
    requires: ["masonry"], yieldMult: { materials: 0.1 }, unlockBuilding: "bloomery",
    blurb: "+10% materials; unlocks the Bloomery — forge your iron country into arms.",
  },
  economics: {
    id: "economics", name: "Double-Entry Ledger", branch: "economy", tier: 2, era: 2, cost: 54,
    requires: ["banking"], yieldMult: { gold: 0.2, materials: 0.1 }, unlockBuilding: "guildhall",
    blurb: "+20% gold, +10% materials — the merchant's balanced books; unlocks the Guildhall.",
  },
  philosophy: {
    id: "philosophy", name: "Humanism", branch: "civics", tier: 2, era: 2, cost: 50,
    requires: ["civil_service"], yieldMult: { knowledge: 0.25 }, unrestReduction: 4,
    unlockBuilding: "forum", blurb: "+25% knowledge, -4 unrest; unlocks the Forum.",
  },
  feudalism: {
    id: "feudalism", name: "Feudal Levy", branch: "military", tier: 2, era: 2, cost: 48,
    requires: ["horseback"], yieldMult: { materials: 0.15 }, unrestReduction: 3,
    blurb: "+15% materials, -3 unrest — sworn service raises men and works.",
  },
  castles: {
    id: "castles", name: "Order Castles", branch: "military", tier: 2, era: 2, cost: 46,
    requires: ["masonry"], unrestReduction: 3, unlockBuilding: "watchtower",
    blurb: "-3 unrest — the crusading orders' brick strongholds; unlocks the Watchtower.",
  },
  common_law: {
    id: "common_law", name: "Town Law", branch: "civics", tier: 2, era: 2, cost: 50,
    requires: ["civil_service"], unrestReduction: 5, unlockBuilding: "courthouse",
    blurb: "-5 unrest — codified Stadtrecht; unlocks the Courthouse (strong order).",
  },
  guilds: {
    id: "guilds", name: "Merchant Guilds", branch: "economy", tier: 2, era: 2, cost: 48,
    requires: ["banking"], yieldMult: { gold: 0.15, materials: 0.1 },
    blurb: "+15% gold, +10% materials — chartered trade guilds.",
  },

  // --- Peak of the Hansa (era 3) -------------------------------------------
  nationalism: {
    id: "nationalism", name: "Civic Pride", branch: "civics", tier: 3, era: 3, cost: 72,
    requires: ["philosophy", "feudalism"], unrestReduction: 8, yieldMult: { gold: 0.1 },
    blurb: "-8 unrest, +10% gold — burghers proud of their town and its liberties.",
  },
  printing: {
    id: "printing", name: "The Printing Press", branch: "civics", tier: 3, era: 3, cost: 70,
    requires: ["philosophy"], yieldMult: { knowledge: 0.3 }, unlockBuilding: "printing_house",
    blurb: "+30% knowledge; unlocks the Printing House.",
  },
  mercantilism: {
    id: "mercantilism", name: "Staple Right", branch: "economy", tier: 3, era: 3, cost: 74,
    requires: ["economics", "guilds"], yieldMult: { gold: 0.25 },
    blurb: "+25% gold — the Stapelrecht forces passing trade to your market.",
  },
  standing_army: {
    id: "standing_army", name: "Mercenary Companies", branch: "military", tier: 3, era: 3, cost: 68,
    requires: ["feudalism"], yieldMult: { materials: 0.15 }, unrestReduction: 4,
    blurb: "+15% materials, -4 unrest — paid, drilled Söldner companies.",
  },

  // --- The Turning (era 4) -------------------------------------------------
  theology: {
    id: "theology", name: "Cathedral Chapter", branch: "civics", tier: 4, era: 4, cost: 90,
    requires: ["printing"], unrestReduction: 8, yieldMult: { knowledge: 0.15 },
    unlockBuilding: "cathedral", blurb: "-8 unrest, +15% knowledge; unlocks the Cathedral.",
  },
  absolutism: {
    id: "absolutism", name: "Princely Rule", branch: "civics", tier: 4, era: 4, cost: 92,
    requires: ["nationalism"], unrestReduction: 10, yieldMult: { gold: 0.15 },
    blurb: "-10 unrest, +15% gold — the territorial prince's word is law.",
  },
  gunpowder: {
    id: "gunpowder", name: "Cannon Foundry", branch: "military", tier: 4, era: 4, cost: 88,
    requires: ["engineering", "standing_army"], yieldMult: { materials: 0.2 }, unrestReduction: 4,
    blurb: "+20% materials, -4 unrest — cannon foundries and drilled shot.",
  },
};

export const TECH_IDS = Object.keys(TECHS) as TechId[];
