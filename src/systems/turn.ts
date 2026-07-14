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
import { TRAIT_IDS } from "@/data/traits";
import { TECHS, type TechId } from "@/data/techs";
import { generateMap, type MapGenOptions } from "@/systems/mapgen";
import { nationalProduction, round1 } from "@/systems/economy";
import { advanceConstruction } from "@/systems/construction";
import { nextPopulation } from "@/systems/population";
import { nextUnrest } from "@/systems/stability";
import { armyMoves, totalUpkeep } from "@/systems/military";
import { driftRelations, atWar, tradePartners, tradeIncome } from "@/systems/diplomacy";
import { runNationTurn } from "@/systems/ai";
import { advanceResearch, techUnrestReduction, isBuildingUnlockedFor, selectTech } from "@/systems/tech";
import { fireEvent } from "@/systems/events";
import { checkVictory, nationScore } from "@/systems/victory";
import { createRng, type Rng } from "@/systems/rng";
import {
  BANKRUPTCY_UNREST,
  WAR_WEARY_TURNS,
  WAR_WEARY_MAX_STACKS,
  UNREST_BASE,
  UNREST_REVOLT,
  SECESSION_REVOLT_TURNS,
  REBEL_GARRISON,
  armySize,
  BARBARIAN_ID,
  DEFAULT_TAX,
  DIFFICULTY,
  EVENT_CHANCE,
  GRANARY_CAP,
  PLAYER_ID,
  UNREST_MAX,
  clampTax,
  emptyResearch,
  emptyUnits,
  type Army,
  type Difficulty,
  type GameState,
  type Nation,
  type NationModifier,
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
  research: emptyResearch(),
  wonders: 0,
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
  difficulty?: Difficulty;
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
      research: emptyResearch(),
      wonders: 0,
      famine: false,
      bankrupt: false,
    },
    { ...BARBARIAN_NATION, stocks: zeroStocks(), research: emptyResearch(), wonders: 0 },
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
      research: emptyResearch(),
      wonders: 0,
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
    nations[nationId]!.capitalRegionId = capital; // remembered so the AI can aim crippling strikes
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

  // Draw a distinct national trait for each non-barbarian nation (player +
  // rivals), for opening variety. Done last so existing seeded map/capital
  // layouts are unaffected by the added RNG draws.
  const traitPool = shuffled(TRAIT_IDS, rng);
  let traitIdx = 0;
  for (const n of nations) {
    if (n.isBarbarian) continue;
    n.trait = traitPool[traitIdx % traitPool.length];
    traitIdx += 1;
  }

  const playerCapitalName = regions[capitals[0]!]!.name;

  const game: GameState = {
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
    difficulty: options.difficulty ?? "normal",
    outcome: "playing",
    log: [
      `Turn 1 — your realm rises around ${playerCapitalName}; ` +
        `${rivalCount} rival power${rivalCount === 1 ? "" : "s"} contest the land (seed ${options.seed}).`,
    ],
    scoreHistory: {},
  };
  // Seed the score graph with the opening position (one sample per nation).
  game.scoreHistory = appendScores(game);
  return game;
}

/** How many living, non-barbarian nations a nation is currently at war with. */
function warCount(state: GameState, id: number): number {
  return state.nations.filter((o) => !o.isBarbarian && o.alive && o.id !== id && atWar(state, id, o.id)).length;
}

/**
 * Refresh the war-weariness modifier on every nation currently at war, scaling
 * its bite by the number of simultaneous wars (a two-front war hurts more),
 * capped at WAR_WEARY_MAX_STACKS.
 */
function applyWarWeariness(state: GameState): GameState {
  const nations = state.nations.map((n) => {
    if (n.isBarbarian || !n.alive) return n;
    const wars = warCount(state, n.id);
    if (wars === 0) return n;
    const stacks = Math.min(wars, WAR_WEARY_MAX_STACKS);
    const others = (n.modifiers ?? []).filter((m) => m.id !== "war_weary");
    return { ...n, modifiers: [...others, { id: "war_weary" as const, turnsLeft: WAR_WEARY_TURNS, stacks }] };
  });
  return { ...state, nations };
}

