/**
 * Turn resolution pipeline and game setup.
 *
 * `resolveTurn` is the pure reducer at the heart of the game
 * (docs/game-design.md §1): GameState → new GameState, in a fixed order. Later
 * milestones slot research, rival AI, and events into their defined points.
 *
 * M3 pipeline order (subset of §1):
 *   income & upkeep → production/construction completes → population growth &
 *   food → unrest/stability update → bankruptcy check → army moves refresh →
 *   (later: rival AI, events) → victory check.
 *
 * Player army movement and combat happen interactively during the player's turn
 * (see military.ts), not inside `resolveTurn`. Purity: `resolveTurn` never
 * mutates its input and never touches the DOM or wall-clock time.
 */

import { BUILDINGS, type BuildingId } from "@/data/buildings";
import { UNITS, type UnitType } from "@/data/units";
import { generateMap, type MapGenOptions } from "@/systems/mapgen";
import { nationalProduction, round1 } from "@/systems/economy";
import { advanceConstruction } from "@/systems/construction";
import { nextPopulation } from "@/systems/population";
import { nextUnrest } from "@/systems/stability";
import { armyMoves, totalUpkeep } from "@/systems/military";
import { createRng } from "@/systems/rng";
import {
  BANKRUPTCY_UNREST,
  BARBARIAN_ID,
  DEFAULT_TAX,
  GRANARY_CAP,
  PLAYER_ID,
  TAX_MAX,
  TAX_MIN,
  UNREST_MAX,
  emptyUnits,
  type Army,
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

const BARBARIAN_NATION: Nation = {
  id: BARBARIAN_ID,
  name: "Free Peoples",
  color: "#9a5b53",
  isPlayer: false,
};

const STARTING_TREASURY = 60;
/** How many regions the player begins with (capital + neighbours). */
const START_REGIONS = 3;

export interface NewGameOptions {
  seed: number;
  map?: MapGenOptions;
  taxRate?: number;
}

/** Build a fresh game from a seed. Pure: same seed → identical starting state. */
export function createGame(options: NewGameOptions): GameState {
  const { regions } = generateMap(options.seed, options.map);
  // A setup RNG stream, decorrelated from map generation but seed-derived.
  const rng = createRng((options.seed ^ 0x9e3779b9) >>> 0);

  // Player capital + a couple of neighbours form the starting realm.
  const capital = rng.int(0, regions.length - 1);
  const owned = new Set<number>([capital]);
  for (const n of regions[capital]!.adjacency) {
    if (owned.size >= START_REGIONS) break;
    owned.add(n);
  }

  let nextArmyId = 0;
  const armies: Army[] = [];

  const laidOut: Region[] = regions.map((r) => {
    if (owned.has(r.id)) {
      return { ...r, ownerId: PLAYER_ID, fortification: r.id === capital ? 1 : 0 };
    }
    // Everyone else is barbarian-held: light fortification + a small garrison.
    const fort = rng.int(0, 2);
    const garrison = { ...emptyUnits(), militia: rng.int(1, 2) };
    if (rng.next() < 0.35) garrison.infantry = 1;
    armies.push({ id: nextArmyId++, ownerId: BARBARIAN_ID, regionId: r.id, units: garrison, movesLeft: 0 });
    return { ...r, ownerId: BARBARIAN_ID, fortification: fort };
  });

  // The player starts with a modest field army in the capital.
  const startUnits = { ...emptyUnits(), militia: 2, infantry: 1 };
  armies.push({
    id: nextArmyId++,
    ownerId: PLAYER_ID,
    regionId: capital,
    units: startUnits,
    movesLeft: armyMoves(startUnits),
  });

  return {
    seed: options.seed,
    rngState: rng.seed,
    turn: 1,
    taxRate: clampTax(options.taxRate ?? DEFAULT_TAX),
    stocks: { gold: STARTING_TREASURY, food: 20, materials: 15, knowledge: 0 },
    nations: [{ ...PLAYER_NATION }, { ...BARBARIAN_NATION }],
    regions: laidOut,
    armies,
    nextArmyId,
    famine: false,
    bankrupt: false,
    log: [
      `Turn 1 — the realm of ${owned.size} regions rises around ${regions[capital]!.name} (seed ${options.seed}).`,
    ],
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

/** Whether a building can be queued in a region (owned, not already built). */
export function canQueueBuilding(region: Region, building: BuildingId): boolean {
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
export function cancelConstruction(state: GameState, regionId: number): GameState {
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

  // 1. Income & upkeep.
  const flow = nationalProduction(state, PLAYER_ID);
  const upkeep = totalUpkeep(state, PLAYER_ID);
  const stocks = {
    gold: round1(state.stocks.gold + flow.gold - upkeep),
    food: state.stocks.food, // resolved below
    materials: round1(state.stocks.materials + flow.materials),
    knowledge: round1(state.stocks.knowledge + flow.knowledge),
  };

  // 2. Construction completes, drawing from the materials stockpile.
  const built = advanceConstruction(state.regions, stocks.materials);
  stocks.materials = round1(stocks.materials - built.materialsSpent);
  let regions = built.regions;

  // 3. Food balance → famine flag; the granary is a small, capped buffer.
  const rawFood = round1(state.stocks.food + flow.food);
  const famine = rawFood < 0;
  stocks.food = round1(Math.max(0, Math.min(GRANARY_CAP, rawFood)));

  // 4/5. Population growth and unrest — player regions only (barbarian regions
  //      are frozen until conquered). Overexpansion scales with regions held.
  const ownedCount = regions.filter((r) => r.ownerId === PLAYER_ID).length;
  regions = regions.map((r) =>
    r.ownerId === PLAYER_ID
      ? {
          ...r,
          population: nextPopulation(r, famine),
          unrest: nextUnrest(r, state.taxRate, famine, ownedCount),
        }
      : r,
  );

  // 6. Bankruptcy: a negative treasury forces disbandment and spikes unrest.
  let armies = state.armies;
  const bankrupt = stocks.gold < 0;
  const bankruptcyNotes: string[] = [];
  if (bankrupt) {
    armies = disbandForDebt(armies);
    regions = regions.map((r) =>
      r.ownerId === PLAYER_ID
        ? { ...r, unrest: Math.min(UNREST_MAX, r.unrest + BANKRUPTCY_UNREST) }
        : r,
    );
    stocks.gold = 0;
    bankruptcyNotes.push("⚠ bankruptcy — troops disbanded, unrest spikes");
  }

  // 7. Refresh army moves for the coming turn.
  armies = armies.map((a) => ({ ...a, movesLeft: armyMoves(a.units) }));

  // 8. Turn log.
  const notes: string[] = [];
  for (const c of built.completed) notes.push(`${c.building} built in ${c.regionName}`);
  if (famine) notes.push("⚠ famine — population starving");
  notes.push(...bankruptcyNotes);
  const entry =
    `Turn ${turn} — +${flow.gold}g (−${upkeep} upkeep) +${flow.materials}m ` +
    `+${flow.knowledge}k, food ${fmtSigned(flow.food)}. Treasury ${stocks.gold}g.` +
    (notes.length ? ` ${notes.join("; ")}.` : "");

  return {
    ...state,
    turn,
    stocks,
    regions,
    armies,
    famine,
    bankrupt,
    log: [...state.log, entry].slice(-50),
  };
}

/** Remove the single highest-upkeep unit from each player army to cut costs. */
function disbandForDebt(armies: Army[]): Army[] {
  return armies
    .map((a) => {
      if (a.ownerId !== PLAYER_ID) return a;
      let worst: UnitType | null = null;
      let worstUpkeep = 0;
      for (const t of Object.keys(a.units) as UnitType[]) {
        if (a.units[t] > 0 && UNITS[t].upkeep > worstUpkeep) {
          worst = t;
          worstUpkeep = UNITS[t].upkeep;
        }
      }
      if (!worst) return a;
      return { ...a, units: { ...a.units, [worst]: a.units[worst] - 1 } };
    })
    .filter((a) => Object.values(a.units).some((n) => n > 0));
}

function fmtSigned(n: number): string {
  return `${n >= 0 ? "+" : ""}${n}`;
}

/** Re-export so callers have one import site for building content. */
export { BUILDINGS };
