/**
 * The Hanseatic League — the collective-trade institution (docs/hansa-alignment-plan.md
 * Plan 3, "trade as power"; hansa times.md §3, §6). A realm *forms* the League once
 * it is a real trading power; others *join* for its privileges or *break* away.
 *
 * Grounded in the history:
 *  - **Kontor access** — the Kontore were exclusive Hanseatic privileges; non-members
 *    are shut out of Kontore held by the League (the great pull to join).
 *  - **Trade dividend** — members share the wealth the League's Kontore generate.
 *  - **Collective boycott** — the League's "ultimate weapon was economic": it could
 *    cut a hostile realm off from the Kontore (a Diet-declared boycott).
 *  - **Mutual defence** — the Confederation of Cologne (1367 → Peace of Stralsund
 *    1370): attack one member and the whole League turns cold on you.
 *  - **Peace among members / Verhansung** — the League cohered by shared interest, not
 *    sovereignty; a member cannot war a fellow member (it must leave first).
 *  - **No standing treasury** — collective action is paid by an *ad-hoc* Pfundzoll
 *    levy on members, not a permanent due.
 *
 * The Alderman (leader) is *derived* — the member holding the most Kontore — never
 * stored. Pure over GameState; no RNG, no DOM. Hansa board only (state.league absent
 * elsewhere, so every helper no-ops on other maps).
 */

import { KONTORE, KONTOR_IDS, type KontorId } from "@/data/kontore";
import { atWar, adjustRelation } from "@/systems/diplomacy";
import { round1 } from "@/systems/economy";
import {
  BARBARIAN_ID,
  PLAYER_ID,
  inLeague,
  type GameState,
  type Nation,
  type TradeRoute,
} from "@/systems/state";

// Tuning (docs/hansa-alignment-plan.md). Founding wants a real trading power, so the
// League is a mid-game institution rather than a turn-1 lock-in.
export const FOUND_MIN_ROUTES = 3; // routes that mark a realm as a trading power fit to found
const BOYCOTT_LEVY = 8; // Pfundzoll — each member's ad-hoc contribution when a boycott is called
const BOYCOTT_RELATION_HIT = -12; // the cut-off realm's resentment of each member
const LEAVE_PENALTY = -14; // relations hit with each member on leaving
const EXPEL_PENALTY = -26; // the sharper hit of Verhansung (expulsion)
const DEFENCE_ENMITY = -2; // per-turn relations slide with each member while you war one of them

// --- membership queries ------------------------------------------------------

/** Kontore held by `nationId` right now (by live region ownership, not the seeded holder). */
export function kontoreHeldBy(state: GameState, nationId: number): number {
  let n = 0;
  for (const id of KONTOR_IDS) {
    if (state.regions[KONTORE[id].regionId]?.ownerId === nationId) n += 1;
  }
  return n;
}

/**
 * The Alderman — the member holding the most Kontore (ties break to the earliest in
 * the member list, i.e. the founder's precedence). null if there is no League or it
 * is empty. Recomputed from live ownership, so it shifts as Kontore change hands. Pure.
 */
export function leagueLeader(state: GameState): number | null {
  const members = state.league?.members ?? [];
  if (members.length === 0) return null;
  let best = members[0]!;
  let bestN = kontoreHeldBy(state, best);
  for (const m of members) {
    const n = kontoreHeldBy(state, m);
    if (n > bestN) {
      best = m;
      bestN = n;
    }
  }
  return best;
}

/** Trade routes `nationId` currently runs. */
function routeCount(state: GameState, nationId: number): number {
  return (state.routes ?? []).filter((r) => r.ownerId === nationId).length;
}

/** A realm is a real trading power — fit to found the League — once it runs enough
    routes. Trade-gated (not mere Kontor ownership) so the League is a mid-game
    institution, not a turn-1 lock-in. Pure. */
export function canFoundLeague(state: GameState, nationId: number): boolean {
  if (state.league || nationId === BARBARIAN_ID || state.mapId !== "hansa") return false;
  return routeCount(state, nationId) >= FOUND_MIN_ROUTES;
}

/** A realm may join an existing League if it is real and at peace with every member. Pure. */
export function canJoinLeague(state: GameState, nationId: number): boolean {
  if (!state.league || nationId === BARBARIAN_ID || inLeague(state, nationId)) return false;
  return state.league.members.every((m) => !atWar(state, nationId, m));
}

