/**
 * Rival AI — rule-based utility scoring with personality archetypes
 * (docs/game-design.md §5).
 *
 * HARD CONSTRAINT: this is plain TypeScript that runs entirely in the browser.
 * It makes no LLM/API calls, needs no key, and consumes no credits — playing is
 * free and offline. Claude is used only at development time to write these rules.
 *
 * Each rival runs the same framework under the same scarcity as the player:
 * assess the situation into scalars, score candidate actions weighted by its
 * personality, and commit the affordable ones. It *feels* reactive because it
 * responds to real state — attacking weakness, hesitating against strength,
 * cooling toward armies on its border — not because of scripts.
 *
 * Pure over `GameState`; all randomness comes from the passed-in Rng.
 */

import { UNITS, UNIT_TYPES, type UnitType } from "@/data/units";
import { SEA_ZONE_IDS, SEA_ZONES, type SeaZoneId } from "@/data/sea";
import { BUILDINGS, buildingFocusOk, buildingResourceOk, focusCapstone, type BuildingId } from "@/data/buildings";
import type { TraitId } from "@/data/traits";
import { TERRAIN, type StrategicResource, type TerrainId } from "@/data/terrain";
import type { FocusId } from "@/data/focuses";
import { previewCombat, sideStrength, type UnitCounts } from "@/systems/combat";
import { publicIntelUnits, publicNationPower } from "@/systems/intel";
import { strategyProfile } from "@/systems/strategy";
import { planCampaign, onCampaignRoad, warOpensRoad, type Campaign } from "@/systems/campaign";
import {
  appointCommander,
  canRaiseUnit,
  fortifyArmy,
  moveArmy,
  armyIsAtSea,
  armyIsFleet,
  armyHasLandUnits,
  landAssaultForce,
  reachableSeaZones,
  sailToSeaZone,
  raiseUnit,
  regionDefense,
  strategicAccess,
  unitCost,
} from "@/systems/military";
import {
  addOffer,
  atWar,
  callToArms,
  declareWar,
  getRelation,
  getTreaty,
  gift,
  makePeace,
  nationPower,
  peaceReparations,
  setPact,
  sharedBorders,
  wouldBreakTreaty,
  wouldJoinWar,
  underTruce,
} from "@/systems/diplomacy";
import { researchFrontier, selectTech, isBuildingUnlockedFor, nextNodeInPath, isPathRejected } from "@/systems/tech";
import { createRoute, distanceFactor, distanceMapToKontor, regionSources } from "@/systems/trade";
import { buyWare, sellWare, marketBuyPrice } from "@/systems/market";
import { luxuryAppetite, resolveContentment } from "@/systems/prosperity";
import { foundLeague, joinLeague, canFoundLeague, canJoinLeague, kontoreHeldBy, hasHanseHall } from "@/systems/league";
import { GOODS, GOOD_IDS, contentmentWares, type GoodId } from "@/data/goods";
import { KONTOR_IDS, KONTORE, type KontorId } from "@/data/kontore";
import { eraIndexForTurn } from "@/data/eras";
import { TECHS, type TechId, type ResearchCategory } from "@/data/techs";
import type { Rng } from "@/systems/rng";
import {
  LOG_CAP,
  BARBARIAN_ID,
  DIFFICULTY,
  FORT_PER_LEVEL,
  FRIENDLY_THRESHOLD,
  MAX_ROUTES_PER_NATION,
  PLAYER_ID,
  UNREST_REVOLT,
  SECESSION_REVOLT_TURNS,
  nationInstability,
  armySize,
  clampTax,
  landNeighbours,
  emptyUnits,
  type Army,
  type GameState,
  type Nation,
  type Region,
} from "@/systems/state";

/** Turns rivals leave the player alone at the start (scales with difficulty). */
function earlyPeaceTurns(state: GameState): number {
  return DIFFICULTY[state.difficulty].earlyPeace;
}

/** Run a rival nation's full turn. */
export function runNationTurn(state: GameState, nationId: number, rng: Rng): GameState {
  let s = state;
  s = manageEconomy(s, nationId);
  s = manageTrade(s, nationId);
  s = manageLeague(s, nationId);
  s = doDiplomacy(s, nationId, rng);
  s = doMilitary(s, nationId, rng);
  return s;
}

/** A realm with the trade to want the League's leadership — routes or a Kontor. */
function wantsLeagueSeat(state: GameState, nationId: number): boolean {
  // A realm playing for the network wants the seat before it has the trade to
  // justify it — the seat is a fifth of Hansa control on its own.
  if (strategyProfile(state.nations.find((n) => n.id === nationId)).seeksLeague) return true;
  return (state.routes ?? []).some((r) => r.ownerId === nationId) || kontoreHeldBy(state, nationId) >= 1;
}

/**
 * The Hanseatic League decision. If none exists: found it when ready (a Hanse Hall
 * is built), else a trading power works toward it — raising a Hanse Hall in its
 * capital once it holds the Lübeck Law charter (the research nudge lives in
 * manageEconomy). If one exists: a trader outside it joins for the Kontor privileges
 * (only at peace with every member). Warlike, trade-poor realms stay out. Hansa
 * board only. Pure.
 */
function manageLeague(state: GameState, nationId: number): GameState {
  if (nationId === BARBARIAN_ID || state.mapId !== "hansa") return state;
  const nation = state.nations.find((n) => n.id === nationId);
  if (!nation) return state;

  if (!state.league) {
    if (canFoundLeague(state, nationId)) return foundLeague(state, nationId);
    // Hold the charter but no seat yet → raise a Hanse Hall (in the capital if free).
    if (nation.research.done.includes("lubeck_law") && wantsLeagueSeat(state, nationId) && !hasHanseHall(state, nationId)) {
      const building = state.regions.some((r) => r.ownerId === nationId && r.construction?.building === "hanse_hall");
      if (!building) {
        const seat =
          state.regions.find((r) => r.ownerId === nationId && r.id === nation.capitalRegionId && !r.construction) ??
          state.regions.find((r) => r.ownerId === nationId && !r.construction);
        if (seat) return queueFor(state, seat.id, "hanse_hall", nationId);
      }
    }
    return state;
  }
  if (!state.league.members.includes(nationId) && canJoinLeague(state, nationId) && wantsLeagueSeat(state, nationId)) {
    return joinLeague(state, nationId);
  }
  return state;
}

/**
 * Open the merchant routes a rival can profitably run: for each owned region that
 * sources a good, the best reachable Kontor that demands it, filled to the
 * per-nation cap, richest lane first. `createRoute` is the real guard (ownership,
 * demand, a lane, no trading into a foe, the cap); this only proposes good
 * candidates and skips routes already open, so it is a stable no-op once a realm's
 * book is full. Pure and deterministic — no RNG, tie-broken by ids. Barbarians
 * (and realms already at the cap) do nothing.
 */
function manageTrade(state: GameState, nationId: number): GameState {
  const nation = state.nations.find((n) => n.id === nationId);
  if (nationId === BARBARIAN_ID) return state;
  let s = state;
  const mine = () => (s.routes ?? []).filter((r) => r.ownerId === nationId);
  // A realm playing for the network fills its book; a conqueror runs a few
  // routes to pay for the army and no more.
  const routeTarget = Math.max(
    1,
    Math.min(
      MAX_ROUTES_PER_NATION,
      Math.round(MAX_ROUTES_PER_NATION * strategyProfile(nation).routes),
    ),
  );
  if (mine().length >= routeTarget) return s;

  // Route ranking only needs hop counts. Build one reverse BFS per Kontor rather
  // than running laneFor for every region × good × Kontor candidate. The exact
  // lane is still reconstructed by createRoute for the few routes that win.
  const distances = new Map<KontorId, Map<number, number>>();
  for (const kontorId of KONTOR_IDS) distances.set(kontorId, distanceMapToKontor(s, kontorId));

  interface Cand { regionId: number; good: (typeof GOOD_IDS)[number]; kontorId: keyof typeof KONTORE; income: number }
  const cands: Cand[] = [];
  for (const region of s.regions) {
    if (region.ownerId !== nationId) continue;
    for (const good of GOOD_IDS) {
      if (!regionSources(region, good)) continue;
      for (const kontorId of GOODS[good].demandedAt) {
        const hops = distances.get(kontorId)?.get(region.id);
        if (hops === undefined) continue; // Kontor unreachable / off this map
        const hostOwner = s.regions[KONTORE[kontorId].regionId]?.ownerId ?? null;
        if (hostOwner !== null && hostOwner !== nationId && atWar(s, nationId, hostOwner)) continue;
        cands.push({ regionId: region.id, good, kontorId, income: GOODS[good].value * distanceFactor(hops) });
      }
    }
  }
  // Richest first; deterministic tie-break so the same seed opens the same book.
  cands.sort(
    (a, b) => b.income - a.income || a.regionId - b.regionId || a.good.localeCompare(b.good) || a.kontorId.localeCompare(b.kontorId),
  );
  const already = (c: Cand): boolean =>
    mine().some((r) => r.fromRegionId === c.regionId && r.good === c.good && r.toKontorId === c.kontorId);
  for (const c of cands) {
    if (mine().length >= routeTarget) break;
    if (already(c)) continue;
    s = createRoute(s, nationId, c.regionId, c.good, c.kontorId);
  }
  return s;
}

// --- economy ---------------------------------------------------------------

/** Stored food below which the AI plants food buildings before anything else. */
const AI_FOOD_LOW = 12;
/** Total build-ware stock (timber+brick+iron+naval stores) below which the AI develops industry. */
const AI_BUILD_WARE_LOW = 24;
/** Gold a rival keeps as a working reserve — it never buys on the market below this. */
const AI_MARKET_MIN_GOLD = 60;
/** Units of a ware a rival imports in one market purchase. */
const AI_MARKET_BATCH = 10;
/** Gold above which a war-minded rival converts coin into arms (iron) so recruitment isn't ware-blocked. */
const AI_ARMS_GOLD = 150;
/** Iron stock below which a war-minded, flush rival tops up on the market. */
const AI_ARMS_IRON_LOW = 20;
/** Iron a war-minded rival buys in one go, and the reserve it keeps doing so. */
const AI_ARMS_BATCH = 20;
const AI_ARMS_FLOOR = 100;
/** Gold above which a flush rival spends coin topping up burgher contentment (luxuries → prestige). */
const AI_LUXURY_GOLD = 220;
/** Working reserve a rival keeps when buying luxuries for contentment (a discretionary spend). */
const AI_LUXURY_FLOOR = 140;
/** Contentment below which a flush rival tops up luxuries from the market. */
const AI_CONTENT_TARGET = 0.85;
/** Gold below which a near-broke rival liquidates a ware glut for emergency coin. */
const AI_SELL_GOLD = 40;
/** Stock above which a ware counts as a "glut" a broke rival will dump. */
const AI_GLUT_STOCK = 40;