/**
 * Secession (design §3.3): a region held in full revolt for SECESSION_REVOLT_TURNS
 * consecutive turns — with no friendly garrison to hold it together — breaks away
 * to the barbarians, spawning a rebel militia that must be reconquered. A friendly
 * army in the region (or unrest dropping below the revolt threshold) resets the
 * counter, so stationing troops or easing unrest is the counterplay. Pure.
 */
export function applySecession(state: GameState): GameState {
  const secededIds: number[] = [];
  const regions = state.regions.map((r) => {
    const owner = r.ownerId;
    if (owner === null || owner === BARBARIAN_ID) return r;
    const inRevolt = r.unrest >= UNREST_REVOLT;
    const garrisoned =
      inRevolt &&
      state.armies.some((a) => a.regionId === r.id && a.ownerId === owner && armySize(a.units) > 0);
    if (!inRevolt || garrisoned) {
      return r.revoltTurns ? { ...r, revoltTurns: 0 } : r;
    }
    const turns = (r.revoltTurns ?? 0) + 1;
    if (turns < SECESSION_REVOLT_TURNS) return { ...r, revoltTurns: turns };
    secededIds.push(r.id);
    return { ...r, ownerId: BARBARIAN_ID, unrest: UNREST_BASE, construction: null, revoltTurns: 0 };
  });
  if (secededIds.length === 0) return { ...state, regions };

  let armies = state.armies;
  let nextArmyId = state.nextArmyId;
  let log = state.log;
  for (const id of secededIds) {
    armies = [
      ...armies,
      { id: nextArmyId, ownerId: BARBARIAN_ID, regionId: id, units: { ...emptyUnits(), militia: REBEL_GARRISON }, movesLeft: 0 },
    ];
    nextArmyId += 1;
    const former = state.nations.find((n) => n.id === state.regions[id]!.ownerId);
    log = [
      ...log,
      `${state.regions[id]!.name} rises in revolt and secedes from ${former?.isPlayer ? "your realm" : (former?.name ?? "its ruler")}.`,
    ].slice(-50);
  }
  return { ...state, regions, armies, nextArmyId, log };
}

/** Count a nation's temporary modifiers down one turn, dropping any that expire. */
function tickModifiers(modifiers: NationModifier[] | undefined): NationModifier[] | undefined {
  if (!modifiers || modifiers.length === 0) return modifiers;
  const next = modifiers.map((m) => ({ ...m, turnsLeft: m.turnsLeft - 1 })).filter((m) => m.turnsLeft > 0);
  return next.length ? next : undefined;
}

/**
 * Append the current per-nation prestige scores to the running history, keeping
 * one aligned series per non-barbarian nation (dead nations included, so all
 * series share the same length and turns line up by index). Pure.
 */
function appendScores(state: GameState): Record<number, number[]> {
  const prev = state.scoreHistory ?? {};
  const next: Record<number, number[]> = {};
  for (const n of state.nations) {
    if (n.isBarbarian) continue;
    next[n.id] = [...(prev[n.id] ?? []), nationScore(state, n.id)];
  }
  return next;
}

/** Set a nation's tax rate (defaults to the player). Pure. */
export function setTaxRate(state: GameState, rate: number, nationId = PLAYER_ID): GameState {
  const nations = state.nations.map((n) =>
    n.id === nationId ? { ...n, taxRate: clampTax(rate) } : n,
  );
  return { ...state, nations };
}

