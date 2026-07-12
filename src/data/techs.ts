/**
 * Technology tree (docs/game-design.md §3.6) — a small branching tree (~16
 * nodes) across four branches. Techs grant economic multipliers, unlock the
 * advanced units and buildings, provide unrest tools, and — at the capstone —
 * enable the Great Works victory. Branches force build diversity: you cannot
 * research everything in one game, so tech order is a strategy identity.
 *
 * Effects are declarative data so balancing is editing this table, not code.
 * Numbers are illustrative starting values for tuning.
 */

import type { BuildingId } from "@/data/buildings";
import type { UnitType } from "@/data/units";
import type { ResourceYield } from "@/data/terrain";

export type TechId =
  | "agriculture"
  | "bronze_working"
  | "currency"
  | "writing"
  | "irrigation"
  | "horseback"
  | "mathematics"
  | "banking"
  | "masonry"
  | "civil_service"
  | "engineering"
  | "economics"
  | "philosophy"
  | "feudalism"
  | "architecture"
  | "nationalism";

export type TechBranch = "economy" | "military" | "civics" | "wonders";

export interface TechDef {
  id: TechId;
  name: string;
  blurb: string;
  /** Knowledge required to research. */
  cost: number;
  requires: TechId[];
  branch: TechBranch;
  tier: number;
  /** Multiplicative yield bonus, e.g. { gold: 0.15 } = +15% gold. */
  yieldMult?: Partial<ResourceYield>;
  unlockBuilding?: BuildingId;
  unlockUnit?: UnitType;
  /** Flat reduction to every owned region's unrest target. */
  unrestReduction?: number;
}

export const TECHS: Record<TechId, TechDef> = {
  agriculture: {
    id: "agriculture", name: "Agriculture", branch: "economy", tier: 0, cost: 20,
    requires: [], yieldMult: { food: 0.2 }, blurb: "+20% food.",
  },
  bronze_working: {
    id: "bronze_working", name: "Bronze Working", branch: "military", tier: 0, cost: 22,
    requires: [], unlockUnit: "ranged", blurb: "Unlock Ranged units.",
  },
  currency: {
    id: "currency", name: "Currency", branch: "economy", tier: 0, cost: 20,
    requires: [], yieldMult: { gold: 0.15 }, blurb: "+15% gold.",
  },
  writing: {
    id: "writing", name: "Writing", branch: "civics", tier: 0, cost: 18,
    requires: [], yieldMult: { knowledge: 0.25 }, blurb: "+25% knowledge.",
  },
  irrigation: {
    id: "irrigation", name: "Irrigation", branch: "economy", tier: 1, cost: 34,
    requires: ["agriculture"], unlockBuilding: "aqueduct", blurb: "Unlock the Aqueduct.",
  },
  horseback: {
    id: "horseback", name: "Horseback Riding", branch: "military", tier: 1, cost: 34,
    requires: ["bronze_working"], unlockUnit: "cavalry", blurb: "Unlock Cavalry (needs horses).",
  },
  mathematics: {
    id: "mathematics", name: "Mathematics", branch: "civics", tier: 1, cost: 36,
    requires: ["writing"], unlockBuilding: "university", blurb: "Unlock the University.",
  },
  banking: {
    id: "banking", name: "Banking", branch: "economy", tier: 1, cost: 38,
    requires: ["currency"], unlockBuilding: "bank", blurb: "Unlock the Bank.",
  },
  masonry: {
    id: "masonry", name: "Masonry", branch: "military", tier: 1, cost: 30,
    requires: ["bronze_working"], unrestReduction: 4, blurb: "-4 unrest everywhere.",
  },
  civil_service: {
    id: "civil_service", name: "Civil Service", branch: "civics", tier: 1, cost: 40,
    requires: ["writing"], unrestReduction: 6, blurb: "-6 unrest everywhere.",
  },
  engineering: {
    id: "engineering", name: "Engineering", branch: "military", tier: 2, cost: 52,
    requires: ["masonry", "mathematics"], unlockUnit: "siege", unlockBuilding: "fortress",
    blurb: "Unlock Siege (needs iron) and the Fortress.",
  },
  economics: {
    id: "economics", name: "Economics", branch: "economy", tier: 2, cost: 54,
    requires: ["banking"], yieldMult: { gold: 0.2, materials: 0.1 }, blurb: "+20% gold, +10% materials.",
  },
  philosophy: {
    id: "philosophy", name: "Philosophy", branch: "civics", tier: 2, cost: 50,
    requires: ["civil_service"], yieldMult: { knowledge: 0.25 }, unrestReduction: 4,
    blurb: "+25% knowledge, -4 unrest.",
  },
  feudalism: {
    id: "feudalism", name: "Feudalism", branch: "military", tier: 2, cost: 48,
    requires: ["horseback"], yieldMult: { materials: 0.15 }, unrestReduction: 3,
    blurb: "+15% materials, -3 unrest.",
  },
  architecture: {
    id: "architecture", name: "Architecture", branch: "wonders", tier: 3, cost: 70,
    requires: ["engineering", "economics"], unlockBuilding: "wonder",
    blurb: "Unlock Great Works (Wonders) — an economic victory path.",
  },
  nationalism: {
    id: "nationalism", name: "Nationalism", branch: "civics", tier: 3, cost: 66,
    requires: ["philosophy", "feudalism"], unrestReduction: 8, yieldMult: { gold: 0.1 },
    blurb: "-8 unrest, +10% gold.",
  },
};

export const TECH_IDS = Object.keys(TECHS) as TechId[];
