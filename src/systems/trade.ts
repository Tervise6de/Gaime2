/**
 * Trade — the merchant layer's pure sim (hansa-plan.md §6).
 *
 * Goods sit *beside* the four-resource economy: terrain and strategic resources
 * make a region *able to source* a good (`regionGoodOutput`), but a good only
 * becomes gold when a standing trade route carries it along a lane of regions to a
 * Kontor that demands it (`stepTrade`). Nothing here touches `regionProduction`
 * (economy.ts) — goods are a parallel derived quantity that only *adds* gold, so
 * the core economy and its tests are unaffected.
 *
 * The seam in the turn pipeline is `stepTrade`, inserted beside `applyTradeIncome`
 * (the older bilateral trade). Both credit gold identically and log the player's
 * total. `seedKontore` opens the four Kontore at game start, mirroring `seedFaith`.
 *
 * Pure over `GameState` — no RNG (fully deterministic), no DOM. The same lane
 * BFS as turn.ts `graphDistance`, but returning the path with a lowest-id
 * tie-break so a route's lane is reproducible.
 */

import { GOODS, GOOD_IDS, type GoodId } from "@/data/goods";
import { KONTORE, KONTOR_IDS, type KontorId } from "@/data/kontore";
import { round1, unrestPenalty } from "@/systems/economy";
import { atWar } from "@/systems/diplomacy";
import {
  BARBARIAN_ID,
  MAX_ROUTES_PER_NATION,
  PLAYER_ID,
  TRADE_DIST_CAP,
  TRADE_DIST_COEF,
  type GameState,
  type KontorState,
  type Region,
  type TradeRoute,
} from "@/systems/state";

// --- region → goods ---------------------------------------------------------

/**
 * Whether a region *structurally* sources a good — its terrain or strategic
 * resource matches the good's source. Independent of unrest (that only scales the
 * quantity), so a route may be founded on a region even while it briefly revolts.
 */
export function regionSources(region: Region, good: GoodId): boolean {
  const src = GOODS[good].source;
  const byTerrain = src.terrain?.includes(region.terrain) ?? false;
  const byResource = src.resource !== undefined && region.resource === src.resource;
  return byTerrain || byResource;
}

/**
 * The goods a region produces this turn and how much of each, in GOOD_IDS order.
 * The quantity is the good's base output scaled by the SAME `unrestPenalty` the
 * economy uses — so a region in full revolt ships nothing (empty list). Pure.
 */
export function regionGoodOutput(region: Region): { good: GoodId; amount: number }[] {
  const penalty = unrestPenalty(region.unrest);
  const out: { good: GoodId; amount: number }[] = [];
  for (const id of GOOD_IDS) {
    if (!regionSources(region, id)) continue;
    const amount = round1(GOODS[id].source.baseOutput * penalty);
    if (amount > 0) out.push({ good: id, amount });
  }
  return out;
}

// --- lanes (BFS shortest path) ----------------------------------------------

/**
 * The lane a route runs: the shortest path of region ids from `fromRegionId` to
 * the Kontor's host region, over `region.adjacency`. Same breadth-first search as
 * turn.ts `graphDistance`, but it reconstructs the path and expands neighbours in
 * ascending-id order, so equal-length paths resolve to the lowest-id one — a
 * deterministic, order-free lane. Returns [] if the host is unreachable (or absent
 * on this map); a zero-length hop (source === host) returns the single node. Pure.
 */
export function laneFor(state: GameState, fromRegionId: number, kontor: KontorId): number[] {
  const target = KONTORE[kontor].regionId;
  const regions = state.regions;
  if (fromRegionId === target) return [fromRegionId];

  const prev = new Map<number, number>();
  const visited = new Set<number>([fromRegionId]);
  const queue: number[] = [fromRegionId];
  while (queue.length) {
    const n = queue.shift()!;
    if (n === target) break;
    // Ascending id order gives a lowest-id tie-break on equal-length paths.
    const neighbours = [...(regions[n]?.adjacency ?? [])].sort((a, b) => a - b);
    for (const m of neighbours) {
      if (!visited.has(m)) {
        visited.add(m);
        prev.set(m, n);
        queue.push(m);
      }
    }
  }
  if (!visited.has(target)) return []; // unreachable / off this map

  const path: number[] = [target];
  let cur = target;
  while (cur !== fromRegionId) {
    const p = prev.get(cur);
    if (p === undefined) return []; // defensive: broken chain
    path.push(p);
    cur = p;
  }
  return path.reverse();
}

// --- route creation ---------------------------------------------------------

/**
 * Found a trade route for `ownerId`: ship `good` from `fromRegionId` to
 * `toKontorId`. A no-op (returns state unchanged) unless every rule holds:
 *  - the region exists and `ownerId` holds it (you trade from your own land);
 *  - `ownerId` is a real realm (not the barbarians);
 *  - the region structurally sources the good;
 *  - the Kontor demands the good;
 *  - a lane exists to the Kontor host;
 *  - `ownerId` is not at war with the Kontor's host owner (no trading into a foe);
 *  - the nation is under its MAX_ROUTES_PER_NATION cap.
 * On success appends the route and bumps nextRouteId (armies/nextArmyId pattern). Pure.
 */
