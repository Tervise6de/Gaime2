/**
 * Turn resolution pipeline and game setup.
 *
 * `resolveTurn` is the pure reducer at the heart of the game
 * (docs/game-design.md §1): GameState → new GameState, in a fixed order. In
 * Milestone 1 the pipeline is just the economy step; later milestones slot in
 * population, unrest, research, AI, combat, and events at their defined points.
 *
 * Purity: `resolveTurn` never mutates its input and never touches the DOM, RNG
 * globals, or wall-clock time. Same input → same output, always.
 */

import { generateMap, type MapGenOptions } from "@/systems/mapgen";
import { nationalProduction, round1 } from "@/systems/economy";
import {
  DEFAULT_TAX,
  PLAYER_ID,
  TAX_MAX,
  TAX_MIN,
  type GameState,
  type Nation,
} from "@/systems/state";

const PLAYER_NATION: Nation = {
  id: PLAYER_ID,
  name: "Your Realm",
  color: "#d8a24a",
  isPlayer: true,
};

const STARTING_TREASURY = 50;

export interface NewGameOptions {
  seed: number;
  map?: MapGenOptions;
  taxRate?: number;
}

/** Build a fresh game from a seed. Pure: same seed → identical starting state. */
export function createGame(options: NewGameOptions): GameState {
  const { regions } = generateMap(options.seed, options.map);
  return {
    seed: options.seed,
    turn: 1,
    taxRate: clampTax(options.taxRate ?? DEFAULT_TAX),
    stocks: { gold: STARTING_TREASURY, food: 0, materials: 0, knowledge: 0 },
    nations: [{ ...PLAYER_NATION }],
    regions,
    log: [`Turn 1 — a realm of ${regions.length} regions rises (seed ${options.seed}).`],
  };
}

/** Clamp a tax rate into the legal band. */
export function clampTax(rate: number): number {
  return Math.min(TAX_MAX, Math.max(TAX_MIN, rate));
}

/** Return a copy of state with the tax rate changed (does not mutate input). */
export function setTaxRate(state: GameState, rate: number): GameState {
  return { ...state, taxRate: clampTax(rate) };
}

/**
 * Advance the game by one turn. Pure: returns a new GameState, input untouched.
 *
 * Fixed resolution order (M1 subset of docs/game-design.md §1):
 *   income & upkeep → (later: production, population, unrest, research, AI,
 *   combat, events) → victory check.
 */
export function resolveTurn(state: GameState): GameState {
  const flow = nationalProduction(state, PLAYER_ID);

  const stocks = {
    gold: round1(state.stocks.gold + flow.gold),
    food: round1(Math.max(0, state.stocks.food + flow.food)),
    materials: round1(state.stocks.materials + flow.materials),
    knowledge: round1(state.stocks.knowledge + flow.knowledge),
  };

  const turn = state.turn + 1;
  const entry =
    `Turn ${turn} — +${flow.gold}g +${flow.food}f ` +
    `+${flow.materials}m +${flow.knowledge}k. Treasury ${stocks.gold}g.`;

  return {
    ...state,
    turn,
    stocks,
    // Keep the log bounded so a long game doesn't grow state without limit.
    log: [...state.log, entry].slice(-50),
  };
}
