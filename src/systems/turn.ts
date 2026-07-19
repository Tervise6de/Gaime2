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

import { BUILDINGS, buildingFocusOk, buildingResourceOk, type BuildingId } from "@/data/buildings";
import { UNITS, type UnitType } from "@/data/units";
import { ARCHETYPES, personalityByArchetype } from "@/data/personalities";
import { TRAIT_IDS, type TraitId } from "@/data/traits";
import { factionByName, type FactionBonus } from "@/data/factions";
import type { FocusId } from "@/data/focuses";
import { eraIndexForTurn } from "@/data/eras";
import { TECHS, type TechId } from "@/data/techs";
import { generateMap, type MapGenOptions } from "@/systems/mapgen";
import { scriptedMap } from "@/data/maps/types";
import type { ScriptedMap } from "@/data/maps/types";
import { KONTORE } from "@/data/kontore";
import { SOUND } from "@/data/sound";
import type { StrategicResource } from "@/data/terrain";
import { nationalProduction, round1 } from "@/systems/economy";
import { advanceConstruction } from "@/systems/construction";
import { stepTrade, seedKontore } from "@/systems/trade";
import { stepLeague } from "@/systems/league";
import { scheduleEpochs, stepEpochs } from "@/systems/epochs";
import { nextPopulation } from "@/systems/population";
import { nextUnrest } from "@/systems/stability";
import { advanceMarches, applyCommanderEffects, applyDefection, armyMoves, tickEntrenchment, totalUpkeep } from "@/systems/military";
import { commanderTitle, generateCommander } from "@/data/commanders";
import { generateRuler } from "@/data/rulers";
import { recordChronicle, chronicleName } from "@/systems/chronicle";
import { driftRelations, decayOpinions, atWar } from "@/systems/diplomacy";
import { runNationTurn } from "@/systems/ai";
import { advanceResearch, dequeueResearch, techUnrestReduction, isBuildingUnlockedFor, selectTech, queueResearch as queueResearchTech, clearQueue } from "@/systems/tech";
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
  GAME_LENGTH_TURNS,
  GRANARY_CAP,
  PLAYER_ID,
  UNREST_MAX,
  clampTax,
  emptyResearch,
  emptyUnits,
  type Army,
  type Difficulty,
  type GameLength,
  type GameState,
  type Nation,
  type NationModifier,
  type Region,
  type ResourceStocks,
} from "@/systems/state";

const BARBARIAN_NATION: Nation = {
  id: BARBARIAN_ID,
  name: "Free Towns",
  color: "#9a5b53",
  isPlayer: false,
  isBarbarian: true,
  alive: true,
  stocks: zeroStocks(),
  taxRate: 0,
  research: emptyResearch(),
  famine: false,
  bankrupt: false,
};

const STARTING_STOCKS: ResourceStocks = { gold: 60, food: 20, materials: 15, knowledge: 0 };

export interface NewGameOptions {
  seed: number;
  /** Deprecated: the game is Hansa-only; retained so old callers do not break. */
  map?: MapGenOptions;
  taxRate?: number;
  /** Deprecated: the Hansa board seats its full authored faction roster. */
  rivals?: number;
  difficulty?: Difficulty;
  /** Deprecated setup hook: force the player's opening trait (else drawn from the pool). */
  playerTrait?: TraitId;
  /** Authored real-geography map id. Defaults to the Hanseatic World. */
  mapId?: string;
  /** On a scripted map, the faction name the human plays (else picked from seed). */
  playerFaction?: string;
  /** Session length (Short/Standard/Long/Endless); default "standard". Sets `turnLimit`. */
  gameLength?: GameLength;
}

/**
 * The prestige-tiebreak turn limit a Game-length option maps to: a finite turn
 * count for short/standard/long, or `null` for "endless" (no score-limit).
 * Default (undefined) is "standard" → TURN_LIMIT (220).
 */
function turnLimitFor(gameLength: GameLength | undefined): number | null {
  return gameLength === "endless" ? null : GAME_LENGTH_TURNS[gameLength ?? "standard"];
}