function manageEconomy(state: GameState, nationId: number): GameState {
  const nation = state.nations.find((n) => n.id === nationId);
  if (!nation) return state;
  const owned = state.regions.filter((r) => r.ownerId === nationId);
  if (!owned.length) return state;

  let s = state;

  // Research: keep a tech in progress, chosen by personality branch — but a would-be
  // League founder (no League yet, a trading power) prioritises Lübeck Law, the
  // charter that unlocks the Hanse Hall, once it is reachable.
  if (!nation.research.current) {
    // A Kontor-holder with no League beelines the charter chain toward Lübeck Law
    // (which unlocks the Hanse Hall) — the natural League seats work toward founding.
    const era = eraIndexForTurn(s.turn);
    const charterStep =
      s.mapId === "hansa" && !s.league && kontoreHeldBy(s, nationId) >= 1 && !nation.research.done.includes("lubeck_law")
        ? nextTechToward("lubeck_law", nation.research.done, era)
        : null;
    const pick = charterStep ?? pickTech(nation.research.done, nation, era);
    if (pick) s = chooseTech(s, nationId, pick);
  }

  // Tax policy: aim higher when calm and poorer; ease off when unrest bites, and
  // cut hard when any one province is tipping toward secession (a cheaper save
  // than marching an army to garrison it).
  s = setTax(s, nationId, desiredTaxRate(nation, owned));

  // Buildings: fill empty slots with the best unlocked option, biased by what the
  // realm actually needs — food if the larder is low (food comes from food wares
  // now, R3), industry if it is short of the build wares that fund construction.
  const done = s.nations.find((n) => n.id === nationId)!.research.done;
  const cur = s.nations.find((n) => n.id === nationId)!;
  const buildWareStock = cur.wares.timber + cur.wares.brick + cur.wares.iron + cur.wares.naval_stores;
  const hints: BuildHints = {
    needFood: cur.famine || cur.stocks.food < AI_FOOD_LOW,
    needBuildWares: buildWareStock < AI_BUILD_WARE_LOW,
    // Develop luxury industry when the burghers are well short of contentment (R5.1),
    // so a realm's own land keeps its towns comfortable rather than only imports.
    needLuxury: contentRatio(cur, nationPop(s, nationId)) < 0.6,
  };
  for (const region of s.regions) {
    if (region.ownerId !== nationId || region.construction) continue;
    const choice = chooseBuilding(region, done, nation.trait, hints);
    if (choice) s = queueFor(s, region.id, choice, nationId);
  }

  // Specialise idle provinces so rivals play the focus system too. A region
  // keeps its focus once set (assigned by terrain, with a martial realm mustering
  // on its rough ground), so this is stable, not thrash.
  s = assignAiFocus(s, nationId, nation.trait);

  // The town market (R5): spend some of the treasury to cover a shortfall the
  // realm cannot produce fast enough — a grain reserve against famine, build
  // wares when construction is starved. Gives a rival's gold a job beyond armies.
  s = manageMarket(s, nationId);
  return s;
}

/** A nation's total population — scales its luxury appetite (contentment). */
function nationPop(state: GameState, nationId: number): number {
  return state.regions.filter((r) => r.ownerId === nationId).reduce((s, r) => s + r.population, 0);
}

/** A nation's current burgher-contentment ratio (0..1), the read the score/unrest use. */
function contentRatio(nation: Nation, pop: number): number {
  return resolveContentment(nation.wares, luxuryAppetite(pop)).ratio;
}

/**
 * The rival's use of the town market (R5 / R5.1) — how a realm's treasury actually
 * does work, the way a player's would. In priority order, each keeping a working
 * reserve so it never buys itself broke:
 *   1. a grain reserve when the larder is low (against famine);
 *   2. build wares when construction is starved;
 *   3. arms (iron) when war-minded and flush, so recruitment isn't ware-blocked —
 *      the gold→military pipeline a rich warlord should run;
 *   4. luxuries when flush and its towns are short of contentment — spending the
 *      hoard on burgher comfort (contentment → unrest relief and prestige);
 *   5. as a last resort when near-broke, liquidating a ware glut for coin.
 * Pure.
 */
export function manageMarket(state: GameState, nationId: number): GameState {
  const nat = state.nations.find((n) => n.id === nationId);
  if (!nat || nat.isBarbarian) return state;
  let s = state;
  const cur = (): Nation => s.nations.find((n) => n.id === nationId)!;

  // 1. Grain reserve against a lean larder / famine.
  if (cur().famine || cur().stocks.food < AI_FOOD_LOW) s = aiImport(s, nationId, "grain");

  // 2. Build wares when the chest that funds construction runs thin.
  const buildStock = (): number => {
    const w = cur().wares;
    return w.timber + w.brick + w.iron + w.naval_stores;
  };
  if (buildStock() < AI_BUILD_WARE_LOW) s = aiImport(s, nationId, "timber");

  // 3. Arms: a war-minded, flush realm buys iron so it can keep mustering.
  const wantsWar =
    (cur().personality?.aggression ?? 0.4) > 0.5 ||
    s.nations.some((o) => !o.isBarbarian && o.id !== nationId && atWar(s, nationId, o.id));
  if (wantsWar && cur().wares.iron < AI_ARMS_IRON_LOW && cur().stocks.gold > AI_ARMS_GOLD) {
    s = aiImport(s, nationId, "iron", AI_ARMS_FLOOR, AI_ARMS_BATCH);
  }

  // 4. Luxuries: a flush realm tops up burgher contentment from the market — a real,
  //    bounded job for a big treasury (capped at full contentment, so no runaway).
  if (cur().stocks.gold > AI_LUXURY_GOLD && contentRatio(cur(), nationPop(s, nationId)) < AI_CONTENT_TARGET) {
    const cheapest = contentmentWares().reduce((a, b) => (marketBuyPrice(a) <= marketBuyPrice(b) ? a : b));
    s = aiImport(s, nationId, cheapest, AI_LUXURY_FLOOR);
  }

  // 5. Emergency liquidity: near-broke, dump the biggest ware glut for coin.
  if (cur().stocks.gold < AI_SELL_GOLD) {
    let glut: GoodId | null = null;
    let most = AI_GLUT_STOCK;
    for (const g of GOOD_IDS) {
      if (cur().wares[g] > most) { most = cur().wares[g]; glut = g; }
    }
    if (glut) s = sellWare(s, nationId, glut, AI_MARKET_BATCH);
  }

  return s;
}

/** Import up to `batch` units of `good`, keeping `floor` gold in reserve. */
function aiImport(state: GameState, nationId: number, good: GoodId, floor = AI_MARKET_MIN_GOLD, batch = AI_MARKET_BATCH): GameState {
  const nat = state.nations.find((n) => n.id === nationId)!;
  const spendable = nat.stocks.gold - floor;
  if (spendable <= 0) return state;
  const qty = Math.min(batch, Math.floor(spendable / marketBuyPrice(good)));
  return qty > 0 ? buyWare(state, nationId, good, qty) : state;
}

/** Terrain a province leans toward when an AI specialises it. */
const TERRAIN_FOCUS: Record<TerrainId, FocusId> = {
  plains: "farmland", // food + growth
  coast: "market", // trade + gold
  hills: "workshop", // materials
  mountains: "workshop", // materials
  forest: "academy", // knowledge
};

/**
 * Give each of a nation's un-specialised provinces a sensible focus by terrain
 * (a martial realm turns its rough hills/mountains into muster Garrisons instead
 * of workshops). Once set, a region keeps its focus. Pure and deterministic.
 */
function assignAiFocus(state: GameState, nationId: number, trait: TraitId | undefined): GameState {
  let changed = false;
  const regions = state.regions.map((r) => {
    if (r.ownerId !== nationId || r.focus) return r;
    changed = true;
    const focus =
      trait === "martial" && (r.terrain === "hills" || r.terrain === "mountains")
        ? "garrison"
        : TERRAIN_FOCUS[r.terrain];
    return { ...r, focus };
  });
  return changed ? { ...state, regions } : state;
}

/** A province at/above this unrest is trending toward revolt (below the revolt line). */
const NEAR_REVOLT_UNREST = 60;

/**
 * The tax rate a nation aims for. Higher when calm and poorer (economy/aggression
 * push it up); eased when the realm's *average* unrest is high; and cut **hard**
 * when its *worst* province is in or near revolt — a single crisis province is
 * invisible to an average, yet losing it to secession is a free loss, so cutting
 * tax to calm it is worth the income. Clamped to the legal band. Pure.
 */
export function desiredTaxRate(nation: Nation, owned: Region[]): number {
  const p = nation.personality;
  let target = 0.15 + (p?.economy ?? 0.5) * 0.1 + (p?.aggression ?? 0.4) * 0.1;
  if (!owned.length) return clampTax(target);

  const avgUnrest = owned.reduce((a, r) => a + r.unrest, 0) / owned.length;
  if (avgUnrest > 45) target -= 0.1;

  const maxUnrest = owned.reduce((m, r) => Math.max(m, r.unrest), 0);
  if (maxUnrest >= UNREST_REVOLT) target -= 0.1; // a province is revolting — de-escalate
  else if (maxUnrest >= NEAR_REVOLT_UNREST) target -= 0.05; // trending toward revolt

  if (nation.stocks.gold > 300) target -= 0.05;
  return clampTax(target);
}

/** The research category a nation should favour, given the personality thresholds. */
function personalityCategory(nation: Nation): ResearchCategory {
  const p = nation.personality;
  return (p?.aggression ?? 0) > 0.6 ? "military" : (p?.economy ?? 0) > 0.6 ? "commerce" : "governance";
}

/**
 * The research category a nation prefers, biased first by its national TRAIT so a
 * realm rushes the doctrines that play to its strength — a Scholarly nation up the
 * knowledge line, a Martial one the military line, mercantile ones commerce,
 * builders production. With no trait it falls back to the personality category.
 */
export function preferredCategory(nation: Nation): ResearchCategory {
  switch (nation.trait) {
    case "scholarly":
      return "scholarship";
    case "martial":
      return "military";
    case "mercantile":
      return "commerce";
    case "industrious":
    case "fertile":
      return "production";
    default:
      return personalityCategory(nation);
  }
}

/**
 * The next researchable node on the way to `target`: the first unfinished rung of
 * target's path (up to target's own tier), once its age has come and the path is
 * not already committed away from. null if the path is blocked or the rung's age
 * has not yet dawned.
 */
function nextTechToward(target: TechId, done: TechId[], era: number): TechId | null {
  if (done.includes(target)) return null;
  if (isPathRejected(done, TECHS[target].path)) return null;
  const next = nextNodeInPath(done, TECHS[target].path);
  if (!next || TECHS[next].tier > TECHS[target].tier) return null;
  return era >= TECHS[next].era ? next : null;
}

function pickTech(done: TechId[], nation: Nation, era: number): TechId | null {
  const frontier = researchFrontier(done, era);
  if (!frontier.length) return null;
  // Prefer the trait-driven category, then the personality category, then anything.
  const traitCat = preferredCategory(nation);
  const persCat = personalityCategory(nation);
  const inTrait = frontier.filter((t) => TECHS[t].category === traitCat);
  const inPers = frontier.filter((t) => TECHS[t].category === persCat);
  const pool = inTrait.length ? inTrait : inPers.length ? inPers : frontier;
  // Cheapest of the chosen candidate set (deterministic, never null here).
  return pool.reduce((best, t) => (TECHS[t].cost < TECHS[best].cost ? t : best), pool[0]!);
}

/** Base build order when a nation's trait expresses no preference. The
    resource works (bloomery/stable) sit early — they only pass `fits` on a
    region that actually holds the resource, so they are cheap to keep near the
    front and get raised wherever they apply. */
const BASE_BUILD_ORDER: BuildingId[] = [
  "bloomery", "stable", "market", "harbor", "bank", "guildhall", "workshop", "mine", "university", "forum", "farm", "aqueduct", "library", "temple", "monastery", "cathedral", "fortress",
];

