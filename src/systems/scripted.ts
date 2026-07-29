/**
 * A scripted player — the measuring instrument for balance work.
 *
 * Every autoplay this project has run so far left the player's realm sitting on
 * its hands, so every number we have describes a world of rivals and an inert
 * sixteenth realm. That is fine for asking "do rivals fight too much"; it is
 * useless for asking "can the trade victory be *won*", because the answer to
 * that depends entirely on what a realm played well can reach — and nobody had
 * ever measured it.
 *
 * This is that realm: a competent, trade-first player, expressed as one pure
 * turn of intents. It plays the game the way the design says the game wants to
 * be played (docs/game-design.md §Direction — "trade first"):
 *
 *   • research beelines the League charter, then the doctrines that pay trade
 *   • the treasury keeps the larder full and the building slots busy
 *   • the route book is kept full, richest option first, and pruned of any
 *     route that has stopped paying
 *   • the League is founded the moment it can be, and led
 *   • a hull is kept in every sea the realm has a coast on — the lane strand is
 *     the one nobody was contesting
 *   • the army is defensive: a garrison at home, and no wars of choice
 *
 * It is *not* the rival AI. The rival AI is temperament-driven and plays for
 * whichever victory its plan wants; this plays one strategy, well, so a strand
 * of `hansaControl` can be read as "this is what trade alone reaches".
 *
 * Pure over `GameState`, deterministic given the passed Rng. No DOM. It ships
 * because it is unit-tested and reusable — every future balance question wants
 * a yardstick, and a yardstick kept in a scratch file rots.
 */

import type { GoodId } from "@/data/goods";
import { buyWare, marketBuyPrice } from "@/systems/market";
import type { KontorId } from "@/data/kontore";
import { SEA_ZONES, SEA_ZONE_IDS, type SeaZoneId } from "@/data/sea";
import { UNITS, UNIT_TYPES, type UnitType } from "@/data/units";
import type { DoctrinePathId } from "@/data/techs";
import { chooseBuilding, desiredTaxRate, manageMarket, regionIsThreatened } from "@/systems/ai";
import { canFoundLeague, canJoinLeague, foundLeague, hasHanseHall, joinLeague } from "@/systems/league";
import { acceptOffer, atWar, makePeace } from "@/systems/diplomacy";
import {
  armyIsAtSea,
  armyIsFleet,
  canRaiseUnit,
  fortifyArmy,
  moveArmy,
  raiseUnit,
  reachableSeaZones,
  unitCost,
  sailToSeaZone,
} from "@/systems/military";
import { canResearch, isPathRejected, nextNodeInPath, researchFrontier } from "@/systems/tech";
import { eraIndexForTurn } from "@/data/eras";
import { canQueueBuilding, chooseResearch, queueBuilding, setTaxRate } from "@/systems/turn";
import { closeRoute, createRoute, routeIncome, routeOptions } from "@/systems/trade";
import type { Rng } from "@/systems/rng";
import {
  MAX_ROUTES_PER_NATION,
  PLAYER_ID,
  armySize,
  landNeighbours,
  type GameState,
  type Region,
} from "@/systems/state";

/**
 * What a trade realm researches, in the order it wants it: the League charter
 * first (the Hanse Hall is the seat, and the League strand is a fifth of the
 * race), then the monopoly doctrines that raise what a route pays, then the
 * shipping that widens the lanes.
 */
const DOCTRINE_ORDER: DoctrinePathId[] = [
  "league_federation",
  "staple_monopoly",
  "merchant_marine",
  "open_markets",
  "naval_power",
  "free_cities",
];

/** Hulls the realm wants afloat in each sea it has a coast on. */
const HULLS_PER_SEA = 1;
/** Land units it keeps for defence — enough to garrison, never to invade. */
const HOME_GARRISON = 4;
/** Gold kept back from the muster so the market work always comes first. */
const WAR_CHEST_FLOOR = 150;

/**
 * One turn of a competent trade realm's orders. Call it before `resolveTurn`,
 * exactly where the UI would have applied the player's clicks.
 */
