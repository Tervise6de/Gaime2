/**
 * Terrain types and their economic modifiers.
 *
 * Terrain is the root of the production web (docs/game-design.md §3.7):
 * terrain → production → food/gold/materials/knowledge. These are the base
 * per-region outputs before population, buildings, and tax are applied.
 *
 * Numbers are illustrative starting values for tuning, not final balance.
 * Balancing this game is meant to be editing this table, not the systems.
 */

export type TerrainId = "plains" | "forest" | "hills" | "mountains" | "coast";

/** Strategic resources gate advanced units (docs/game-design.md §3.2). */
export type StrategicResource = "iron" | "horses";

export interface ResourceYield {
  food: number;
  materials: number;
  gold: number;
  knowledge: number;
}

export interface TerrainDef {
  id: TerrainId;
  name: string;
  /** Fill colour used by the node+edge renderer. */
  color: string;
  /** Base per-turn yield of an unworked region of this terrain. */
  base: ResourceYield;
  /** Soft population cap the terrain can sustain (raised later by buildings). */
  popCapacity: number;
  /** Defensive multiplier applied to a defender fighting on this terrain. */
  defense: number;
  /** Strategic resource that may spawn on this terrain (procedural). */
  strategic: StrategicResource | null;
  /** Relative weight for procedural placement. */
  weight: number;
}

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  plains: {
    id: "plains",
    name: "Plains",
    color: "#8fae5d",
    base: { food: 4, materials: 1, gold: 2, knowledge: 0 },
    popCapacity: 12,
    defense: 1.0,
    strategic: "horses",
    weight: 4,
  },
  forest: {
    id: "forest",
    name: "Forest",
    color: "#3f7a4f",
    base: { food: 2, materials: 4, gold: 1, knowledge: 0 },
    popCapacity: 8,
    defense: 1.2,
    strategic: null,
    weight: 3,
  },
  hills: {
    id: "hills",
    name: "Hills",
    color: "#a98b52",
    base: { food: 1, materials: 3, gold: 2, knowledge: 1 },
    popCapacity: 7,
    defense: 1.25,
    strategic: "iron",
    weight: 3,
  },
  mountains: {
    id: "mountains",
    name: "Mountains",
    color: "#7c7f88",
    base: { food: 0, materials: 2, gold: 1, knowledge: 2 },
    popCapacity: 4,
    defense: 1.4,
    strategic: "iron",
    weight: 2,
  },
  coast: {
    id: "coast",
    name: "Coast",
    color: "#4a89b8",
    base: { food: 3, materials: 1, gold: 4, knowledge: 1 },
    popCapacity: 10,
    defense: 1.0,
    strategic: null,
    weight: 3,
  },
};

export const TERRAIN_IDS = Object.keys(TERRAIN) as TerrainId[];

/** Pick a terrain id from a weighted roll in [0, 1). */
export function terrainFromRoll(roll: number): TerrainId {
  const total = TERRAIN_IDS.reduce((sum, id) => sum + TERRAIN[id].weight, 0);
  let cursor = roll * total;
  for (const id of TERRAIN_IDS) {
    cursor -= TERRAIN[id].weight;
    if (cursor <= 0) return id;
  }
  return "plains";
}