/** Buildings a trait rushes first, so rivals open along their strength. A
    scholarly realm doubles as the church-builder (monasteries and cathedrals are
    seats of learning), so it presses the religious race as well as the tech one. */
const TRAIT_BUILD_PRIORITY: Record<TraitId, BuildingId[]> = {
  fertile: ["farm", "aqueduct"],
  industrious: ["workshop", "mine", "guildhall"],
  mercantile: ["market", "harbor", "bank", "guildhall"],
  scholarly: ["library", "monastery", "university", "cathedral", "forum"],
  martial: ["fortress", "workshop"],
};

/** Food-yielding buildings, best first — what a starving realm reaches for (fits()
    still gates the focus/terrain-locked ones like the Manor and Harbor). */
const FOOD_BUILDINGS: BuildingId[] = ["manor", "farm", "aqueduct", "harbor", "granary", "lighthouse", "canal"];
/** Ware-yielding industry, best first — what a realm short of build wares (or eager
    to trade) develops to feed its construction and its Kontor routes. */
const WARE_BUILDINGS: BuildingId[] = ["foundry", "bloomery", "mine", "workshop", "guildhall", "stable"];
/** Luxury industry — what a realm builds to keep its burghers content (R5.1). The
    Weaving Works spins wool into cloth (a contentment luxury). */
const LUXURY_BUILDINGS: BuildingId[] = ["weaving_works"];

/**
 * Produce-to-need hints from the nation's economy: build food when the larder runs
 * low (food now comes from the food wares — R3), and develop ware industry when the
 * build-ware chest is thin (so construction and trade keep flowing).
 */
export interface BuildHints {
  needFood?: boolean;
  needBuildWares?: boolean;
  /** Burghers are short of contentment — develop luxury industry (a Weaving Works). */
  needLuxury?: boolean;
}

export function chooseBuilding(
  region: { unrest: number; buildings: BuildingId[]; terrain: TerrainId; focus?: FocusId; resource?: StrategicResource | null },
  done: TechId[],
  trait?: TraitId,
  hints?: BuildHints,
): BuildingId | null {
  const has = (b: BuildingId) => region.buildings.includes(b);
  const unlocked = (b: BuildingId) => isBuildingUnlockedFor(done, b);
  const fits = (b: BuildingId) => {
    const t = BUILDINGS[b].requiresTerrain;
    if (t && region.terrain !== t) return false;
    if (!buildingResourceOk(region.resource, b)) return false;
    return buildingFocusOk(region.focus, b);
  };
  const firstOf = (list: BuildingId[]) => list.find((b) => unlocked(b) && !has(b) && fits(b)) ?? null;

  if (region.unrest > 35 && !has("temple")) return "temple";
  // Build this province's focus capstone as soon as it's available — the payoff
  // for having specialised it (a martial garrison raises its Citadel, etc.).
  if (region.focus) {
    const cap = focusCapstone(region.focus);
    if (cap && unlocked(cap) && !has(cap) && fits(cap)) return cap;
  }
  // Produce-to-need: a hungry realm plants food first; one short of build wares
  // develops industry before its generalist order.
  if (hints?.needFood) {
    const food = firstOf(FOOD_BUILDINGS);
    if (food) return food;
  }
  if (hints?.needBuildWares) {
    const ware = firstOf(WARE_BUILDINGS);
    if (ware) return ware;
  }
  // Burghers short of luxuries: raise a Weaving Works to spin cloth for contentment.
  if (hints?.needLuxury) {
    const lux = firstOf(LUXURY_BUILDINGS);
    if (lux) return lux;
  }
  // Trait-preferred buildings first, then the generalist order.
  const order = [...new Set([...(trait ? TRAIT_BUILD_PRIORITY[trait] : []), ...BASE_BUILD_ORDER])];
  for (const b of order) if (unlocked(b) && !has(b) && fits(b)) return b;
  return null;
}

function chooseTech(state: GameState, nationId: number, tech: TechId): GameState {
  const era = eraIndexForTurn(state.turn);
  const nations = state.nations.map((n) =>
    n.id === nationId ? { ...n, research: selectTech(n.research, tech, era) } : n,
  );
  return { ...state, nations };
}

// --- diplomacy --------------------------------------------------------------

/** A leader must be this much stronger than the next nation to be "runaway". */
const LEADER_POWER_RATIO = 1.6;
/** …and hold at least this share of all owned (non-barbarian) regions. */
const LEADER_REGION_SHARE = 0.4;
/** Join the coalition once its combined power reaches the leader × this. */
const COALITION_MARGIN = 0.85;

/**
 * The runaway leader's id, or null. A runaway both out-powers the second-place
 * nation by `LEADER_POWER_RATIO` and holds `LEADER_REGION_SHARE` of the map.
 * Needs at least three living nations, so there's a coalition to form.
 */
export function runawayLeader(state: GameState, observerId?: number): number | null {
  const nations = state.nations.filter((n) => !n.isBarbarian && n.alive);
  if (nations.length < 3) return null;
  const powers = nations
    .map((n) => ({ id: n.id, p: observerId === undefined ? nationPower(state, n.id) : publicNationPower(state, observerId, n.id) }))
    .sort((a, b) => b.p - a.p);
  const first = powers[0]!;
  const second = powers[1]!;
  if (first.p < second.p * LEADER_POWER_RATIO) return null;
  const owned = state.regions.filter(
    (r) => r.ownerId !== null && r.ownerId !== BARBARIAN_ID,
  ).length || 1;
  const leaderRegions = state.regions.filter((r) => r.ownerId === first.id).length;
  if (leaderRegions / owned < LEADER_REGION_SHARE) return null;
  return first.id;
}

/** Combined power of `joinerId` plus everyone already at war with `leaderId`. */
export function coalitionPowerAgainst(
  state: GameState,
  leaderId: number,
  joinerId: number,
  observerId?: number,
): number {
  const powerOf = (id: number) => observerId === undefined ? nationPower(state, id) : publicNationPower(state, observerId, id);
  let power = powerOf(joinerId);
  for (const n of state.nations) {
    if (n.isBarbarian || !n.alive || n.id === leaderId || n.id === joinerId) continue;
    if (atWar(state, n.id, leaderId)) power += powerOf(n.id);
  }
  return power;
}

function doDiplomacy(state: GameState, nationId: number, rng: Rng): GameState {
  const me = state.nations.find((n) => n.id === nationId);
  if (!me) return state;
  // The realm's war aim: a peace standing on the next province of its road is
  // the one thing it will open a war *for* rather than merely out of hostility.
  const campaign = planCampaign(state, nationId);
  const p = me.personality;
  const aggression = p?.aggression ?? 0.4;
  const trust = p?.trustworthiness ?? 0.5;

  const others = state.nations.filter(
    (n) => !n.isBarbarian && n.alive && n.id !== nationId,
  );
  // A conqueror opens wars at a slimmer edge than its temperament alone would;
  // a merchant wants a decisive one before it risks its lanes.
  const appetite = strategyProfile(state.nations.find((n) => n.id === nationId)).warAppetite;
  const myPower = publicNationPower(state, nationId, nationId) * appetite;
  const leaderId = runawayLeader(state, nationId);
  // A realm already struggling to hold itself together (a province in open
  // revolt) puts new wars of *conquest* on hold until it restores order — quell
  // unrest before grabbing more land. Defensive wars, suing for peace, and
  // coalitions against a runaway leader are unaffected.
  const overstretched = state.regions.some(
    (r) => r.ownerId === nationId && r.unrest >= UNREST_REVOLT,
  );

  let s = state;
  let actions = 0;
  for (const o of others) {
    if (actions >= 1) break; // at most one diplomatic move per turn
    const rel = getRelation(s, nationId, o.id);
    const treaty = getTreaty(s, nationId, o.id);
    const theirPower = publicNationPower(s, nationId, o.id) || 1;
    const ratio = myPower / theirPower;
    // A war of passage is judged on real strength, not on temperament: a realm
    // that has already decided to march reads the odds like a soldier, so the
    // merchant's `warAppetite` discount is left out of this one comparison.
    // With it in, a merchant needed roughly twice the power of the realm in its
    // way and no road ever opened — measured, campaigns sat blocked for a
    // hundred turns at a border they could have forced.
    const campaignRatio = publicNationPower(s, nationId, nationId) / theirPower;
    const border = sharedBorders(s, nationId, o.id) > 0;
    const earlyGraceForPlayer = o.isPlayer && s.turn < earlyPeaceTurns(s);

    if (treaty === "war") {
      // Losing badly → sue for peace (more readily if unaggressive). But hold the
      // line against a runaway leader: don't hand the snowball an easy white peace.
      if (ratio < 0.7 - aggression * 0.2 && o.id !== leaderId) {
        s = suePeace(s, nationId, o);
        actions++;
      }
      continue;
    }

    // Gang up on a runaway leader: once the coalition already fighting it (plus
    // me) collectively rivals its power, pile on — even at unfavourable 1v1 odds.
    // This is the anti-snowball brake (design §5), respecting NAPs/alliances and
    // the player's early grace.
    if (
      o.id === leaderId &&
      border &&
      treaty === "peace" &&
      rel < FRIENDLY_THRESHOLD &&
      !earlyGraceForPlayer &&
      coalitionPowerAgainst(s, leaderId, nationId, nationId) >= publicNationPower(s, nationId, leaderId) * COALITION_MARGIN
    ) {
      s = openWar(s, nationId, o);
      actions++;
      continue;
    }

    // Opportunistic war: hostile, bordering, and I'm stronger. Warlords pounce
    // at worse odds; peaceful types need a big edge. The player gets an
    // early-game grace period so a new realm isn't snuffed out immediately.
    // A rival that is internally weak — a province in open revolt, or gripped by
    // famine or bankruptcy — is distracted and poorly placed to defend, so it's a
    // tempting moment: the required power edge drops. (The complement to the
    // `overstretched` restraint: strike weakness, don't compound your own.)
    const targetUnstable = nationInstability(state, o.id).reeling;
    const warThreshold = 1.5 - aggression - (targetUnstable ? 0.3 : 0);
    // A realm we hold no pact with can be struck on hostility + a power edge. A
    // NAP or alliance is a given word: only a low-trust realm breaks it, and only
    // for a tempting strike (`wouldBreakTreaty` — a real power edge, worse odds
    // only against a reeling foe), branding itself with every court (declareWar's
    // reputation cost). A warm partnership (rel ≥ friendly) is safe even from a
    // schemer. This is C4's treaty-breaking: characterful betrayal, self-punished.
    const pact = treaty === "nap" || treaty === "alliance";
    // A truce sworn to end the last war binds a rival absolutely: it is the rule
    // that closes the war → peace → war loop, and `wouldBreakTreaty` alone does
    // not cover it (that is only consulted where a *pact* exists, not a plain
    // peace). The player may still tear one up — at a price stated up front.
    const mayStrike =
      !underTruce(s, nationId, o.id) &&
      (pact ? rel < FRIENDLY_THRESHOLD && wouldBreakTreaty(s, nationId, o.id) : rel < -25);
    if (border && mayStrike && ratio > warThreshold && !earlyGraceForPlayer && !overstretched) {
      s = openWar(s, nationId, o);
      actions++;
      continue;
    }

    // A war of *passage*: this realm is marching at a prize (a Kontor town, an
    // enemy seat) and this neighbour's land is the next province of the road.
    // Without this clause a realm could want the network and never take a step
    // toward it — a merchant is rarely hostile enough to clear the `rel < -25`
    // bar above, which is precisely why it never went anywhere. The costs are
    // the same as any other war: it needs a real power edge, it will not touch
    // a sworn truce or a pact it means to keep, and the declaration is public.
    if (
      warOpensRoad(campaign, o.id) &&
      border &&
      !pact &&
      !underTruce(s, nationId, o.id) &&
      campaignRatio > warThreshold + CAMPAIGN_WAR_CAUTION &&
      !earlyGraceForPlayer &&
      !overstretched
    ) {
      s = openWar(s, nationId, o);
      actions++;
      continue;
    }

    // Extortion short of war: a strong, bordering rival that is unfriendly (but
    // not yet hostile enough to invade — that case warred above) demands tribute
    // of the player. Pay up, or refuse and watch relations sour toward the war
    // it foreshadows. Only the player can weigh such an offer, and only one
    // stands at a time (dedup); ignoring it never itself triggers war.
    if (
      o.isPlayer &&
      border &&
      treaty === "peace" &&
      !earlyGraceForPlayer &&
      rel < 0 &&
      ratio > 1.35 &&
      !s.offers.some((of) => of.from === nationId && of.to === o.id && of.type === "tribute")
    ) {
      s = demandTribute(s, nationId, o.id, Math.min(50, Math.round(18 + (ratio - 1) * 25)));
      actions++;
      continue;
    }

    // Trustworthy types shore up relations with a pact or a gift.
    if (trust > 0.55 && rel > 15 && treaty === "peace" && border) {
      s = offerPact(s, nationId, o, rel > 45 ? "alliance" : "nap");
      actions++;
      continue;
    }

    // A merchant appeases a much stronger, unfriendly neighbour with a gift.
    if ((p?.economy ?? 0) > 0.7 && ratio < 0.6 && rel < 0 && me.stocks.gold > 80) {
      s = gift(s, nationId, o.id, 30);
      actions++;
    }
  }
  // Rally an ally into a war I'm LOSING (call to arms) — at most one per turn, and
  // only when the enemy out-powers me, so it's a genuine cry for help rather than
  // an automatic dogpile (which would end games too fast). wouldJoinWar declines
  // for a player ally, so the AI never forces the player into a war.
  rally: for (const ally of others) {
    if (getTreaty(s, nationId, ally.id) !== "alliance") continue;
    for (const enemy of others) {
      if (enemy.id === ally.id) continue;
      if (
        atWar(s, nationId, enemy.id) &&
        publicNationPower(s, nationId, enemy.id) > publicNationPower(s, nationId, nationId) * 1.1 &&
        wouldJoinWar(s, ally.id, nationId, enemy.id)
      ) {
        s = callToArms(s, nationId, ally.id, enemy.id);
        break rally;
      }
    }
  }

  // Small random chance a warlord with no target still probes a neighbour.
  void rng;
  return s;
}

