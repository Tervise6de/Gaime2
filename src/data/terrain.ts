/**
 * Terrain definitions.
 *
 * Data-defined content (design doc §3): balancing terrain is editing this
 * table, not touching economy code. Numbers are illustrative starting values
 * for tuning, not final balance.
 *
 * `base` is the raw per-turn output of an *empty* region of this terrain;
 * population working the land adds to it (see `systems/economy.ts`).
 * `popCapacity` caps how many workers the terrain can support before growth
 * stalls (used from M2 onward, but stored here so it lives with its terrain).
 */

import type { Resources, TerrainType } from "@/core/types";

export interface TerrainDef {
  id: TerrainType;
  name: string;
  /** Fill colour for the region on the map. */
  color: string;
  /** Base per-turn production of an unpopulated region. */
  base: Resources;
  /** Population capacity of the terrain (before buildings). */
  popCapacity: number;
  /** Relative weight when randomly assigning terrain during map gen. */
  weight: number;
}

function res(
  gold: number,
  food: number,
  materials: number,
  knowledge: number,
): Resources {
  return { gold, food, materials, knowledge };
}

export const TERRAIN: Record<TerrainType, TerrainDef> = {
  plains: {
    id: "plains",
    name: "Plains",
    color: "#6f8f4a",
    //   gold food mat know
    base: res(1, 4, 1, 0),
    popCapacity: 10,
    weight: 30,
  },
  forest: {
    id: "forest",
    name: "Forest",
    color: "#2f6b3f",
    base: res(1, 1, 4, 0),
    popCapacity: 7,
    weight: 25,
  },
  hills: {
    id: "hills",
    name: "Hills",
    color: "#8a7a3f",
    base: res(2, 2, 3, 0),
    popCapacity: 8,
    weight: 20,
  },
  mountains: {
    id: "mountains",
    name: "Mountains",
    color: "#7d7f88",
    base: res(1, 0, 2, 0),
    popCapacity: 4,
    weight: 15,
  },
  tundra: {
    id: "tundra",
    name: "Tundra",
    color: "#9fb2bd",
    base: res(0, 1, 1, 0),
    popCapacity: 3,
    weight: 10,
  },
};

/** All terrain definitions as an array (stable order). */
export const TERRAIN_LIST: TerrainDef[] = [
  TERRAIN.plains,
  TERRAIN.forest,
  TERRAIN.hills,
  TERRAIN.mountains,
  TERRAIN.tundra,
];

/** Trade-gold bonus granted to a coastal (frontier) region. */
export const COASTAL_GOLD_BONUS = 2;
