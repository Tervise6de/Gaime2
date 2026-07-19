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
 * total. `seedKontore` opens the four Kontore at game start.
 *
 * Pure over `GameState` — no RNG (fully deterministic), no DOM. The same lane
 * BFS as turn.ts `graphDistance`, but returning the path with a lowest-id
 * tie-break so a route's lane is reproducible.
 */

import { GOODS, GOOD_IDS, type GoodId } from "@/data/goods";
import { KONTORE, KONTOR_IDS, type KontorId } from "@/data/kontore";
import { SOUND } from "@/data/sound";
import { round1, unrestPenalty } from "@/systems/economy";
import { atWar } from "@/systems/diplomacy";
import { kontorBlockedFor, leagueSeversRoute, isLeagueMonopoly } from "@/systems/league";
import {
  BARBARIAN_ID,
  MAX_ROUTES_PER_NATION,
  PLAYER_ID,
  TRADE_DIST_CAP,
  TRADE_DIST_COEF,
  inLeague,
  nationById,
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

// --- Kontor state -----------------------------------------------------------

/**
 * Whether a Kontor is open for trade. Reads the live merchant network
 * (`state.kontore`, seeded by `seedKontore`); an epoch such as the fall of the
 * Novgorod Peterhof shuts one by flipping `open` (systems/epochs.ts). Defaults to
 * open when the Kontor has no entry — legacy saves and non-Hansa maps carry no
 * `kontore` table. Pure.
 */
export function kontorOpen(state: GameState, kontor: KontorId): boolean {
  return state.kontore?.find((k) => k.id === kontor)?.open ?? true;
}

// --- route creation ---------------------------------------------------------

/**
 * Found a trade route for `ownerId`: ship `good` from `fromRegionId` to
 * `toKontorId`. A no-op (returns state unchanged) unless every rule holds:
 *  - the region exists and `ownerId` holds it (you trade from your own land);
 *  - `ownerId` is a real realm (not the barbarians);
 *  - the region structurally sources the good;
 *  - the Kontor demands the good, and is open (not shuttered by an epoch);
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
  if (!kontorOpen(state, toKontorId)) return state; // a shuttered Kontor (e.g. the Peterhof fell) takes no trade

  const lane = laneFor(state, fromRegionId, toKontorId);
  if (lane.length === 0) return state;

  // No trading into a Kontor whose host you are at war with.
  const hostOwner = state.regions[kontor.regionId]?.ownerId ?? null;
  if (hostOwner !== null && hostOwner !== ownerId && atWar(state, ownerId, hostOwner)) return state;
  // The League shuts non-members out of the Kontore it holds (exclusive privilege).
  if (kontorBlockedFor(state, ownerId, toKontorId)) return state;

  const existing = state.routes ?? [];
  if (existing.filter((r) => r.ownerId === ownerId).length >= MAX_ROUTES_PER_NATION) return state;

  const id = state.nextRouteId ?? 0;
  const route: TradeRoute = { id, ownerId, good, fromRegionId, toKontorId, lane };
  return { ...state, routes: [...existing, route], nextRouteId: id + 1 };
}

/**
 * Close a route: drop it from `ownerId`'s book. A no-op unless the route exists
 * and belongs to `ownerId` (you can only pull your own routes). Pure.
 */
export function closeRoute(state: GameState, routeId: number, ownerId: number): GameState {
  const routes = state.routes ?? [];
  const keep = routes.filter((r) => !(r.id === routeId && r.ownerId === ownerId));
  if (keep.length === routes.length) return state;
  return { ...state, routes: keep };
}

/** A route `ownerId` could open from a region: a sourced good to a demanding,
    reachable Kontor it doesn't already run, with the gold it would pay per turn. */
export interface RouteOption {
  good: GoodId;
  toKontorId: KontorId;
  income: number;
  /** Lane length (nodes) — 1 is the Kontor's own host region. */
  hops: number;
}

/**
 * Every trade route `ownerId` could open from `fromRegionId` right now: for each
 * good the region sources, each Kontor that demands it and is reachable (and whose
 * host it isn't at war with), excluding routes already running from this region.
 * The same validity as `createRoute`, surfaced for the UI/AI to choose from.
 * Sorted richest first (deterministic tie-break). Pure.
 */
export function routeOptions(state: GameState, fromRegionId: number, ownerId: number): RouteOption[] {
  const region = state.regions[fromRegionId];
  if (!region || region.ownerId !== ownerId || ownerId === BARBARIAN_ID) return [];
  const open = (state.routes ?? []).filter((r) => r.ownerId === ownerId && r.fromRegionId === fromRegionId);
  const out: RouteOption[] = [];
  for (const good of GOOD_IDS) {
    if (!regionSources(region, good)) continue;
    for (const toKontorId of GOODS[good].demandedAt) {
      if (!kontorOpen(state, toKontorId)) continue; // a shuttered Kontor offers no routes
      if (open.some((r) => r.good === good && r.toKontorId === toKontorId)) continue;
      const lane = laneFor(state, fromRegionId, toKontorId);
      if (lane.length === 0) continue;
      const hostOwner = state.regions[KONTORE[toKontorId].regionId]?.ownerId ?? null;
      if (hostOwner !== null && hostOwner !== ownerId && atWar(state, ownerId, hostOwner)) continue;
      if (kontorBlockedFor(state, ownerId, toKontorId)) continue; // League Kontor closed to non-members
      out.push({ good, toKontorId, income: projectedRouteIncome(state, ownerId, good, toKontorId, lane.length), hops: lane.length });
    }
  }
  out.sort((a, b) => b.income - a.income || a.good.localeCompare(b.good) || a.toKontorId.localeCompare(b.toKontorId));
  return out;
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

// Market pricing (docs/hansa-alignment-plan.md, Plan 3B) — a gentle ±25% swing so
// *which* good you ship into *which* Kontor is a real choice, not a fixed payout.
const SCARCITY_STEP = 0.12; // each extra supplier of the same good→Kontor shaves the price
const SCARCITY_FLOOR = 0.75; // a glutted market still pays three-quarters
const MONOPOLY_PREMIUM = 1.25; // sole supplier cornering a good's trade into a Kontor pays a quarter more
const LEAGUE_MONOPOLY_PREMIUM = 1.1; // the League collectively cornering a good pays its members a lighter premium

/**
 * The market for a good into a Kontor: how many routes actually *flow* into it this
 * turn, and the distinct realms so supplying it. Only flowing routes are counted
 * (`routeFlows`) — a severed rival delivers nothing, so it must not glut the price
 * nor deny a de-facto sole supplier its monopoly premium (A2). Pure.
 */
function marketAt(state: GameState, good: GoodId, kontor: KontorId): { routes: number; owners: Set<number> } {
  const owners = new Set<number>();
  let routes = 0;
  for (const r of state.routes ?? []) {
    if (r.good === good && r.toKontorId === kontor && routeFlows(state, r)) {
      routes += 1;
      owners.add(r.ownerId);
    }
  }
  return { routes, owners };
}

/** The scarcity multiplier for a market with `supply` routes feeding it (1 at one route, falling to the floor). */
function scarcityFrom(supply: number): number {
  return Math.max(SCARCITY_FLOOR, 1 - SCARCITY_STEP * Math.max(0, supply - 1));
}

/**
 * Scarcity: a good gluts as more of it pours into the same Kontor — each route
 * beyond the first shaves the price, down to a gentle floor. Rewards spreading
 * goods across markets over dogpiling one. Pure.
 */
function scarcityFactor(state: GameState, route: TradeRoute): number {
  return scarcityFrom(marketAt(state, route.good, route.toKontorId).routes);
}

/**
 * Monopoly: cornering a good's trade into a Kontor pays a premium. Sole supplier
 * — no other realm ships this good there — earns the full premium. Pure.
 */
function monopolyFactor(state: GameState, route: TradeRoute): number {
  const { owners } = marketAt(state, route.good, route.toKontorId);
  if (owners.size === 1 && owners.has(route.ownerId)) return MONOPOLY_PREMIUM; // you alone corner it
  // The League collectively cornering a good into a Kontor pays its members a lighter
  // premium — counting only routes that actually flow, so a severed rival never breaks it.
  if (inLeague(state, route.ownerId) && isLeagueMonopoly(state, route.good, route.toKontorId, (r) => routeFlows(state, r))) {
    return LEAGUE_MONOPOLY_PREMIUM;
  }
  return 1;
}

/**
 * A one-word read on the market a prospective route would join, for the UI:
 * "monopoly" if `ownerId` would be the sole supplier of the good into the Kontor
 * (the premium), "glut" if it is already crowded (the scarcity penalty bites), or
 * "normal" in between. Pure.
 */
export function marketOutlook(
  state: GameState,
  ownerId: number,
  good: GoodId,
  kontor: KontorId,
): "monopoly" | "glut" | "normal" {
  const { routes, owners } = marketAt(state, good, kontor);
  if (owners.size === 0 || (owners.size === 1 && owners.has(ownerId))) return "monopoly";
  return routes >= 2 ? "glut" : "normal";
}

/**
 * The gold a route `ownerId` would earn if founded now: base income times the
 * market it would *join* (this route added to supply, and its owner counted as a
 * supplier). Lets the open-route UI show the gold you'd actually keep, not a
 * pre-market sticker price. Pure.
 */
export function projectedRouteIncome(
  state: GameState,
  ownerId: number,
  good: GoodId,
  kontor: KontorId,
  laneLength: number,
): number {
  const { routes, owners } = marketAt(state, good, kontor);
  const scar = scarcityFrom(routes + 1); // this route joins the market
  const sole = owners.size === 0 || (owners.size === 1 && owners.has(ownerId));
  const mono = sole ? MONOPOLY_PREMIUM : 1;
  return round1(GOODS[good].value * distanceFactor(laneLength) * scar * mono);
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

// --- the Øresund Sound toll (trade as power) --------------------------------

/**
 * The nation that levies the Sound toll — the holder of the strait region — or
 * null if the Sound is absent (non-Hansa map) or its host is unheld/barbarian
 * (the strait lies open). Pure.
 */
export function soundHolderId(state: GameState): number | null {
  if (!state.sound) return null;
  const owner = state.regions[state.sound.regionId]?.ownerId ?? null;
  return owner !== null && owner !== BARBARIAN_ID ? owner : null;
}

/**
 * Whether a route must pass the Øresund: a Baltic port's goods bound for a western
 * market (London/Bruges). Decided by endpoints — the source is *not* an Atlantic
 * region (SOUND.westRegions) and the Kontor is a western one. Bergen/Novgorod
 * trade, and Atlantic-port trade, never crosses. Pure.
 */
export function crossesSound(state: GameState, route: TradeRoute): boolean {
  if (!state.sound) return false;
  if (!SOUND.tolledKontore.includes(route.toKontorId)) return false;
  return !SOUND.westRegions.includes(route.fromRegionId);
}

/**
 * The Sound's effect on one route this turn: the gold the holder skims (`toll`),
 * whether the strait is closed to the route's owner (`blocked` — at war with, or
 * embargoed by, the holder), and who holds it. Your own Sound passes your goods
 * free. A route that does not cross the Sound is unaffected. Pure.
 */
export function soundEffect(
  state: GameState,
  route: TradeRoute,
  grossIncome: number,
): { toll: number; blocked: boolean; holderId: number | null } {
  const holderId = soundHolderId(state);
  if (holderId === null || !crossesSound(state, route)) return { toll: 0, blocked: false, holderId: null };
  if (holderId === route.ownerId) return { toll: 0, blocked: false, holderId }; // your strait — free passage
  const closed = atWar(state, route.ownerId, holderId) || activeEmbargoes(state).includes(route.ownerId);
  if (closed) return { toll: 0, blocked: true, holderId };
  return { toll: round1(grossIncome * (state.sound?.tollRate ?? SOUND.defaultRate)), blocked: false, holderId };
}

/**
 * The Sound's effect on a *prospective* route (for the open-route preview): the
 * toll it would pay and whether the strait is shut to `ownerId`. Thin wrapper over
 * `soundEffect` for a not-yet-founded route. Pure.
 */
export function soundPreview(
  state: GameState,
  ownerId: number,
  fromRegionId: number,
  toKontorId: KontorId,
  gross: number,
): { toll: number; blocked: boolean } {
  const { toll, blocked } = soundEffect(
    state,
    { id: -1, ownerId, good: GOOD_IDS[0], fromRegionId, toKontorId, lane: [] },
    gross,
  );
  return { toll, blocked };
}

/**
 * The embargoes currently in force: the Sound's `embargoes`, but only while the
 * realm that set them still holds the strait (`embargoBy` matches the holder). A
 * conqueror inherits an empty slate. Pure.
 */
export function activeEmbargoes(state: GameState): number[] {
  const s = state.sound;
  if (!s || s.embargoes.length === 0) return [];
  return s.embargoBy === soundHolderId(state) ? s.embargoes : [];
}

/**
 * Set the Sound toll rate — only the strait-holder may, clamped to [0, maxRate]
 * and rounded to whole percents. A no-op if `ownerId` does not hold the Sound. Pure.
 */
export function setSoundToll(state: GameState, ownerId: number, rate: number): GameState {
  if (!state.sound || soundHolderId(state) !== ownerId) return state;
  const clamped = Math.max(0, Math.min(SOUND.maxRate, Math.round(rate * 100) / 100));
  if (clamped === state.sound.tollRate) return state;
  return { ...state, sound: { ...state.sound, tollRate: clamped } };
}

/**
 * Open or close the Sound to a rival — only the holder may. Closing (`on`) blocks
 * that realm's Baltic→western trade until lifted. A no-op if `ownerId` does not
 * hold the strait, or the target is the holder itself or the barbarians. Records
 * `embargoBy` so the list falls dormant if the strait changes hands. Pure.
 */
export function setSoundEmbargo(state: GameState, ownerId: number, targetId: number, on: boolean): GameState {
  if (!state.sound || soundHolderId(state) !== ownerId) return state;
  if (targetId === ownerId || targetId === BARBARIAN_ID) return state;
  const current = activeEmbargoes(state);
  const has = current.includes(targetId);
  if (on === has) return state;
  const embargoes = on ? [...current, targetId] : current.filter((id) => id !== targetId);
  return { ...state, sound: { ...state.sound, embargoes, embargoBy: ownerId } };
}

// --- what actually flows ----------------------------------------------------

/**
 * Whether a route actually *carries goods* into its Kontor this turn — the delivery
 * the market is priced on. A route flows unless it is war-disrupted, shut out by the
 * League (a non-member barred from a League Kontor, or a boycott), bound for a
 * shuttered Kontor, or stopped at a closed Øresund. `marketAt` counts only flowing
 * routes, so a severed rival never gluts the price nor denies a de-facto sole supplier
 * its premium (A2). The Sound *toll* (a mere skim) does not stop a route; only a
 * *blocked* strait does. Pure.
 */
export function routeFlows(state: GameState, route: TradeRoute): boolean {
  if (routeDisrupted(state, route)) return false;
  if (leagueSeversRoute(state, route)) return false;
  if (!kontorOpen(state, route.toKontorId)) return false;
  if (soundEffect(state, route, 0).blocked) return false;
  return true;
}

// --- the turn seam ----------------------------------------------------------

/**
 * Resolve every trade route one turn: recompute each route's disruption, pay its
 * owner `routeIncome` (0 if disrupted), and record `lastIncome`/`disrupted` on the
 * route. Credits gold exactly as `applyTradeIncome` does and logs the player's
 * total. A no-op when there are no routes. Pure — returns new state.
 *
 * A route whose owner has since lost the producing region, or been eliminated, is
 * *void*: `createRoute` checks source ownership once, so a later conquest would leave
 * it paying phantom gold from land it no longer holds. Such a route pays nothing AND
 * is struck from the returned book, so it never lingers against the per-nation route
 * cap (A1). A route bound for a Kontor shuttered after it was founded pays 0 (A3).
 */
export function stepTrade(state: GameState): GameState {
  const routes = state.routes;
  if (!routes || routes.length === 0) return state;

  const gain = new Map<number, number>();
  const tollGain = new Map<number, number>(); // Sound-toll income, tracked apart for the log
  const nextRoutes: TradeRoute[] = [];
  for (const route of routes) {
    // A1 — a route is only as good as the land under it: drop it (paying nothing) if
    // its owner no longer holds `fromRegionId` or is no longer a living realm.
    const owner = nationById(state, route.ownerId);
    const holdsSource = state.regions[route.fromRegionId]?.ownerId === route.ownerId;
    if (!owner || !owner.alive || !holdsSource) continue;

    // The League shuts a non-member (or a boycotted realm) out of its Kontore entirely.
    const leagueBlocked = leagueSeversRoute(state, route);
    const disrupted = routeDisrupted(state, route);
    const kontorClosed = !kontorOpen(state, route.toKontorId); // a shuttered Kontor takes no trade (A3)
    let income = disrupted || leagueBlocked || kontorClosed ? 0 : routeIncome(state, route);

    // The Øresund toll: the strait-holder skims a crossing route, or closes it.
    const eff = income > 0 ? soundEffect(state, route, income) : { toll: 0, blocked: false, holderId: null };
    let tollPaid = 0;
    let soundBlocked = false;
    if (eff.blocked) {
      income = 0;
      soundBlocked = true;
    } else if (eff.toll > 0 && eff.holderId !== null) {
      tollPaid = eff.toll;
      income = round1(income - eff.toll);
      gain.set(eff.holderId, round1((gain.get(eff.holderId) ?? 0) + eff.toll));
      tollGain.set(eff.holderId, round1((tollGain.get(eff.holderId) ?? 0) + eff.toll));
    }

    if (income > 0) gain.set(route.ownerId, round1((gain.get(route.ownerId) ?? 0) + income));
    nextRoutes.push({ ...route, lastIncome: income, disrupted: disrupted || soundBlocked || leagueBlocked || kontorClosed, tollPaid, soundBlocked, leagueBlocked });
  }

  const nations =
    gain.size === 0
      ? state.nations
      : state.nations.map((n) => {
          const g = gain.get(n.id);
          return g ? { ...n, stocks: { ...n.stocks, gold: round1(n.stocks.gold + g) } } : n;
        });

  // Log the player's take: route income (minus any toll they paid) and, separately,
  // any Sound toll they gathered as strait-holder — the reward for holding Zealand.
  const log = [...state.log];
  const playerToll = tollGain.get(PLAYER_ID) ?? 0;
  const playerGain = round1((gain.get(PLAYER_ID) ?? 0) - playerToll); // route income only
  if (playerGain > 0) log.push(`Trade routes carried +${playerGain}g to the Kontore.`);
  if (playerToll > 0) log.push(`The Øresund Sound toll gathered +${playerToll}g from passing trade.`);

  return { ...state, routes: nextRoutes, nations, log: log.slice(-50) };
}

// --- setup ------------------------------------------------------------------

/**
 * Open the four Kontore at game start: each takes the owner of its host region as
 * holder (null if the host is unowned, barbarian, or off this map), opens for
 * trade, and stamps the current turn. Pure — returns fresh state.
 */
export function seedKontore(state: GameState): KontorState[] {
  return KONTOR_IDS.map((id) => {
    const host = state.regions[KONTORE[id].regionId];
    const owner = host?.ownerId ?? null;
    const holderId = owner !== null && owner !== BARBARIAN_ID ? owner : null;
    return { id, holderId, open: true, sinceTurn: state.turn };
  });
}
