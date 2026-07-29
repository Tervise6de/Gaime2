/**
 * Hansa control — the trade-power race (docs/game-design.md §6).
 *
 * The board already had two ways to win, and both of them were land: hold most
 * of the map, or lead a score at the turn limit. That made conquest the obvious
 * answer to a game whose first design pillar is "trade first" — every Kontor,
 * route, League vote and blockade was flavour hung off a war game.
 *
 * This is the third path, and the one the setting argues for. The League had
 * "no state, no standing army, no permanent navy, no common treasury, no
 * written constitution" (hansa times.md §3); its power was the network — the
 * Kontore it sat in, the wares it carried, the towns that voted with it, and
 * the sea lanes it could close. So control is measured on exactly those four:
 *
 *   Kontore   — the four great trading posts: hold the town, or at least trade there
 *   Wares     — your share of everything the network carries
 *   League    — outside it, in it, or leading it as Alderman
 *   Sea lanes — the coasts you hold and the water your hulls can deny
 *
 * A realm that keeps `HANSA_VICTORY` of that for `HANSA_HOLD_TURNS` running
 * turns has made itself the Hansa, and wins. The hold is the point: control can
 * be taken away — a Kontor stormed, a lane blockaded, a boycott — so the race
 * rewards holding a network, not touching a number once.
 *
 * Pure over `GameState`; every value is 0..1 so the UI can draw them as bars.
 */

import { KONTORE, KONTOR_IDS } from "@/data/kontore";
import { SEA_ZONES, SEA_ZONE_IDS } from "@/data/sea";
import { inLeague, BARBARIAN_ID, type GameState } from "@/systems/state";
import { leagueLeader } from "@/systems/league";
import { atWar } from "@/systems/diplomacy";
import { armyIsAtSea, armyIsFleet } from "@/systems/military";

/** Control needed to be *the* Hansa. */
export const HANSA_VICTORY = 0.6;
/** Consecutive turns it must be held — a network, not a moment. */
export const HANSA_HOLD_TURNS = 6;

/**
 * What each strand is worth. The Kontore lead because they are the network's
 * fixed points and the hardest to take; the ware share is the money; the League
 * is the politics that can shut a rival out; the lanes are the enforcement.
 */
export const HANSA_WEIGHTS = {
  kontore: 0.35,
  wares: 0.3,
  league: 0.2,
  lanes: 0.15,
} as const;

/** Credit for trading at a Kontor you do not own — access, not possession. */
const KONTOR_ACCESS_CREDIT = 0.35;

export interface HansaControl {
  /** Kontore held (full) or traded with (partial), 0..1. */
  kontore: number;
  /** Share of all route income moving through the network, 0..1. */
  wares: number;
  /** 0 outside the League, 0.55 a member, 1 the Alderman. */
  league: number;
  /** Coasts held and water denied across the six seas, 0..1. */
  lanes: number;
  /** The weighted total, 0..1. */
  total: number;
}

/** One realm's grip on the trading world. Pure. */
export function hansaControl(state: GameState, nationId: number): HansaControl {
  const kontore = kontorControl(state, nationId);
  const wares = wareShare(state, nationId);
  const league = leagueStanding(state, nationId);
  const lanes = laneControl(state, nationId);
  const total =
    kontore * HANSA_WEIGHTS.kontore +
    wares * HANSA_WEIGHTS.wares +
    league * HANSA_WEIGHTS.league +
    lanes * HANSA_WEIGHTS.lanes;
  return { kontore, wares, league, lanes, total: clamp01(total) };
}

/**
 * Holding the host town is full control of a Kontor; running a route into one
 * you do not hold is a foothold worth a third of it. Averaged over the four.
 */
