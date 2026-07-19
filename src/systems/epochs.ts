/**
 * Epoch events — scheduler + effects for the historical beats in
 * data/epochEvents.ts (the Black Death, the herring monopoly, the Victual
 * Brothers, a great fire, the Novgorod Peterhof's closure).
 *
 * A separate layer from the bounded random events (systems/events.ts): the
 * timeline is rolled ONCE at game start (`scheduleEpochs`) from a dedicated RNG,
 * so it never perturbs the game's own stream, and `stepEpochs` fires whatever is
 * due each turn. Each event fires at its anchor year ± a window (and only if its
 * chance rolls), so every game gets its own history and nothing lands on the same
 * turn twice. Pure over GameState — no DOM, no wall-clock.
 */

import type { Rng } from "@/systems/rng";
import {
  MIN_POPULATION,
  UNREST_MAX,
  PLAYER_ID,
  type GameState,
  type ScheduledEpoch,
  type FiredEpochNote,
} from "@/systems/state";
import { EPOCH_EVENTS, type EpochEventDef } from "@/data/epochEvents";
import { BASE_YEAR, YEARS_PER_TURN, yearForTurn } from "@/data/eras";
import { round1 } from "@/systems/economy";

/** Inverse of yearForTurn: the (≥1) game turn a calendar year falls on. */
export function turnForYear(year: number): number {
  return Math.max(1, Math.round(1 + (year - BASE_YEAR) / YEARS_PER_TURN));
}

/**
 * Roll the historical timeline once at game start. Deterministic from `rng`
 * (pass a dedicated, salted RNG so this can't shift the game's own stream).
 * Each event may or may not happen (its `chance`); if it does, it fires at its
 * anchor year ± window — so no two games share a schedule.
 */
export function scheduleEpochs(rng: Rng): ScheduledEpoch[] {
  const out: ScheduledEpoch[] = [];
  for (const e of EPOCH_EVENTS) {
    if (rng.next() >= e.chance) continue; // may or may not happen this game
    const jitter = rng.int(-e.windowYears, e.windowYears);
    out.push({ id: e.id, fireTurn: turnForYear(e.year + jitter) });
  }
  return out.sort((a, b) => a.fireTurn - b.fireTurn);
}

/**
 * Fire any scheduled epoch events that are due (fireTurn ≤ current turn). Fired
 * events are removed from the schedule. Pure. `rng` varies which region an event
 * strikes so the same event never plays out identically.
 */
export function stepEpochs(state: GameState, rng: Rng): GameState {
  const schedule = state.epochs;
  if (!schedule || schedule.length === 0) return state;
  const due = schedule.filter((e) => e.fireTurn <= state.turn);
  if (due.length === 0) return state;
  let s: GameState = { ...state, epochs: schedule.filter((e) => e.fireTurn > state.turn) };
  for (const d of due) {
    const def = EPOCH_EVENTS.find((e) => e.id === d.id);
    if (def) s = applyEpoch(s, def, rng);
  }
  return s;
}

/**
 * Announce a fired event: append to the turn log (stamped with the in-game year)
 * AND record a structured note the HUD surfaces as a notification. `filled` is the
 * event's headline with its {place} resolved.
 */
function announce(state: GameState, def: EpochEventDef, filled: string): GameState {
  const year = yearForTurn(state.turn);
  const note: FiredEpochNote = { id: def.id, year, headline: filled };
  return {
    ...state,
    log: [...state.log, `⚑ ${year} — ${filled}`].slice(-50),
    firedEpochs: [...(state.firedEpochs ?? []), note],
  };
}

const bumpUnrest = (u: number, by: number): number => Math.min(UNREST_MAX, u + by);
const cull = (pop: number, loss: number): number => round1(Math.max(MIN_POPULATION, pop * (1 - loss)));