// --- membership actions ------------------------------------------------------

/** Found the League with `ownerId` as its first member (and Alderman). No-op unless eligible. Pure. */
export function foundLeague(state: GameState, ownerId: number): GameState {
  if (!canFoundLeague(state, ownerId)) return state;
  const league = { members: [ownerId], foundedTurn: state.turn, boycotts: [] };
  const who = ownerId === PLAYER_ID ? "You found" : `${nameOf(state, ownerId)} founds`;
  return { ...state, league, log: [...state.log, `${who} the Hanseatic League.`].slice(-50) };
}

/** Join the League. No-op unless eligible (at peace with all members). Pure. */
export function joinLeague(state: GameState, ownerId: number): GameState {
  if (!state.league || !canJoinLeague(state, ownerId)) return state;
  const members = [...state.league.members, ownerId];
  const who = ownerId === PLAYER_ID ? "You join" : `${nameOf(state, ownerId)} joins`;
  return { ...state, league: { ...state.league, members }, log: [...state.log, `${who} the Hanseatic League.`].slice(-50) };
}

/** Leave the League (relations cool with former partners). Dissolves it if it empties. Pure. */
export function leaveLeague(state: GameState, ownerId: number): GameState {
  return removeMember(state, ownerId, LEAVE_PENALTY, ownerId === PLAYER_ID ? "You leave" : `${nameOf(state, ownerId)} leaves`);
}

/** Expel a member (Verhansung) — a sharper relations hit than leaving. Pure. */
export function expelFromLeague(state: GameState, ownerId: number): GameState {
  return removeMember(state, ownerId, EXPEL_PENALTY, `${nameOf(state, ownerId)} is cast out of`);
}

function removeMember(state: GameState, ownerId: number, penalty: number, verb: string): GameState {
  const league = state.league;
  if (!league || !league.members.includes(ownerId)) return state;
  const remaining = league.members.filter((m) => m !== ownerId);
  let next: GameState = { ...state, league: remaining.length === 0 ? undefined : { ...league, members: remaining } };
  for (const m of remaining) next = adjustRelation(next, ownerId, m, penalty); // cool with those left behind
  return { ...next, log: [...next.log, `${verb} the Hanseatic League.`].slice(-50) };
}

// --- collective boycott ------------------------------------------------------

/**
 * Open or close a League boycott of a non-member realm — only the Alderman may, and
 * calling one levies the Pfundzoll (a flat gold contribution) from every member. A
 * boycotted realm's routes into League-held Kontore are severed. No-op if `ownerId`
 * is not the leader, or the target is a member/barbarian/self. Pure.
 */
export function setLeagueBoycott(state: GameState, ownerId: number, targetId: number, on: boolean): GameState {
  const league = state.league;
  if (!league || leagueLeader(state) !== ownerId) return state;
  if (targetId === ownerId || targetId === BARBARIAN_ID || inLeague(state, targetId)) return state;
  const has = league.boycotts.includes(targetId);
  if (on === has) return state;
  const boycotts = on ? [...league.boycotts, targetId] : league.boycotts.filter((id) => id !== targetId);
  let next: GameState = { ...state, league: { ...league, boycotts } };
  if (on) {
    // Pay the Pfundzoll: each member chips in to fund the boycott.
    next = {
      ...next,
      nations: next.nations.map((n) => (league.members.includes(n.id) ? { ...n, stocks: { ...n.stocks, gold: round1(n.stocks.gold - BOYCOTT_LEVY) } } : n)),
    };
    // The cut-off realm resents the whole League.
    for (const m of league.members) next = adjustRelation(next, targetId, m, BOYCOTT_RELATION_HIT);
    const log = `The Hanseatic League declares a boycott of ${nameOf(state, targetId)} — each member levies ${BOYCOTT_LEVY}g (Pfundzoll).`;
    next = { ...next, log: [...next.log, log].slice(-50) };
  }
  return next;
}

/** Whether the League is boycotting `nationId`. Pure. */
export function isBoycotted(state: GameState, nationId: number): boolean {
  return state.league?.boycotts.includes(nationId) ?? false;
}

// --- Kontor access & route severing -----------------------------------------