function kontorControl(state: GameState, nationId: number): number {
  let sum = 0;
  for (const id of KONTOR_IDS) {
    const host = state.regions[KONTORE[id].regionId];
    if (host?.ownerId === nationId) {
      sum += 1;
      continue;
    }
    const trades = (state.routes ?? []).some(
      (route) => route.ownerId === nationId && route.toKontorId === id && !route.disrupted,
    );
    if (trades) sum += KONTOR_ACCESS_CREDIT;
  }
  return clamp01(sum / KONTOR_IDS.length);
}

/**
 * Your share of everything the network earns. Income, not route count: six
 * routes of salt to a shuttered Kontor are not trade power. A world with no
 * trade at all gives nobody credit for it.
 */
function wareShare(state: GameState, nationId: number): number {
  let mine = 0;
  let all = 0;
  for (const route of state.routes ?? []) {
    const income = Math.max(0, route.lastIncome ?? 0);
    all += income;
    if (route.ownerId === nationId) mine += income;
  }
  return all <= 0 ? 0 : clamp01(mine / all);
}

/** Outside the League, inside it, or its Alderman. */
function leagueStanding(state: GameState, nationId: number): number {
  if (!inLeague(state, nationId)) return 0;
  return leagueLeader(state) === nationId ? 1 : 0.55;
}

/**
 * The seas, one at a time: two thirds for the share of the zone's held ports
 * that are yours (a lane is worked from its harbours), one third for being able
 * to deny the water — your hulls there, with no hostile fleet contesting them.
 */
function laneControl(state: GameState, nationId: number): number {
  let sum = 0;
  for (const zoneId of SEA_ZONE_IDS) {
    const zone = SEA_ZONES[zoneId];
    let mine = 0;
    let held = 0;
    for (const regionId of zone.coastalRegions) {
      const owner = state.regions[regionId]?.ownerId;
      if (owner === undefined || owner === null || owner === BARBARIAN_ID) continue;
      held += 1;
      if (owner === nationId) mine += 1;
    }
    const ports = held > 0 ? mine / held : 0;

    let ours = false;
    let hostile = false;
    for (const army of state.armies) {
      if (!armyIsAtSea(army) || army.seaZoneId !== zoneId || !armyIsFleet(army.units)) continue;
      if (army.ownerId === nationId) ours = true;
      else if (army.ownerId === BARBARIAN_ID || atWar(state, nationId, army.ownerId)) hostile = true;
    }
    sum += ports * 0.66 + (ours && !hostile ? 0.34 : 0);
  }
  return clamp01(sum / SEA_ZONE_IDS.length);
}

/** The realm with the firmest grip on the network, or null on an empty board. */
export function hansaLeader(state: GameState): { id: number; control: HansaControl } | null {
  let best: { id: number; control: HansaControl } | null = null;
  for (const nation of state.nations) {
    if (nation.isBarbarian || !nation.alive) continue;
    const control = hansaControl(state, nation.id);
    if (!best || control.total > best.control.total) best = { id: nation.id, control };
  }
  return best;
}

/**
 * Advance every realm's hold counter: a turn at or above the threshold adds
 * one, anything less resets it to zero. Called once per turn before the victory
 * check, so `nation.hansaHold` is always "turns held running". Pure.
 */
export function tickHansaHold(state: GameState): GameState {
  const nations = state.nations.map((n) => {
    if (n.isBarbarian || !n.alive) return n.hansaHold ? { ...n, hansaHold: 0 } : n;
    const held = hansaControl(state, n.id).total >= HANSA_VICTORY ? (n.hansaHold ?? 0) + 1 : 0;
    return held === (n.hansaHold ?? 0) ? n : { ...n, hansaHold: held };
  });
  return { ...state, nations };
}

/** The realm that has held the network long enough to have won, if any. Pure. */
export function hansaWinner(state: GameState): number | null {
  for (const n of state.nations) {
    if (n.isBarbarian || !n.alive) continue;
    if ((n.hansaHold ?? 0) >= HANSA_HOLD_TURNS) return n.id;
  }
  return null;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
