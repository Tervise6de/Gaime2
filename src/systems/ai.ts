/**
 * Rule-based opponent AI — 100% local, deterministic, no network/LLM calls.
 *
 * The headline behaviour is **concentration of force**: an AI nation identifies
 * a valuable target that no single one of its armies can crack (fortified,
 * garrisoned, or defensible terrain), then funnels multiple armies to a common
 * staging region, merges them, and strikes with the combined stack. Weak targets
 * are still snapped up opportunistically by lone armies. Personality weights
 * shift thresholds (a Warlord attacks at slimmer margins) without changing the
 * framework.
 */

import { UNITS, emptyUnits, totalUnits } from "@/systems/data";
import { defenseStrength, effectiveAttack } from "@/systems/combat";
import {
  armyAt,
  buildFort,
  moveArmy,
  raiseUnits,
  resetMovement,
} from "@/systems/actions";
import type { Rng } from "@/systems/rng";
import type { GameState, UnitType, Units } from "@/systems/types";
import { UNIT_TYPES } from "@/systems/types";

export interface AiOptions {
  /** When false, the AI never masses armies (opportunistic strikes only). */
  concentrate: boolean;
}

const DEFAULT_AI: AiOptions = { concentrate: true };

/** Entry point: run one AI nation's full turn. */
export function runNationAi(
  state: GameState,
  rng: Rng,
  nationId: number,
  opts: AiOptions = DEFAULT_AI,
): void {
  const nation = state.nations[nationId];
  if (!nation || !nation.alive || nation.isPlayer) return;
  resetMovement(state, nationId);
  aiEconomy(state, rng, nationId);
  opportunisticStrikes(state, rng, nationId);
  if (opts.concentrate) concentrateForce(state, rng, nationId);
  marchToFront(state, rng, nationId);
}

// ---------------------------------------------------------------------------
// Economy: taxes, army production, forts
// ---------------------------------------------------------------------------

function aiEconomy(state: GameState, rng: Rng, nationId: number): void {
  const nation = state.nations[nationId];
  const p = nation.personality;
  nation.taxRate = clamp(0.12, 0.34, 0.16 + p.economy * 0.12 + p.aggression * 0.04);

  const targetsHaveFort = hostileTargets(state, nationId).some(
    (t) => state.regions[t].fort > 0,
  );
  // Warlords pour more of the treasury into troops; builders hold back.
  const spendFraction = clamp(0.3, 0.85, 0.4 + p.aggression * 0.4 - p.economy * 0.1);
  let budget = nation.treasury * spendFraction;

  const buildRegion = productionRegion(state, nationId);
  if (buildRegion === -1) return;

  // Ensure some siege capacity when the enemy fortifies.
  const mySiege = countMyUnits(state, nationId, "siege");
  const wantSiege = targetsHaveFort && mySiege < 2;

  const rotation: UnitType[] = wantSiege
    ? ["siege", "infantry", "ranged", "cavalry", "militia"]
    : ["infantry", "ranged", "cavalry", "militia", "infantry"];
  let idx = rng.int(0, rotation.length - 1);
  let raised = 0;
  while (raised < 6) {
    const type = rotation[idx % rotation.length];
    idx++;
    const cost = UNITS[type].goldCost + UNITS[type].materialCost;
    if (budget < cost || nation.treasury < cost) break;
    if (!raiseUnits(state, nationId, buildRegion, type, 1)) break;
    budget -= cost;
    raised++;
  }

  // Defensive personalities shore up a threatened frontier.
  if (p.economy > 0.5 && p.aggression < 0.5) {
    const frontier = frontierRegions(state, nationId).find((r) => state.regions[r].fort < 3);
    if (frontier !== undefined) buildFort(state, nationId, frontier);
  }
}

// ---------------------------------------------------------------------------
// Opportunistic solo strikes — grab anything a single army can already take.
// ---------------------------------------------------------------------------

