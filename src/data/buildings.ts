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
  | "library"
  | "temple"
  | "aqueduct"
  | "university"
  | "bank"
  | "guildhall"
  | "forum"
  | "fortress"
  | "wonder";

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
};

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

/** Materials invested into a region's queued building each turn (if funded). */
export const BUILD_RATE = 6;