function openWar(state: GameState, from: number, target: Nation): GameState {
  if (target.isPlayer) {
    // War is declared immediately (no consent needed).
    return declareWar(state, from, target.id);
  }
  return declareWar(state, from, target.id);
}

function suePeace(state: GameState, from: number, target: Nation): GameState {
  if (target.isPlayer) {
    // Sweeten the bid with reparations when clearly the weaker party — a losing AI
    // buys its way out, giving the player a concrete reason to grant peace.
    const reparations = peaceReparations(state, from, target.id);
    return addOffer(state, from, target.id, "peace", reparations > 0 ? reparations : undefined);
  }
  // AI-to-AI peace resolves immediately.
  return makePeace(state, from, target.id);
}

function offerPact(
  state: GameState,
  from: number,
  target: Nation,
  kind: "nap" | "alliance",
): GameState {
  if (target.isPlayer) return addOffer(state, from, target.id, kind);
  return setPact(state, from, target.id, kind);
}

/** A strong rival demands gold of the player; logs the ultimatum. */
function demandTribute(state: GameState, from: number, playerId: number, gold: number): GameState {
  const next = addOffer(state, from, playerId, "tribute", gold);
  if (next === state) return state; // a demand already stands (dedup)
  const name = state.nations.find((n) => n.id === from)?.name ?? "A rival";
  return { ...next, log: [...next.log, `${name} demands ${gold}g in tribute — pay, or risk war.`].slice(-LOG_CAP) };
}

// --- military ---------------------------------------------------------------

/** An army retreats when a bordering enemy's attack exceeds its defence by this. */
const RETREAT_RATIO = 1.35;

/** Avoid the heavier target scoring pass for realms without a multi-stack war front. */
function shouldConcentrate(state: GameState, nationId: number): boolean {
  let landArmies = 0;
  for (const army of state.armies) {
    if (!armyIsAtSea(army) && !armyIsFleet(army.units) && army.ownerId === nationId && armySize(army.units) > 0) {
      landArmies++;
      if (landArmies >= 2) break;
    }
  }
  if (landArmies < 2) return false;
  return state.regions.some(
    (region) => region.ownerId === nationId && landNeighbours(state, region.id).some((id) => isAttackable(state, id, nationId)),
  );
}

function doMilitary(state: GameState, nationId: number, rng: Rng): GameState {
  let s = state;
  const nation = s.nations.find((n) => n.id === nationId);
  if (!nation) return s;

  // The realm's war aim, read once: every offensive decision below is measured
  // against the same road, so the host cannot pull itself in two directions.
  const campaign = planCampaign(s, nationId);

  // Recruit: keep an army if aggressive/at war and it's affordable.
  s = recruit(s, nationId, rng);
  s = manageNavy(s, nationId, rng);

  // Phase 0 — appoint commanders to lead any sizeable unled stack (M4), so the
  // rival armies benefit from the same martial bonus the player's can.
  for (const a of s.armies) {
    if (a.ownerId === nationId && !a.commander && armySize(a.units) >= 3) {
      s = appointCommander(s, a.id, rng);
    }
  }

  // Phase 1 — attack: strongest armies first take their best winnable target.
  // Restore an empty capital garrison before committing to an offensive.
  const capitalPlan = capitalDefensePlan(s, nationId);
  if (capitalPlan) {
    const defender = s.armies.find((a) => a.id === capitalPlan.armyId);
    if (defender && defender.movesLeft > 0) s = moveArmy(s, defender.id, capitalPlan.step, rng);
  }

  // One shared offensive plan gates the *reserved* armies: the assault stack and
  // the ones marching to join it. It is a plan for one front, not a nation-wide
  // stand-down — armies outside it still take their own winnable targets, and
  // even a reserved army walks into an undefended province, which costs the
  // muster nothing.
  const concentration = shouldConcentrate(s, nationId) ? concentrationPlan(s, nationId, campaign) : null;
  const reserved = concentrationReserves(s, nationId, concentration);
  const actedOffensively = new Set<number>();
  const myArmies = () => s.armies.filter((a) => a.ownerId === nationId && !armyIsFleet(a.units));
  for (const army of [...myArmies()].sort((a, b) => armySize(b.units) - armySize(a.units))) {
    const live = s.armies.find((a) => a.id === army.id);
    if (!live || live.movesLeft <= 0) continue;
    if (concentration?.ready && live.id === concentration.assaultArmyId) {
      s = moveArmy(s, live.id, concentration.targetId, rng);
      actedOffensively.add(live.id);
      continue;
    }
    const target = bestTarget(s, live, nationId, campaign);
    if (target === null) continue;
    if (reserved.has(live.id) && !isUndefendedTarget(s, target, nationId)) continue;
    s = moveArmy(s, live.id, target, rng);
    actedOffensively.add(live.id);
  }

  // Phase 2 — reposition idle armies (no winnable attack this turn):
  //   • badly outmatched where it stands → retreat to a safer owned region
  //     (don't feed the army into a losing fight);
  //   • holding a defensible threatened region → stay put and garrison it;
  //   • otherwise march to reinforce the nearest threatened region, or, failing
  //     that, concentrate toward the offensive frontier (previous behaviour).
  let currentConcentration = concentration && !concentration.ready ? concentration : null;
  for (const army of myArmies()) {
    const live = s.armies.find((a) => a.id === army.id);
    if (!live || live.movesLeft <= 0) continue;
    if (actedOffensively.has(live.id)) continue;
    if (bestTarget(s, live, nationId, campaign) !== null) continue;

    if (isBadlyOutmatched(s, live, nationId)) {
      const refuge = retreatStep(s, live, nationId);
      if (refuge !== null) s = moveArmy(s, live.id, refuge, rng);
      continue; // if nowhere safer, hold and sell it dearly rather than advance
    }

    // Concentration of force: gather toward the anvil next to a high-value target
    // that no single army can crack, massing (and merging) over turns until the
    // combined stack wins — instead of dribbling armies onto the front piecemeal.
    // This takes priority over a *passive* garrison (the anvil is itself on the
    // front), but never overrides the retreat above, and never strips the
    // capital's own garrison — a realm keeps its seat of power defended.
    if (currentConcentration && !currentConcentration.ready) {
      const plan = currentConcentration;
      if (live.regionId === plan.musterId) continue; // the anvil holds and builds up
      if (plan.stagingArmyIds.includes(live.id)) {
        const toMuster = firstStepTowards(s, live.regionId, nationId, (rid) => rid === plan.musterId);
        if (toMuster !== null) {
          s = moveArmy(s, live.id, toMuster, rng);
          currentConcentration = concentrationPlan(s, nationId, campaign);
          continue;
        }
      }
      // Not part of this plan (or no route to the muster) — fall through and let
      // it defend, quell or advance as usual rather than stand idle.
    }

    // (The old per-army "walk toward the focus target's muster" pass lived here.
    // `concentrationPlan` above replaced it with one nation-level plan; the loose
    // version is gone rather than left behind as an unreachable branch.)

    // Defensible and already under threat here → garrison in place.
    if (regionIsThreatened(s, live.regionId, nationId)) continue;

    // Internal order: an army standing in one of the nation's own revolting
    // regions is suppressing it (a garrison resets the secession counter), so
    // hold there rather than let the province break away.
    const here = s.regions[live.regionId];
    if (here && here.ownerId === nationId && here.unrest >= UNREST_REVOLT) continue;

    // Otherwise, if a restless region is about to secede, march to quell it
    // before reinforcing the front — losing a province to revolt is a free loss.
    const atRisk = secessionRiskRegion(s, nationId);
    if (atRisk !== null) {
      const toRisk = firstStepTowards(s, live.regionId, nationId, (rid) => rid === atRisk);
      if (toRisk !== null) {
        s = moveArmy(s, live.id, toRisk, rng);
        continue;
      }
    }

    // Otherwise reinforce the nearest threatened region, then stage at the front.
    const defend = defendStep(s, live, nationId);
    if (defend !== null) {
      s = moveArmy(s, live.id, defend, rng);
      continue;
    }

    const step = advanceStep(s, live, nationId, campaign);
    if (step !== null) s = moveArmy(s, live.id, step, rng);
  }

  // Phase 2b — over the water: sail a loaded stack toward an island prize, or
  // storm the beach if it is already standing off it. Nothing else can reach
  // England, Zealand, Gotland or Ösel now that the crossings are real.
  const landing = amphibiousPlan(s, nationId, campaign);
  if (landing) {
    s = landing.ready
      ? moveArmy(s, landing.armyId, landing.targetId, rng)
      : sailToSeaZone(s, landing.armyId, landing.zoneId, rng);
  } else {
    s = boardForInvasion(s, nationId, campaign, rng);
  }

  // Phase 3 — dig in: an army that ended the phase idle (still had a move) on a
  // threatened owned region holds the line, so entrench it (M3). Entrenchment
  // then deepens each turn it keeps the ground.
  for (const a of s.armies) {
    if (a.ownerId !== nationId || armyIsFleet(a.units) || a.fortifying || a.movesLeft <= 0) continue;
    const r = s.regions[a.regionId];
    if (r && r.ownerId === nationId && regionIsThreatened(s, a.regionId, nationId)) {
      s = fortifyArmy(s, a.id);
    }
  }
  return s;
}

