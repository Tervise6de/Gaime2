/**
 * Campaigns — a rival's war aim, and the road it has to take to get there.
 *
 * Until now a rival's offensive horizon was one province deep. `bestTarget` and
 * `focusTarget` both scored only regions *adjacent to land the realm already
 * held*, so a merchant playing for the Hansa took a Kontor town if and only if
 * it happened to border one. Novgorod, Bergen, Bruges and London are each a
 * rival capital, and three of the four are nowhere near most realms — which is
 * why, measured over five 120-turn autoplays, no computer realm ever pushed
 * past ~56% of the trade race. It could want the network and still had no way
 * to *go and get it*.
 *
 * A campaign is that missing piece, and it is deliberately simple:
 *
 *   objective — one distant prize the realm is playing toward, chosen for what
 *               it is worth divided by how far away it is, and then held for
 *               `CAMPAIGN_DWELL` turns so a realm does not re-aim every turn
 *   road      — the cheapest sequence of regions from its own land to that
 *               prize, where "cheap" counts marching through friendly ground
 *               against fighting through someone else's
 *   step      — the first region on that road it does not own: this turn's war
 *               aim, and the thing the existing concentration machinery masses
 *               against
 *
 * The staging is what makes it a campaign rather than a teleport. Nothing here
 * moves an army or fires a shot: it only tells the offensive code *which*
 * neighbour is worth taking, one province per conquest, until the road runs
 * out. A realm three provinces from Novgorod fights three wars to get there,
 * and it may well die on the way — which is the honest version of the feature.
 *
 * Pure over `GameState`. No randomness at all: the objective is argmax over a
 * deterministic score, ties broken by lowest region id.
 */

import { KONTORE, KONTOR_IDS } from "@/data/kontore";
import { BARBARIAN_ID, type GameState, type Nation } from "@/systems/state";
import { atWar, getTreaty, underTruce } from "@/systems/diplomacy";
import { strategyProfile } from "@/systems/strategy";
import { UNITS, UNIT_TYPES } from "@/data/units";

/** Turns a war aim is protected from being second-guessed. */
export const CAMPAIGN_DWELL = 12;
/** How much better a rival objective must score before a realm re-aims. */
export const CAMPAIGN_SWITCH_MARGIN = 1.3;
/** Roads dearer than this are fantasies — half a continent through three wars. */
export const MAX_ROAD_COST = 22;
/** Soldiers a realm needs before a distant objective is anything but a daydream. */
export const CAMPAIGN_MIN_ARMY = 4;

/**
 * What it costs to put the campaign's road through one region. Marching over
 * your own ground is nearly free; every other kind of ground is a fight, a
 * broken word, or both, and the pathfinder should prefer the long way round
 * rather than plan through an ally.
 */
export const STEP_COST = {
  own: 1,
  barbarian: 3,
  atWar: 4,
  peace: 9,
  nap: 15,
  truce: 22,
  alliance: 26,
} as const;

/** Region value weights for choosing an objective. */
const KONTOR_PRIZE = 100;
const CAPITAL_PRIZE = 40;
const POP_PRIZE = 1.5;
/** How sharply distance discounts a prize (per unit of road cost). */
const DISTANCE_WEIGHT = 0.32;

export interface Campaign {
  /** The distant prize the realm is playing toward. */
  objectiveId: number;
  /** Regions from an owned frontier region to the objective, in marching order. */
  road: number[];
  /** The first region on the road the realm does not own — this turn's war aim. */
  stepId: number;
  /** Total road cost, for the HUD and for judging whether the aim is still sane. */
  cost: number;
  /**
   * A realm the campaign is at peace with whose land blocks the next step. The
   * road cannot open without a declaration; `null` when the step is already
   * fightable (an enemy, or barbarian ground).
   */
  blockedBy: number | null;
}

/**
 * The cheapest road from anything `nationId` holds to `objectiveId`, as a list
 * of regions in marching order (starting at the owned frontier region it leaves
 * from). Multi-source Dijkstra over the region graph — 74 nodes, so the plain
 * O(n²) scan is cheaper than a heap. Null when no road exists at all (a region
 * walled off behind the player's early-game grace) or the objective is ours.
 */
