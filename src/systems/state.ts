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
import type { TechId } from "@/data/techs";
import type { TraitId } from "@/data/traits";

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

/**
 * Diplomacy tuning (M4, docs/game-design.md §3.5). Relations sit in −100..+100
 * and drift toward a slow neutral; actions and proximity shift them.
 */
export const RELATION_MIN = -100;
export const RELATION_MAX = 100;
/** Each turn, relations decay this much toward 0 (grudges and goodwill fade). */
export const RELATION_DRIFT = 1;
/** Relation hit for declaring war / breaking a treaty. */
export const RELATION_WAR_HIT = 45;
/** Relation gain from a gift (per unit, scaled by amount). */
export const GIFT_RELATION = 1; // per gold, capped in diplomacy.ts
/** Border friction: relation drag per shared border with a nation. */
export const BORDER_FRICTION = 0.5;
/** Below this relation an AI will consider war; above it, treaties. */
export const HOSTILE_THRESHOLD = -30;
export const FRIENDLY_THRESHOLD = 40;

/**
 * Tech / victory / events tuning (M5, docs/game-design.md §3.6, §6).
 */
/** Fraction of all regions a nation must hold for a domination victory. */
export const DOMINATION_FRACTION = 0.5;
/** Great Works needed for an economic victory. */
export const WONDER_GOAL = 4;
/** The game ends at this turn on a prestige-score tiebreak. */
export const TURN_LIMIT = 150;
/** Per-turn probability a bounded random event fires for the player. */
export const EVENT_CHANCE = 0.16;

/** Difficulty scales rival economy and how soon they turn on the player. */
export type Difficulty = "easy" | "normal" | "hard";

export interface DifficultyConfig {
  /** Multiplier on rival (non-player) income. */
  rivalEconomy: number;
  /** Turns before rivals may attack the player. */
  earlyPeace: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyConfig> = {
  easy: { rivalEconomy: 0.8, earlyPeace: 25 },
  normal: { rivalEconomy: 1.0, earlyPeace: 18 },
  hard: { rivalEconomy: 1.25, earlyPeace: 10 },
};

/** A nation's research state. */
export interface Research {
  /** The tech currently being researched, if any. */
  current: TechId | null;
  /** Knowledge invested into `current` so far. */
  progress: number;
  /** Completed techs. */
  done: TechId[];
}

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

export interface ResourceStocks {
  gold: number;
  food: number;
  materials: number;
  knowledge: number;
}

/**
 * AI personality archetype (docs/game-design.md §5). Weights shift decision
 * *thresholds*, not the framework — same rules, different feel. 0..1 each.
 */
export interface Personality {
  archetype: "warlord" | "merchant" | "builder" | "opportunist";
  aggression: number;
  expansion: number;
  economy: number;
  trustworthiness: number;
}

/**
 * A nation. From M4 each non-barbarian nation runs the same economy and turn
 * pipeline as the player under the same scarcity; rivals additionally run the
 * rule-based AI (ai.ts). The player is just the nation with `isPlayer: true`.
 */
export interface Nation {
  id: number;
  name: string;
  color: string;
  isPlayer: boolean;
  /** Barbarians are static neutral holders — no economy, no AI, no diplomacy. */
  isBarbarian: boolean;
  /** Eliminated once a nation holds no regions. */
  alive: boolean;
  /** Per-nation treasury and stockpiles. */
  stocks: ResourceStocks;
  /** Per-nation tax rate in [TAX_MIN, TAX_MAX]. */
  taxRate: number;
  /** AI archetype; undefined for the player and barbarians. */
  personality?: Personality;
  /** National trait drawn per game; undefined for barbarians. */
  trait?: TraitId;
  /** Research state (techs done, current, progress). */
  research: Research;
  /** Great Works completed (economic victory progress). */
  wonders: number;
  /** Last turn's flags, for the HUD. */
  famine: boolean;
  bankrupt: boolean;
}

/** Diplomatic standing between two nations. */
export type TreatyStatus = "war" | "peace" | "nap" | "alliance";

/** A pending diplomatic offer awaiting the recipient's decision (AI → player). */
export interface DiplomaticOffer {
  id: number;
  from: number;
  to: number;
  type: "peace" | "nap" | "alliance" | "tribute";
  /** Gold the sender offers (tribute/gift sweetener), if any. */
  gold?: number;
}

export interface GameState {
  /** The seed the whole game derives from (map generation). */
  seed: number;
  /** Advancing RNG state for combat/AI/events — keeps resolution deterministic. */
  rngState: number;
  /** Turns elapsed; starts at 1. */
  turn: number;
  nations: Nation[];
  regions: Region[];
  /** All armies on the map. */
  armies: Army[];
  /** Monotonic id source for new armies. */
  nextArmyId: number;
  /** Pairwise relations, keyed by pairKey(a,b): −100..+100. */
  relations: Record<string, number>;
  /** Pairwise treaty status, keyed by pairKey(a,b). Missing = peace. */
  treaties: Record<string, TreatyStatus>;
  /** Offers from AI nations awaiting the player's response. */
  offers: DiplomaticOffer[];
  nextOfferId: number;
  /** Difficulty chosen for this game (scales rivals). */
  difficulty: Difficulty;
  /** Set once the game has been decided. */
  outcome: "playing" | "defeat" | "victory";
  /** How the game was decided (for the banner), e.g. "domination". */
  victoryKind?: string;
  /** Human-readable turn log, newest last. */
  log: string[];
  /**
   * Per-nation prestige score sampled once per turn (nation id → series, turn 1
   * first), for the end-game score graph. Barbarians are excluded; series stay
   * equal length (dead nations keep being sampled) so turns line up by index.
   */
  scoreHistory?: Record<number, number[]>;
}

/** A fresh research record. */
export function emptyResearch(): Research {
  return { current: null, progress: 0, done: [] };
}

/** The player is nation 0. */
export function playerNation(state: GameState): Nation {
  return state.nations[PLAYER_ID]!;
}

/** Look up a nation by id. */
export function nationById(state: GameState, id: number): Nation | undefined {
  return state.nations.find((n) => n.id === id);
}

/** Stable key for a pair of nations (order-independent). */
export function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Clamp a tax rate into the legal band. */
export function clampTax(rate: number): number {
  return Math.min(TAX_MAX, Math.max(TAX_MIN, rate));
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