/** Enemy (rival, at-war) armies standing in regions adjacent to `regionId`. */
function adjacentThreats(state: GameState, regionId: number, nationId: number): Army[] {
  const region = state.regions[regionId];
  if (!region) return [];
  const out: Army[] = [];
  // Only by land: a stack across a strait threatens nothing until it lands.
  for (const nb of landNeighbours(state, regionId)) {
    for (const a of state.armies) {
      if (armyIsAtSea(a) || a.regionId !== nb) continue;
      if (a.ownerId === nationId || a.ownerId === null || a.ownerId === BARBARIAN_ID) continue;
      if (atWar(state, nationId, a.ownerId)) out.push(a);
    }
  }
  return out;
}

/** Whether an owned region has a mobile enemy stack poised on its border. */
export function regionIsThreatened(state: GameState, regionId: number, nationId: number): boolean {
  const r = state.regions[regionId];
  if (!r || r.ownerId !== nationId) return false;
  return adjacentThreats(state, regionId, nationId).length > 0;
}

/**
 * The nation's owned region most in danger of seceding — in full revolt, with no
 * friendly garrison to hold it, and within a couple of turns of breaking away —
 * or null. Prefers the region closest to seceding, then the most populous (worth
 * saving most). Lets the AI march a spare army in to suppress the revolt.
 */
export function secessionRiskRegion(state: GameState, nationId: number): number | null {
  const imminent = Math.max(1, SECESSION_REVOLT_TURNS - 2);
  let best: { id: number; turns: number; pop: number } | null = null;
  for (const r of state.regions) {
    if (r.ownerId !== nationId || r.unrest < UNREST_REVOLT) continue;
    if ((r.revoltTurns ?? 0) < imminent) continue;
    const garrisoned = state.armies.some(
      (a) => !armyIsAtSea(a) && a.regionId === r.id && a.ownerId === nationId && armySize(a.units) > 0,
    );
    if (garrisoned) continue;
    const turns = r.revoltTurns ?? 0;
    if (!best || turns > best.turns || (turns === best.turns && r.population > best.pop)) {
      best = { id: r.id, turns, pop: r.population };
    }
  }
  return best ? best.id : null;
}

/** Our defensive strength for `units` standing in `regionId` against `enemy`. */
function defenseAt(
  state: GameState,
  units: UnitCounts,
  regionId: number,
  enemy: UnitCounts,
): number {
  const r = state.regions[regionId];
  if (!r) return 0;
  const fortMult = 1 + r.fortification * FORT_PER_LEVEL;
  return sideStrength(units, enemy, "defense") * TERRAIN[r.terrain].defense * fortMult;
}

/** How hard the strongest bordering enemy would hit an army where it stands. */
function incomingPressure(state: GameState, army: Army, nationId: number): number {
  let worst = 0;
  for (const threat of adjacentThreats(state, army.regionId, nationId)) {
    const atk = sideStrength(publicIntelUnits(state, nationId, threat), army.units, "attack");
    if (atk > worst) worst = atk;
  }
  return worst;
}

/** An army is badly outmatched if a bordering enemy clearly beats its defence. */
export function isBadlyOutmatched(state: GameState, army: Army, nationId: number): boolean {
  const pressure = incomingPressure(state, army, nationId);
  if (pressure <= 0) return false;
  const threats = adjacentThreats(state, army.regionId, nationId);
  const enemyUnits = strongestOf(state, threats, nationId);
  const def = defenseAt(state, army.units, army.regionId, enemyUnits);
  return pressure > def * RETREAT_RATIO;
}

/** The units of the strongest (by size) army in a list, for counter maths. */
function strongestOf(state: GameState, armies: Army[], observerId: number): UnitCounts {
  let best: UnitCounts = emptyUnits();
  let bestSize = -1;
  for (const a of armies) {
    const visible = publicIntelUnits(state, observerId, a);
    const size = armySize(visible);
    if (size > bestSize) {
      bestSize = size;
      best = visible;
    }
  }
  return best;
}

/**
 * The adjacent owned region that is safest to retreat into — the one facing the
 * least incoming enemy pressure, and strictly safer than staying put. Null if no
 * owned neighbour is any safer (then the army holds and fights where it is).
 */
export function retreatStep(state: GameState, army: Army, nationId: number): number | null {
  const here = state.regions[army.regionId];
  if (!here) return null;
  const hereThreat = adjacentThreats(state, army.regionId, nationId).reduce(
    (m, a) => Math.max(m, sideStrength(publicIntelUnits(state, nationId, a), army.units, "attack")),
    0,
  );
  let best: number | null = null;
  let bestThreat = hereThreat;
  for (const nb of landNeighbours(state, army.regionId)) {
    const r = state.regions[nb];
    if (!r || r.ownerId !== nationId) continue; // retreat only into our own land
    // Pressure the army would face there next turn.
    let threat = 0;
    for (const a of state.armies) {
      const ar = state.regions[a.regionId];
      if (!ar || a.ownerId === nationId || a.ownerId === null || a.ownerId === BARBARIAN_ID) continue;
      if (!atWar(state, nationId, a.ownerId)) continue;
      if (landNeighbours(state, a.regionId).includes(nb)) {
        threat = Math.max(threat, sideStrength(publicIntelUnits(state, nationId, a), army.units, "attack"));
      }
    }
    if (threat < bestThreat) {
      bestThreat = threat;
      best = nb;
    }
  }
  return best;
}

/**
 * Breadth-first march through *own land only*: the first step (an owned
 * neighbour) along the shortest owned path from `start` to the nearest region
 * satisfying `isGoal`. Null if `start` already satisfies `isGoal` or no owned
 * path reaches one. Shared by the defend / advance / muster routers so they
 * never blunder a march through hostile territory.
 */
function firstStepTowards(
  state: GameState,
  start: number,
  nationId: number,
  isGoal: (regionId: number) => boolean,
): number | null {
  if (isGoal(start)) return null;
  const visited = new Set<number>([start]);
  const queue: { node: number; first: number | null }[] = [{ node: start, first: null }];
  while (queue.length) {
    const { node, first } = queue.shift()!;
    for (const nb of landNeighbours(state, node)) {
      if (visited.has(nb)) continue;
      const nbR = state.regions[nb];
      if (!nbR || nbR.ownerId !== nationId) continue; // march only through own land
      visited.add(nb);
      const step = first ?? nb;
      if (isGoal(nb)) return step;
      queue.push({ node: nb, first: step });
    }
  }
  return null;
}

/**
 * First step (an owned neighbour) along the shortest own-land path toward the
 * nearest threatened owned region — reinforcing where enemies are massing.
 * Null if the army is already at the threatened region or none is reachable.
 */
export function defendStep(state: GameState, army: Army, nationId: number): number | null {
  return firstStepTowards(state, army.regionId, nationId, (rid) =>
    regionIsThreatened(state, rid, nationId),
  );
}

/** Whether a nation may attack into a region (hostile, honouring player grace). */
function isAttackable(state: GameState, regionId: number, nationId: number): boolean {
  const r = state.regions[regionId];
  if (!r || r.ownerId === null || r.ownerId === nationId) return false;
  if (r.ownerId === BARBARIAN_ID) return true;
  if (r.ownerId === PLAYER_ID && state.turn < earlyPeaceTurns(state)) return false;
  return atWar(state, nationId, r.ownerId);
}

/**
 * The first step (an owned neighbour) toward the nearest frontier region — an
 * owned region bordering something attackable. Marches only through friendly
 * land, so the advance never blunders into a losing fight. Null if the army is
 * already at the front or no owned path reaches one.
 */
function advanceStep(
  state: GameState,
  army: { regionId: number },
  nationId: number,
  campaign: Campaign | null = null,
): number | null {
  // With a war aim, "the front" means the road's next province, not whichever
  // border happens to be nearest — otherwise an idle army drifts to the wrong
  // end of the realm and the campaign never gathers weight.
  if (campaign) {
    const toRoad = firstStepTowards(state, army.regionId, nationId, (rid) =>
      landNeighbours(state, rid).includes(campaign.stepId),
    );
    if (toRoad !== null) return toRoad;
  }
  const isFrontier = (rid: number): boolean => {
    const r = state.regions[rid];
    return (
      !!r && r.ownerId === nationId && landNeighbours(state, rid).some((n) => isAttackable(state, n, nationId))
    );
  };
  return firstStepTowards(state, army.regionId, nationId, isFrontier);
}

// --- concentration of force -------------------------------------------------

/**
 * Whether some single owned army adjacent to `targetId` can already win there on
 * its own (mirrors `bestTarget`'s winnable test). If so, the target needs no
 * massing — normal attack handling takes it.
 */
function soloWinnable(state: GameState, targetId: number, nationId: number): boolean {
  const target = state.regions[targetId];
  if (!target) return false;
  const defenders = targetDefenders(state, targetId, nationId);
  const garrison = regionDefense(state, targetId, nationId)?.garrison;
  for (const a of state.armies) {
    if (a.ownerId !== nationId || armyIsAtSea(a) || armyIsFleet(a.units)) continue;
    const ar = state.regions[a.regionId];
    if (!ar || !landNeighbours(state, a.regionId).includes(targetId)) continue;
    const atk = sideStrength(a.units, zeroUnits(), "attack");
    const def = armySize(defenders) > 0
      ? sideStrength(defenders, a.units, "defense") * 1.2 +
        (target.fortification + (garrison?.entrenchment ?? 0)) * 3
      : 0;
    if (atk > def * 1.1) return true;
  }
  return false;
}

/**
 * A high-value enemy region worth *massing* against: attackable, bordering our
 * land, and NOT already beatable by a single adjacent army (else normal attack
 * takes it). Prize weighting mirrors `bestTarget` (population, resource, an enemy
 * capital), scaled by archetype. Deterministic — highest score, ties by lowest
 * id. Null when nothing needs massing.
 */