export function playScriptedTurn(state: GameState, nationId = PLAYER_ID, rng?: Rng): GameState {
  let s = state;
  if (!s.nations.find((n) => n.id === nationId)?.alive) return s;
  s = scriptResearch(s, nationId);
  s = scriptTax(s, nationId);
  s = scriptBuildings(s, nationId);
  s = manageMarket(s, nationId);
  s = scriptPeace(s, nationId);
  s = scriptRoutes(s, nationId);
  s = scriptLeague(s, nationId);
  s = scriptNavy(s, nationId, rng);
  s = scriptDefence(s, nationId, rng);
  return s;
}

/**
 * Keep a tech in progress, following the trade realm's doctrine order — and
 * fall through to the next path when the one it wants is era-locked, rather
 * than banking knowledge it cannot spend. (The first version of this returned
 * on the *choice* rather than on the choice taking effect, and the realm sat on
 * 192 knowledge for eighty turns waiting for an era that had not arrived.)
 */
function scriptResearch(state: GameState, nationId: number): GameState {
  const nation = state.nations.find((n) => n.id === nationId);
  if (!nation || nation.research.current) return state;
  const era = eraIndexForTurn(state.turn);
  for (const path of DOCTRINE_ORDER) {
    if (isPathRejected(nation.research.done, path)) continue;
    const next = nextNodeInPath(nation.research.done, path);
    if (next && canResearch(nation.research.done, next, era)) return chooseResearch(state, next, nationId);
  }
  // Nothing on plan is open: take anything affordable so the knowledge works.
  for (const tech of researchFrontier(nation.research.done, era)) {
    const taken = chooseResearch(state, tech, nationId);
    if (taken !== state) return taken;
  }
  return state;
}

/** The same unrest-aware tax read the rivals use — a competent player's read too. */
function scriptTax(state: GameState, nationId: number): GameState {
  const nation = state.nations.find((n) => n.id === nationId);
  if (!nation) return state;
  const owned = state.regions.filter((r) => r.ownerId === nationId);
  return setTaxRate(state, desiredTaxRate(nation, owned), nationId);
}

/** Fill every idle building slot, favouring the larder and the ware chest. */
function scriptBuildings(state: GameState, nationId: number): GameState {
  const nation = state.nations.find((n) => n.id === nationId);
  if (!nation) return state;
  let s = state;
  const wareStock = nation.wares.timber + nation.wares.brick + nation.wares.iron + nation.wares.naval_stores;
  const hints = {
    needFood: nation.famine || nation.stocks.food < 12,
    needBuildWares: wareStock < 24,
    needLuxury: false,
  };
  for (const region of s.regions) {
    if (region.ownerId !== nationId || region.construction) continue;
    // The Hanse Hall before anything else once the charter is law: it is the
    // League's seat, the League strand is a fifth of the race, and a realm that
    // misses the founding is shut out of every Kontor the League then holds.
    const hall =
      !hasHanseHall(s, nationId) && canQueueBuilding(region, "hanse_hall", nation.research.done)
        ? "hanse_hall"
        : null;
    const pick = hall ?? chooseBuilding(region, nation.research.done, nation.trait, hints);
    if (pick) s = queueBuilding(s, region.id, pick, nationId);
  }
  return s;
}

/**
 * Keep the route book full and paying. Every turn: drop any route that has
 * stopped earning (a severed lane, a shuttered Kontor), then open the richest
 * option available anywhere in the realm until the book is full. This is the
 * one thing a trade player does that the rival AI barely does at all.
 */
