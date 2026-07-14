/**
 * Core simulation types.
 *
 * `GameState` is a plain, serialisable object. Every turn-resolution function is
 * pure: `(state, …) => newState`. Nothing here touches the DOM or the network.
 */

export type Terrain = "plains" | "forest" | "hills" | "mountains" | "coast";

export type UnitType = "militia" | "infantry" | "ranged" | "cavalry" | "siege";

export const UNIT_TYPES: readonly UnitType[] = [
  "militia",
  "infantry",
  "ranged",
  "cavalry",
  "siege",
];

/** A stack of units, keyed by unit type. */
export type Units = Record<UnitType, number>;

export type Archetype = "warlord" | "merchant" | "builder" | "opportunist";

export interface Personality {
  archetype: Archetype;
  /** 0..1 — willingness to fight at unfavourable odds. */
  aggression: number;
  /** 0..1 — appetite for grabbing territory. */
  expansion: number;
  /** 0..1 — bias toward economy/army investment. */
  economy: number;
}

export interface Region {
  id: number;
  name: string;
  /** Layout position in normalised [0,1] space; rendering scales to canvas. */
  x: number;
  y: number;
  terrain: Terrain;
  /** Owning nation id, or -1 for a neutral/barbarian region. */
  owner: number;
  population: number;
  /** Fortification level 0..MAX_FORT. Raises defensive strength. */
  fort: number;
  /** Adjacent region ids (undirected graph). */
  adj: number[];
}

export interface Army {
  id: number;
  owner: number;
  /** Region id the army occupies. */
  location: number;
  units: Units;
  /** Set once the army has moved/attacked this turn. */
  moved: boolean;
}

export interface Nation {
  id: number;
  name: string;
  color: string;
  isPlayer: boolean;
  personality: Personality;
  treasury: number;
  /** Global tax rate 0..0.4. Higher = more gold, more unrest. */
  taxRate: number;
  alive: boolean;
}

export interface ScoreSnapshot {
  turn: number;
  /** Prestige per nation, indexed by nation id. */
  scores: number[];
}

export type Phase = "playing" | "ended";

export type VictoryType = "domination" | "elimination" | "prestige" | null;

export interface GameState {
  seed: number;
  /** Current RNG cursor — see rng.ts. */
  rngState: number;
  turn: number;
  maxTurns: number;
  regions: Region[];
  nations: Nation[];
  armies: Army[];
  nextArmyId: number;
  scoreHistory: ScoreSnapshot[];
  /** Rolling human-readable event log (newest last). */
  log: string[];
  phase: Phase;
  winner: number | null;
  victoryType: VictoryType;
}