export function focusTarget(
  state: GameState,
  nationId: number,
  campaign: Campaign | null = planCampaign(state, nationId),
): number | null {
  const owned = state.regions.filter((r) => r.ownerId === nationId);
  const p = state.nations.find((n) => n.id === nationId)?.personality;
  const capW = CAPITAL_VALUE * (0.5 + (p?.aggression ?? 0.4));
  const resW = RESOURCE_VALUE * (0.5 + (p?.economy ?? 0.5));
  const candidates = new Set<number>();
  for (const r of owned) {
    for (const nb of landNeighbours(state, r.id)) if (isAttackable(state, nb, nationId)) candidates.add(nb);
  }
  let best: number | null = null;
  let bestScore = -Infinity;
  for (const id of [...candidates].sort((a, b) => a - b)) {
    if (soloWinnable(state, id, nationId)) continue; // handled by ordinary attack
    const t = state.regions[id]!;
    const isEnemy = t.ownerId !== null && t.ownerId !== BARBARIAN_ID && atWar(state, nationId, t.ownerId);
    const isCapital =
      isEnemy && state.nations.some((n) => n.id === t.ownerId && n.capitalRegionId === id);
    const value =
      t.population * REGION_POP_VALUE +
      (t.resource ? resW : 0) +
      (isCapital ? capW : 0) +
      (isEnemy ? 5 : 2) +
      // The road's next province is what the whole host is being gathered for.
      (onCampaignRoad(campaign, id) ? CAMPAIGN_STEP_VALUE : 0);
    if (value > bestScore) {
      bestScore = value;
      best = id;
    }
  }
  return best;
}

/**
 * The owned staging region (an "anvil") next to `focusId` where the nation should
 * gather its armies — the adjacent owned region already holding the most friendly
 * force, ties by lowest id. Null if no owned region borders the focus.
 */
export function musterRegion(state: GameState, nationId: number, focusId: number): number | null {
  const focus = state.regions[focusId];
  if (!focus) return null;
  let best: number | null = null;
  let bestForce = -1;
  for (const nb of landNeighbours(state, focusId).slice().sort((a, b) => a - b)) {
    const r = state.regions[nb];
    if (!r || r.ownerId !== nationId) continue;
    const force = state.armies
      .filter((a) => !armyIsAtSea(a) && a.ownerId === nationId && a.regionId === nb)
      .reduce((s, a) => s + armySize(a.units), 0);
    if (force > bestForce) {
      bestForce = force;
      best = nb;
    }
  }
  return best;
}

export interface ConcentrationPlan {
  targetId: number;
  musterId: number;
  assaultArmyId: number | null;
  stagingArmyIds: number[];
  ready: boolean;
}

/** Armies physically standing in a region, excluding fleets at sea. */
function stationedArmies(state: GameState, regionId: number, nationId: number): Army[] {
  return state.armies.filter(
    (a) => !armyIsAtSea(a) && !armyIsFleet(a.units) && a.ownerId === nationId && a.regionId === regionId && armySize(a.units) > 0,
  );
}

/** Keep at least one stack in a capital and in any currently threatened home region. */
export function isEssentialDefender(state: GameState, army: Army, nationId: number): boolean {
  const region = state.regions[army.regionId];
  if (!region || region.ownerId !== nationId) return false;
  const capitalId = state.nations.find((n) => n.id === nationId)?.capitalRegionId;
  const stationed = stationedArmies(state, region.id, nationId);
  if (region.id === capitalId && stationed.length <= 1) return true;
  return regionIsThreatened(state, region.id, nationId) && stationed.length <= 1;
}

/**
 * A sole garrison may still redeploy across the same threatened front: moving
 * from one owned border region to another that also borders the chosen target
 * does not abandon the threat, it creates a better-held anvil.
 */
function canStageEssentialDefender(
  state: GameState,
  army: Army,
  nationId: number,
  musterId: number,
  targetId: number,
): boolean {
  if (!isEssentialDefender(state, army, nationId)) return true;
  const capitalId = state.nations.find((n) => n.id === nationId)?.capitalRegionId;
  if (army.regionId === capitalId) return false;
  const current = state.regions[army.regionId];
  const muster = state.regions[musterId];
  return (
    !!current &&
    !!muster &&
    landNeighbours(state, current.id).includes(targetId) &&
    landNeighbours(state, muster.id).includes(targetId)
  );
}

function offensiveMargin(state: GameState, nationId: number): number {
  const aggression = state.nations.find((n) => n.id === nationId)?.personality?.aggression ?? 0.4;
  // Aggressive archetypes accept a narrower edge, but never plan an attack below
  // parity: concentration makes the attack decisive, not suicidal.
  return 1.08 - aggression * 0.06;
}

function targetDefenders(state: GameState, targetId: number, nationId: number): UnitCounts {
  const defenders = emptyUnits();
  const defense = regionDefense(state, targetId, nationId);
  for (const army of defense?.armies ?? []) {
    const visible = publicIntelUnits(state, nationId, army);
    for (const type of UNIT_TYPES) defenders[type] += visible[type];
  }
  return defenders;
}

/**
 * Build one nation-level offensive plan. The plan is recomputed every turn, so
 * it cannot go stale when a target falls or its garrison changes. It reserves
 * essential defenders, stages through one owned anvil, and opens the attack
 * only when the actual assembled stack clears the shared combat forecast.
 */
export function concentrationPlan(
  state: GameState,
  nationId: number,
  campaign: Campaign | null = planCampaign(state, nationId),
): ConcentrationPlan | null {
  const landArmies = state.armies.filter(
    (army) => !armyIsAtSea(army) && !armyIsFleet(army.units) && army.ownerId === nationId && armySize(army.units) > 0,
  );
  if (landArmies.length < 2) return null;
  const targetId = focusTarget(state, nationId, campaign);
  if (targetId === null) return null;
  const musterId = musterRegion(state, nationId, targetId);
  if (musterId === null) return null;

  const atMuster = stationedArmies(state, musterId, nationId).sort((a, b) => armySize(b.units) - armySize(a.units) || a.id - b.id);
  // One stack per owner/region is the invariant; if a malformed state ever holds
  // two, lead with the strongest rather than letting the plan deadlock unready.
  const assault = atMuster[0] ?? null;
  const defenders = targetDefenders(state, targetId, nationId);
  const target = state.regions[targetId]!;
  const force = assault?.units ?? emptyUnits();
  const forecast = previewCombat(force, defenders, {
    terrainDefense: TERRAIN[target.terrain].defense,
    fortification:
      target.fortification + (regionDefense(state, targetId, nationId)?.garrison.entrenchment ?? 0),
  });
  const ready = !!assault && forecast.attack > forecast.defense * offensiveMargin(state, nationId);
  const stagingArmyIds = state.armies
    .filter((army) => {
      if (armyIsAtSea(army) || armyIsFleet(army.units) || army.ownerId !== nationId || army.regionId === musterId) return false;
      if (!canStageEssentialDefender(state, army, nationId, musterId, targetId)) return false;
      return firstStepTowards(state, army.regionId, nationId, (rid) => rid === musterId) !== null;
    })
    .sort((a, b) => armySize(b.units) - armySize(a.units) || a.id - b.id)
    .map((army) => army.id);

  return { targetId, musterId, assaultArmyId: assault?.id ?? null, stagingArmyIds, ready };
}

/** Armies a pending concentration holds back: the assault stack and its stagers. */
export function concentrationReserves(
  state: GameState,
  nationId: number,
  plan: ConcentrationPlan | null,
): Set<number> {
  const reserved = new Set<number>();
  if (!plan || plan.ready) return reserved;
  for (const id of plan.stagingArmyIds) reserved.add(id);
  for (const army of stationedArmies(state, plan.musterId, nationId)) reserved.add(army.id);
  return reserved;
}

/** No stack of another realm stands on this region — walking in simply takes it. */
export function isUndefendedTarget(state: GameState, targetId: number, nationId: number): boolean {
  return armySize(targetDefenders(state, targetId, nationId)) === 0;
}

export interface CapitalDefensePlan {
  capitalId: number;
  armyId: number;
  step: number;
}

/** Find the nearest releasable army that can restore a missing capital garrison. */
export function capitalDefensePlan(state: GameState, nationId: number): CapitalDefensePlan | null {
  const capitalId = state.nations.find((n) => n.id === nationId)?.capitalRegionId;
  const capital = capitalId === undefined ? undefined : state.regions[capitalId];
  if (!capital || capital.ownerId !== nationId || stationedArmies(state, capital.id, nationId).length > 0) return null;
  const candidates = state.armies
    .filter((army) => !armyIsAtSea(army) && !armyIsFleet(army.units) && army.ownerId === nationId && army.movesLeft > 0)
    .filter((army) => !isEssentialDefender(state, army, nationId))
    .map((army) => ({ army, step: firstStepTowards(state, army.regionId, nationId, (rid) => rid === capital.id) }))
    .filter((entry): entry is { army: Army; step: number } => entry.step !== null)
    .sort((a, b) => armySize(b.army.units) - armySize(a.army.units) || a.army.id - b.army.id);
  const best = candidates[0];
  return best ? { capitalId: capital.id, armyId: best.army.id, step: best.step } : null;
}

export interface AmphibiousPlan {
  /** The mixed stack — hulls to sail, soldiers to storm. */
  armyId: number;
  /** The coastal region to land on. */
  targetId: number;
  /** A sea zone the stack can reach that touches the target. */
  zoneId: SeaZoneId;
  /** At sea in that zone already: land this turn instead of sailing. */
  ready: boolean;
}

/**
 * Whether any land a realm holds borders `regionId` by land — i.e. whether the
 * army can simply walk there. Anything it cannot walk to and still wants must
 * be taken from the water.
 */
function reachableOverland(state: GameState, regionId: number, nationId: number): boolean {
  return state.regions.some(
    (r) => r.ownerId === nationId && landNeighbours(state, r.id).includes(regionId),
  );
}

/**
 * The realm's amphibious operation this turn, if it has one.
 *
 * Once the sea became a real obstacle (data/maps/hansa.ts `seaCrossings`),
 * England, Zealand, Gotland and Ösel became islands — which is the period's
 * actual geography, and would also have made four realms permanently
 * unconquerable if the rivals had no way to cross. This is that way: a stack
 * holding both hulls and soldiers sails to a sea zone touching the prize, and
 * lands on it. `moveArmy` already resolves the landing as an assault with the
 * ships standing offshore (`landAssaultForce`), so nothing new happens in
 * combat — the AI simply now reaches for it.
 *
 * Deterministic: the richest reachable prize, ties by lowest region id.
 */
export function amphibiousPlan(
  state: GameState,
  nationId: number,
  campaign: Campaign | null = planCampaign(state, nationId),
): AmphibiousPlan | null {
  const p = state.nations.find((n) => n.id === nationId)?.personality;
  const stacks = state.armies.filter(
    (a) =>
      a.ownerId === nationId &&
      a.movesLeft > 0 &&
      armyIsFleet(a.units) &&
      armyHasLandUnits(a.units) &&
      armySize(a.units) > 0,
  );
  if (stacks.length === 0) return null;

  let best: AmphibiousPlan | null = null;
  let bestScore = 0;
  for (const target of state.regions) {
    if (target.terrain !== "coast") continue; // a landing needs a shore
    if (!isAttackable(state, target.id, nationId)) continue;
    if (reachableOverland(state, target.id, nationId)) continue; // just walk
    const isKontor = KONTOR_IDS.some((id) => KONTORE[id].regionId === target.id);
    const isCapital = state.nations.some((n) => n.id === target.ownerId && n.capitalRegionId === target.id);
    const value =
      target.population * REGION_POP_VALUE +
      (isKontor ? KONTOR_VALUE * strategyProfile(state.nations.find((n) => n.id === nationId)).kontorPrize : 0) +
      (isCapital ? CAPITAL_VALUE * (0.5 + (p?.aggression ?? 0.4)) : 0) +
      (onCampaignRoad(campaign, target.id) || campaign?.objectiveId === target.id ? CAMPAIGN_STEP_VALUE : 0);
    if (value <= bestScore) continue;

    // A landing is only worth ordering if the stack can actually take the beach.
    const defenders = targetDefenders(state, target.id, nationId);
    for (const stack of [...stacks].sort((a, b) => armySize(b.units) - armySize(a.units) || a.id - b.id)) {
      const { storm } = landAssaultForce(stack.units);
      if (armySize(storm) === 0) continue;
      const forecast = previewCombat(storm, defenders, {
        terrainDefense: TERRAIN[target.terrain].defense,
        fortification:
          target.fortification + (regionDefense(state, target.id, nationId)?.garrison.entrenchment ?? 0),
      });
      if (forecast.attack <= forecast.defense * offensiveMargin(state, nationId)) continue;
      const zones = reachableSeaZones(state, stack).filter((zoneId) =>
        SEA_ZONES[zoneId].coastalRegions.includes(target.id),
      );
      const here = stack.seaZoneId;
      if (here !== undefined && SEA_ZONES[here].coastalRegions.includes(target.id)) {
        best = { armyId: stack.id, targetId: target.id, zoneId: here, ready: true };
        bestScore = value;
        break;
      }
      const zone = zones[0];
      if (zone === undefined) continue;
      best = { armyId: stack.id, targetId: target.id, zoneId: zone, ready: false };
      bestScore = value;
      break;
    }
  }
  return best;
}

