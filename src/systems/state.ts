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
import type { ResourceYield, TerrainId } from "@/data/terrain";

/** Owner id 0 is always the human player in Milestone 1. */
export const PLAYER_ID = 0;

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
  /** Defensive works. Inert until military (M3). */
  fortification: number;
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
  /** The seed the whole game derives from (map, and later AI/events). */
  seed: number;
  /** Turns elapsed; starts at 1. */
  turn: number;
  /** Global tax rate in [TAX_MIN, TAX_MAX]. */
  taxRate: number;
  /** National stockpiles. Gold is the treasury. */
  stocks: ResourceStocks;
  nations: Nation[];
  regions: Region[];
  /** True when last turn's national food balance went negative. */
  famine: boolean;
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

/** A per-turn production/consumption breakdown, used for the HUD and the sim. */
export type ResourceFlow = ResourceYield;

export const ZERO_FLOW: ResourceFlow = {
  food: 0,
  materials: 0,
  gold: 0,
  knowledge: 0,
};
