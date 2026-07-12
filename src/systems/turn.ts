/**
 * Turn resolution pipeline and game setup.
 *
 * `resolveTurn` is the pure reducer at the heart of the game
 * (docs/game-design.md §1): GameState → new GameState, in a fixed order.
 *
 * M4 pipeline order (subset of §1):
 *   for each nation: income & upkeep → construction → population & food →
 *   unrest → bankruptcy;  then rival AI takes its turn (raise/move/attack/
 *   diplomacy);  then relations drift;  then army moves refresh;  then the
 *   outcome (defeat/elimination) check.  (Research/events/victory arrive in M5.)
 *
 * The player's own army movement and diplomacy happen interactively before
 * `resolveTurn` is called. Purity: `resolveTurn` never mutates its input.
 */

import { BUILDINGS, type BuildingId } from "@/data/buildings";
import { UNITS, type UnitType } from "@/data/units";
import { ARCHETYPES } from "@/data/personalities";
import { generateMap, type MapGenOptions } from "@/systems/mapgen";
import { nationalProduction, round1 } from "@/systems/economy";
import { advanceConstruction } from "@/systems/construction";
import { nextPopulation } from "@/systems/population";
import { nextUnrest } from "@/systems/stability";
import { armyMoves, totalUpkeep } from "@/systems/military";
import { driftRelations } from "@/systems/diplomacy";
import { runNationTurn } from "@/systems/ai";
import { createRng, type Rng } from "@/systems/rng";
import {
  BANKRUPTCY_UNREST,
  BARBARIAN_ID,
  DEFAULT_TAX,
  GRANARY_CAP,
  PLAYER_ID,
  UNREST_MAX,
  clampTax,
  emptyUnits,
  type Army,
  type GameState,
  type Nation,
  type Region,
  type ResourceStocks,
} from "@/systems/state";

const BARBARIAN_NATION: Nation = {
  id: BARBARIAN_ID,
  name: "Free Peoples",
  color: "#9a5b53",
  isPlayer: false,
  isBarbarian: true,
  alive: true,
  stocks: zeroStocks(),
  taxRate: 0,
  famine: false,
  bankrupt: false,
};

const RIVAL_NAMES = ["Valdheim", "Suzerain of Kael", "Sundered League"];
const RIVAL_COLORS = ["#5b8bd0", "#b06ec0", "#6cae7a"];

const STARTING_STOCKS: ResourceStocks = { gold: 60, food: 20, materials: 15, knowledge: 0 };
/** How many regions each nation begins with (capital + neighbours). */
const START_REGIONS = 3;
/** Number of AI rival nations. */
const RIVAL_COUNT = 2;

export interface NewGameOptions {
  seed: number;
  map?: MapGenOptions;
  taxRate?: number;
  rivals?: number;
}

/** Build a fresh game from a seed. Pure: same seed → identical starting state. */
export function createGame(options: NewGameOptions): GameState {
  const { regions } = generateMap(options.seed, options.map);
  const rng = createRng((options.seed ^ 0x9e3779b9) >>> 0);
  const rivalCount = Math.max(0, Math.min(options.rivals ?? RIVAL_COUNT, RIVAL_COLORS.length));

  // Player is nation 0, barbarians nation 1, rivals 2..n. Index === id.
  const nations: Nation[] = [
    {
      id: PLAYER_ID,
      name: "Your Realm",
      color: "#d8a24a",
      isPlayer: true,
      isBarbarian: false,
      alive: true,
      stocks: { ...STARTING_STOCKS },
      taxRate: clampTax(options.taxRate ?? DEFAULT_TAX),
      famine: false,
      bankrupt: false,
    },
    { ...BARBARIAN_NATION, stocks: zeroStocks() },
  ];
  const personalities = shuffled(ARCHETYPES, rng);
  for (let i = 0; i < rivalCount; i++) {
    nations.push({
      id: 2 + i,
      name: RIVAL_NAMES[i]!,
      color: RIVAL_COLORS[i]!,
      isPlayer: false,
      isBarbarian: false,
      alive: true,
      stocks: { ...STARTING_STOCKS },
      taxRate: DEFAULT_TAX,
      personality: personalities[i % personalities.length],
      famine: false,
      bankrupt: false,
    });
  }

  // Choose well-separated capitals for the player + rivals.
  const capitals = pickCapitals(regions, rng, 1 + rivalCount);
  const nationIds = [PLAYER_ID, ...Array.from({ length: rivalCount }, (_, i) => 2 + i)];

  let nextArmyId = 0;
  const armies: Army[] = [];
  const ownerOf = new Map<number, number>();

  nationIds.forEach((nationId, idx) => {
    const capital = capitals[idx]!;
    const owned = new Set<number>([capital]);
    for (const n of regions[capital]!.adjacency) {
      if (owned.size >= START_REGIONS) break;
      if (![...ownerOf.keys()].includes(n)) owned.add(n);
    }
    for (const rid of owned) ownerOf.set(rid, nationId);
    const startUnits = { ...emptyUnits(), militia: 2, infantry: 1 };
    armies.push({
      id: nextArmyId++,
      ownerId: nationId,
      regionId: capital,
      units: startUnits,
      movesLeft: armyMoves(startUnits),
    });
  });

  const capitalSet = new Set(capitals);
  const laidOut: Region[] = regions.map((r) => {
    const owner = ownerOf.get(r.id);
    if (owner !== undefined) {
      return { ...r, ownerId: owner, fortification: capitalSet.has(r.id) ? 1 : 0 };
    }
    // Barbarian-held: light fortification + a small garrison.
    const fort = rng.int(0, 2);
    const garrison = { ...emptyUnits(), militia: rng.int(1, 2) };
    if (rng.next() < 0.35) garrison.infantry = 1;
    armies.push({ id: nextArmyId++, ownerId: BARBARIAN_ID, regionId: r.id, units: garrison, movesLeft: 0 });
    return { ...r, ownerId: BARBARIAN_ID, fortification: fort };
  });

  const playerCapitalName = regions[capitals[0]!]!.name;

  return {
    seed: options.seed,
    rngState: rng.seed,
    turn: 1,
    nations,
    regions: laidOut,
    armies,
    nextArmyId,
    relations: {},
    treaties: {},
    offers: [],
    nextOfferId: 0,
    outcome: "playing",
    log: [
      `Turn 1 — your realm rises around ${playerCapitalName}; ` +
        `${rivalCount} rival power${rivalCount === 1 ? "" : "s"} contest the land (seed ${options.seed}).`,
    ],
  };
}