function applyEpoch(state: GameState, def: EpochEventDef, rng: Rng): GameState {
  const eff = def.effect;
  switch (eff.kind) {
    case "plague": {
      // The plague came up the trade lanes into the crowded ports, so the great
      // towns die hardest. Strike a spread from among the most populous regions
      // (rng picks which, so the same plague never hits the same towns twice).
      const ranked = [...state.regions].sort((a, b) => b.population - a.population);
      const pool = ranked.slice(0, Math.min(ranked.length, eff.regions * 2));
      const hit = new Set<number>();
      let guard = 0;
      while (hit.size < Math.min(eff.regions, pool.length) && guard++ < 100) {
        hit.add(pool[rng.int(0, pool.length - 1)]!.id);
      }
      const place = ranked[0]?.name ?? "the ports";
      const regions = state.regions.map((r) =>
        hit.has(r.id) ? { ...r, population: cull(r.population, eff.popLoss), unrest: bumpUnrest(r.unrest, eff.unrest) } : r,
      );
      return announce({ ...state, regions }, def, def.headline.replace("{place}", place));
    }
    case "trade_boom": {
      // A windfall to every realm, scaled by how much land (and thus trade) it holds.
      const nations = state.nations.map((n) => {
        if (n.isBarbarian || !n.alive) return n;
        const owned = state.regions.filter((r) => r.ownerId === n.id).length;
        return owned > 0 ? { ...n, stocks: { ...n.stocks, gold: round1(n.stocks.gold + owned * eff.goldPerRegion) } } : n;
      });
      return announce({ ...state, nations }, def, def.headline);
    }
    case "pirates": {
      // A raid on one of the player's shores: gold lost, that province unsettled.
      const coast =
        state.regions.find((r) => r.ownerId === PLAYER_ID && r.terrain === "coast") ??
        state.regions.find((r) => r.ownerId === PLAYER_ID);
      const place = coast?.name ?? "the coast";
      const nations = state.nations.map((n) =>
        n.id === PLAYER_ID ? { ...n, stocks: { ...n.stocks, gold: round1(Math.max(0, n.stocks.gold - eff.goldLoss)) } } : n,
      );
      const regions = coast
        ? state.regions.map((r) => (r.id === coast.id ? { ...r, unrest: bumpUnrest(r.unrest, eff.unrest) } : r))
        : state.regions;
      return announce({ ...state, nations, regions }, def, def.headline.replace("{place}", place));
    }
    case "great_fire": {
      // Fire guts the busiest wharf-town: people lost, its owner's stockpiled
      // materials burned. rng picks among the biggest ports.
      const ports = [...state.regions]
        .filter((r) => r.terrain === "coast")
        .sort((a, b) => b.population - a.population);
      const pool = (ports.length ? ports : [...state.regions].sort((a, b) => b.population - a.population)).slice(0, 3);
      if (pool.length === 0) return announce(state, def, def.headline.replace("{place}", "a great port"));
      const town = pool[rng.int(0, pool.length - 1)]!;
      const regions = state.regions.map((r) =>
        r.id === town.id ? { ...r, population: cull(r.population, eff.popLoss), unrest: bumpUnrest(r.unrest, eff.unrest) } : r,
      );
      const nations = state.nations.map((n) =>
        n.id === town.ownerId
          ? { ...n, stocks: { ...n.stocks, materials: round1(Math.max(0, n.stocks.materials - eff.materialsLoss)) } }
          : n,
      );
      return announce({ ...state, regions, nations }, def, def.headline.replace("{place}", town.name));
    }
    case "kontor_closed": {
      // Only bites where the Kontor exists and is open (else the history is moot).
      if (!state.kontore || !state.kontore.some((k) => k.id === eff.kontor && k.open)) return state;
      const kontore = state.kontore.map((k) => (k.id === eff.kontor ? { ...k, open: false, holderId: null } : k));
      return announce({ ...state, kontore }, def, def.headline);
    }
    default:
      return state;
  }
}
