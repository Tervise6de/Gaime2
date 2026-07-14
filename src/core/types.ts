/**
 * Core simulation types.
 *
 * `GameState` is a plain, serialisable object. Every turn-resolution function is
 * a pure transform `GameState -> GameState` (see `systems/turn.ts`): no hidden
 * state, no DOM, no `Math.random()`. This is what makes the sim deterministic,
 * testable, and save/load-able (design doc §7).
 */

/** The four core resources tracked as national stockpiles. */
export type ResourceKind = "gold" | "food" | "materials" | "knowledge";

/** A bundle of the four core resources. */
export type Resources = Record<ResourceKind, number>;

/** Terrain kinds available on the map (design doc §3.1, ~5 types). */
export type TerrainType =
  | "plains"
  | "forest"
  | "hills"
  | "mountains"
  | "tundra";

/** A point in normalised map space, each axis in [0, 1]. */
export interface Point {
  x: number;
  y: number;
}

/**
 * A province in the region graph. All spatial rules (movement, borders, trade)
 * touch only `adjacency`; `site`/`coastal` are for rendering and light economy.
 */
export interface Region {
  id: number;
  name: string;
  terrain: TerrainType;
  /** Owning nation id, or `null` for an unowned/neutral region. */
  ownerId: number | null;
  /** Working population (drives production up to terrain capacity). */
  population: number;
  /** Normalised position used by the renderer. */
  site: Point;
  /** Ids of adjacent regions (symmetric — if a→b then b→a). */
  adjacency: number[];
  /** Sits on the map frontier → trade-gold bonus. */
  coastal: boolean;
}

/** A nation (the player, plus AI rivals in later milestones). */
export interface Nation {
  id: number;
  name: string;
  /** CSS colour used to tint owned regions. */
  color: string;
  isPlayer: boolean;
  /** Accumulated resource stockpiles (`gold` is the treasury). */
  stockpile: Resources;
  /** Global tax rate, 0..MAX_TAX_RATE. Converts trade into gold at an unrest
   * cost (unrest lands in M2). */
  taxRate: number;
}

/**
 * The complete game state. Serialisable to JSON for save/load and reproducible
 * from `seed` alone (plus any turns replayed). `rngState` snapshots the RNG so
 * resolution can consume randomness without breaking determinism.
 */
export interface GameState {
  /** Friendly seed the map was generated from. */
  seed: number;
  /** Serialised RNG state (see `core/rng.ts`). */
  rngState: number;
  /** Current turn number, starting at 1. */
  turn: number;
  regions: Region[];
  nations: Nation[];
  /** Id of the human player's nation. */
  playerNationId: number;
}
