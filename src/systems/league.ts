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
import { HANSA_TOWNS } from "@/data/towns";
import { atWar, adjustRelation } from "@/systems/diplomacy";
import { round1 } from "@/systems/economy";
import {
  LOG_CAP,
  BARBARIAN_ID,
  PLAYER_ID,
  inLeague,
  nationById,
  type GameState,
  type Nation,
  type TradeRoute,
} from "@/systems/state";

// Tuning (docs/hansa-alignment-plan.md).
const BOYCOTT_LEVY = 8; // Pfundzoll — each member's ad-hoc contribution when a boycott is called
const BOYCOTT_RELATION_HIT = -12; // the cut-off realm's resentment of each member
const LEAVE_PENALTY = -14; // relations hit with each member on leaving
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
 * The weight of League towns a realm holds (data/towns.ts) — Lübeck, Hamburg,
 * Stralsund, Danzig, Visby, Riga and the rest, counted where they actually sit.
 * Pure.
 */
export function townWeightHeldBy(state: GameState, nationId: number): number {
  let sum = 0;
  for (const town of HANSA_TOWNS) {
    if (state.regions[town.regionId]?.ownerId === nationId) sum += town.weight;
  }
  return sum;
}

/**
 * What a Kontor is worth against a town in the Diet's reckoning. High, because
 * the Kontore were the League's power abroad and the reason it existed — but
 * finite, because Lübeck led the Hansa for three centuries holding none.
 */
export const KONTOR_PRECEDENCE = 4;

/** A member's standing in the Diet: the towns it holds, and the Kontore. */
export function leagueStandingOf(state: GameState, nationId: number): number {
  return townWeightHeldBy(state, nationId) + KONTOR_PRECEDENCE * kontoreHeldBy(state, nationId);
}

/**
 * The Alderman — precedence in the Diet.
 *
 * Read from the **League towns** a member holds and the **Kontore** it has taken
 * (`leagueStandingOf`). That is the way round the Hansa actually worked: the
 * Diet was the towns, and the towns' weight is where precedence started — but a
 * realm that has seized the great Kontore has the League's overseas power in its
 * hands and the chair follows it.
 *
 * (It used to be Kontore alone, with ties falling to whoever founded the League,
 * which handed the chair — and a fifth of the trade race — to the first realm to
 * raise a Hall. A first pass at fixing that used towns alone, and parked the
 * chair permanently with the realm that happens to start on the Saxon towns,
 * whether or not it was contesting anything.) Recomputed from live ownership, so
 * the chair moves as towns and Kontore change hands. Pure.
 */
export function leagueLeader(state: GameState): number | null {
  const members = state.league?.members ?? [];
  if (members.length === 0) return null;
  let best = members[0]!;
  let bestScore = leagueStandingOf(state, best);
  for (const m of members) {
    const score = leagueStandingOf(state, m);
    if (score > bestScore) {
      best = m;
      bestScore = score;
    }
  }
  return best;
}

/** Whether `nationId` has built a Hanse Hall — the League's seat and founding prerequisite. Pure. */
export function hasHanseHall(state: GameState, nationId: number): boolean {
  return state.regions.some((r) => r.ownerId === nationId && r.buildings.includes("hanse_hall"));
}

/**
 * A realm may found the League once it has built a **Hanse Hall** — which needs the
 * Lübeck Law tech (data/techs.ts) to build. So founding is the payoff of a research +
 * construction investment (research the charter → raise the Hall → found), a mid-game
 * milestone rather than a calendar unlock. One League only; Hansa board. Pure.
 */
export function canFoundLeague(state: GameState, nationId: number): boolean {
  if (state.league || nationId === BARBARIAN_ID || state.mapId !== "hansa") return false;
  return hasHanseHall(state, nationId);
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
  return { ...state, league, log: [...state.log, `${who} the Hanseatic League.`].slice(-LOG_CAP) };
}

/** Join the League. No-op unless eligible (at peace with all members). Pure. */
export function joinLeague(state: GameState, ownerId: number): GameState {
  if (!state.league || !canJoinLeague(state, ownerId)) return state;
  const members = [...state.league.members, ownerId];
  const who = ownerId === PLAYER_ID ? "You join" : `${nameOf(state, ownerId)} joins`;
  return { ...state, league: { ...state.league, members }, log: [...state.log, `${who} the Hanseatic League.`].slice(-LOG_CAP) };
}