/** Add a faction's opening extra regiments to a starting unit stack. */
function addStartUnits(base: Record<UnitType, number>, bonus: FactionBonus | undefined): Record<UnitType, number> {
  if (!bonus?.startUnits) return base;
  const out = { ...base };
  for (const t of Object.keys(bonus.startUnits) as UnitType[]) out[t] += bonus.startUnits[t] ?? 0;
  return out;
}

/** Build a fresh Hansa game from a seed. Pure: same seed -> identical starting state. */
export function createGame(options: NewGameOptions): GameState {
  const mapId = "hansa";
  const { regions } = generateMap(options.seed, mapId);
  const smap = scriptedMap(mapId);
  if (!smap || smap.factions.length === 0) throw new Error("Hansa map data is missing");
  return createScriptedGame(smap, regions, { ...options, mapId });
}
/**
 * Start a game on a scripted map: every historical realm is seated on its own
 * home ground (no random capitals). The human plays the chosen faction (or one
 * picked from the seed), rendered in the player gold; the rest are AI. Regions
 * not owned by any faction fall to the Free Towns.
 */
function createScriptedGame(map: ScriptedMap, regions: Region[], options: NewGameOptions): GameState {
  const rng = createRng((options.seed ^ 0x9e3779b9) >>> 0);

  // Which faction the human plays: the named one if valid, else seed-picked.
  const named = map.factions.findIndex((f) => f.name === options.playerFaction);
  const playerIdx = named >= 0 ? named : options.seed % map.factions.length;

  // Nation 0 = player, 1 = Free Towns, 2.. = the other realms (author order).
  const nations: Nation[] = [
    {
      id: PLAYER_ID,
      name: map.factions[playerIdx]!.name,
      color: "#d8a24a", // player gold — "mine" reads at a glance regardless of realm
      isPlayer: true,
      isBarbarian: false,
      alive: true,
      stocks: { ...STARTING_STOCKS },
      taxRate: clampTax(options.taxRate ?? DEFAULT_TAX),
      research: emptyResearch(),
      famine: false,
      bankrupt: false,
    },
    { ...BARBARIAN_NATION, stocks: zeroStocks(), research: emptyResearch() },
  ];
  const personalities = shuffled(ARCHETYPES, rng);
  const factionToNation = new Map<number, number>([[playerIdx, PLAYER_ID]]);
  let nextId = 2;
  map.factions.forEach((f, fi) => {
    if (fi === playerIdx) return;
    factionToNation.set(fi, nextId);
    nations.push({
      id: nextId,
      name: f.name,
      color: f.color,
      isPlayer: false,
      isBarbarian: false,
      alive: true,
      stocks: { ...STARTING_STOCKS },
      taxRate: DEFAULT_TAX,
      // Seat the realm's signature disposition (looked up by name), else round-robin.
      personality: factionByName(f.name)?.disposition
        ? personalityByArchetype(factionByName(f.name)!.disposition!)
        : personalities[(nextId - 2) % personalities.length],
      research: emptyResearch(),
      famine: false,
      bankrupt: false,
    });
    nextId += 1;
  });

  // Give every realm a named ruler (E1), flavoured by its AI disposition.
  for (const n of nations) {
    if (!n.isBarbarian) n.ruler = generateRuler(rng, n.personality?.archetype);
  }

  // Ownership + capitals + a starting army per realm.
  const ownerOf = new Map<number, number>();
  const capitalSet = new Set<number>();
  const capitalFocus = new Map<number, FocusId | undefined>();
  const armies: Army[] = [];
  let nextArmyId = 0;
  map.factions.forEach((f, fi) => {
    const nationId = factionToNation.get(fi)!;
    nations[nationId]!.capitalRegionId = f.capital;
    capitalSet.add(f.capital);
    capitalFocus.set(f.capital, factionByName(f.name)?.homeFocus);
    for (const rid of f.regions) ownerOf.set(rid, nationId);
    const startUnits = addStartUnits({ ...emptyUnits(), militia: 2, infantry: 1 }, factionByName(f.name)?.bonus);
    armies.push({ id: nextArmyId++, ownerId: nationId, regionId: f.capital, units: startUnits, movesLeft: armyMoves(startUnits) });
  });

  // Town-size hierarchy (docs/hansa-alignment-plan.md, Plan 2): historic hubs
  // out-scale hinterland so a Kontor city dwarfs a backwater — a Kontor host is a
  // great emporium, a realm's capital a leading town, then coast > plains > forest
  // > mountains. Sets a per-region `baseCapacity` and a proportional starting
  // population (hubs start populous, backwaters sparse). Only for maps that opt in
  // (the Hansa board); other maps keep the flat terrain cap + mapgen population.
  const kontorHosts = new Set(Object.values(KONTORE).map((k) => k.regionId));
  const sizedTowns = map.id === "hansa";
  const townSizing = (r: Region, isCapital: boolean): Partial<Region> => {
    if (!sizedTowns) return {};
    const size = kontorHosts.has(r.id)
      ? 18
      : isCapital
        ? 13
        : r.terrain === "coast"
          ? 8
          : r.terrain === "plains"
            ? 6
            : r.terrain === "mountains"
              ? 3
              : 5; // forest / hills
    const population = Math.max(2, Math.round(size * 0.45) + rng.int(-1, 1));
    return { baseCapacity: size, population };
  };

  // Strategic resources on the Hansa board (docs/hansa-alignment-plan.md, Plan 3):
  // iron in the Swedish/Silesian ore country, horses on the breeding plains, and
  // the two signature *trade* strategics — salt (Lüneburg's Brunswick, Wieliczka's
  // Kraków) and amber (the Samland shore at Königsberg, and Curonian Kurland).
  // Activates the resource layer that the scripted Hansa map otherwise leaves bare.
  const HANSA_RESOURCES: Record<number, StrategicResource> = {
    34: "iron", 72: "iron", // Bergslagen, Silesia
    25: "horses", 70: "horses", // Jutland, Masovia
    15: "salt", 71: "salt", // Brunswick (Lüneburg), Kraków (Wieliczka)
    68: "amber", 52: "amber", // Königsberg (Samland), Kurland
  };
  const resourceFor = (r: Region): StrategicResource | null =>
    sizedTowns ? HANSA_RESOURCES[r.id] ?? null : r.resource;

  // Lay out regions: owned (fort + home focus on capitals) or Free-Tribe held.
  const laidOut: Region[] = regions.map((r) => {
    const owner = ownerOf.get(r.id);
    if (owner !== undefined) {
      const isCapital = capitalSet.has(r.id);
      return { ...r, ownerId: owner, resource: resourceFor(r), fortification: isCapital ? 1 : 0, focus: isCapital ? capitalFocus.get(r.id) : undefined, ...townSizing(r, isCapital) };
    }
    const fort = rng.int(0, 2);
    const garrison = { ...emptyUnits(), militia: rng.int(1, 2) };
    if (rng.next() < 0.35) garrison.infantry = 1;
    armies.push({ id: nextArmyId++, ownerId: BARBARIAN_ID, regionId: r.id, units: garrison, movesLeft: 0 });
    return { ...r, ownerId: BARBARIAN_ID, resource: resourceFor(r), fortification: fort, ...townSizing(r, false) };
  });

  // National traits come from each realm's faction (a scenario may pin the
  // player's); a realm not in the roster falls back to a seeded draw.
  const traitPool = shuffled(TRAIT_IDS, rng);
  let traitIdx = 0;
  for (const n of nations) {
    if (n.isBarbarian) continue;
    const def = factionByName(n.name);
    n.trait =
      n.isPlayer && options.playerTrait
        ? options.playerTrait
        : def?.trait ?? traitPool[traitIdx++ % traitPool.length];
    // Opening bonus: gold + free tech (extra regiments added to the army above).
    const bonus = def?.bonus;
    if (bonus?.startGold) n.stocks = { ...n.stocks, gold: n.stocks.gold + bonus.startGold };
    if (bonus?.startTech && !n.research.done.includes(bonus.startTech)) {
      n.research = { ...n.research, done: [...n.research.done, bonus.startTech] };
    }
  }

  const playerName = nations[PLAYER_ID]!.name;
  const rivalCount = map.factions.length - 1;
  const game: GameState = {
    seed: options.seed,
    mapId: options.mapId,
    rngState: rng.seed,
    turn: 1,
    nations,
    regions: laidOut,
    armies,
    nextArmyId,
    routes: [],
    nextRouteId: 0,
    relations: {},
    treaties: {},
    offers: [],
    nextOfferId: 0,
    difficulty: options.difficulty ?? "normal",
    turnLimit: turnLimitFor(options.gameLength),
    outcome: "playing",
    log: [
      `Turn 1 — you rule ${playerName} on the ${map.name} map; ` +
        `${rivalCount} rival power${rivalCount === 1 ? "" : "s"} share the land (seed ${options.seed}).`,
    ],
    scoreHistory: {},
  };
  game.scoreHistory = appendScores(game);
  // Open the four Kontore (holder = host region's owner).
  game.kontore = seedKontore(game);
  // The Øresund Sound toll — the strait-holder's chokepoint on Baltic→western
  // trade (data/sound.ts). Hansa board only; other maps carry no Sound.
  if (map.id === "hansa") {
    game.sound = { regionId: SOUND.regionId, tollRate: SOUND.defaultRate, embargoes: [] };
  }
  // Roll the historical timeline (plague, monopolies, a lost Kontor…) from a
  // dedicated, salted RNG so scheduling never perturbs the game's own stream.
  game.epochs = scheduleEpochs(createRng((options.seed ^ 0x2545f491) >>> 0));
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
    // Remember who lost it, so the former ruler gets a reclaim casus belli and
    // the AI prioritises retaking its own breakaway land (E5 loop).
    return { ...r, ownerId: BARBARIAN_ID, priorOwnerId: owner, unrest: UNREST_BASE, construction: null, revoltTurns: 0 };
  });
  if (secededIds.length === 0) return { ...state, regions };

  // A revolt throws up a named pretender to lead the rebels (E5) — deterministic
  // from the state RNG, so the same game always raises the same figurehead.
  const rng = createRng(state.rngState);
  let armies = state.armies;
  let nextArmyId = state.nextArmyId;
  let log = state.log;
  const chronicled: { id: number; pretender: string; former: number | null }[] = [];
  for (const id of secededIds) {
    const pretender = generateCommander(rng);
    armies = [
      ...armies,
      { id: nextArmyId, ownerId: BARBARIAN_ID, regionId: id, units: { ...emptyUnits(), militia: REBEL_GARRISON }, movesLeft: 0, commander: pretender },
    ];
    nextArmyId += 1;
    const formerId = state.regions[id]!.ownerId;
    const former = state.nations.find((n) => n.id === formerId);
    log = [
      ...log,
      `${state.regions[id]!.name} rises in revolt under ${commanderTitle(pretender)}, seceding from ${former?.isPlayer ? "your realm" : (former?.name ?? "its ruler")}.`,
    ].slice(-50);
    chronicled.push({ id, pretender: commanderTitle(pretender), former: formerId });
  }
  let next: GameState = { ...state, regions, armies, nextArmyId, log, rngState: rng.seed };
  for (const c of chronicled) {
    next = recordChronicle(
      next,
      "revolt",
      `${next.regions[c.id]!.name} rose in revolt under ${c.pretender}, breaking away from ${chronicleName(next, c.former)}.`,
    );
  }
  return next;
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
  if (!buildingResourceOk(region.resource, building)) return false;
  if (!buildingFocusOk(region.focus, building)) return false;
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
  if (!buildingResourceOk(region.resource, building)) return state;
  if (!buildingFocusOk(region.focus, building)) return state;
  const owner = state.nations.find((n) => n.id === ownerId);
  if (!owner || !isBuildingUnlockedFor(owner.research.done, building)) return state;
  const regions = state.regions.map((r) =>
    r.id === regionId ? { ...r, construction: { building, progress: 0 } } : r,
  );
  return { ...state, regions };
}

