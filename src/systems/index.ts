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

export { regionProduction, nationalProduction, round1 } from "@/systems/economy";

export { createGame, resolveTurn, setTaxRate, clampTax } from "@/systems/turn";
export type { NewGameOptions } from "@/systems/turn";

export * from "@/systems/state";