export function createRoute(
  state: GameState,
  ownerId: number,
  fromRegionId: number,
  good: GoodId,
  toKontorId: KontorId,
): GameState {
  const kontor = KONTORE[toKontorId];
  if (!kontor) return state;
  if (ownerId === BARBARIAN_ID) return state;

  const region = state.regions[fromRegionId];
  if (!region || region.ownerId !== ownerId) return state;
  if (!regionSources(region, good)) return state;
  if (!kontor.demands.includes(good)) return state;

  const lane = laneFor(state, fromRegionId, toKontorId);
  if (lane.length === 0) return state;

  // No trading into a Kontor whose host you are at war with.
  const hostOwner = state.regions[kontor.regionId]?.ownerId ?? null;
  if (hostOwner !== null && hostOwner !== ownerId && atWar(state, ownerId, hostOwner)) return state;

  const existing = state.routes ?? [];
  if (existing.filter((r) => r.ownerId === ownerId).length >= MAX_ROUTES_PER_NATION) return state;

  const id = state.nextRouteId ?? 0;
  const route: TradeRoute = { id, ownerId, good, fromRegionId, toKontorId, lane };
  return { ...state, routes: [...existing, route], nextRouteId: id + 1 };
}

// --- route income -----------------------------------------------------------

/**
 * The distance premium on a route's income: 1 at a single-node lane, rising
 * `+TRADE_DIST_COEF` per lane node beyond the first, capped at TRADE_DIST_CAP so
 * a very long reach pays a bounded bonus. Pure.
 */
export function distanceFactor(laneLength: number): number {
  return Math.min(TRADE_DIST_CAP, 1 + TRADE_DIST_COEF * Math.max(0, laneLength - 1));
}

// TODO(merchant layer): scarcity scales a good's price when supply into a demanding
// Kontor is thin (a glut pays less). Stubbed at 1 until the Kontor demand model lands.
function scarcityFactor(_state: GameState, _route: TradeRoute): number {
  return 1;
}

// TODO(merchant layer): a monopoly premium when one realm holds all routes of a good
// into a Kontor (privileges/monopolies, hansa-plan §6). Stubbed at 1 for this slice.
function monopolyFactor(_state: GameState, _route: TradeRoute): number {
  return 1;
}

/**
 * Gold a route pays per turn (before disruption): the good's value times the lane
 * distance premium, times the (currently unit) scarcity and monopoly premiums. Pure.
 */
export function routeIncome(state: GameState, route: TradeRoute): number {
  const base = GOODS[route.good].value * distanceFactor(route.lane.length);
  return round1(base * scarcityFactor(state, route) * monopolyFactor(state, route));
}

/**
 * Whether a route is severed this turn: `ownerId` is at war with the Kontor host's
 * owner, or any node on the lane is held by a realm at war with `ownerId` (an enemy
 * astride the road chokes it). Barbarian holders are not treaty parties, so they do
 * not disrupt trade in this slice. Pure.
 */
export function routeDisrupted(state: GameState, route: TradeRoute): boolean {
  const hostOwner = state.regions[KONTORE[route.toKontorId].regionId]?.ownerId ?? null;
  if (hostOwner !== null && hostOwner !== route.ownerId && atWar(state, route.ownerId, hostOwner)) {
    return true;
  }
  for (const nodeId of route.lane) {
    const owner = state.regions[nodeId]?.ownerId ?? null;
    if (owner !== null && owner !== route.ownerId && atWar(state, route.ownerId, owner)) return true;
  }
  return false;
}

// --- the turn seam ----------------------------------------------------------

/**
 * Resolve every trade route one turn: recompute each route's disruption, pay its
 * owner `routeIncome` (0 if disrupted), and record `lastIncome`/`disrupted` on the
 * route. Credits gold exactly as `applyTradeIncome` does and logs the player's
 * total. A no-op when there are no routes. Pure — returns new state.
 */
export function stepTrade(state: GameState): GameState {
  const routes = state.routes;
  if (!routes || routes.length === 0) return state;

  const gain = new Map<number, number>();
  const nextRoutes = routes.map((route) => {
    const disrupted = routeDisrupted(state, route);
    const income = disrupted ? 0 : routeIncome(state, route);
    if (income > 0) gain.set(route.ownerId, round1((gain.get(route.ownerId) ?? 0) + income));
    return { ...route, lastIncome: income, disrupted };
  });

  const nations =
    gain.size === 0
      ? state.nations
      : state.nations.map((n) => {
          const g = gain.get(n.id);
          return g ? { ...n, stocks: { ...n.stocks, gold: round1(n.stocks.gold + g) } } : n;
        });

  const playerGain = gain.get(PLAYER_ID);
  const log = playerGain
    ? [...state.log, `Trade routes carried +${playerGain}g to the Kontore.`].slice(-50)
    : state.log;

  return { ...state, routes: nextRoutes, nations, log };
}

// --- setup ------------------------------------------------------------------

/**
 * Open the four Kontore at game start: each takes the owner of its host region as
 * holder (null if the host is unowned, barbarian, or off this map), opens for
 * trade, and stamps the current turn. Mirrors `seedFaith`. Pure — returns fresh state.
 */
export function seedKontore(state: GameState): KontorState[] {
  return KONTOR_IDS.map((id) => {
    const host = state.regions[KONTORE[id].regionId];
    const owner = host?.ownerId ?? null;
    const holderId = owner !== null && owner !== BARBARIAN_ID ? owner : null;
    return { id, holderId, open: true, sinceTurn: state.turn };
  });
}