/**
 * Whether `building` may be *added* to a region's plan (owned, unlocked, right
 * terrain/focus, not already built, not the current job, not already queued).
 * The gate shared by `enqueueBuilding` and the build-queue UI. Pure.
 */
export function canEnqueueBuilding(
  region: Region,
  building: BuildingId,
  done: TechId[] = [],
): boolean {
  if (region.buildings.includes(building)) return false;
  if (region.construction?.building === building) return false;
  if ((region.buildQueue ?? []).includes(building)) return false;
  if (!isBuildingUnlockedFor(done, building)) return false;
  const terrain = BUILDINGS[building].requiresTerrain;
  if (terrain && region.terrain !== terrain) return false;
  if (!buildingResourceOk(region.resource, building)) return false;
  return buildingFocusOk(region.focus, building);
}

/**
 * Enqueue a building for a region: start it now if the slot is idle, else append
 * it to the region's build queue. The player QoL entry point (one click plans a
 * whole build order). Pure; no-op on an invalid add.
 */
export function enqueueBuilding(
  state: GameState,
  regionId: number,
  building: BuildingId,
  ownerId = PLAYER_ID,
): GameState {
  const region = state.regions[regionId];
  if (!region || region.ownerId !== ownerId) return state;
  const owner = state.nations.find((n) => n.id === ownerId);
  if (!owner || !canEnqueueBuilding(region, building, owner.research.done)) return state;
  if (!region.construction) return queueBuilding(state, regionId, building, ownerId);
  const regions = state.regions.map((r) =>
    r.id === regionId ? { ...r, buildQueue: [...(r.buildQueue ?? []), building] } : r,
  );
  return { ...state, regions };
}