/** Set a nation's tax rate (defaults to the player). Pure. */
export function setTaxRate(state: GameState, rate: number, nationId = PLAYER_ID): GameState {
  const nations = state.nations.map((n) =>
    n.id === nationId ? { ...n, taxRate: clampTax(rate) } : n,
  );
  return { ...state, nations };
}

/** Whether a building can be queued in a region (owned by player, not built). */
export function canQueueBuilding(region: Region, building: BuildingId): boolean {
  if (region.ownerId !== PLAYER_ID) return false;
  if (region.buildings.includes(building)) return false;
  return true;
}

/** Queue (or replace) a region's construction order for its owner. Pure. */
export function queueBuilding(
  state: GameState,
  regionId: number,
  building: BuildingId,
  ownerId = PLAYER_ID,
): GameState {
  const region = state.regions[regionId];
  if (!region || region.ownerId !== ownerId || region.buildings.includes(building)) return state;
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

/**
 * Run one nation's economic turn: income/upkeep, construction, food/famine,
 * population and unrest, bankruptcy. Pure. Detailed logging only for the player
 * (rival economies stay quiet; their notable actions log via AI/combat).
 */
export function advanceNationEconomy(state: GameState, nationId: number): GameState {
  const nation = state.nations.find((n) => n.id === nationId);
  if (!nation || nation.isBarbarian || !nation.alive) return state;

  const flow = nationalProduction(state, nationId);
  const upkeep = totalUpkeep(state, nationId);
  const stocks: ResourceStocks = {
    gold: round1(nation.stocks.gold + flow.gold - upkeep),
    food: nation.stocks.food,
    materials: round1(nation.stocks.materials + flow.materials),
    knowledge: round1(nation.stocks.knowledge + flow.knowledge),
  };

  // Construction (this nation's regions only).
  const built = advanceConstruction(state.regions, stocks.materials, nationId);
  stocks.materials = round1(stocks.materials - built.materialsSpent);
  let regions = built.regions;

  // Food balance → famine.
  const rawFood = round1(nation.stocks.food + flow.food);
  const famine = rawFood < 0;
  stocks.food = round1(Math.max(0, Math.min(GRANARY_CAP, rawFood)));

  // Population & unrest for this nation's regions.
  const ownedCount = regions.filter((r) => r.ownerId === nationId).length;
  regions = regions.map((r) =>
    r.ownerId === nationId
      ? {
          ...r,
          population: nextPopulation(r, famine),
          unrest: nextUnrest(r, nation.taxRate, famine, ownedCount),
        }
      : r,
  );

  // Bankruptcy.
  let armies = state.armies;
  const bankrupt = stocks.gold < 0;
  if (bankrupt) {
    armies = disbandForDebt(armies, nationId);
    regions = regions.map((r) =>
      r.ownerId === nationId
        ? { ...r, unrest: Math.min(UNREST_MAX, r.unrest + BANKRUPTCY_UNREST) }
        : r,
    );
    stocks.gold = 0;
  }

  const nations = state.nations.map((n) =>
    n.id === nationId ? { ...n, stocks, famine, bankrupt } : n,
  );

  let log = state.log;
  if (nation.isPlayer) {
    const notes: string[] = [];
    for (const c of built.completed) notes.push(`${c.building} built in ${c.regionName}`);
    if (famine) notes.push("⚠ famine — population starving");
    if (bankrupt) notes.push("⚠ bankruptcy — troops disbanded, unrest spikes");
    const entry =
      `Turn ${state.turn} — +${flow.gold}g (−${upkeep} upkeep) +${flow.materials}m ` +
      `+${flow.knowledge}k, food ${fmtSigned(flow.food)}. Treasury ${stocks.gold}g.` +
      (notes.length ? ` ${notes.join("; ")}.` : "");
    log = [...state.log, entry].slice(-50);
  }

  return { ...state, nations, regions, armies, log };
}

/** Advance the game by one turn. Pure: returns a new GameState, input untouched. */
export function resolveTurn(state: GameState): GameState {
  if (state.outcome !== "playing") return state;

  let s: GameState = { ...state, turn: state.turn + 1 };

  // 1. Economy for each living non-barbarian nation.
  for (const nation of s.nations) {
    if (nation.isBarbarian || !nation.alive) continue;
    s = advanceNationEconomy(s, nation.id);
  }

  // 2. Rival AI turns (deterministic RNG stream).
  const rng: Rng = createRng(s.rngState);
  for (const nation of s.nations) {
    if (nation.isBarbarian || nation.isPlayer || !nation.alive) continue;
    if (!s.nations.find((n) => n.id === nation.id)?.alive) continue;
    s = runNationTurn(s, nation.id, rng);
  }
  s = { ...s, rngState: rng.seed };

  // 3. Relations drift.
  s = driftRelations(s);

  // 4. Refresh army moves for the coming turn.
  s = { ...s, armies: s.armies.map((a) => ({ ...a, movesLeft: armyMoves(a.units) })) };

  // 5. Outcome: update alive flags, detect elimination / player defeat.
  s = updateOutcome(s);

  return s;
}

/** Mark eliminated nations and set defeat/victory. */
function updateOutcome(state: GameState): GameState {
  const nations = state.nations.map((n) => {
    if (n.isBarbarian) return n;
    const holds = state.regions.some((r) => r.ownerId === n.id);
    return holds === n.alive ? n : { ...n, alive: holds };
  });

  const newlyDead = nations.filter((n, i) => state.nations[i]!.alive && !n.alive && !n.isBarbarian);
  let log = state.log;
  for (const n of newlyDead) log = [...log, `${n.name} has been eliminated.`].slice(-50);

  const player = nations[PLAYER_ID]!;
  const livingRivals = nations.filter((n) => !n.isBarbarian && !n.isPlayer && n.alive);
  const hadRivals = state.nations.some((n) => !n.isBarbarian && !n.isPlayer);
  let outcome = state.outcome;
  if (!player.alive) outcome = "defeat";
  else if (hadRivals && livingRivals.length === 0) {
    outcome = "victory"; // last realm standing (domination by elimination)
  }

  return { ...state, nations, log, outcome };
}

/** Remove the single highest-upkeep unit from each of a nation's armies. */
function disbandForDebt(armies: Army[], nationId: number): Army[] {
  return armies
    .map((a) => {
      if (a.ownerId !== nationId) return a;
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

// --- setup helpers ----------------------------------------------------------

/** Pick `count` region ids that are far apart on the graph (fair starts). */
function pickCapitals(regions: Region[], rng: Rng, count: number): number[] {
  let best: number[] = [];
  let bestScore = -1;
  for (let attempt = 0; attempt < 24; attempt++) {
    const pick: number[] = [];
    const used = new Set<number>();
    while (pick.length < count) {
      const id = rng.int(0, regions.length - 1);
      // Need enough neighbours to seat a starting realm.
      if (used.has(id) || regions[id]!.adjacency.length < 2) continue;
      used.add(id);
      pick.push(id);
    }
    const score = minPairwiseDistance(regions, pick);
    if (score > bestScore) {
      bestScore = score;
      best = pick;
    }
  }
  return best;
}

function minPairwiseDistance(regions: Region[], ids: number[]): number {
  let min = Infinity;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      min = Math.min(min, graphDistance(regions, ids[i]!, ids[j]!));
    }
  }
  return min === Infinity ? 0 : min;
}

function graphDistance(regions: Region[], from: number, to: number): number {
  const dist = new Map<number, number>([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const n = queue.shift()!;
    if (n === to) return dist.get(n)!;
    for (const m of regions[n]!.adjacency) {
      if (!dist.has(m)) {
        dist.set(m, dist.get(n)! + 1);
        queue.push(m);
      }
    }
  }
  return Infinity;
}

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function zeroStocks(): ResourceStocks {
  return { gold: 0, food: 0, materials: 0, knowledge: 0 };
}

function fmtSigned(n: number): string {
  return `${n >= 0 ? "+" : ""}${n}`;
}

/** Re-export so callers have one import site for building content. */
export { BUILDINGS };