/** Leave the League (relations cool with former partners). Dissolves it if it empties. Pure. */
export function leaveLeague(state: GameState, ownerId: number): GameState {
  return removeMember(state, ownerId, LEAVE_PENALTY, ownerId === PLAYER_ID ? "You leave" : `${nameOf(state, ownerId)} leaves`);
}

function removeMember(state: GameState, ownerId: number, penalty: number, verb: string): GameState {
  const league = state.league;
  if (!league || !league.members.includes(ownerId)) return state;
  const remaining = league.members.filter((m) => m !== ownerId);
  let next: GameState = { ...state, league: remaining.length === 0 ? undefined : { ...league, members: remaining } };
  for (const m of remaining) next = adjustRelation(next, ownerId, m, penalty); // cool with those left behind
  return { ...next, log: [...next.log, `${verb} the Hanseatic League.`].slice(-LOG_CAP) };
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
    next = { ...next, log: [...next.log, log].slice(-LOG_CAP) };
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
 * False if there is no supply or the League is absent. `flows` (optional) restricts
 * the count to routes that actually deliver this turn, so a severed non-member does
 * not break the corner (A2); it defaults to counting every route. Pure.
 */
export function isLeagueMonopoly(
  state: GameState,
  good: string,
  kontor: KontorId,
  flows: (route: TradeRoute) => boolean = () => true,
): boolean {
  if (!state.league) return false;
  const suppliers = new Set<number>();
  for (const r of state.routes ?? []) {
    if (r.good === good && r.toKontorId === kontor && flows(r)) suppliers.add(r.ownerId);
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
 *
 * Eliminated realms are pruned from the roll *before* anything is paid: a dead member
 * must neither draw the dividend (leaked gold) nor dilute the living members' share,
 * nor freeze the Aldermanship as a ghost holder (A4). The pruned membership is written
 * back to `state.league`; if it empties, the League dissolves.
 */
export function stepLeague(state: GameState): GameState {
  const league = state.league;
  if (!league || league.members.length === 0) return state;

  // 0) Prune the dead from the roll. If no living member remains, the League is gone.
  const members = league.members.filter((m) => nationById(state, m)?.alive ?? false);
  if (members.length === 0) {
    return { ...state, league: undefined, log: [...state.log, "The Hanseatic League dissolves — no realms remain to uphold it."].slice(-LOG_CAP) };
  }
  const workingLeague = { ...league, members };

  // 1) Dividend — split the pool equally among the LIVING members.
  const pool = leagueDividendPool({ ...state, league: workingLeague });
  const share = round1(pool / members.length);
  let nations = state.nations;
  if (share > 0) {
    nations = nations.map((n) => (members.includes(n.id) ? { ...n, stocks: { ...n.stocks, gold: round1(n.stocks.gold + share) } } : n));
  }

  // Housekeeping — a boycott of a realm that has since joined (or died out) lapses.
  const boycotts = workingLeague.boycotts.filter((id) => !members.includes(id));
  const nextLeague = { ...workingLeague, boycotts };

  let next: GameState = { ...state, nations, league: nextLeague };

  // 2) Mutual defence — anyone warring a member cools with every member (short of a
  // formal call-to-arms; the enmity feeds the existing coalition/relations systems).
  for (const aggressor of state.nations) {
    if (aggressor.isBarbarian || members.includes(aggressor.id)) continue;
    if (!members.some((m) => atWar(state, aggressor.id, m))) continue;
    for (const m of members) next = adjustRelation(next, aggressor.id, m, DEFENCE_ENMITY);
  }
  const playerShare = members.includes(PLAYER_ID) ? share : 0;
  if (playerShare > 0) {
    next = { ...next, log: [...next.log, `The Hanseatic League's Kontore paid you a +${playerShare}g dividend.`].slice(-LOG_CAP) };
  }
  return next;
}

// --- small local helpers (kept here to avoid import cycles) ------------------

function nameOf(state: GameState, id: number): string {
  return state.nations.find((n: Nation) => n.id === id)?.name ?? "A realm";
}