/** Remove the queued building at `index` from a region's build queue. Pure. */
export function removeQueuedBuilding(
  state: GameState,
  regionId: number,
  index: number,
  ownerId = PLAYER_ID,
): GameState {
  const region = state.regions[regionId];
  if (!region || region.ownerId !== ownerId || !region.buildQueue?.length) return state;
  const buildQueue = region.buildQueue.filter((_, i) => i !== index);
  const regions = state.regions.map((r) =>
    r.id === regionId ? { ...r, buildQueue: buildQueue.length ? buildQueue : undefined } : r,
  );
  return { ...state, regions };
}

/** Empty a region's build queue (leaves the current construction running). Pure. */
export function clearBuildQueue(state: GameState, regionId: number, ownerId = PLAYER_ID): GameState {
  const region = state.regions[regionId];
  if (!region || region.ownerId !== ownerId || !region.buildQueue?.length) return state;
  const regions = state.regions.map((r) => (r.id === regionId ? { ...r, buildQueue: undefined } : r));
  return { ...state, regions };
}

/**
 * For each of `nationId`'s regions whose construction slot is idle but has a
 * queue, start the next still-valid entry (dropping any that became invalid —
 * already built, tech/terrain/focus no longer met). Pure; called each turn after
 * construction advances so a completed build flows straight into the next.
 */