function scriptRoutes(state: GameState, nationId: number): GameState {
  let s = state;
  for (const route of (s.routes ?? []).filter((r) => r.ownerId === nationId)) {
    if (routeIncome(s, route) <= 0) s = closeRoute(s, route.id, nationId);
  }
  for (;;) {
    const open = (s.routes ?? []).filter((r) => r.ownerId === nationId).length;
    if (open >= MAX_ROUTES_PER_NATION) break;
    let best: { regionId: number; good: GoodId; kontor: KontorId; income: number } | null = null;
    for (const region of s.regions) {
      if (region.ownerId !== nationId) continue;
      for (const option of routeOptions(s, region.id, nationId)) {
        if (!best || option.income > best.income) {
          best = { regionId: region.id, good: option.good, kontor: option.toKontorId, income: option.income };
        }
      }
    }
    if (!best) break;
    const next = createRoute(s, nationId, best.regionId, best.good, best.kontor);
    if (next === s) break; // refused for a reason the options list did not model
    s = next;
  }
  return s;
}

/**
 * End wars, and take any peace offered.
 *
 * A trade realm has no use for a war, and one open war with a League member is
 * enough to bar it from the League for good (`canJoinLeague` wants peace with
 * every member) — which in the first measured run cost the scripted realm the
 * entire race from turn 24 onward.
 */
function scriptPeace(state: GameState, nationId: number): GameState {
  let s = state;
  for (const offer of s.offers.filter((o) => o.to === nationId)) {
    if (offer.type === "peace" || offer.type === "nap" || offer.type === "alliance") {
      s = acceptOffer(s, offer.id);
    }
  }
  for (const other of s.nations) {
    if (other.isBarbarian || other.id === nationId || !other.alive) continue;
    if (!atWar(s, nationId, other.id)) continue;
    s = other.isPlayer ? s : makePeace(s, nationId, other.id);
  }
  return s;
}

/** Found the League as soon as the charter and a Kontor allow; else join it. */
function scriptLeague(state: GameState, nationId: number): GameState {
  if (canFoundLeague(state, nationId)) return foundLeague(state, nationId);
  if (canJoinLeague(state, nationId)) return joinLeague(state, nationId);
  return state;
}

/**
 * Keep a hull in every sea the realm has a coast on.
 *
 * This is the strand nobody contests: lane control is two thirds the share of a
 * sea's held ports that are yours and one third being able to deny the water,
 * and a realm with no fleet scores zero on the second part of all six seas.
 */
function scriptNavy(state: GameState, nationId: number, rng?: Rng): GameState {
  let s = state;
  const seas = seasTouched(s, nationId);
  if (seas.length === 0) return s;

  // Raise a cog at a port when short of hulls, cheapest useful ship first.
  const fleets = (): number =>
    s.armies.filter((a) => a.ownerId === nationId && armyIsFleet(a.units)).length;
  if (fleets() < seas.length * HULLS_PER_SEA) {
    const port = s.regions.find((r) => r.ownerId === nationId && r.terrain === "coast");
    if (port) {
      const hulls = (UNIT_TYPES.filter((u) => UNITS[u].naval) as UnitType[]).sort(
        (a, b) => UNITS[a].cost.gold - UNITS[b].cost.gold,
      );
      let ship = hulls.find((u) => canRaiseUnit(s, port.id, u, nationId).ok);
      if (!ship) {
        // A shipyard short of naval stores is a market problem, not a hard stop —
        // a realm with a treasury buys the timber and the tar. Without this the
        // realm launched exactly one cog a game and the lane strand stayed at 7.
        s = buyShipStores(s, nationId, port.id, hulls[0]);
        ship = hulls.find((u) => canRaiseUnit(s, port.id, u, nationId).ok);
      }
      if (ship) s = raiseUnit(s, port.id, ship, nationId);
    }
  }

  // Spread the hulls: send each idle fleet to the nearest sea we do not hold.
  for (const fleet of s.armies.filter((a) => a.ownerId === nationId && armyIsFleet(a.units) && a.movesLeft > 0)) {
    const held = new Set(
      s.armies
        .filter((a) => a.ownerId === nationId && armyIsAtSea(a) && a.seaZoneId !== undefined && a.id !== fleet.id)
        .map((a) => a.seaZoneId as SeaZoneId),
    );
    if (armyIsAtSea(fleet) && !held.has(fleet.seaZoneId as SeaZoneId)) continue; // already holding one
    const want = reachableSeaZones(s, fleet).find((zone) => seas.includes(zone) && !held.has(zone));
    if (want !== undefined) s = sailToSeaZone(s, fleet.id, want, rng);
  }
  return s;
}

