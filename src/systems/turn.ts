/**
 * Turn resolution pipeline and game setup.
 *
 * `resolveTurn` is the pure reducer at the heart of the game
 * (docs/game-design.md §1): GameState → new GameState, in a fixed order. Later
 * milestones slot research, AI, combat, and events into their defined points.
 *
 * M2 pipeline order (subset of §1):
 *   income & upkeep → production/construction completes → population growth &
 *   food → unrest/stability update → (later: research, AI, combat, events) →
 *   victory check.
 *
 * Purity: `resolveTurn` never mutates its input and never touches the DOM, RNG
 * globals, or wall-clock time. Same input → same output, always.
 */

import { BUILDINGS, type BuildingId } from "@/data/buildings";
import { generateMap, type MapGenOptions } from "@/systems/mapgen";
import { nationalProduction, round1 } from "@/systems/economy";
import { advanceConstruction } from "@/systems/construction";
import { nextPopulation } from "@/systems/population";
import { nextUnrest } from "@/systems/stability";
import {
  DEFAULT_TAX,
  GRANARY_CAP,
  PLAYER_ID,
  TAX_MAX,
  TAX_MIN,
  type GameState,
  type Nation,
  type Region,
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
    stocks: { gold: STARTING_TREASURY, food: 20, materials: 10, knowledge: 0 },
    nations: [{ ...PLAYER_NATION }],
    regions,
    famine: false,
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

/** Whether a building can be queued in a region (owned, absent, affordable-later). */
export function canQueueBuilding(
  region: Region,
  building: BuildingId,
): boolean {
  if (region.ownerId !== PLAYER_ID) return false;
  if (region.buildings.includes(building)) return false;
  return true;
}

/** Queue (or replace) a region's construction order. Pure. */
export function queueBuilding(
  state: GameState,
  regionId: number,
  building: BuildingId,
): GameState {
  const region = state.regions[regionId];
  if (!region || !canQueueBuilding(region, building)) return state;
  const regions = state.regions.map((r) =>
    r.id === regionId ? { ...r, construction: { building, progress: 0 } } : r,
  );
  return { ...state, regions };
}

/** Clear a region's construction order (progress is lost). Pure. */
export function cancelConstruction(
  state: GameState,
  regionId: number,
): GameState {
  const region = state.regions[regionId];
  if (!region || !region.construction) return state;
  const regions = state.regions.map((r) =>
    r.id === regionId ? { ...r, construction: null } : r,
  );
  return { ...state, regions };
}

/** Advance the game by one turn. Pure: returns a new GameState, input untouched. */
export function resolveTurn(state: GameState): GameState {
  const turn = state.turn + 1;

  // 1. Income & production (uses this turn's regions and current unrest).
  const flow = nationalProduction(state, PLAYER_ID);
  const stocks = {
    gold: round1(state.stocks.gold + flow.gold),
    food: state.stocks.food, // resolved below
    materials: round1(state.stocks.materials + flow.materials),
    knowledge: round1(state.stocks.knowledge + flow.knowledge),
  };

  // 2. Construction completes, drawing from the materials stockpile.
  const built = advanceConstruction(state.regions, stocks.materials);
  stocks.materials = round1(stocks.materials - built.materialsSpent);
  let regions = built.regions;

  // 3. Food balance → famine flag; granary is a small buffer, capped.
  const rawFood = round1(state.stocks.food + flow.food);
  const famine = rawFood < 0;
  stocks.food = round1(Math.max(0, Math.min(GRANARY_CAP, rawFood)));

  // 4. Population growth / starvation, then 5. unrest drift — both read the
  //    post-construction region snapshot (buildings completed this turn count).
  regions = regions.map((r) => ({
    ...r,
    population: nextPopulation(r, famine),
    unrest: nextUnrest(r, state.taxRate, famine),
  }));

  // 6. Turn log.
  const notes: string[] = [];
  for (const c of built.completed) notes.push(`${c.building} built in ${c.regionName}`);
  if (famine) notes.push("⚠ famine — population starving, unrest rising");
  const entry =
    `Turn ${turn} — +${flow.gold}g +${flow.materials}m +${flow.knowledge}k, ` +
    `food ${fmtSigned(flow.food)}. Treasury ${stocks.gold}g.` +
    (notes.length ? ` ${notes.join("; ")}.` : "");

  return {
    ...state,
    turn,
    stocks,
    regions,
    famine,
    log: [...state.log, entry].slice(-50),
  };
}

function fmtSigned(n: number): string {
  return `${n >= 0 ? "+" : ""}${n}`;
}

/** Re-export so callers have one import site for building content. */
export { BUILDINGS };
