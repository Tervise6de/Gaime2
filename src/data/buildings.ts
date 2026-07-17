/**
 * Buildings — queued in a region's single production slot.
 *
 * Buildings are the first real spending decision (docs/game-design.md §3.3,
 * M2): they cost materials to construct over several turns and then modify that
 * region's economy, population capacity, or unrest. Content lives here as data
 * so balancing is editing this table, not the systems.
 *
 * Effects are additive modifiers applied per region:
 *   - `yield`      adds to the region's per-turn production
 *   - `popCapacity` raises the sustainable population cap
 *   - `unrest`     is subtracted from the region's unrest target (order)
 *
 * Numbers are illustrative starting values for tuning.
 */

import type { ResourceYield, TerrainId } from "@/data/terrain";
import type { TechId } from "@/data/techs";

export type BuildingId =
  | "farm"
  | "workshop"
  | "market"
  | "harbor"
  | "mine"
  | "library"
  | "temple"
  | "aqueduct"
  | "university"
  | "bank"
  | "guildhall"
  | "forum"
  | "fortress"
  | "wonder"
  | "granary"
  | "barracks"
  | "lighthouse"
  | "monastery"
  | "watchtower"
  | "courthouse"
  | "printing_house"
  | "cathedral";

export interface BuildingDef {
  id: BuildingId;
  name: string;
  /** Total materials required to complete construction. */
  cost: number;
  /** Additive per-turn yield once built. */
  yield: Partial<ResourceYield>;
  /** Added to the region's population capacity. */
  popCapacity: number;
  /** Subtracted from the region's unrest target (an order-keeping effect). */
  unrest: number;
  /** Fortification levels added to the region on completion (one-time). */
  fortification?: number;
  /** Tech that must be researched before this can be built. */
  requiresTech?: TechId;
  /** Terrain the region must have — hidden entirely elsewhere (not just locked). */
  requiresTerrain?: TerrainId;
  /** A Great Work — counts toward the economic victory. */
  isWonder?: boolean;
  /** One-line description for the build menu. */
  blurb: string;
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  farm: {
    id: "farm",
    name: "Farm",
    cost: 12,
    yield: { food: 3 },
    popCapacity: 4,
    unrest: 0,
    blurb: "+3 food, +4 population capacity.",
  },
  workshop: {
    id: "workshop",
    name: "Workshop",
    cost: 16,
    yield: { materials: 3 },
    popCapacity: 0,
    unrest: 0,
    blurb: "+3 materials per turn.",
  },
  market: {
    id: "market",
    name: "Market",
    cost: 16,
    yield: { gold: 3 },
    popCapacity: 0,
    unrest: 0,
    blurb: "+3 gold per turn (before tax).",
  },
  harbor: {
    id: "harbor",
    name: "Harbor",
    cost: 20,
    yield: { gold: 3, food: 2 },
    popCapacity: 2,
    unrest: 0,
    requiresTerrain: "coast",
    blurb: "+3 gold, +2 food, +2 population capacity. Coast regions only.",
  },
  mine: {
    id: "mine",
    name: "Mine",
    cost: 22,
    yield: { materials: 4, gold: 2 },
    popCapacity: 0,
    unrest: 0,
    requiresTech: "masonry",
    requiresTerrain: "mountains",
    blurb: "+4 materials, +2 gold. Mountain regions only. (Masonry)",
  },
  library: {
    id: "library",
    name: "Library",
    cost: 20,
    yield: { knowledge: 2 },
    popCapacity: 0,
    unrest: 0,
    blurb: "+2 knowledge per turn.",
  },
  temple: {
    id: "temple",
    name: "Temple",
    cost: 14,
    yield: {},
    popCapacity: 0,
    unrest: 12,
    blurb: "-12 unrest — keeps a heavily-taxed region in order.",
  },
  aqueduct: {
    id: "aqueduct",
    name: "Aqueduct",
    cost: 22,
    yield: { food: 3 },
    popCapacity: 6,
    unrest: 0,
    requiresTech: "irrigation",
    blurb: "+3 food, +6 population capacity. (Irrigation)",
  },
  university: {
    id: "university",
    name: "University",
    cost: 24,
    yield: { knowledge: 4 },
    popCapacity: 0,
    unrest: 0,
    requiresTech: "mathematics",
    blurb: "+4 knowledge per turn. (Mathematics)",
  },
  bank: {
    id: "bank",
    name: "Bank",
    cost: 24,
    yield: { gold: 5 },
    popCapacity: 0,
    unrest: 0,
    requiresTech: "banking",
    blurb: "+5 gold per turn. (Banking)",
  },
  guildhall: {
    id: "guildhall",
    name: "Guildhall",
    cost: 30,
    yield: { gold: 3, materials: 3 },
    popCapacity: 0,
    unrest: 0,
    requiresTech: "economics",
    blurb: "+3 gold, +3 materials — the economy branch's workshop-and-market in one. (Economics)",
  },
  forum: {
    id: "forum",
    name: "Forum",
    cost: 26,
    yield: { knowledge: 2 },
    popCapacity: 0,
    unrest: 6,
    requiresTech: "philosophy",
    blurb: "+2 knowledge, -6 unrest — the civics branch's library-and-temple in one. (Philosophy)",
  },
  fortress: {
    id: "fortress",
    name: "Fortress",
    cost: 28,
    yield: {},
    popCapacity: 0,
    unrest: 0,
    fortification: 2,
    requiresTech: "engineering",
    blurb: "+2 fortification — a hard region to crack. (Engineering)",
  },
  wonder: {
    id: "wonder",
    name: "Great Work",
    cost: 100,
    yield: { gold: 2, knowledge: 2 },
    popCapacity: 0,
    unrest: 0,
    requiresTech: "architecture",
    isWonder: true,
    blurb: "A prestige project. Build enough to win an economic victory. (Architecture)",
  },
  granary: {
    id: "granary",
    name: "Granary",
    cost: 14,
    yield: { food: 2 },
    popCapacity: 4,
    unrest: 0,
    requiresTech: "pottery",
    blurb: "+2 food, +4 population capacity. (Pottery)",
  },
  barracks: {
    id: "barracks",
    name: "Barracks",
    cost: 16,
    yield: {},
    popCapacity: 0,
    unrest: 8,
    requiresTech: "warcraft",
    blurb: "-8 unrest — a drilled garrison keeps a martial town in order. (Warcraft)",
  },
  lighthouse: {
    id: "lighthouse",
    name: "Lighthouse",
    cost: 20,
    yield: { gold: 3, food: 1 },
    popCapacity: 2,
    unrest: 0,
    requiresTech: "cartography",
    requiresTerrain: "coast",
    blurb: "+3 gold, +1 food, +2 population. Coast only. (Cartography)",
  },
  monastery: {
    id: "monastery",
    name: "Monastery",
    cost: 20,
    yield: { knowledge: 3 },
    popCapacity: 0,
    unrest: 6,
    requiresTech: "scholasticism",
    blurb: "+3 knowledge, -6 unrest — scholars and quiet order. (Scholasticism)",
  },
  watchtower: {
    id: "watchtower",
    name: "Watchtower",
    cost: 18,
    yield: {},
    popCapacity: 0,
    unrest: 3,
    fortification: 1,
    requiresTech: "castles",
    blurb: "+1 fortification, -3 unrest — a watched, defended march. (Castles)",
  },
  courthouse: {
    id: "courthouse",
    name: "Courthouse",
    cost: 24,
    yield: {},
    popCapacity: 0,
    unrest: 14,
    requiresTech: "common_law",
    blurb: "-14 unrest — the king's law tames a restless province. (Common Law)",
  },
  printing_house: {
    id: "printing_house",
    name: "Printing House",
    cost: 26,
    yield: { knowledge: 6 },
    popCapacity: 0,
    unrest: 0,
    requiresTech: "printing",
    blurb: "+6 knowledge per turn — the press multiplies learning. (Printing)",
  },
  cathedral: {
    id: "cathedral",
    name: "Cathedral",
    cost: 34,
    yield: { knowledge: 2, gold: 1 },
    popCapacity: 0,
    unrest: 10,
    requiresTech: "theology",
    blurb: "+2 knowledge, +1 gold, -10 unrest — a seat of faith. (Theology)",
  },
};

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

/** Materials invested into a region's queued building each turn (if funded). */
export const BUILD_RATE = 6;
