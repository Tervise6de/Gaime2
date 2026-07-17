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
  BARBARIAN_ID,
  GRANARY_CAP,
  MIN_POPULATION,
  PLAYER_ID,
  RESEARCH_SURGE_TURNS,
  UNREST_MAX,
  emptyUnits,
  type GameState,
  type ModifierId,
  type Region,
} from "@/systems/state";
import { atWar, adjustRelation, getRelation } from "@/systems/diplomacy";
import { round1 } from "@/systems/economy";
import type { TraitId } from "@/data/traits";

/** Add (or refresh) a temporary national modifier for `turns` turns. Pure. */
function addModifier(state: GameState, nationId: number, id: ModifierId, turns: number): GameState {
  const nations = state.nations.map((n) => {
    if (n.id !== nationId) return n;
    const others = (n.modifiers ?? []).filter((m) => m.id !== id);
    return { ...n, modifiers: [...others, { id, turnsLeft: turns }] };
  });
  return { ...state, nations };
}
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

/**
 * The nation's most exposed border region — an owned region bordering land it
 * does not hold — preferring the least-fortified (ties by id). Null if the realm
 * has no frontier. Deterministic; used to place a wall-reinforcement.
 */
function frontierRegion(state: GameState, nationId: number): Region | null {
  const frontier = state.regions.filter(
    (r) =>
      r.ownerId === nationId &&
      r.adjacency.some((nb) => {
        const n = state.regions[nb];
        return n !== undefined && n.ownerId !== nationId;
      }),
  );
  if (!frontier.length) return null;
  return frontier.reduce((best, r) =>
    r.fortification < best.fortification || (r.fortification === best.fortification && r.id < best.id) ? r : best,
  );
}

/**
 * A fortified hostile region (barbarian, or a rival the nation is at war with)
 * bordering the nation's land — the most-fortified such neighbour, ties by id.
 * Null if none. The sap-the-walls target: weaken it before an assault.
 */
function hostileFortNeighbour(state: GameState, nationId: number): Region | null {
  const owned = state.regions.filter((r) => r.ownerId === nationId);
  let best: Region | null = null;
  const seen = new Set<number>();
  for (const r of owned) {
    for (const nb of r.adjacency) {
      if (seen.has(nb)) continue;
      seen.add(nb);
      const n = state.regions[nb];
      if (!n || n.ownerId === null || n.ownerId === nationId || n.fortification < 1) continue;
      const hostile = n.ownerId === BARBARIAN_ID || atWar(state, nationId, n.ownerId);
      if (!hostile) continue;
      if (!best || n.fortification > best.fortification || (n.fortification === best.fortification && n.id < best.id)) {
        best = n;
      }
    }
  }
  return best;
}

/**
 * A living non-barbarian rival with the lowest standing toward `nationId` — the
 * natural target for a relations-warming envoy. Ties by id. Null if the nation has
 * no living rival. Deterministic.
 */
function lowestRelationRival(state: GameState, nationId: number): number | null {
  const rivals = state.nations.filter((n) => !n.isBarbarian && n.alive && n.id !== nationId);
  if (!rivals.length) return null;
  let best = rivals[0]!;
  let bestRel = getRelation(state, nationId, best.id);
  for (const r of rivals.slice(1)) {
    const rel = getRelation(state, nationId, r.id);
    if (rel < bestRel || (rel === bestRel && r.id < best.id)) {
      best = r;
      bestRel = rel;
    }
  }
  return best.id;
}

/**
 * A province a preacher could win to `nationId`'s faith: first one of the realm's
 * own regions whose people still hold another faith (the conversion sticks — you
 * rule them), else a bordering province of any owner not yet of your faith. Lowest
 * id for determinism. Null if there is nothing to convert. See systems/faith.ts.
 */