/**
 * March a spare land stack to a port where hulls are waiting, so the realm can
 * form the mixed stack an amphibious operation needs. Only bothers when there is
 * something across the water actually worth taking.
 */
function boardForInvasion(state: GameState, nationId: number, campaign: Campaign | null, rng: Rng): GameState {
  // Something over the water we want, and no stack yet able to carry troops to it.
  const wants = state.regions.some(
    (r) =>
      r.terrain === "coast" &&
      isAttackable(state, r.id, nationId) &&
      !reachableOverland(state, r.id, nationId) &&
      (onCampaignRoad(campaign, r.id) ||
        campaign?.objectiveId === r.id ||
        KONTOR_IDS.some((id) => KONTORE[id].regionId === r.id)),
  );
  if (!wants) return state;
  const port = state.armies.find(
    (a) => a.ownerId === nationId && !armyIsAtSea(a) && armyIsFleet(a.units) && !armyHasLandUnits(a.units),
  );
  if (!port) return state;
  const soldiers = state.armies
    .filter(
      (a) =>
        a.ownerId === nationId &&
        !armyIsAtSea(a) &&
        !armyIsFleet(a.units) &&
        a.movesLeft > 0 &&
        armySize(a.units) > 0 &&
        !isEssentialDefender(state, a, nationId),
    )
    .sort((a, b) => armySize(b.units) - armySize(a.units) || a.id - b.id);
  for (const army of soldiers) {
    const step = firstStepTowards(state, army.regionId, nationId, (rid) => rid === port.regionId);
    if (step !== null) return moveArmy(state, army.id, step, rng);
  }
  return state;
}

/** Raise and move a small navy: rivals patrol their trade approaches and seek
 * enemy ports at sea, while peaceful merchants keep a single escort afloat. */
function manageNavy(state: GameState, nationId: number, rng: Rng): GameState {
  const nation = state.nations.find((n) => n.id === nationId);
  if (!nation) return state;
  const aggression = nation.personality?.aggression ?? 0.4;
  const atWarNow = state.nations.some(
    (other) => !other.isBarbarian && other.id !== nationId && atWar(state, nationId, other.id),
  );
  const hasTrade = (state.routes ?? []).some((route) => route.ownerId === nationId);
  const plan = strategyProfile(nation);
  const desired =
    (atWarNow || hasTrade || aggression >= 0.6 ? (atWarNow && aggression >= 0.7 ? 2 : 1) : 0) +
    // Lanes are the fifth of Hansa control a fleet can actually take and hold.
    plan.navy;
  let s = state;
  const fleets = (): Army[] => s.armies.filter((a) => a.ownerId === nationId && armyIsFleet(a.units));

  if (fleets().length < desired) {
    const port = s.regions
      .filter((r) => r.ownerId === nationId && r.terrain === "coast")
      .sort((a, b) => a.id - b.id)[0];
    if (port && canRaiseUnit(s, port.id, "war_cog", nationId).ok) s = raiseUnit(s, port.id, "war_cog", nationId);
  }

  for (const fleet of [...fleets()].sort((a, b) => a.id - b.id)) {
    const live = s.armies.find((a) => a.id === fleet.id);
    if (!live || live.movesLeft <= 0) continue;
    const choices = reachableSeaZones(s, live);
    if (choices.length === 0) continue;
    const scored = choices
      .map((zoneId) => ({ zoneId, score: seaZoneValue(s, nationId, zoneId, live.id) }))
      .sort((a, b) => b.score - a.score || SEA_ZONE_IDS.indexOf(a.zoneId) - SEA_ZONE_IDS.indexOf(b.zoneId));
    const target = scored[0];
    if (!target) continue;
    // Sail only for a *better* sea than the one already held. Comparing against
    // the current zone keeps a patrol on station instead of circling every turn,
    // and the crowding penalty inside the score sends the second cog elsewhere
    // rather than piling every realm's navy onto the same lane.
    const here = live.seaZoneId === undefined ? null : seaZoneValue(s, nationId, live.seaZoneId, live.id);
    if (here === null ? target.score > 0 || atWarNow : target.score > here) {
      s = sailToSeaZone(s, live.id, target.zoneId, rng);
    }
  }
  return s;
}

/**
 * What a sea zone is worth to one realm's navy this turn: hostile fleets to
 * break first, then enemy ports to watch, then its own shores and trade lanes to
 * cover — minus a crowding penalty for hulls already sitting there, so a navy
 * spreads out instead of stacking on one label. Pure and deterministic.
 */
function seaZoneValue(state: GameState, nationId: number, zoneId: SeaZoneId, movingArmyId: number): number {
  const zone = SEA_ZONES[zoneId];
  let enemyShips = 0;
  let ownShips = 0;
  let neutralShips = 0;
  for (const a of state.armies) {
    if (!armyIsAtSea(a) || a.seaZoneId !== zoneId || !armyIsFleet(a.units) || a.id === movingArmyId) continue;
    if (a.ownerId === nationId) ownShips++;
    else if (a.ownerId === BARBARIAN_ID || atWar(state, nationId, a.ownerId)) enemyShips++;
    else neutralShips++;
  }
  let enemyPorts = 0;
  let homePorts = 0;
  for (const regionId of zone.coastalRegions) {
    const owner = state.regions[regionId]?.ownerId;
    if (owner === undefined || owner === null) continue;
    if (owner === nationId) homePorts++;
    else if (owner !== BARBARIAN_ID && atWar(state, nationId, owner)) enemyPorts++;
  }
  const ownRoutes = (state.routes ?? []).filter(
    (route) =>
      route.ownerId === nationId &&
      [route.fromRegionId, ...route.lane].some((regionId) => zone.coastalRegions.includes(regionId)),
  ).length;
  return (
    enemyShips * 100 +
    enemyPorts * 10 +
    homePorts * 4 +
    ownRoutes * 3 -
    ownShips * 25 -
    neutralShips * 2
  );
}

function recruit(state: GameState, nationId: number, rng: Rng): GameState {
  const nation = state.nations.find((n) => n.id === nationId);
  if (!nation) return state;
  const p = nation.personality;
  const aggression = p?.aggression ?? 0.4;
  const atWarNow = state.nations.some(
    (o) => !o.isBarbarian && o.id !== nationId && atWar(state, nationId, o.id),
  );
  const myUnits = state.armies
    .filter((a) => a.ownerId === nationId)
    .reduce(
      (sum, a) =>
        sum + UNIT_TYPES.reduce((count, type) => count + (UNITS[type].naval ? 0 : a.units[type]), 0),
      0,
    );

  // Warlords keep a bigger standing army; everyone raises more in wartime; a
  // Martial realm (cheaper units) fields a larger host and leans on it. R5.1: a rich,
  // aggressive realm turns its treasury into military weight — gold finally buys a
  // bigger host (drawn on by ongoing upkeep) instead of piling up unused. Capped and
  // aggression-scaled, so a peaceful realm's hoard doesn't militarise.
  const wealthLevies = Math.min(8, Math.max(0, Math.floor((nation.stocks.gold - 400) / 600)));
  // The plan sets the size of the host: a conqueror keeps a third again more
  // under arms than its temperament alone would ask for; a realm playing the
  // ledger keeps less and spends the difference on the network.
  const plan = strategyProfile(nation);
  // A realm with a road to walk needs a host that can walk it. Without this a
  // merchant on campaign keeps a merchant's army (plan.army 0.8) and stalls at
  // the first walled town on the way to the Kontor it is playing for.
  const wanted = Math.round(
    (3 + Math.round(aggression * 6) + (atWarNow ? 3 : 0) + (nation.trait === "martial" ? 3 : 0) +
      Math.round(aggression * wealthLevies)) * plan.army,
  );
  if (myUnits >= wanted) return state;
  if (nation.stocks.gold < 30) return state;

  // Recruit in the capital-ish region (first owned with an army, else first owned).
  const home =
    state.armies.find(
      (a) =>
        a.ownerId === nationId &&
        !armyIsAtSea(a) &&
        state.regions[a.regionId]?.ownerId === nationId,
    )?.regionId ??
    state.regions.find((r) => r.ownerId === nationId)?.id;
  if (home === undefined) return state;

  // Composition-aware: bring siege against fortified frontier targets and units
  // that counter the enemy's actual mix, falling back to a generalist plan when
  // there's no intel — rather than always defaulting to infantry.
  const pref = planRecruitment(state, nationId);
  let s = state;
  let pick = pref.find((u) => canRaiseUnit(s, home, u, nationId).ok);
  if (!pick) {
    // Nothing raisable — but "nothing raisable" usually meant "short of one
    // ware", not "short of means". Measured over 120-turn autoplays, rivals sat
    // on the treasury cap (~2 550 gold) for a hundred turns while every muster
    // was refused for want of timber, because the market pass only tops up
    // build wares in *aggregate* (a realm rich in brick never buys timber) and
    // only buys iron for war. So a realm's gold could not become soldiers, and
    // the whole board froze at four provinces and six men a realm.
    s = supplyMuster(s, nationId, home, pref);
    if (s === state) return state;
    pick = pref.find((u) => canRaiseUnit(s, home, u, nationId).ok);
    if (!pick) return s;
  }
  void rng;
  return raiseUnit(s, home, pick, nationId);
}

/** Gold a realm keeps back when buying the stores for a muster. */
const AI_MUSTER_FLOOR = 120;

/**
 * Buy the wares that are actually blocking the next muster.
 *
 * Walks the realm's own recruitment preference and stops at the first unit that
 * nothing but a ware shortfall stands in the way of — the tech is researched,
 * the strategic access is held, the gold is there — and buys exactly the
 * shortfall. A realm short on tech or iron ore is left alone: this converts
 * coin into soldiers, it does not conjure a smithy. Pure.
 */
