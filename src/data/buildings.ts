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

import type { ResourceYield } from "@/data/terrain";
import type { TechId } from "@/data/techs";

export type BuildingId =
  | "farm"
  | "workshop"
  | "market"
  | "library"
  | "temple"
  | "aqueduct"
  | "university"
  | "bank"
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
    cost: 60,
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
