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

/**
 * Strategic resources (docs/game-design.md §3.2). Iron and horses gate advanced
 * units; salt and amber are the Hansa's signature *trade* strategics — salt the
 * "white gold" that preserves fish, amber the Baltic luxury — seeded on the Hansa
 * map.
 */
export type StrategicResource = "iron" | "horses" | "salt" | "amber";

/** Display metadata for each strategic resource (map marker, region panel, legend). */
export const STRATEGIC_RESOURCES: Record<StrategicResource, { label: string; glyph: string; tip: string }> = {
  iron: {
    label: "Iron",
    glyph: "⚒",
    tip: "Iron deposit — a strategic resource: advanced units (Ranged, Siege) need iron, and it trades as a good.",
  },
  horses: {
    label: "Horses",
    glyph: "🐎",
    tip: "Horses — a strategic resource: Cavalry and Knights need horses.",
  },
  salt: {
    label: "Salt",
    glyph: "🧂",
    tip: "Salt — the 'white gold' that preserves fish; a high-value Hansa trade good (Lüneburg, Wieliczka).",
  },
  amber: {
    label: "Amber",
    glyph: "🟠",
    tip: "Amber — the Baltic's signature luxury, gathered on the Samland and Curonian shores; a rich trade good.",
  },
};

export interface ResourceYield {
  food: number;
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
  /** Strategic resource associated with this terrain. */
  strategic: StrategicResource | null;
  /** Legacy placement weight retained for data compatibility. */
  weight: number;
}

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  plains: {
    id: "plains",
    name: "Plains",
    // Pale wheat — the base parchment tone (vintage-map land, not saturated green).
    color: "#e6d7ab",
    base: { food: 4, gold: 2, knowledge: 0 },
    popCapacity: 12,
    defense: 1.0,
    strategic: "horses",
    weight: 4,
  },
  forest: {
    id: "forest",
    name: "Forest",
    // Muted sage — a greyed green that sits in the aged-paper family.
    color: "#a6b884",
    base: { food: 2, gold: 1, knowledge: 0 },
    popCapacity: 8,
    defense: 1.2,
    strategic: null,
    weight: 3,
  },
  hills: {
    id: "hills",
    name: "Hills",
    // Warm tan — dry upland parchment, a shade deeper than the plains wheat.
    color: "#d2b98c",
    base: { food: 1, gold: 2, knowledge: 1 },
    popCapacity: 7,
    defense: 1.25,
    strategic: "iron",
    weight: 3,
  },
  mountains: {
    id: "mountains",
    name: "Mountains",
    // Warm grey-taupe — neutral stony parchment, the least saturated terrain.
    color: "#b4a996",
    base: { food: 0, gold: 1, knowledge: 2 },
    popCapacity: 4,
    defense: 1.4,
    strategic: "iron",
    weight: 2,
  },
  coast: {
    id: "coast",
    name: "Coast",
    // Green-tinted cream — a slightly greener parchment than the plains wheat,
    // deliberately NOT ocean-blue so coast cells read as wet *land* rather than
    // lakes inside the island silhouette.
    color: "#cfd6ac",
    base: { food: 3, gold: 4, knowledge: 1 },
    popCapacity: 10,
    defense: 1.0,
    strategic: null,
    weight: 3,
  },
};

export const TERRAIN_IDS = Object.keys(TERRAIN) as TerrainId[];