export function campaignRoad(
  state: GameState,
  nationId: number,
  objectiveId: number,
): { road: number[]; cost: number } | null {
  const goal = state.regions[objectiveId];
  if (!goal || goal.ownerId === nationId) return null;

  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  for (const r of state.regions) if (r.ownerId === nationId) dist.set(r.id, 0);
  if (dist.size === 0) return null;

  const settled = new Set<number>();
  for (;;) {
    // Cheapest unsettled node; ties by lowest id keep the road deterministic.
    let node: number | null = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (settled.has(id)) continue;
      if (d < best) {
        best = d;
        node = id;
      }
    }
    if (node === null) break;
    if (node === objectiveId) break;
    settled.add(node);
    for (const nb of state.regions[node]!.adjacency) {
      if (settled.has(nb)) continue;
      const step = stepCost(state, nationId, nb);
      if (!Number.isFinite(step)) continue;
      const through = best + step;
      if (through < (dist.get(nb) ?? Infinity)) {
        dist.set(nb, through);
        prev.set(nb, node);
      }
    }
  }

  const cost = dist.get(objectiveId);
  if (cost === undefined || cost > MAX_ROAD_COST) return null;
  const road: number[] = [];
  for (let at: number | undefined = objectiveId; at !== undefined; at = prev.get(at)) {
    road.unshift(at);
    if (!prev.has(at)) break;
  }
  return { road, cost };
}

/** What crossing one region costs a campaign: own ground, a fight, or a betrayal. */
function stepCost(state: GameState, nationId: number, regionId: number): number {
  const r = state.regions[regionId];
  if (!r) return Infinity;
  const owner = r.ownerId;
  if (owner === nationId) return STEP_COST.own;
  if (owner === null) return STEP_COST.barbarian;
  if (owner === BARBARIAN_ID) return STEP_COST.barbarian;
  if (atWar(state, nationId, owner)) return STEP_COST.atWar;
  // A road that runs over a sworn truce is not a road — the realm will not
  // break one (systems/diplomacy.ts), so price it near-impassable rather than
  // let the planner draw a line it can never walk.
  if (underTruce(state, nationId, owner)) return STEP_COST.truce;
  const treaty = getTreaty(state, nationId, owner);
  if (treaty === "alliance") return STEP_COST.alliance;
  if (treaty === "nap") return STEP_COST.nap;
  return STEP_COST.peace;
}

/**
 * Every prize worth marching at, scored. A Kontor town leads by a wide margin
 * for a realm playing the network — that is the whole point of the plan — and
 * an enemy capital leads for a realm playing the land; population is the
 * tiebreak. Each prize is then divided down by the road to it, so a rich town
 * across three realms loses to a decent one next door.
 */
function objectiveScores(state: GameState, nation: Nation): Map<number, number> {
  const out = new Map<number, number>();
  const p = nation.personality;
  const plan = strategyProfile(nation);
  const strategy = nation.strategy ?? "prestige";
  // Only a realm whose plan is *served* by a march takes an aim. A realm playing
  // for renown builds; giving it a war aim too was the first version of this,
  // and it simply militarised the whole board — measured, every realm ended up
  // with a road to walk, everyone fought everyone, and nobody consolidated
  // anything. A campaign has to be the exception to be worth anything.
  if (strategy === "prestige") return out;
  const candidates = new Map<number, number>(); // regionId → raw prize

  for (const id of KONTOR_IDS) {
    const host = state.regions[KONTORE[id].regionId];
    if (!host || host.ownerId === nation.id) continue;
    candidates.set(host.id, KONTOR_PRIZE * plan.kontorPrize * (0.6 + (p?.economy ?? 0.5) * 0.8));
  }
  // A conqueror also weighs a rival's seat; a merchant marches for the network
  // and nothing else — a Kontor town or no campaign at all.
  if (strategy === "conquest") {
    for (const other of state.nations) {
      if (other.isBarbarian || !other.alive || other.id === nation.id) continue;
      const cap = other.capitalRegionId;
      if (cap === undefined) continue;
      const region = state.regions[cap];
      if (!region || region.ownerId === nation.id) continue;
      const prize = CAPITAL_PRIZE * (0.5 + (p?.aggression ?? 0.4));
      candidates.set(cap, (candidates.get(cap) ?? 0) + prize);
    }
  }

  for (const [regionId, prize] of [...candidates].sort((a, b) => a[0] - b[0])) {
    const road = campaignRoad(state, nation.id, regionId);
    if (!road) continue;
    const pop = state.regions[regionId]?.population ?? 0;
    out.set(regionId, (prize + pop * POP_PRIZE) / (1 + road.cost * DISTANCE_WEIGHT));
  }
  return out;
}

/** Land soldiers under this realm's colours (fleets do not storm towns). */
function fieldStrength(state: GameState, nationId: number): number {
  let n = 0;
  for (const army of state.armies) {
    if (army.ownerId !== nationId) continue;
    for (const type of UNIT_TYPES) if (!UNITS[type].naval) n += army.units[type];
  }
  return n;
}

/**
 * Re-read every rival's war aim. Called once per turn from the turn pipeline,
 * right after strategies are reassessed — the plan chooses what kind of prize
 * is worth having, this chooses which one and holds the realm to it.
 *
 * An aim is dropped the moment it is achieved or its road closes, and is
 * otherwise protected for `CAMPAIGN_DWELL` turns so a realm halfway to Novgorod
 * does not turn around for a marginally better prospect behind it.
 */