export function startQueuedBuildings(regions: Region[], nationId: number, done: TechId[]): Region[] {
  return regions.map((region) => {
    if (region.ownerId !== nationId || region.construction || !region.buildQueue?.length) return region;
    const queue = [...region.buildQueue];
    while (queue.length) {
      const next = queue.shift()!;
      if (canEnqueueBuilding({ ...region, buildQueue: undefined }, next, done)) {
        return { ...region, construction: { building: next, progress: 0 }, buildQueue: queue.length ? queue : undefined };
      }
    }
    return { ...region, buildQueue: undefined };
  });
}

/** Select the player's (or a nation's) current research. Age-gated. Pure. */
export function chooseResearch(state: GameState, tech: TechId, nationId = PLAYER_ID): GameState {
  const era = eraIndexForTurn(state.turn);
  const nations = state.nations.map((n) =>
    n.id === nationId ? { ...n, research: selectTech(n.research, tech, era) } : n,
  );
  return { ...state, nations };
}

/** Append a tech to a nation's research queue (auto-starts after the current). Pure. */
export function queueResearch(state: GameState, tech: TechId, nationId = PLAYER_ID): GameState {
  const nations = state.nations.map((n) =>
    n.id === nationId ? { ...n, research: queueResearchTech(n.research, tech) } : n,
  );
  return { ...state, nations };
}

