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
import type { TraitId } from "@/data/traits";

interface EventDef {
  id: string;
  weight: number;
  /** Optional gate: only fires for nations that pass (defaults to always). */
  eligible?: (state: GameState, nationId: number) => boolean;
  /** Apply to a nation; returns new state + a log message (or null to skip). */
  apply: (state: GameState, nationId: number, rng: Rng) => { state: GameState; message: string } | null;
}

/** Gate an event to nations carrying a specific national trait. */
function hasTrait(trait: TraitId): (state: GameState, nationId: number) => boolean {
  return (state, nationId) => state.nations.find((n) => n.id === nationId)?.trait === trait;
}

/** Add a flat amount to one of a nation's stockpiles. */
function addStock(
  state: GameState,
  nationId: number,
  key: "food" | "materials" | "gold" | "knowledge",
  amount: number,
  cap = Infinity,
): GameState {
  const nations = state.nations.map((n) =>
    n.id === nationId
      ? { ...n, stocks: { ...n.stocks, [key]: round1(Math.min(cap, n.stocks[key] + amount)) } }
      : n,
  );
  return { ...state, nations };
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
  {
    // Gold windfall — the coin counterpart to good_harvest / ore_discovery.
    id: "market_boom",
    weight: 3,
    apply: (state, nationId) => ({
      state: addStock(state, nationId, "gold", 18),
      message: "A market boom fills the coffers.",
    }),
  },
  {
    // Knowledge windfall (advances the current tech, else banks knowledge).
    id: "wandering_scholars",
    weight: 2,
    apply: (state, nationId) => {
      const nation = state.nations.find((n) => n.id === nationId);
      if (!nation) return null;
      const nations = state.nations.map((n) =>
        n.id === nationId
          ? n.research.current
            ? { ...n, research: { ...n.research, progress: round1(n.research.progress + 14) } }
            : { ...n, stocks: { ...n.stocks, knowledge: round1(n.stocks.knowledge + 12) } }
          : n,
      );
      return { state: { ...state, nations }, message: "Wandering scholars share new learning." };
    },
  },
  {
    // Unrest relief — a counterweight to plague / local_uprising, eases every
    // owned region a little.
    id: "festival",
    weight: 2,
    apply: (state, nationId) => {
      const owned = state.regions.filter((r) => r.ownerId === nationId);
      if (!owned.length) return null;
      const regions = state.regions.map((r) =>
        r.ownerId === nationId ? { ...r, unrest: Math.max(0, round1(r.unrest - 8)) } : r,
      );
      return { state: { ...state, regions }, message: "A grand festival lifts spirits — unrest eases." };
    },
  },

  // --- Trait-flavoured events: each fires only for a nation with that trait,
  // giving a modest windfall along its strength (design §6). ---
  {
    id: "bountiful_season",
    weight: 1,
    eligible: hasTrait("fertile"),
    apply: (state, nationId) => ({
      state: addStock(state, nationId, "food", 16, GRANARY_CAP),
      message: "A bountiful season — fertile fields overflow.",
    }),
  },
  {
    id: "master_craftsmen",
    weight: 1,
    eligible: hasTrait("industrious"),
    apply: (state, nationId) => ({
      state: addStock(state, nationId, "materials", 18),
      message: "Master craftsmen deliver a surge of materials.",
    }),
  },
  {
    id: "trade_caravan",
    weight: 1,
    eligible: hasTrait("mercantile"),
    apply: (state, nationId) => ({
      state: addStock(state, nationId, "gold", 26),
      message: "A rich trade caravan arrives — coffers swell.",
    }),
  },
  {
    id: "scholarly_breakthrough",
    weight: 1,
    eligible: hasTrait("scholarly"),
    apply: (state, nationId) => {
      const nation = state.nations.find((n) => n.id === nationId);
      if (!nation) return null;
      // Advance the current research if any, else bank knowledge.
      const nations = state.nations.map((n) =>
        n.id === nationId
          ? n.research.current
            ? { ...n, research: { ...n.research, progress: round1(n.research.progress + 22) } }
            : { ...n, stocks: { ...n.stocks, knowledge: round1(n.stocks.knowledge + 18) } }
          : n,
      );
      return { state: { ...state, nations }, message: "A scholarly breakthrough speeds your research." };
    },
  },
  {
    id: "veteran_volunteers",
    weight: 1,
    eligible: hasTrait("martial"),
    apply: (state, nationId, rng) => {
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
        message: `Veteran volunteers muster at ${region.name}.`,
      };
    },
  },
];

/** Fire a single random event for a nation. Returns state unchanged if it fizzles. */
export function fireEvent(state: GameState, nationId: number, rng: Rng): GameState {
  // Only events this nation is eligible for (trait gates, etc.).
  const pool = EVENTS.filter((e) => !e.eligible || e.eligible(state, nationId));
  const totalWeight = pool.reduce((s, e) => s + e.weight, 0);
  let roll = rng.next() * totalWeight;
  let chosen = pool[0]!;
  for (const e of pool) {
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