function supplyMuster(
  state: GameState,
  nationId: number,
  home: number,
  pref: UnitType[],
): GameState {
  const nation = state.nations.find((n) => n.id === nationId);
  if (!nation || nation.stocks.gold <= AI_MUSTER_FLOOR) return state;
  const focus = state.regions[home]?.focus;
  for (const unit of pref) {
    const def = UNITS[unit];
    if (def.requiresTech && !nation.research.done.includes(def.requiresTech)) continue;
    if (def.requires && !strategicAccess(state, nationId).has(def.requires)) continue;
    if (def.naval && state.regions[home]?.terrain !== "coast") continue;
    const cost = unitCost(nation, unit, focus);
    if (nation.stocks.gold < cost.gold + AI_MUSTER_FLOOR) continue;
    let s = state;
    let bought = false;
    for (const good of Object.keys(cost.wares) as GoodId[]) {
      const need = (cost.wares[good] ?? 0) - (s.nations.find((n) => n.id === nationId)?.wares[good] ?? 0);
      if (need <= 0) continue;
      const before = s;
      s = aiImport(s, nationId, good, AI_MUSTER_FLOOR + cost.gold, need);
      if (s === before) return state; // cannot cover this one — try nothing further
      bought = true;
    }
    if (bought) return s;
  }
  return state;
}

/** What this nation is likely to fight next: enemy mix + toughest target fort. */
interface ThreatProfile {
  /** Summed unit counts of hostile armies on or next to our border. */
  composition: UnitCounts;
  /** Highest fortification among attackable frontier targets. */
  maxTargetFort: number;
  /** Whether any attackable target borders our territory at all. */
  hasTarget: boolean;
}

function assessThreat(state: GameState, nationId: number): ThreatProfile {
  const owned = state.regions.filter((r) => r.ownerId === nationId);
  const ownedIds = new Set(owned.map((r) => r.id));
  const targetIds = new Set<number>();
  let maxTargetFort = 0;
  for (const r of owned) {
    for (const nb of landNeighbours(state, r.id)) {
      if (isAttackable(state, nb, nationId)) {
        targetIds.add(nb);
        maxTargetFort = Math.max(maxTargetFort, state.regions[nb]!.fortification);
      }
    }
  }

  // Hostile armies within reach: standing on a target, or one step from our land.
  const composition = emptyUnits();
  for (const a of state.armies) {
    if (a.ownerId === nationId || a.ownerId === null) continue;
    const hostile = a.ownerId === BARBARIAN_ID || atWar(state, nationId, a.ownerId);
    if (!hostile) continue;
    if (armyIsAtSea(a)) continue;
    const onTarget = targetIds.has(a.regionId);
    const nearOurLand = landNeighbours(state, a.regionId).some((n) => ownedIds.has(n));
    if (onTarget || nearOurLand) {
      const visible = publicIntelUnits(state, nationId, a);
      for (const t of UNIT_TYPES) composition[t] += visible[t];
    }
  }

  return { composition, maxTargetFort, hasTarget: targetIds.size > 0 };
}

/** The enemy's most numerous field unit (siege excluded), or null if none seen. */
function dominantFieldUnit(composition: UnitCounts): UnitType | null {
  let best: UnitType | null = null;
  let bestCount = 0;
  for (const t of UNIT_TYPES) {
    if (t === "siege") continue;
    if (composition[t] > bestCount) {
      bestCount = composition[t];
      best = t;
    }
  }
  return best;
}

function myUnitCount(state: GameState, nationId: number, unit: UnitType): number {
  let sum = 0;
  for (const a of state.armies) if (a.ownerId === nationId) sum += a.units[unit];
  return sum;
}

/**
 * Ordered recruitment preference for a nation given the current threat picture:
 *   1. Siege, when a fortified target needs breaking and we lack enough of it.
 *   2. The counter to the enemy's dominant field unit.
 *   3. A generalist fallback (cavalry if we have horses, then infantry/ranged/militia).
 * Pure and deterministic — a plain function of state, easily unit-tested.
 */
export function planRecruitment(state: GameState, nationId: number): UnitType[] {
  const access = strategicAccess(state, nationId);
  const threat = assessThreat(state, nationId);
  const pref: UnitType[] = [];

  // 1) Siege to strip forts a split field force can't crack — but only up to the
  //    number of siege units needed for the toughest target, so armies don't turn
  //    into all-siege stacks (siege is weak in the open field).
  const neededSiege = Math.ceil(threat.maxTargetFort / UNITS.siege.siegePower);
  if (threat.maxTargetFort >= 1 && myUnitCount(state, nationId, "siege") < neededSiege) {
    pref.push("siege");
  }

  // 2) Counter the enemy's dominant field unit — the strongest available counter
  //    first (Pikemen over Militia vs cavalry, etc.); canRaiseUnit gates by tech.
  const dominant = dominantFieldUnit(threat.composition);
  if (dominant) {
    const counters = UNIT_TYPES.filter((t) => UNITS[t].counters === dominant).sort(
      (a, b) => UNITS[b].attack + UNITS[b].defense - (UNITS[a].attack + UNITS[a].defense),
    );
    pref.push(...counters);
  }

  // 3) Generalist fallback — a balanced core army (so the default host isn't an
  //    all-glass-cannon stack); the premium late units sit behind it, reached only
  //    when the core is unbuildable or via the counter above.
  if (access.has("horses")) pref.push("cavalry", "knight");
  pref.push("infantry", "swordsman", "ranged", "pikeman", "handgunner", "militia");

  return [...new Set(pref)];
}

/**
 * The best adjacent region for an army to attack, or null to hold.
 *
 * `campaign` is the realm's war aim (systems/campaign.ts); pass it in to keep
 * the road's next province ahead of whichever neighbour is merely softest.
 * Omitted, it is read from the realm — cheap, since a realm with no aim returns
 * immediately without pathfinding.
 */
export function bestTarget(
  state: GameState,
  army: { id: number; regionId: number; units: Record<UnitType, number> },
  nationId: number,
  campaign: Campaign | null = planCampaign(state, nationId),
): number | null {
  const region = state.regions[army.regionId];
  if (!region) return null;
  const atk = sideStrength(army.units, zeroUnits(), "attack");

  // Archetype-weighted prizes: warlike nations covet enemy capitals (a
  // crippling strike at the rival's heartland), economic ones covet strategic
  // resources. Same scoring code, personality shifts what "valuable" means.
  const p = state.nations.find((n) => n.id === nationId)?.personality;
  const capitalValue = CAPITAL_VALUE * (0.5 + (p?.aggression ?? 0.4));
  const resourceValue = RESOURCE_VALUE * (0.5 + (p?.economy ?? 0.5));

  let best: number | null = null;
  let bestScore = 0;
  for (const nid of landNeighbours(state, army.regionId)) {
    const target = state.regions[nid];
    if (!target || target.ownerId === nationId) continue;

    const isBarb = target.ownerId === BARBARIAN_ID;
    const isEnemy = target.ownerId !== null && !isBarb && atWar(state, nationId, target.ownerId);
    if (!isBarb && !isEnemy) continue; // don't attack nations we're at peace with
    // Honour the player's early-game grace: don't invade them before it lapses.
    if (target.ownerId === PLAYER_ID && state.turn < earlyPeaceTurns(state)) continue;

    const defenders = targetDefenders(state, nid, nationId);
    const garrison = regionDefense(state, nid, nationId)?.garrison;
    const def = armySize(defenders) > 0
      ? sideStrength(defenders, army.units, "defense") * 1.2 +
        (target.fortification + (garrison?.entrenchment ?? 0)) * 3
      : 0;

    // Winnable if our attack clearly exceeds their defence.
    if (atk > def * 1.1) {
      // Among winnable targets, prefer a bigger margin, an enemy nation over
      // neutral barbarians, and a *valuable* prize: population is economic
      // worth, a strategic resource unlocks units, an enemy CAPITAL is a
      // crippling strike — each weighted by this nation's archetype above.
      const isCapital =
        isEnemy &&
        state.nations.some((n) => n.id === target.ownerId && n.capitalRegionId === target.id);
      // Reclaiming our own breakaway land (a seceded or defected region that
      // still remembers us) is a priority — close the defection loop (E5).
      const isReclaim = target.priorOwnerId === nationId;
      const isKontor = KONTOR_IDS.some((id) => KONTORE[id].regionId === target.id);
      const value =
        target.population * REGION_POP_VALUE +
        (target.resource ? resourceValue : 0) +
        (isCapital ? capitalValue : 0) +
        (isReclaim ? RECLAIM_VALUE : 0) +
        // Merchant-minded realms want the Kontor most, but nobody ignores it.
        (isKontor
          ? KONTOR_VALUE *
            (0.6 + (p?.economy ?? 0.5) * 0.8) *
            strategyProfile(state.nations.find((n) => n.id === nationId)).kontorPrize
          : 0) +
        // The next province on the campaign road outranks a softer neighbour:
        // this is the whole difference between a realm that takes what borders
        // it and one that is *going somewhere*.
        (onCampaignRoad(campaign, nid) ? CAMPAIGN_STEP_VALUE : 0);
      const score = atk - def + value + (isBarb ? 2 : 5);
      if (score > bestScore) {
        bestScore = score;
        best = nid;
      }
    }
  }
  return best;
}

/** How much a point of target population weighs in AI attack targeting. */
const REGION_POP_VALUE = 1.5;
/** Base weight for a target region holding a strategic resource (iron/horses). */
const RESOURCE_VALUE = 6;
/** Base weight for an enemy nation's capital (scaled by attacker aggression). */
const CAPITAL_VALUE = 10;
/** Weight for retaking a region that broke away from us (seceded/defected). */
const RECLAIM_VALUE = 9;
/**
 * A Kontor town is the richest prize on the board and the fixed point of the
 * trade race (systems/hansa.ts): whoever holds Novgorod, Bergen, Bruges or
 * London holds a quarter of the network. Rivals must covet them, or the trade
 * victory has no antagonist — measured before this, no AI realm ever pushed
 * past ~50% control because it took Kontor towns only by accident.
 */
const KONTOR_VALUE = 14;
/**
 * Weight for the next province on a realm's campaign road (systems/campaign.ts).
 * It has to beat the ordinary prize terms outright, or a realm three provinces
 * from Novgorod would keep wandering off after whichever neighbour was softest
 * this turn and never arrive — which is exactly the behaviour that made the
 * trade race un-winnable for the AI.
 */
const CAMPAIGN_STEP_VALUE = 26;
/**
 * Extra power edge a realm wants before opening a war purely to clear a road.
 * A war of passage is a war the realm *chose*, and it still has to reach the
 * objective afterwards. Measured over twelve 160-turn autoplays, this figure is
 * what keeps campaigns from turning the board into a brawl: with it, realms at
 * war sit around 2% of realm-pairs on an average turn against 1.1% without
 * campaigns at all, and half again as many Kontor towns change hands.
 */
const CAMPAIGN_WAR_CAUTION = 0.3;

// --- small helpers ----------------------------------------------------------

function setTax(state: GameState, nationId: number, rate: number): GameState {
  const nations = state.nations.map((n) =>
    n.id === nationId ? { ...n, taxRate: clampTax(rate) } : n,
  );
  return { ...state, nations };
}

function queueFor(state: GameState, regionId: number, building: BuildingId, ownerId: number): GameState {
  const region = state.regions[regionId];
  if (!region || region.ownerId !== ownerId || region.buildings.includes(building)) return state;
  const regions = state.regions.map((r) =>
    r.id === regionId ? { ...r, construction: { building, progress: 0 } } : r,
  );
  return { ...state, regions };
}

function zeroUnits(): Record<UnitType, number> {
  const u = {} as Record<UnitType, number>;
  for (const t of UNIT_TYPES) u[t] = 0;
  return u;
}