function opportunisticStrikes(state: GameState, rng: Rng, nationId: number): void {
  const margin = attackMargin(state.nations[nationId].personality);
  let acted = true;
  while (acted) {
    acted = false;
    for (const army of myArmies(state, nationId)) {
      if (army.moved || totalUnits(army.units) === 0) continue;
      const region = state.regions[army.location];
      const options = region.adj
        .filter((t) => state.regions[t].owner !== nationId)
        .map((t) => ({ t, def: defenseStrength(state, t), atk: effectiveAttack(state, army.units, t) }))
        .filter((o) => o.atk > o.def * margin)
        .sort((a, b) => regionValue(state, b.t) - regionValue(state, a.t));
      const choice = options[0];
      if (choice) {
        moveArmy(state, rng, army.id, choice.t);
        acted = true;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Concentration of force — the centrepiece.
// ---------------------------------------------------------------------------

interface ConcentrationPlan {
  target: number;
  staging: number;
  def: number;
  combinedAttack: number;
  residentAttack: number;
  residentArmyId: number | null;
  moverIds: number[];
  value: number;
}

function concentrateForce(state: GameState, rng: Rng, nationId: number): void {
  const margin = attackMargin(state.nations[nationId].personality);
  const plan = bestConcentrationPlan(state, nationId, margin);
  if (!plan) return;

  // If a stack already massed at the staging region can crack the target now,
  // strike immediately.
  if (
    plan.residentArmyId !== null &&
    plan.residentAttack > plan.def * margin
  ) {
    moveArmy(state, rng, plan.residentArmyId, plan.target);
    return;
  }

  // Otherwise funnel every reachable army onto the staging region. They
  // auto-merge there (see actions.mergeCoLocated); next turn the combined stack
  // — now strong enough — attacks.
  for (const moverId of plan.moverIds) {
    const mover = state.armies.find((a) => a.id === moverId);
    if (mover && !mover.moved) moveArmy(state, rng, moverId, plan.staging);
  }
}

/** Evaluate every hostile target and return the best plan whose merged force wins. */
function bestConcentrationPlan(
  state: GameState,
  nationId: number,
  margin: number,
): ConcentrationPlan | null {
  let best: ConcentrationPlan | null = null;

  for (const target of hostileTargets(state, nationId)) {
    const def = defenseStrength(state, target);
    // Staging = an owned region adjacent to the target, or one my army holds.
    const stagingChoices = state.regions[target].adj.filter(
      (s) => state.regions[s].owner === nationId || armyAt(state, nationId, s),
    );
    for (const staging of stagingChoices) {
      const resident = armyAt(state, nationId, staging);
      const movers = state.armies.filter(
        (a) =>
          a.owner === nationId &&
          !a.moved &&
          a.location !== staging &&
          state.regions[staging].adj.includes(a.location),
      );
      // Combined force if resident + all movers pile onto the staging region.
      const combined = emptyUnits();
      if (resident) addUnits(combined, resident.units);
      for (const m of movers) addUnits(combined, m.units);
      if (totalUnits(combined) === 0) continue;

      const combinedAttack = effectiveAttack(state, combined, target);
      // Only interesting if a single stack cannot already do it (that is the
      // opportunistic path) but the concentration can.
      const residentAttack = resident ? effectiveAttack(state, resident.units, target) : 0;
      const singleBest = Math.max(
        residentAttack,
        ...movers.map((m) => effectiveAttack(state, m.units, target)),
        0,
      );
      const needsConcentration = singleBest <= def * margin;
      const canCrack = combinedAttack > def * margin;
      if (!canCrack || !needsConcentration) continue;

      const value = regionValue(state, target) + (movers.length + (resident ? 1 : 0));
      if (!best || value > best.value) {
        best = {
          target,
          staging,
          def,
          combinedAttack,
          residentAttack,
          residentArmyId: resident ? resident.id : null,
          moverIds: movers.map((m) => m.id),
          value,
        };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// March idle armies toward the nearest front so force accumulates over turns.
// ---------------------------------------------------------------------------

function marchToFront(state: GameState, rng: Rng, nationId: number): void {
  const fronts = frontierRegions(state, nationId);
  if (fronts.length === 0) return;
  for (const army of myArmies(state, nationId)) {
    if (army.moved || totalUnits(army.units) === 0) continue;
    if (fronts.includes(army.location)) continue;
    // Steps only through owned corridors, so no combat is triggered and the
    // RNG stays untouched — but pass it through for a single clean interface.
    const step = nextHopThroughOwned(state, nationId, army.location, fronts);
    if (step !== -1) moveArmy(state, rng, army.id, step);
  }
}

/** BFS through owned regions; returns the first step toward the nearest goal. */
function nextHopThroughOwned(
  state: GameState,
  nationId: number,
  from: number,
  goals: number[],
): number {
  if (goals.includes(from)) return -1;
  const goalSet = new Set(goals);
  const prev = new Map<number, number>();
  const seen = new Set<number>([from]);
  let frontier = [from];
  let found = -1;
  outer: while (frontier.length) {
    const next: number[] = [];
    for (const r of frontier) {
      for (const n of state.regions[r].adj) {
        if (seen.has(n)) continue;
        // Traverse only owned corridors; the goal frontier regions are owned too.
        if (state.regions[n].owner !== nationId) continue;
        seen.add(n);
        prev.set(n, r);
        if (goalSet.has(n)) {
          found = n;
          break outer;
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  if (found === -1) return -1;
  let cur = found;
  while (prev.get(cur) !== from) {
    const p = prev.get(cur);
    if (p === undefined) return -1;
    cur = p;
  }
  return cur;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function myArmies(state: GameState, nationId: number) {
  return state.armies.filter((a) => a.owner === nationId);
}

/** Hostile regions adjacent to something the nation owns or has an army beside. */
export function hostileTargets(state: GameState, nationId: number): number[] {
  const set = new Set<number>();
  for (const region of state.regions) {
    const mine = region.owner === nationId || armyAt(state, nationId, region.id);
    if (!mine) continue;
    for (const n of region.adj) {
      if (state.regions[n].owner !== nationId) set.add(n);
    }
  }
  return [...set];
}

/** Owned regions that border a hostile region. */
function frontierRegions(state: GameState, nationId: number): number[] {
  return state.regions
    .filter(
      (r) =>
        r.owner === nationId &&
        r.adj.some((n) => state.regions[n].owner !== nationId),
    )
    .map((r) => r.id);
}

/** Best owned region to build in: a frontier region, else any owned region. */
function productionRegion(state: GameState, nationId: number): number {
  const fronts = frontierRegions(state, nationId);
  if (fronts.length) {
    // Prefer the safest (highest-fort) frontier region so new troops survive.
    return fronts.sort((a, b) => state.regions[b].fort - state.regions[a].fort)[0];
  }
  const owned = state.regions.find((r) => r.owner === nationId);
  return owned ? owned.id : -1;
}

function regionValue(state: GameState, regionId: number): number {
  const r = state.regions[regionId];
  const ownerBonus = r.owner >= 0 ? 8 : 0; // enemy land worth more than neutral
  return 10 + r.population * 1.2 + r.fort * 3 + ownerBonus;
}

function attackMargin(p: { aggression: number }): number {
  // Aggressive nations attack at slimmer favourable margins.
  return clamp(1.02, 1.3, 1.22 - p.aggression * 0.25);
}

function countMyUnits(state: GameState, nationId: number, type: UnitType): number {
  let n = 0;
  for (const army of state.armies) if (army.owner === nationId) n += army.units[type];
  return n;
}

function addUnits(into: Units, from: Units): void {
  for (const type of UNIT_TYPES) into[type] += from[type];
}

function clamp(lo: number, hi: number, v: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