function faithConversionTarget(state: GameState, nationId: number): Region | null {
  const ownUnconverted = state.regions.filter((r) => r.ownerId === nationId && r.faith !== nationId);
  if (ownUnconverted.length) return ownUnconverted.reduce((a, r) => (r.id < a.id ? r : a));
  let best: Region | null = null;
  const seen = new Set<number>();
  for (const r of state.regions) {
    if (r.ownerId !== nationId) continue;
    for (const nb of r.adjacency) {
      if (seen.has(nb)) continue;
      seen.add(nb);
      const n = state.regions[nb];
      if (!n || n.faith === nationId) continue;
      if (!best || n.id < best.id) best = n;
    }
  }
  return best;
}

/**
 * A faithful province of `nationId` that borders a *different* living faith — the
 * seam where heresy can take root. Returns the region and the rival faith it slips
 * to (which sticks, via inertia, until you win it back). Lowest id. Null if none.
 */
function heresyTarget(state: GameState, nationId: number): { region: Region; toFaith: number } | null {
  const faithful = state.regions
    .filter((r) => r.ownerId === nationId && r.faith === nationId)
    .sort((a, b) => a.id - b.id);
  for (const r of faithful) {
    for (const nb of r.adjacency) {
      const n = state.regions[nb];
      if (n && n.faith !== undefined && n.faith !== nationId) return { region: r, toFaith: n.faith };
    }
  }
  return null;
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
    // Setback: a dry year — the counterweight to good_harvest. Costs food and
    // unsettles one region, never below the floors.
    id: "drought",
    weight: 2,
    apply: (state, nationId, rng) => {
      const owned = state.regions.filter((r) => r.ownerId === nationId);
      if (!owned.length) return null;
      const drained = addStock(state, nationId, "food", -12);
      const withFloor = {
        ...drained,
        nations: drained.nations.map((n) =>
          n.id === nationId ? { ...n, stocks: { ...n.stocks, food: Math.max(0, n.stocks.food) } } : n,
        ),
      };
      const target = owned[rng.int(0, owned.length - 1)]!;
      const regions = withFloor.regions.map((r) =>
        r.id === target.id ? { ...r, unrest: Math.min(UNREST_MAX, round1(r.unrest + 5)) } : r,
      );
      return { state: { ...withFloor, regions }, message: "A dry year — granaries thin and tempers fray." };
    },
  },
  {
    // Setback: bandits waylay a caravan — the counterweight to market_boom. Never
    // drives the treasury below zero.
    id: "caravan_raided",
    weight: 2,
    apply: (state, nationId) => {
      const drained = addStock(state, nationId, "gold", -12);
      const nations = drained.nations.map((n) =>
        n.id === nationId ? { ...n, stocks: { ...n.stocks, gold: Math.max(0, n.stocks.gold) } } : n,
      );
      return { state: { ...drained, nations }, message: "Bandits waylay a caravan — the coffers lighten." };
    },
  },
  {
    // Setback (frontier only): a raid across an exposed border costs a little
    // population and stirs unrest there. Fires only for a realm with a frontier.
    id: "border_raid",
    weight: 2,
    eligible: (state, nationId) => frontierRegion(state, nationId) !== null,
    apply: (state, nationId) => {
      const target = frontierRegion(state, nationId);
      if (!target) return null;
      const regions = state.regions.map((r) =>
        r.id === target.id
          ? {
              ...r,
              population: round1(Math.max(MIN_POPULATION, r.population - 1)),
              unrest: Math.min(UNREST_MAX, round1(r.unrest + 8)),
            }
          : r,
      );
      return { state: { ...state, regions }, message: `Raiders strike across the border at ${target.name}.` };
    },
  },
  {
    // Windfall: a travelling fair — a small dual boon (a little coin, a little calm).
    id: "traveling_fair",
    weight: 1,
    apply: (state, nationId) => {
      const owned = state.regions.filter((r) => r.ownerId === nationId);
      if (!owned.length) return null;
      const paid = addStock(state, nationId, "gold", 10);
      const regions = paid.regions.map((r) =>
        r.ownerId === nationId ? { ...r, unrest: Math.max(0, round1(r.unrest - 4)) } : r,
      );
      return { state: { ...paid, regions }, message: "A travelling fair passes through — coin and cheer in its wake." };
    },
  },
  {
    // DECISION: pay upfront to kick off a run of prosperity (a lasting +gold modifier).
    id: "golden_jubilee",
    weight: 2,
    choice: {
      prompt: "Merchants propose a golden jubilee — invest 20 gold to spark a boom?",
      options: [
        {
          id: "proclaim",
          label: "Proclaim it (−20g)",
          detail: "Spend 20 gold; +25% gold income for 5 turns.",
          apply: (state, nationId) => {
            const n = state.nations.find((x) => x.id === nationId);
            if (!n || n.stocks.gold < 20) return { state, message: "The treasury cannot fund a jubilee." };
            const paid = addStock(state, nationId, "gold", -20);
            return { state: addModifier(paid, nationId, "prosperity", 5), message: "A golden jubilee begins — trade booms for five turns." };
          },
        },
        {
          id: "pass",
          label: "Not now",
          detail: "Keep the gold; skip the festivities.",
          apply: (state) => ({ state, message: "You let the jubilee pass." }),
        },
      ],
      // A funded, economy-minded AI invests in the boom.
      aiPick: (state, nationId) => {
        const n = state.nations.find((x) => x.id === nationId);
        const econ = n?.personality?.economy ?? 0.5;
        return n && n.stocks.gold >= 40 && econ >= 0.5 ? "proclaim" : "pass";
      },
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
    // DECISION (diplomacy): spend gold on an envoy to warm relations with your
    // frostiest neighbour — a de-escalation lever, the first event to touch
    // diplomacy. Fires only when a living rival exists.
    id: "envoy_exchange",
    weight: 2,
    eligible: (state, nationId) => lowestRelationRival(state, nationId) !== null,
    choice: {
      prompt: "Your chancellor proposes an envoy to a neighbouring court — fund the mission for 20 gold?",
      options: [
        {
          id: "send",
          label: "Send the envoy (−20g)",
          detail: "Spend 20 gold; +15 relations with your lowest-standing rival.",
          apply: (state, nationId) => {
            const n = state.nations.find((x) => x.id === nationId);
            if (!n || n.stocks.gold < 20) return { state, message: "Too little gold to fund an envoy." };
            const target = lowestRelationRival(state, nationId);
            if (target === null) return { state, message: "No neighbouring court to treat with." };
            const paid = addStock(state, nationId, "gold", -20);
            const warmed = adjustRelation(paid, nationId, target, 15);
            const targetName = state.nations.find((x) => x.id === target)?.name ?? "a rival";
            return { state: warmed, message: `Your envoy is well received — relations with ${targetName} warm.` };
          },
        },
        {
          id: "abstain",
          label: "Not now",
          detail: "Keep the gold; leave the courts be.",
          apply: (state) => ({ state, message: "You keep your envoys at home." }),
        },
      ],
      // A funded nation warms ties with a rival it isn't yet friendly with.
      aiPick: (state, nationId) => {
        const n = state.nations.find((x) => x.id === nationId);
        const target = lowestRelationRival(state, nationId);
        if (!n || target === null || n.stocks.gold < 40) return "abstain";
        return getRelation(state, nationId, target) < 20 ? "send" : "abstain";
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
  {
    // DECISION: invest materials in fortifying your most exposed border region —
    // the only source of fortification besides the tech-gated Fortress building.
    id: "reinforce_walls",
    weight: 2,
    choice: {
      prompt: "Master masons offer to reinforce a frontier stronghold — fund the works for 20 materials?",
      options: [
        {
          id: "fund",
          label: "Reinforce the walls (−20 materials)",
          detail: "Spend 20 materials; +1 fortification on your most exposed border region.",
          apply: (state, nationId) => {
            const n = state.nations.find((x) => x.id === nationId);
            if (!n || n.stocks.materials < 20) return { state, message: "Too few materials to reinforce the walls." };
            const target = frontierRegion(state, nationId);
            if (!target) return { state, message: "No frontier stronghold needs reinforcing." };
            const paid = addStock(state, nationId, "materials", -20);
            const regions = paid.regions.map((r) =>
              r.id === target.id ? { ...r, fortification: r.fortification + 1 } : r,
            );
            return { state: { ...paid, regions }, message: `The walls of ${target.name} are reinforced (+1 fortification).` };
          },
        },
        {
          id: "decline",
          label: "Not now",
          detail: "Leave the walls as they stand.",
          apply: (state) => ({ state, message: "You defer the wall-works." }),
        },
      ],
      // A materials-rich nation with an exposed frontier invests in its walls.
      aiPick: (state, nationId) => {
        const n = state.nations.find((x) => x.id === nationId);
        return n && n.stocks.materials >= 35 && frontierRegion(state, nationId) !== null ? "fund" : "decline";
      },
    },
  },
  {
    // DECISION (offered only when a fortified hostile fort borders you): hire
    // sappers to undermine an enemy stronghold before an assault — the offensive
    // counterpart to reinforce_walls, a siege-prep lever for aggressive play.
    id: "sap_the_walls",
    weight: 2,
    eligible: (state, nationId) => hostileFortNeighbour(state, nationId) !== null,
    choice: {
      prompt: "Sappers offer to undermine a bordering enemy stronghold — hire them for 25 gold?",
      options: [
        {
          id: "hire",
          label: "Hire the sappers (−25g)",
          detail: "Spend 25 gold; −1 fortification on the toughest hostile fort on your border.",
          apply: (state, nationId) => {
            const n = state.nations.find((x) => x.id === nationId);
            if (!n || n.stocks.gold < 25) return { state, message: "Too little gold to hire the sappers." };
            const target = hostileFortNeighbour(state, nationId);
            if (!target) return { state, message: "No enemy stronghold stands within reach." };
            const paid = addStock(state, nationId, "gold", -25);
            const regions = paid.regions.map((r) =>
              r.id === target.id ? { ...r, fortification: Math.max(0, r.fortification - 1) } : r,
            );
            return { state: { ...paid, regions }, message: `Sappers undermine the walls of ${target.name} (−1 fortification).` };
          },
        },
        {
          id: "decline",
          label: "Not now",
          detail: "Keep the gold; storm the walls the hard way.",
          apply: (state) => ({ state, message: "You send the sappers away." }),
        },
      ],
      // A funded nation with a fortified enemy on its border pays to soften it.
      aiPick: (state, nationId) => {
        const n = state.nations.find((x) => x.id === nationId);
        return n && n.stocks.gold >= 45 ? "hire" : "decline";
      },
    },
  },
  {
    // TRAIT DECISION (Martial): conscript a levy now, at a cost in contentment.
    id: "call_the_banners",
    weight: 2,
    eligible: hasTrait("martial"),
    choice: {
      prompt: "Your war-captains urge you to call the banners — conscript a levy now, at a cost in contentment?",
      options: [
        {
          id: "muster",
          label: "Call the banners (+3 militia)",
          detail: "3 militia join your capital, but unrest rises 8 across the realm.",
          apply: (state, nationId) => {
            const withTroops = reinforce(state, nationId, "militia", 3);
            const regions = withTroops.regions.map((r) =>
              r.ownerId === nationId ? { ...r, unrest: Math.min(UNREST_MAX, round1(r.unrest + 8)) } : r,
            );
            return { state: { ...withTroops, regions }, message: "The banners are called — militia muster as grumbling spreads." };
          },
        },
        {
          id: "stand_down",
          label: "Stand down",
          detail: "Leave the levies to their fields.",
          apply: (state) => ({ state, message: "You leave the banners furled." }),
        },
      ],
      // A calm, aggressive martial AI musters; if the realm is already restless it holds.
      aiPick: (state, nationId) => {
        const n = state.nations.find((x) => x.id === nationId);
        const owned = state.regions.filter((r) => r.ownerId === nationId);
        const avgUnrest = owned.length ? owned.reduce((a, r) => a + r.unrest, 0) / owned.length : 100;
        const aggr = n?.personality?.aggression ?? 0.4;
        return avgUnrest < 35 && aggr >= 0.5 ? "muster" : "stand_down";
      },
    },
  },
  {
    // TRAIT DECISION (Scholarly): the trait's signature "power at a cost" — a
    // burst of learning that unsettles the traditional, mirroring the Martial levy.
    id: "forbidden_lore",
    weight: 2,
    eligible: hasTrait("scholarly"),
    choice: {
      prompt: "A wandering sage offers forbidden lore — enlightening, but unsettling to the devout. Study it?",
      options: [
        {
          id: "study",
          label: "Study the lore (+research)",
          detail: "Speeds your current research by 30 (else +25 knowledge), but unrest rises 6 realm-wide.",
          apply: (state, nationId) => {
            const nation = state.nations.find((n) => n.id === nationId);
            if (!nation) return { state, message: "" };
            const nations = state.nations.map((n) =>
              n.id === nationId
                ? n.research.current
                  ? { ...n, research: { ...n.research, progress: round1(n.research.progress + 30) } }
                  : { ...n, stocks: { ...n.stocks, knowledge: round1(n.stocks.knowledge + 25) } }
                : n,
            );
            const regions = state.regions.map((r) =>
              r.ownerId === nationId ? { ...r, unrest: Math.min(UNREST_MAX, round1(r.unrest + 6)) } : r,
            );
            return { state: { ...state, nations, regions }, message: "You study the forbidden lore — insight spreads, and so does unease." };
          },
        },
        {
          id: "burn",
          label: "Burn the scrolls",
          detail: "Refuse the lore; keep the peace.",
          apply: (state) => ({ state, message: "You consign the sage's scrolls to the flames." }),
        },
      ],
      // A calm scholarly realm studies; a restless one plays it safe.
      aiPick: (state, nationId) => {
        const owned = state.regions.filter((r) => r.ownerId === nationId);
        const avgUnrest = owned.length ? owned.reduce((a, r) => a + r.unrest, 0) / owned.length : 100;
        return avgUnrest < 35 ? "study" : "burn";
      },
    },
  },
  {
    // TRAIT DECISION (Scholarly): invest materials in an academy for a lasting
    // research surge — resources converted into research tempo (a +knowledge
    // modifier, not a one-off), distinct from forbidden_lore's power-at-a-cost.
    id: "grand_academy",
    weight: 2,
    eligible: hasTrait("scholarly"),
    choice: {
      prompt: "Your savants petition to found a grand academy — endow it with 30 materials?",
      options: [
        {
          id: "endow",
          label: "Endow the academy (−30 materials)",
          detail: `Spend 30 materials; +40% knowledge for ${RESEARCH_SURGE_TURNS} turns.`,
          apply: (state, nationId) => {
            const n = state.nations.find((x) => x.id === nationId);
            if (!n || n.stocks.materials < 30) return { state, message: "Too few materials to endow an academy." };
            const paid = addStock(state, nationId, "materials", -30);
            return {
              state: addModifier(paid, nationId, "research_surge", RESEARCH_SURGE_TURNS),
              message: "A grand academy is founded — learning quickens across the realm.",
            };
          },
        },
        {
          id: "decline",
          label: "Not now",
          detail: "Keep the materials for walls and workshops.",
          apply: (state) => ({ state, message: "You set the academy aside for now." }),
        },
      ],
      // A scholarly AI with materials to spare endows the academy.
      aiPick: (state, nationId) => {
        const n = state.nations.find((x) => x.id === nationId);
        return n && n.stocks.materials >= 45 ? "endow" : "decline";
      },
    },
  },
  {
    // TRAIT DECISION (Mercantile): a fat purse now, resented by the commons.
    id: "monopoly_charter",
    weight: 2,
    eligible: hasTrait("mercantile"),
    choice: {
      prompt: "A wealthy cartel will pay handsomely for an exclusive charter — grant it?",
      options: [
        {
          id: "grant",
          label: "Grant the charter (+40g)",
          detail: "Take 40 gold now, but resentment lifts unrest 6 realm-wide.",
          apply: (state, nationId) => {
            const paid = addStock(state, nationId, "gold", 40);
            const regions = paid.regions.map((r) =>
              r.ownerId === nationId ? { ...r, unrest: Math.min(UNREST_MAX, round1(r.unrest + 6)) } : r,
            );
            return { state: { ...paid, regions }, message: "You grant the charter — coffers swell as commoners grumble." };
          },
        },
        {
          id: "refuse",
          label: "Refuse",
          detail: "Keep the markets open to all.",
          apply: (state) => ({ state, message: "You refuse the cartel's charter." }),
        },
      ],
      // A mercantile AI takes the coin when not already rich or restless.
      aiPick: (state, nationId) => {
        const n = state.nations.find((x) => x.id === nationId);
        const owned = state.regions.filter((r) => r.ownerId === nationId);
        const avg = owned.length ? owned.reduce((a, r) => a + r.unrest, 0) / owned.length : 100;
        return n && n.stocks.gold < 120 && avg < 40 ? "grant" : "refuse";
      },
    },
  },
  {
    // TRAIT DECISION (Fertile): spend food to settle new families (population growth).
    id: "settling_season",
    weight: 2,
    eligible: hasTrait("fertile"),
    choice: {
      prompt: "A bountiful season lets you settle new families — feed them onto the land?",
      options: [
        {
          id: "settle",
          label: "Settle families (−14 food)",
          detail: "Spend 14 food; +2 population in up to three of your regions.",
          apply: (state, nationId) => {
            const n = state.nations.find((x) => x.id === nationId);
            if (!n || n.stocks.food < 14) return { state, message: "Too little food to settle new families." };
            const fed = addStock(state, nationId, "food", -14);
            const targetIds = new Set(fed.regions.filter((r) => r.ownerId === nationId).slice(0, 3).map((r) => r.id));
            const regions = fed.regions.map((r) =>
              targetIds.has(r.id) ? { ...r, population: round1(r.population + 2) } : r,
            );
            return { state: { ...fed, regions }, message: "New families settle the land — your realm grows." };
          },
        },
        {
          id: "store",
          label: "Store the surplus",
          detail: "Keep the grain against leaner days.",
          apply: (state) => ({ state, message: "You store the surplus in the granaries." }),
        },
      ],
      // A fertile AI with a food surplus settles.
      aiPick: (state, nationId) => {
        const n = state.nations.find((x) => x.id === nationId);
        return n && n.stocks.food >= 28 ? "settle" : "store";
      },
    },
  },
  {
    // TRAIT DECISION (Industrious): spend materials on public works that calm the realm.
    id: "public_works",
    weight: 2,
    eligible: hasTrait("industrious"),
    choice: {
      prompt: "The guilds propose grand public works — commission them?",
      options: [
        {
          id: "commission",
          label: "Commission works (−24 materials)",
          detail: "Spend 24 materials; eases unrest 8 across the realm.",
          apply: (state, nationId) => {
            const n = state.nations.find((x) => x.id === nationId);
            if (!n || n.stocks.materials < 24) return { state, message: "Too few materials for public works." };
            const paid = addStock(state, nationId, "materials", -24);
            const regions = paid.regions.map((r) =>
              r.ownerId === nationId ? { ...r, unrest: Math.max(0, round1(r.unrest - 8)) } : r,
            );
            return { state: { ...paid, regions }, message: "Public works rise — the realm's mood lifts." };
          },
        },
        {
          id: "defer",
          label: "Defer",
          detail: "Save the materials for war and walls.",
          apply: (state) => ({ state, message: "You defer the public works." }),
        },
      ],
      // An industrious AI with materials to spare invests when the realm is restless.
      aiPick: (state, nationId) => {
        const n = state.nations.find((x) => x.id === nationId);
        const owned = state.regions.filter((r) => r.ownerId === nationId);
        const avg = owned.length ? owned.reduce((a, r) => a + r.unrest, 0) / owned.length : 0;
        return n && n.stocks.materials >= 40 && avg > 15 ? "commission" : "defer";
      },
    },
  },

  {
    // DECISION (faith): fund a missionary to carry your faith to a nearby people —
    // a direct lever toward the religious victory (systems/faith.ts). Offered only
    // when there is a province to win over.
    id: "wandering_preacher",
    weight: 2,
    eligible: (state, nationId) => faithConversionTarget(state, nationId) !== null,
    choice: {
      prompt: "A zealous preacher offers to carry your faith to a neighbouring people — fund the mission for 25 gold?",
      options: [
        {
          id: "send",
          label: "Send the preacher (−25g)",
          detail: "Spend 25 gold; win a nearby province to your faith.",
          apply: (state, nationId) => {
            const n = state.nations.find((x) => x.id === nationId);
            if (!n || n.stocks.gold < 25) return { state, message: "Too little gold to fund the mission." };
            const target = faithConversionTarget(state, nationId);
            if (!target) return { state, message: "No nearby people to preach to." };
            const paid = addStock(state, nationId, "gold", -25);
            const regions = paid.regions.map((r) => (r.id === target.id ? { ...r, faith: nationId } : r));
            return { state: { ...paid, regions }, message: `Your preacher wins ${target.name} to your faith.` };
          },
        },
        {
          id: "stay",
          label: "Keep them home",
          detail: "Leave the mission unfunded.",
          apply: (state) => ({ state, message: "The preacher stays within your own borders." }),
        },
      ],
      // A funded realm spreads the word; the cash-poor keep the preacher home.
      aiPick: (state, nationId) => {
        const n = state.nations.find((x) => x.id === nationId);
        return n && n.stocks.gold >= 45 ? "send" : "stay";
      },
    },
  },
  {
    // WINDFALL (faith): a saint's relic calms the realm and firms your faith in one
    // wavering province you rule but had not yet converted.
    id: "saints_relic",
    weight: 1,
    apply: (state, nationId) => {
      const owned = state.regions.filter((r) => r.ownerId === nationId);
      if (!owned.length) return null;
      let regions = state.regions.map((r) =>
        r.ownerId === nationId ? { ...r, unrest: Math.max(0, round1(r.unrest - 5)) } : r,
      );
      const waver = owned.find((r) => r.faith !== nationId);
      if (waver) regions = regions.map((r) => (r.id === waver.id ? { ...r, faith: nationId } : r));
      return { state: { ...state, regions }, message: "A saint's relic arrives — the faithful rejoice and devotion firms." };
    },
  },
  {
    // SETBACK (faith): heresy takes a border province from your faith to a rival's —
    // and it sticks (their creed has inertia) until you win it back with a church.
    id: "heresy",
    weight: 2,
    eligible: (state, nationId) => heresyTarget(state, nationId) !== null,
    apply: (state, nationId) => {
      const t = heresyTarget(state, nationId);
      if (!t) return null;
      const regions = state.regions.map((r) =>
        r.id === t.region.id
          ? { ...r, faith: t.toFaith, unrest: Math.min(UNREST_MAX, round1(r.unrest + 8)) }
          : r,
      );
      return { state: { ...state, regions }, message: `Heresy spreads in ${t.region.name} — its people forsake your faith.` };
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

/** Ids of events that raise a player decision modal (they carry a `choice`). */
export const CHOICE_EVENT_IDS: readonly string[] = EVENTS.filter((e) => e.choice).map((e) => e.id);

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
