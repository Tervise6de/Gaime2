/**
 * Core game state and the constants that drive turn resolution.
 *
 * `GameState` is a plain, serialisable object (docs/game-design.md §7): no
 * class instances, no functions, no DOM references — just data. Turn resolution
 * is a set of pure functions over `GameState` → new `GameState`, which keeps
 * the sim deterministic, snapshot-serialisable, and cheap to unit-test.
 *
 * Some fields (unrest, fortification, buildings) are inert in Milestone 1 but
 * are modelled now so later milestones can fill them in without reshaping the
 * state. Numbers are illustrative starting values for tuning.
 */

import type { BuildingId } from "@/data/buildings";
import type { ResourceYield, StrategicResource, TerrainId } from "@/data/terrain";
import type { UnitType } from "@/data/units";

/** Owner id 0 is always the human player. */
export const PLAYER_ID = 0;
/** Barbarians hold the neutral regions you conquer (M3; no diplomacy yet). */
export const BARBARIAN_ID = 1;

/** Tax is a global slider; the fiscal lever of docs/game-design.md §3.2. */
export const TAX_MIN = 0;
export const TAX_MAX = 0.4;
export const TAX_STEP = 0.05;
export const DEFAULT_TAX = 0.1;

/**
 * Stability / population tuning (M2). The anti-snowball brake lives here
 * (docs/game-design.md §3.3): tax and famine push unrest up; low tax and
 * temples pull it down; high unrest throttles production and, past the revolt
 * threshold, stops a region entirely.
 */
export const UNREST_MAX = 100;
/** Baseline unrest every region carries. */
export const UNREST_BASE = 5;
/** Extra unrest a region trends toward at the maximum tax rate. */
export const UNREST_TAX_MAX = 28;
/** Unrest below this has no production effect. */
export const UNREST_PENALTY_START = 30;
/** At/above this, the region revolts: production stops, population falls. */
export const UNREST_REVOLT = 75;
/** Unrest moves at most this far toward its target each turn (gradual). */
export const UNREST_DRIFT = 6;
/** Unrest spike applied to a region during a national famine. */
export const FAMINE_UNREST_SPIKE = 18;

/** Population tuning (M2). */
export const GROWTH_BASE = 0.35;
/** Above this unrest a region stops growing. */
export const GROWTH_UNREST_CEILING = 55;
/** Fraction of population lost per turn during famine or revolt. */
export const STARVE_FRACTION = 0.12;
/** Minimum population a region retains (never depopulates to zero in M2). */
export const MIN_POPULATION = 1;
/** National food granary cap (surplus beyond this is wasted). */
export const GRANARY_CAP = 60;

/**
 * Military / conquest tuning (M3, docs/game-design.md §3.4). Combat is abstract
 * (no tactical grid); armies drain gold upkeep; conquest and overexpansion feed
 * unrest, the anti-snowball brake.
 */
/** Fortification defensive bonus per level. */
export const FORT_PER_LEVEL = 0.2;
/** Random swing applied to the attacker's strength ratio in combat. */
export const COMBAT_VARIANCE = 0.15;
/** Fraction of the losing side's army destroyed in a decisive fight. */
export const CASUALTY_SCALE = 0.6;
/** Unrest added to a region the turn it is conquered (foreign population). */
export const CONQUEST_UNREST = 40;
/** Regions you can hold before overexpansion unrest kicks in. */
export const FREE_REGIONS = 5;
/** Extra unrest per region held beyond FREE_REGIONS. */
export const OVEREXPANSION_UNREST = 2.5;
/** Bankruptcy: unrest spike applied nationwide when the treasury goes negative. */
export const BANKRUPTCY_UNREST = 15;

/** A region's single construction slot. */
export interface ConstructionOrder {
  building: BuildingId;
  /** Materials invested so far, out of the building's cost. */
  progress: number;
}

export interface Region {
  id: number;
  name: string;
  terrain: TerrainId;
  /** Owning nation id, or null for unowned/neutral terrain (used from M3). */
  ownerId: number | null;
  population: number;
  /** 0..100. Tax and famine raise it; temples and low tax lower it (M2). */
  unrest: number;
  /** Defensive works (levels). Multiplies defender strength in combat (M3). */
  fortification: number;
  /** Strategic resource present here, if any (gates advanced units). */
  resource: StrategicResource | null;
  /** Completed building ids in this region. */
  buildings: BuildingId[];
  /** What's under construction here, if anything. */
  construction: ConstructionOrder | null;
  /** Ids of adjacent regions (the pure logic graph). */
  adjacency: number[];
  /** Layout position for the renderer, in world units [0, 1]. */
  x: number;
  y: number;
}

/** A stack of units of one nation occupying one region. */
export interface Army {
  id: number;
  ownerId: number;
  regionId: number;
  /** Count of each unit type in the stack. */
  units: Record<UnitType, number>;
  /** Region moves remaining this turn. */
  movesLeft: number;
}

export interface Nation {
  id: number;
  name: string;
  color: string;
  isPlayer: boolean;
}

export interface ResourceStocks {
  gold: number;
  food: number;
  materials: number;
  knowledge: number;
}

export interface GameState {
  /** The seed the whole game derives from (map generation). */
  seed: number;
  /** Advancing RNG state for combat/events — keeps resolution deterministic. */
  rngState: number;
  /** Turns elapsed; starts at 1. */
  turn: number;
  /** Global tax rate in [TAX_MIN, TAX_MAX]. */
  taxRate: number;
  /** National stockpiles. Gold is the treasury. */
  stocks: ResourceStocks;
  nations: Nation[];
  regions: Region[];
  /** All armies on the map (player and barbarian). */
  armies: Army[];
  /** Monotonic id source for new armies. */
  nextArmyId: number;
  /** True when last turn's national food balance went negative. */
  famine: boolean;
  /** True when last turn ended with a negative treasury (bankruptcy). */
  bankrupt: boolean;
  /** Human-readable turn log, newest last. */
  log: string[];
}

/** The four core resources, in display order. */
export const RESOURCE_KEYS = [
  "gold",
  "food",
  "materials",
  "knowledge",
] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];

/** A zeroed unit-count record. */
export function emptyUnits(): Record<UnitType, number> {
  return { militia: 0, infantry: 0, ranged: 0, cavalry: 0, siege: 0 };
}

/** Total number of units in a stack. */
export function armySize(units: Record<UnitType, number>): number {
  return (
    units.militia + units.infantry + units.ranged + units.cavalry + units.siege
  );
}

/** A per-turn production/consumption breakdown, used for the HUD and the sim. */
export type ResourceFlow = ResourceYield;

export const ZERO_FLOW: ResourceFlow = {
  food: 0,
  materials: 0,
  gold: 0,
  knowledge: 0,
};