/** Clear a nation's research queue. Pure. */
export function clearResearchQueue(state: GameState, nationId = PLAYER_ID): GameState {
  const nations = state.nations.map((n) => (n.id === nationId ? { ...n, research: clearQueue(n.research) } : n));
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
 * Assign (or clear) a region's specialisation focus. Owner-gated — you can only
 * re-purpose a region you hold. Takes effect immediately (no build time); the
 * one-focus-per-region limit is the whole trade-off. Pure.
 */
export function setRegionFocus(
  state: GameState,
  regionId: number,
  focus: FocusId,
  ownerId = PLAYER_ID,
): GameState {
  const region = state.regions[regionId];
  if (!region || region.ownerId !== ownerId) return state;
  const next: FocusId | undefined = focus === "balanced" ? undefined : focus;
  if (region.focus === next) return state;
  const regions = state.regions.map((r) => (r.id === regionId ? { ...r, focus: next } : r));
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

  // Research: knowledge produced funds the current tech; on completion the next
  // queued tech (still valid + age-appropriate) auto-starts.
  const step = advanceResearch(nation.research, flow.knowledge);
  const research = dequeueResearch(step.research, eraIndexForTurn(state.turn));

  const stocks: ResourceStocks = {
    gold: round1(nation.stocks.gold + flow.gold * econMult - upkeep),
    food: nation.stocks.food,
    materials: round1(nation.stocks.materials + flow.materials * econMult),
    knowledge: round1(research.progress), // display: invested in current tech
  };

  // Construction (this nation's regions only).
  const built = advanceConstruction(state.regions, stocks.materials, nationId);
  stocks.materials = round1(stocks.materials - built.materialsSpent);
  // A completed build pulls the next still-valid entry off the region's queue.
  let regions = startQueuedBuildings(built.regions, nationId, research.done);

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
      ? { ...n, stocks, research, famine, bankrupt, modifiers: tickModifiers(n.modifiers) }
      : n,
  );

  let log = state.log;
  if (nation.isPlayer) {
    const notes: string[] = [];
    for (const c of built.completed) notes.push(`${BUILDINGS[c.building].name} built in ${c.regionName}`);
    if (step.completed) notes.push(`researched ${TECHS[step.completed].name}`);
    if (famine) notes.push("Famine — population starving");
    if (bankrupt) notes.push("Bankruptcy — troops disbanded, unrest spikes");
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

/** Advance the game by one turn. Pure: returns a new GameState, input untouched. */
export function resolveTurn(state: GameState): GameState {
  if (state.outcome !== "playing") return state;

  // Fresh turn: clear last turn's battle reports and epoch notices (shown already).
  let s: GameState = { ...state, turn: state.turn + 1, battles: [], firedEpochs: [] };

  // 1. Economy for each living non-barbarian nation.
  for (const nation of s.nations) {
    if (nation.isBarbarian || !nation.alive) continue;
    s = advanceNationEconomy(s, nation.id);
  }

  // 1.45. Commanders (M4/E5): loyalty drifts with each province's mood and a
  // disloyal officer foments unrest; then any disloyal commander garrisoning a
  // region already in open revolt turns his coat and seizes it as a named
  // pretender — the slow fuse of a neglected province.
  s = applyCommanderEffects(s);
  s = applyDefection(s);

  // 1.5. Secession: regions held in prolonged, ungarrisoned revolt break away —
  // a territorial brake on overexpansion. Runs before the AI so rivals can react
  // (e.g. move to reconquer a region that just seceded).
  s = applySecession(s);

  // 1.6. Hansa goods trade: standing routes carry goods to the Kontore, turning
  // goods into gold without touching the four-resource economy.
  s = stepTrade(s);

  // 1.66. The Hanseatic League: pay members their Kontor dividend and let the
  // League's enmity cool relations with anyone warring a member (systems/league.ts).
  s = stepLeague(s);

  // 1.7. March orders: armies travelling under a standing order advance a step
  // toward their destination (fighting whatever they meet), BEFORE the rivals
  // move, so the AI reacts to where your forces actually end up this turn.
  s = advanceMarches(s);

  // 2. Rival AI turns (deterministic RNG stream).
  const rng: Rng = createRng(s.rngState);
  for (const nation of s.nations) {
    if (nation.isBarbarian || nation.isPlayer || !nation.alive) continue;
    if (!s.nations.find((n) => n.id === nation.id)?.alive) continue;
    s = runNationTurn(s, nation.id, rng);
  }
  s = { ...s, rngState: rng.seed };

  // 3. Relations drift; the opinion log fades in step (grudges cool off).
  s = driftRelations(s);
  s = decayOpinions(s);

  // 3.5. War-weariness: a nation at war carries a lingering −gold modifier,
  // refreshed each turn the war continues (the cost of a long conflict).
  s = applyWarWeariness(s);

  // 4. Bounded random events (low probability, low variance).
  s = fireEvents(s, rng);

  // 4.5. Epoch events: the scheduled historical beats (plague, the herring
  // monopoly, pirates, a great fire, the Novgorod Peterhof's fall) fire when
  // their rolled turn arrives — dated history, not a per-turn coin-flip.
  s = stepEpochs(s, rng);

  // 5. Refresh army moves for the coming turn, and deepen entrenchment for
  //    every army still dug in (M3).
  s = {
    ...s,
    armies: tickEntrenchment(s.armies).map((a) => ({ ...a, movesLeft: armyMoves(a.units) })),
  };

  // 6. Outcome: elimination, then domination / turn score.
  s = updateOutcome(s);

  // 7. Sample every nation's prestige score for the end-game graph.
  s = { ...s, scoreHistory: appendScores(s) };

  return s;
}

/** One-line chronicle close for a decided game, by outcome + victory kind. */
function victoryChronicle(outcome: string, kind: string): string {
  const won = outcome === "victory";
  const how =
    kind === "domination" ? "by dominion over the land"
    : "on the ledger of prestige when the age closed";
  return won
    ? `Your realm was judged the greatest power ${how}. The chronicle is complete.`
    : `Another power was judged greatest ${how}; your realm's tale ends unfinished.`;
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
  // Chronicle beat (E2): the fall of a realm.
  for (const n of newlyDead) {
    withNations = recordChronicle(withNations, "fall", `${chronicleName(withNations, n.id)} was extinguished — its lands lost.`);
  }

  // Elimination outcomes.
  const player = nations[PLAYER_ID]!;
  const livingRivals = nations.filter((n) => !n.isBarbarian && !n.isPlayer && n.alive);
  const hadRivals = state.nations.some((n) => !n.isBarbarian && !n.isPlayer);
  if (!player.alive) {
    return recordChronicle({ ...withNations, outcome: "defeat", victoryKind: "elimination" }, "victory", "Your realm fell. The chronicle ends here.");
  }
  if (hadRivals && livingRivals.length === 0) {
    return recordChronicle({ ...withNations, outcome: "victory", victoryKind: "conquest" }, "victory", "Your realm stood alone, all rivals cast down — a conquest for the ages.");
  }

  // Domination / turn-limit prestige.
  const verdict = checkVictory(withNations);
  if (verdict) {
    const ended = { ...withNations, outcome: verdict.outcome, victoryKind: verdict.kind };
    return recordChronicle(ended, "victory", victoryChronicle(verdict.outcome, verdict.kind));
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
