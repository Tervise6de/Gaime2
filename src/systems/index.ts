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
  fortifyArmy,
  appointCommander,
  inEnemyZoc,
  totalUpkeep,
} from "@/systems/military";
export type { RaiseCheck } from "@/systems/military";

export {
  createGame,
  resolveTurn,
  setTaxRate,
  queueBuilding,
  cancelConstruction,
  canQueueBuilding,
  chooseResearch,
  advanceNationEconomy,
} from "@/systems/turn";
export type { NewGameOptions } from "@/systems/turn";

export {
  techMultipliers,
  techUnrestReduction,
  isBuildingUnlocked,
  isUnitUnlocked,
  researchFrontier,
  canResearch,
  advanceResearch,
  selectTech,
} from "@/systems/tech";
export { fireEvent } from "@/systems/events";
export { checkVictory, nationScore } from "@/systems/victory";
export {
  serializeGame,
  deserializeGame,
  saveToLocal,
  loadFromLocal,
  hasLocalSave,
} from "@/systems/save";

export {
  getRelation,
  setRelation,
  adjustRelation,
  getTreaty,
  setTreaty,
  atWar,
  nationPower,
  sharedBorders,
  declareWar,
  makePeace,
  setPact,
  gift,
  wouldAccept,
  driftRelations,
  addOffer,
  acceptOffer,
  rejectOffer,
  playerPropose,
} from "@/systems/diplomacy";

export { runNationTurn } from "@/systems/ai";

export * from "@/systems/state";
