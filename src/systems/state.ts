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

import type { ResourceYield, TerrainId } from "@/data/terrain";

/** Owner id 0 is always the human player in Milestone 1. */
export const PLAYER_ID = 0;

/** Tax is a global slider; the fiscal lever of docs/game-design.md §3.2. */
export const TAX_MIN = 0;
export const TAX_MAX = 0.4;
export const TAX_STEP = 0.05;
export const DEFAULT_TAX = 0.1;

export interface Region {
  id: number;
  name: string;
  terrain: TerrainId;
  /** Owning nation id, or null for unowned/neutral terrain (used from M3). */
  ownerId: number | null;
  population: number;
  /** 0..100. Inert in M1; the anti-snowball brake arrives in M2. */
  unrest: number;
  /** Defensive works. Inert until military (M3). */
  fortification: number;
  /** Building ids queued/built here. Empty until M2. */
  buildings: string[];
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