/** Whether a building can be queued in a region (owned by player, unlocked, not built). */
export function canQueueBuilding(
  region: Region,
  building: BuildingId,
  done: TechId[] = [],
): boolean {
  if (region.ownerId !== PLAYER_ID) return false;
  if (region.buildings.includes(building)) return false;
  if (!isBuildingUnlockedFor(done, building)) return false;
  const terrain = BUILDINGS[building].requiresTerrain;
  if (terrain && region.terrain !== terrain) return false;
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
  const terrain = BUILDINGS[building].requiresTerrain;
  if (terrain && region.terrain !== terrain) return state;
  const owner = state.nations.find((n) => n.id === ownerId);
  if (!owner || !isBuildingUnlockedFor(owner.research.done, building)) return state;
  const regions = state.regions.map((r) =>
    r.id === regionId ? { ...r, construction: { building, progress: 0 } } : r,
  );
  return { ...state, regions };
}

/** Select the player's (or a nation's) current research. Pure. */
export function chooseResearch(state: GameState, tech: TechId, nationId = PLAYER_ID): GameState {
  const nations = state.nations.map((n) =>
    n.id === nationId ? { ...n, research: selectTech(n.research, tech) } : n,
  );
  return { ...state, nations };
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

  // Difficulty scales rival economies (never the player's).
  const econMult = nation.isPlayer ? 1 : DIFFICULTY[state.difficulty].rivalEconomy;

  // Research: knowledge produced funds the current tech.
  const step = advanceResearch(nation.research, flow.knowledge);
  const research = step.research;

  const stocks: ResourceStocks = {
    gold: round1(nation.stocks.gold + flow.gold * econMult - upkeep),
    food: nation.stocks.food,
    materials: round1(nation.stocks.materials + flow.materials * econMult),
    knowledge: round1(research.progress), // display: invested in current tech
  };

  // Construction (this nation's regions only); may complete wonders.
  const built = advanceConstruction(state.regions, stocks.materials, nationId);
  stocks.materials = round1(stocks.materials - built.materialsSpent);
  let regions = built.regions;
  const wondersBuilt = built.completed.filter((c) => BUILDINGS[c.building].isWonder).length;

  // Food balance → famine.
  const rawFood = round1(nation.stocks.food + flow.food);
  const famine = rawFood < 0;
  stocks.food = round1(Math.max(0, Math.min(GRANARY_CAP, rawFood)));

  // Population & unrest for this nation's regions (tech eases unrest; a stationed
  // garrison polices its region and calms it — design §3.3).
  const ownedCount = regions.filter((r) => r.ownerId === nationId).length;
  const techCalm = techUnrestReduction(research.done);
  const garrisonIn = (regionId: number): number =>
    state.armies
      .filter((a) => a.regionId === regionId && a.ownerId === nationId)
      .reduce((sum, a) => sum + armySize(a.units), 0);
  regions = regions.map((r) =>
    r.ownerId === nationId
      ? {
          ...r,
          population: nextPopulation(r, famine),
          unrest: nextUnrest(r, nation.taxRate, famine, ownedCount, techCalm, garrisonIn(r.id)),
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
    n.id === nationId
      ? { ...n, stocks, research, wonders: n.wonders + wondersBuilt, famine, bankrupt, modifiers: tickModifiers(n.modifiers) }
      : n,
  );

  let log = state.log;
  if (nation.isPlayer) {
    const notes: string[] = [];
    for (const c of built.completed) notes.push(`${BUILDINGS[c.building].name} built in ${c.regionName}`);
    if (step.completed) notes.push(`researched ${TECHS[step.completed].name}`);
    if (famine) notes.push("⚠ famine — population starving");
    if (bankrupt) notes.push("⚠ bankruptcy — troops disbanded, unrest spikes");
    const entry =
      `Turn ${state.turn} — +${flow.gold}g (−${upkeep} upkeep) +${flow.materials}m ` +
      `+${flow.knowledge}k, food ${fmtSigned(flow.food)}. Treasury ${stocks.gold}g.` +
      (notes.length ? ` ${notes.join("; ")}.` : "");
    log = [...state.log, entry].slice(-50);
  } else if (step.completed) {
    log = [...state.log, `${nation.name} researched ${TECHS[step.completed].name}.`].slice(-50);
  }

  return { ...state, nations, regions, armies, log };
}

/**
 * Trade income: each active trade route pays *both* partners gold this turn
 * (economic diplomacy — peace is profitable, and a war that severs a route costs
 * you the income). Pure; logs the player's total.
 */
export function applyTradeIncome(state: GameState): GameState {
  if (!state.trades || Object.keys(state.trades).length === 0) return state;
  const gain = new Map<number, number>();
  for (const n of state.nations) {
    if (n.isBarbarian || !n.alive) continue;
    let total = 0;
    for (const partner of tradePartners(state, n.id)) total += tradeIncome(state, n.id, partner);
    if (total > 0) gain.set(n.id, round1(total));
  }
  if (gain.size === 0) return state;
  const nations = state.nations.map((n) => {
    const g = gain.get(n.id);
    return g ? { ...n, stocks: { ...n.stocks, gold: round1(n.stocks.gold + g) } } : n;
  });
  const playerGain = gain.get(PLAYER_ID);
  const log = playerGain
    ? [...state.log, `Trade routes earned +${playerGain}g.`].slice(-50)
    : state.log;
  return { ...state, nations, log };
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

  // 1.5. Secession: regions held in prolonged, ungarrisoned revolt break away —
  // a territorial brake on overexpansion. Runs before the AI so rivals can react
  // (e.g. move to reconquer a region that just seceded).
  s = applySecession(s);

  // 1.6. Trade income: active trade routes pay both partners (economic diplomacy).
  s = applyTradeIncome(s);

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

  // 3.5. War-weariness: a nation at war carries a lingering −gold modifier,
  // refreshed each turn the war continues (the cost of a long conflict).
  s = applyWarWeariness(s);

  // 4. Bounded random events (low probability, low variance).
  s = fireEvents(s, rng);

  // 5. Refresh army moves for the coming turn.
  s = { ...s, armies: s.armies.map((a) => ({ ...a, movesLeft: armyMoves(a.units) })) };

  // 6. Outcome: elimination, then domination / great works / turn-limit score.
  s = updateOutcome(s);

  // 7. Sample every nation's prestige score for the end-game graph.
  s = { ...s, scoreHistory: appendScores(s) };

  return s;
}

/** Fire at most one event per living nation, at low probability. */
function fireEvents(state: GameState, rng: Rng): GameState {
  let s = state;
  for (const nation of s.nations) {
    if (nation.isBarbarian || !nation.alive) continue;
    // Rivals see events a bit less often (keeps the log player-focused).
    const chance = nation.isPlayer ? EVENT_CHANCE : EVENT_CHANCE * 0.6;
    if (rng.next() < chance) s = fireEvent(s, nation.id, rng);
  }
  return s;
}

/** Mark eliminated nations, then apply the victory/defeat conditions. */
function updateOutcome(state: GameState): GameState {
  const nations = state.nations.map((n) => {
    if (n.isBarbarian) return n;
    const holds = state.regions.some((r) => r.ownerId === n.id);
    return holds === n.alive ? n : { ...n, alive: holds };
  });

  const newlyDead = nations.filter((n, i) => state.nations[i]!.alive && !n.alive && !n.isBarbarian);
  let log = state.log;
  for (const n of newlyDead) log = [...log, `${n.name} has been eliminated.`].slice(-50);

  let withNations: GameState = { ...state, nations, log };

  // Elimination outcomes.
  const player = nations[PLAYER_ID]!;
  const livingRivals = nations.filter((n) => !n.isBarbarian && !n.isPlayer && n.alive);
  const hadRivals = state.nations.some((n) => !n.isBarbarian && !n.isPlayer);
  if (!player.alive) {
    return { ...withNations, outcome: "defeat", victoryKind: "elimination" };
  }
  if (hadRivals && livingRivals.length === 0) {
    return { ...withNations, outcome: "victory", victoryKind: "conquest" };
  }

  // Domination / great works / turn-limit prestige.
  const verdict = checkVictory(withNations);
  if (verdict) {
    return { ...withNations, outcome: verdict.outcome, victoryKind: verdict.kind };
  }
  return withNations;
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
