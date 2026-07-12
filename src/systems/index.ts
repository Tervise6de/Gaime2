/**
 * Game systems.
 *
 * Each system owns one slice of simulation (economy, map generation, turn
 * resolution, rendering). Systems hold logic over `GameState` and stay
 * decoupled from the UI layer — they never touch the DOM.
 *
 * Re-export systems here as they are added.
 */
export { createRenderer } from "@/systems/renderer";
export type { Renderer } from "@/systems/renderer";

export { createRng, hashSeed } from "@/systems/rng";
export type { Rng } from "@/systems/rng";

export { generateMap, DEFAULT_MAP_OPTIONS } from "@/systems/mapgen";
export type { MapGenOptions, GeneratedMap } from "@/systems/mapgen";

export {
  regionProduction,
  nationalProduction,
  unrestPenalty,
  round1,
} from "@/systems/economy";

export { regionCapacity, nextPopulation } from "@/systems/population";
export {
  unrestTarget,
  nextUnrest,
  overexpansionUnrest,
} from "@/systems/stability";
export { advanceConstruction } from "@/systems/construction";
export type { ConstructionResult } from "@/systems/construction";

export {
  resolveCombat,
  sideStrength,
  siegePower,
} from "@/systems/combat";
export type { CombatResult, CombatContext, UnitCounts } from "@/systems/combat";

export {
  armyAt,
  anyArmyAt,
  strategicAccess,
  armyMoves,
  canRaiseUnit,
  raiseUnit,
  reachableRegions,
  moveArmy,
  totalUpkeep,
} from "@/systems/military";
export type { RaiseCheck } from "@/systems/military";

export {
  createGame,
  resolveTurn,
  setTaxRate,
  clampTax,
  queueBuilding,
  cancelConstruction,
  canQueueBuilding,
} from "@/systems/turn";
export type { NewGameOptions } from "@/systems/turn";

export * from "@/systems/state";
