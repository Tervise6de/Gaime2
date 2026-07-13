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
  PLAYER_ID,
  UNREST_MAX,
  emptyUnits,
  type GameState,
  type Region,
} from "@/systems/state";
import { round1 } from "@/systems/economy";
import type { TraitId } from "@/data/traits";
import type { UnitType } from "@/data/units";

type EventOutcome = { state: GameState; message: string } | null;

/** A branching option on a choice event — the player picks one; the AI auto-picks. */
interface EventChoiceOption {
  id: string;
  label: string;
  detail: string;
  apply: (state: GameState, nationId: number) => EventOutcome;
}

interface EventChoice {
  prompt: string;
  options: EventChoiceOption[];
  /** Which option id an AI nation takes (deterministic). */
  aiPick: (state: GameState, nationId: number) => string;
}

interface EventDef {
  id: string;
  weight: number;
  /** Optional gate: only fires for nations that pass (defaults to always). */
  eligible?: (state: GameState, nationId: number) => boolean;
  /** Immediate effect (auto-resolving events). Mutually exclusive with `choice`. */
  apply?: (state: GameState, nationId: number, rng: Rng) => EventOutcome;
  /** A player-facing decision; the AI resolves it automatically via `aiPick`. */
  choice?: EventChoice;
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

/**
 * Add units to a nation's garrison at its capital (if still held) or, failing
 * that, its first owned region. Deterministic — no RNG — so it is safe to run
 * from a player's choice resolution as well as an AI event.
 */
function reinforce(state: GameState, nationId: number, unit: UnitType, count: number): GameState {
  const owned = state.regions.filter((r) => r.ownerId === nationId);
  if (!owned.length) return state;
  const nation = state.nations.find((n) => n.id === nationId);
  const capHeld =
    nation?.capitalRegionId !== undefined && state.regions[nation.capitalRegionId]?.ownerId === nationId;
  const region = capHeld ? state.regions[nation!.capitalRegionId!]! : owned[0]!;
  const existing = state.armies.find((a) => a.regionId === region.id && a.ownerId === nationId);
  if (existing) {
    const armies = state.armies.map((a) =>
      a.id === existing.id ? { ...a, units: { ...a.units, [unit]: a.units[unit] + count } } : a,
    );
    return { ...state, armies };
  }
  const armies = [
    ...state.armies,
    { id: state.nextArmyId, ownerId: nationId, regionId: region.id, units: { ...emptyUnits(), [unit]: count }, movesLeft: 0 },
  ];
  return { ...state, armies, nextArmyId: state.nextArmyId + 1 };
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
  {
    // A player-facing DECISION: hire a passing mercenary company, or send it on.
    // The AI resolves it deterministically via aiPick.
    id: "mercenary_offer",
    weight: 2,
    choice: {
      prompt: "A mercenary company offers its blades for 40 gold.",
      options: [
        {
          id: "hire",
          label: "Hire (−40g)",
          detail: "Pay 40 gold; 2 infantry join your capital garrison.",
          apply: (state, nationId) => {
            const nation = state.nations.find((n) => n.id === nationId);
            if (!nation || nation.stocks.gold < 40) {
              return { state, message: "The coffers are too bare to hire the mercenaries." };
            }
            const paid = addStock(state, nationId, "gold", -40);
            return { state: reinforce(paid, nationId, "infantry", 2), message: "Mercenaries hired — 2 infantry bolster your ranks." };
          },
        },
        {
          id: "decline",
          label: "Decline",
          detail: "Keep your gold; send them on their way.",
          apply: (state) => ({ state, message: "You turn the mercenary company away." }),
        },
      ],
      // A funded, aggressive AI hires; the cautious or cash-poor decline.
      aiPick: (state, nationId) => {
        const n = state.nations.find((x) => x.id === nationId);
        const aggr = n?.personality?.aggression ?? 0.4;
        return n && n.stocks.gold >= 60 && aggr >= 0.5 ? "hire" : "decline";
      },
    },
  },
  {
    // DECISION: convert gold into materials + knowledge via an expedition.
    id: "expedition",
    weight: 2,
    choice: {
      prompt: "Scouts have found ruins beyond the frontier. Fund an expedition for 30 gold?",
      options: [
        {
          id: "fund",
          label: "Fund it (−30g)",
          detail: "Spend 30 gold; return with 25 materials and 15 knowledge.",
          apply: (state, nationId) => {
            const n = state.nations.find((x) => x.id === nationId);
            if (!n || n.stocks.gold < 30) {
              return { state, message: "The coffers are too bare to fund an expedition." };
            }
            let s = addStock(state, nationId, "gold", -30);
            s = addStock(s, nationId, "materials", 25);
            s = addStock(s, nationId, "knowledge", 15);
            return { state: s, message: "The expedition returns laden with materials and lore." };
          },
        },
        {
          id: "ignore",
          label: "Ignore",
          detail: "Leave the ruins to the dust.",
          apply: (state) => ({ state, message: "You leave the ruins unexplored." }),
        },
      ],
      // Economy-minded, funded AIs invest; others pass.
      aiPick: (state, nationId) => {
        const n = state.nations.find((x) => x.id === nationId);
        const econ = n?.personality?.economy ?? 0.5;
        return n && n.stocks.gold >= 50 && econ >= 0.5 ? "fund" : "ignore";
      },
    },
  },
  {
    // DECISION: spend food to relieve unrest across the realm.
    id: "grain_aid",
    weight: 1,
    choice: {
      prompt: "A starving border town begs for grain. Open your granaries?",
      options: [
        {
          id: "aid",
          label: "Share grain (−12 food)",
          detail: "Give 12 food; eases unrest by 6 across all your regions.",
          apply: (state, nationId) => {
            const n = state.nations.find((x) => x.id === nationId);
            if (!n || n.stocks.food < 12) {
              return { state, message: "The granaries are too empty to share." };
            }
            const fed = addStock(state, nationId, "food", -12);
            const regions = fed.regions.map((r) =>
              r.ownerId === nationId ? { ...r, unrest: Math.max(0, round1(r.unrest - 6)) } : r,
            );
            return { state: { ...fed, regions }, message: "Your granaries relieve the town — the realm's mood lifts." };
          },
        },
        {
          id: "refuse",
          label: "Refuse",
          detail: "Keep the grain for your own.",
          apply: (state) => ({ state, message: "You turn the petitioners away." }),
        },
      ],
      // Nations with a food surplus share; the hungry keep it.
      aiPick: (state, nationId) => {
        const n = state.nations.find((x) => x.id === nationId);
        return n && n.stocks.food >= 24 ? "aid" : "refuse";
      },
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
  const nation = state.nations.find((n) => n.id === nationId);
  const prefix = nation && !nation.isPlayer ? `${nation.name}: ` : "";

  // A choice event: the player is prompted (decision pends); the AI auto-resolves.
  if (chosen.choice) {
    if (nation?.isPlayer) {
      const pendingChoice = {
        eventId: chosen.id,
        prompt: chosen.choice.prompt,
        options: chosen.choice.options.map((o) => ({ id: o.id, label: o.label, detail: o.detail })),
      };
      return { ...state, pendingChoice, log: [...state.log, `A decision awaits — ${chosen.choice.prompt}`].slice(-50) };
    }
    const pick = chosen.choice.aiPick(state, nationId);
    const opt = chosen.choice.options.find((o) => o.id === pick) ?? chosen.choice.options[0]!;
    const outcome = opt.apply(state, nationId);
    if (!outcome) return state;
    return { ...outcome.state, log: [...outcome.state.log, `${prefix}${outcome.message}`].slice(-50) };
  }

  const result = chosen.apply?.(state, nationId, rng);
  if (!result) return state;
  return { ...result.state, log: [...result.state.log, `${prefix}${result.message}`].slice(-50) };
}

/**
 * Resolve the player's pending decision by applying the chosen option's effect
 * and clearing the prompt. A no-op (just clears) if nothing pends or the option
 * is unknown. Always acts for the player (only players get a pending choice).
 */
export function resolveChoice(state: GameState, optionId: string): GameState {
  const pc = state.pendingChoice;
  if (!pc) return state;
  const ev = EVENTS.find((e) => e.id === pc.eventId);
  const opt = ev?.choice?.options.find((o) => o.id === optionId);
  if (!opt) return { ...state, pendingChoice: undefined };
  const outcome = opt.apply(state, PLAYER_ID);
  const base = outcome ? outcome.state : state;
  const log = outcome ? [...base.log, outcome.message].slice(-50) : base.log;
  return { ...base, pendingChoice: undefined, log };
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