/** A Kontor is League-held if its host region's owner is a League member. Pure. */
export function kontorHeldByLeague(state: GameState, kontor: KontorId): boolean {
  const owner = state.regions[KONTORE[kontor].regionId]?.ownerId ?? null;
  return owner !== null && inLeague(state, owner);
}

/**
 * Whether `ownerId` is barred from trading at `kontor`: the Kontor is held by the
 * League and `ownerId` is not a member (the exclusive Hanseatic privilege). Pure.
 */
export function kontorBlockedFor(state: GameState, ownerId: number, kontor: KontorId): boolean {
  if (!state.league) return false;
  return !inLeague(state, ownerId) && kontorHeldByLeague(state, kontor);
}

/**
 * Whether the League severs a route this turn: its owner is barred from the Kontor
 * (non-member, League Kontor) or the League is boycotting its owner and the Kontor is
 * League-held. Members trade freely. Pure.
 */
export function leagueSeversRoute(state: GameState, route: TradeRoute): boolean {
  if (!state.league) return false;
  if (isBoycotted(state, route.ownerId)) return true; // total boycott — the League cuts them off entirely
  return kontorBlockedFor(state, route.ownerId, route.toKontorId); // non-members barred from League Kontore
}

/**
 * Whether every realm shipping `good` into `kontor` is a League member (the League
 * has cornered that good's market there) — the hook for the League-monopoly premium.
 * False if there is no supply or the League is absent. Pure.
 */
export function isLeagueMonopoly(state: GameState, good: string, kontor: KontorId): boolean {
  if (!state.league) return false;
  const suppliers = new Set<number>();
  for (const r of state.routes ?? []) {
    if (r.good === good && r.toKontorId === kontor) suppliers.add(r.ownerId);
  }
  if (suppliers.size === 0) return false;
  for (const s of suppliers) if (!inLeague(state, s)) return false;
  return true;
}

// --- the turn seam -----------------------------------------------------------

/** The League's dividend pool this turn: the leagueIncome of every Kontor its members hold. Pure. */
export function leagueDividendPool(state: GameState): number {
  if (!state.league) return 0;
  let pool = 0;
  for (const id of KONTOR_IDS) {
    const owner = state.regions[KONTORE[id].regionId]?.ownerId ?? null;
    if (owner !== null && inLeague(state, owner)) pool += KONTORE[id].leagueIncome;
  }
  return pool;
}

/**
 * Resolve the League one turn: pay each member an equal share of the dividend pool
 * (the League's Kontor wealth), and let the League's enmity slide relations with any
 * realm at war with a member (mutual defence, short of a formal call-to-arms). Also
 * lifts boycotts of realms that have since joined. Pure — returns new state.
 */
export function stepLeague(state: GameState): GameState {
  const league = state.league;
  if (!league || league.members.length === 0) return state;

  // 1) Dividend — split the pool equally among members.
  const pool = leagueDividendPool(state);
  const share = round1(pool / league.members.length);
  let nations = state.nations;
  if (share > 0) {
    nations = nations.map((n) => (league.members.includes(n.id) ? { ...n, stocks: { ...n.stocks, gold: round1(n.stocks.gold + share) } } : n));
  }

  // Housekeeping — a boycott of a realm that has since joined lapses.
  const boycotts = league.boycotts.filter((id) => !inLeague(state, id));
  const nextLeague = boycotts.length === league.boycotts.length ? league : { ...league, boycotts };

  let next: GameState = { ...state, nations, league: nextLeague };

  // 2) Mutual defence — anyone warring a member cools with every member (short of a
  // formal call-to-arms; the enmity feeds the existing coalition/relations systems).
  for (const aggressor of state.nations) {
    if (aggressor.isBarbarian || inLeague(state, aggressor.id)) continue;
    if (!league.members.some((m) => atWar(state, aggressor.id, m))) continue;
    for (const m of league.members) next = adjustRelation(next, aggressor.id, m, DEFENCE_ENMITY);
  }
  const playerShare = league.members.includes(PLAYER_ID) ? share : 0;
  if (playerShare > 0) {
    next = { ...next, log: [...next.log, `The Hanseatic League's Kontore paid you a +${playerShare}g dividend.`].slice(-50) };
  }
  return next;
}

// --- small local helpers (kept here to avoid import cycles) ------------------

function nameOf(state: GameState, id: number): string {
  return state.nations.find((n: Nation) => n.id === id)?.name ?? "A realm";
}