export function reassessCampaigns(state: GameState): GameState {
  let changed = false;
  const nations = state.nations.map((n) => {
    if (n.isBarbarian || n.isPlayer || !n.alive) return n;
    const current = n.campaign;
    const held = current !== undefined && state.regions[current.objectiveId]?.ownerId === n.id;
    // Too small a host to march anywhere: keep an existing aim (it may be one
    // battle from paying off) but do not adopt a new one.
    const canMarch = fieldStrength(state, n.id) >= CAMPAIGN_MIN_ARMY;
    const scores = objectiveScores(state, n);

    if (held) {
      changed = true;
      return { ...n, campaign: undefined };
    }
    if (current !== undefined) {
      // A campaign outlives a change of plan. The levy is raised, the host is on
      // the road, and a council that turns to the ledger does not get its army
      // home by wishing — so an aim is held for its dwell whatever the realm is
      // now playing for, and only *taking a new one* needs a plan that wants it.
      // (Without this, aims evaporated within a dozen turns and no realm ever
      // arrived anywhere: measured, campaigns were lasting under twenty turns
      // against roads three or four conquests long.)
      const roadOpen = campaignRoad(state, n.id, current.objectiveId) !== null;
      if (roadOpen && state.turn - current.since < CAMPAIGN_DWELL) return n;
      const stillOpen = scores.get(current.objectiveId);
      if (stillOpen !== undefined) {
        let bestId = current.objectiveId;
        let bestScore = stillOpen * CAMPAIGN_SWITCH_MARGIN;
        for (const [id, score] of scores) {
          if (score > bestScore) {
            bestId = id;
            bestScore = score;
          }
        }
        if (bestId === current.objectiveId) return n;
        changed = true;
        return { ...n, campaign: { objectiveId: bestId, since: state.turn } };
      }
      // The road closed (a truce sworn across it, a realm eliminated): re-aim.
    }
    if (!canMarch) {
      if (current === undefined) return n;
      changed = true;
      return { ...n, campaign: undefined };
    }
    let bestId: number | null = null;
    let bestScore = 0;
    for (const [id, score] of scores) {
      if (score > bestScore) {
        bestId = id;
        bestScore = score;
      }
    }
    if (bestId === null) {
      if (current === undefined) return n;
      changed = true;
      return { ...n, campaign: undefined };
    }
    changed = true;
    return { ...n, campaign: { objectiveId: bestId, since: state.turn } };
  });
  return changed ? { ...state, nations } : state;
}

/**
 * The live campaign for one realm: its standing objective, the road as it looks
 * on *this* board, the next province to take, and whoever's peace is in the
 * way. Recomputed from scratch so it can never go stale mid-turn. Null when the
 * realm has no aim, or its road has closed since the aim was set.
 */
export function planCampaign(state: GameState, nationId: number): Campaign | null {
  const nation = state.nations.find((n) => n.id === nationId);
  const aim = nation?.campaign;
  if (!nation || !aim) return null;
  const road = campaignRoad(state, nationId, aim.objectiveId);
  if (!road) return null;
  const stepId = road.road.find((id) => state.regions[id]?.ownerId !== nationId);
  if (stepId === undefined) return null;
  const owner = state.regions[stepId]?.ownerId ?? null;
  const fightable =
    owner === null ||
    owner === BARBARIAN_ID ||
    atWar(state, nationId, owner);
  return {
    objectiveId: aim.objectiveId,
    road: road.road,
    stepId,
    cost: road.cost,
    blockedBy: fightable ? null : owner,
  };
}

/**
 * Whether a region is the campaign's current war aim. The offensive code adds a
 * prize weight for it, so the realm's armies converge on the road instead of
 * whichever neighbour happens to be softest.
 */
export function onCampaignRoad(campaign: Campaign | null, regionId: number): boolean {
  return campaign !== null && campaign.stepId === regionId;
}

/**
 * Whether opening a war on `targetId` would unblock the campaign — the reason a
 * merchant realm ever declares one. Only true for the realm standing on the
 * *next* province of the road, never for a war of general convenience.
 */
export function warOpensRoad(campaign: Campaign | null, targetId: number): boolean {
  return campaign !== null && campaign.blockedBy === targetId && targetId !== BARBARIAN_ID;
}

/** A campaign the player can be told about: "Lübeck is marching on Novgorod." */
export function campaignBlurb(state: GameState, campaign: Campaign | null): string | null {
  if (!campaign) return null;
  const objective = state.regions[campaign.objectiveId];
  if (!objective) return null;
  const kontor = KONTOR_IDS.find((id) => KONTORE[id].regionId === campaign.objectiveId);
  const what = kontor ? `the Kontor at ${objective.name}` : objective.name;
  const step = state.regions[campaign.stepId];
  if (!step || campaign.stepId === campaign.objectiveId) return `has designs on ${what}`;
  return `is marching on ${what}, by way of ${step.name}`;
}

