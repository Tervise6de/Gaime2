/**
 * Bounded random events (docs/game-design.md §6) — texture, not coin-flips.
 *
 * Low variance by design: events add colour and small adaptations, never swing
 * a game. Each is single-beat (no branching chains). They fire with a low
 * per-turn probability and apply a modest effect to a nation, using the state's
 * RNG stream so the whole thing stays deterministic.
 *
 * Pure over `GameState`.
 */

import type { Rng } from "@/systems/rng";
import {
  GRANARY_CAP,
  MIN_POPULATION,
  UNREST_MAX,
  emptyUnits,
  type GameState,
  type Region,
} from "@/systems/state";
import { round1 } from "@/systems/economy";

interface EventDef {
  id: string;
  weight: number;
  /** Apply to a nation; returns new state + a log message (or null to skip). */
  apply: (state: GameState, nationId: number, rng: Rng) => { state: GameState; message: string } | null;
}

const EVENTS: EventDef[] = [
  {
    id: "good_harvest",
    weight: 3,
    apply: (state, nationId) => {
      const nations = state.nations.map((n) =>
        n.id === nationId
          ? { ...n, stocks: { ...n.stocks, food: round1(Math.min(GRANARY_CAP, n.stocks.food + 12)) } }
          : n,
      );
      return { state: { ...state, nations }, message: "Good harvest — granaries fill." };
    },
  },
  {
    id: "ore_discovery",
    weight: 3,
    apply: (state, nationId) => {
      const nations = state.nations.map((n) =>
        n.id === nationId
          ? { ...n, stocks: { ...n.stocks, materials: round1(n.stocks.materials + 15) } }
          : n,
      );
      return { state: { ...state, nations }, message: "Ore discovery — a windfall of materials." };
    },
  },
  {
    id: "migration_wave",
    weight: 2,
    apply: (state, nationId, rng) =>
      mutateRegion(state, nationId, rng, (r) => ({ ...r, population: round1(r.population + 2) }), "Migration wave swells a region."),
  },
  {
    id: "plague",
    weight: 2,
    apply: (state, nationId, rng) =>
      mutateRegion(
        state,
        nationId,
        rng,
        (r) => ({
          ...r,
          population: round1(Math.max(MIN_POPULATION, r.population * 0.8)),
          unrest: Math.min(UNREST_MAX, r.unrest + 8),
        }),
        "Plague strikes — population and order suffer.",
      ),
  },
  {
    id: "local_uprising",
    weight: 2,
    apply: (state, nationId, rng) =>
      mutateRegion(
        state,
        nationId,
        rng,
        (r) => ({ ...r, unrest: Math.min(UNREST_MAX, r.unrest + 15) }),
        "A local uprising flares — unrest spikes.",
      ),
  },
  {
    id: "mercenaries",
    weight: 2,
    apply: (state, nationId, rng) => {
      // Free wandering mercenaries join a random owned region's garrison.
      const owned = state.regions.filter((r) => r.ownerId === nationId);
      if (!owned.length) return null;
      const region = owned[rng.int(0, owned.length - 1)]!;
      const existing = state.armies.find((a) => a.regionId === region.id && a.ownerId === nationId);
      let armies = state.armies;
      let nextArmyId = state.nextArmyId;
      if (existing) {
        armies = state.armies.map((a) =>
          a.id === existing.id ? { ...a, units: { ...a.units, militia: a.units.militia + 2 } } : a,
        );
      } else {
        armies = [
          ...state.armies,
          { id: nextArmyId, ownerId: nationId, regionId: region.id, units: { ...emptyUnits(), militia: 2 }, movesLeft: 0 },
        ];
        nextArmyId += 1;
      }
      return {
        state: { ...state, armies, nextArmyId },
        message: `Wandering mercenaries join your garrison at ${region.name}.`,
      };
    },
  },
];

const TOTAL_WEIGHT = EVENTS.reduce((s, e) => s + e.weight, 0);

/** Fire a single random event for a nation. Returns state unchanged if it fizzles. */
export function fireEvent(state: GameState, nationId: number, rng: Rng): GameState {
  let roll = rng.next() * TOTAL_WEIGHT;
  let chosen = EVENTS[0]!;
  for (const e of EVENTS) {
    roll -= e.weight;
    if (roll <= 0) {
      chosen = e;
      break;
    }
  }
  const result = chosen.apply(state, nationId, rng);
  if (!result) return state;
  const nation = state.nations.find((n) => n.id === nationId);
  const prefix = nation && !nation.isPlayer ? `${nation.name}: ` : "";
  return { ...result.state, log: [...result.state.log, `${prefix}${result.message}`].slice(-50) };
}

function mutateRegion(
  state: GameState,
  nationId: number,
  rng: Rng,
  fn: (r: Region) => Region,
  message: string,
): { state: GameState; message: string } | null {
  const owned = state.regions.filter((r) => r.ownerId === nationId);
  if (!owned.length) return null;
  const target = owned[rng.int(0, owned.length - 1)]!;
  const regions = state.regions.map((r) => (r.id === target.id ? fn(r) : r));
  return { state: { ...state, regions }, message };
}