/** Buy exactly the wares a hull is short of, keeping a working reserve. */
function buyShipStores(state: GameState, nationId: number, portId: number, ship: UnitType | undefined): GameState {
  if (!ship) return state;
  const nation = state.nations.find((n) => n.id === nationId);
  if (!nation) return state;
  const cost = unitCost(nation, ship, state.regions[portId]?.focus);
  if (nation.stocks.gold < cost.gold + WAR_CHEST_FLOOR) return state;
  let s = state;
  for (const good of Object.keys(cost.wares) as GoodId[]) {
    const have = s.nations.find((n) => n.id === nationId)?.wares[good] ?? 0;
    const need = (cost.wares[good] ?? 0) - have;
    if (need <= 0) continue;
    const gold = s.nations.find((n) => n.id === nationId)?.stocks.gold ?? 0;
    const afford = Math.floor((gold - cost.gold - WAR_CHEST_FLOOR) / marketBuyPrice(good));
    if (afford < need) return state;
    s = buyWare(s, nationId, good, need);
  }
  return s;
}

/** The seas this realm has a coast on — the only water its ports can work. */
function seasTouched(state: GameState, nationId: number): SeaZoneId[] {
  return SEA_ZONE_IDS.filter((id) =>
    SEA_ZONES[id].coastalRegions.some((rid) => state.regions[rid]?.ownerId === nationId),
  );
}

/**
 * A defensive army and nothing more: keep a garrison, hold threatened ground,
 * dig in. A trade realm that marches is measuring the wrong thing.
 */
function scriptDefence(state: GameState, nationId: number, rng?: Rng): GameState {
  let s = state;
  const nation = s.nations.find((n) => n.id === nationId);
  if (!nation) return s;

  const soldiers = (): number =>
    s.armies
      .filter((a) => a.ownerId === nationId)
      .reduce((sum, a) => sum + UNIT_TYPES.reduce((n, t) => n + (UNITS[t].naval ? 0 : a.units[t]), 0), 0);
  if (soldiers() < HOME_GARRISON && (s.nations.find((n) => n.id === nationId)?.stocks.gold ?? 0) > WAR_CHEST_FLOOR) {
    const home = capitalRegion(s, nationId);
    if (home) {
      const pick = (UNIT_TYPES.filter((u) => !UNITS[u].naval) as UnitType[])
        .sort((a, b) => UNITS[b].defense - UNITS[a].defense || UNITS[a].cost.gold - UNITS[b].cost.gold)
        .find((u) => canRaiseUnit(s, home.id, u, nationId).ok);
      if (pick) s = raiseUnit(s, home.id, pick, nationId);
    }
  }

  for (const army of s.armies.filter((a) => a.ownerId === nationId && !armyIsFleet(a.units))) {
    const live = s.armies.find((a) => a.id === army.id);
    if (!live || live.movesLeft <= 0 || armySize(live.units) === 0) continue;
    const here = s.regions[live.regionId];
    if (here?.ownerId === nationId && regionIsThreatened(s, live.regionId, nationId)) {
      if (!live.fortifying) s = fortifyArmy(s, live.id);
      continue;
    }
    // Otherwise fall back on the capital, so the seat is never left empty.
    const home = capitalRegion(s, nationId);
    if (!home || live.regionId === home.id) continue;
    const step = landNeighbours(s, live.regionId).find((id) => s.regions[id]?.ownerId === nationId);
    if (step !== undefined) s = moveArmy(s, live.id, step, rng);
  }
  return s;
}

function capitalRegion(state: GameState, nationId: number): Region | undefined {
  const capitalId = state.nations.find((n) => n.id === nationId)?.capitalRegionId;
  const capital = capitalId === undefined ? undefined : state.regions[capitalId];
  if (capital?.ownerId === nationId) return capital;
  return state.regions.find((r) => r.ownerId === nationId);
}
