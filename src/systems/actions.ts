/**
 * Action helpers shared by the player (UI intents) and the AI.
 *
 * Each helper mutates an already-cloned GameState and returns a small result so
 * callers can log or react. Nothing here is DOM-aware.
 */

import { UNITS, emptyUnits, totalUnits } from "@/systems/data";
import { resolveAttack, type AttackOutcome } from "@/systems/combat";
import type { Rng } from "@/systems/rng";
import type { Army, GameState, UnitType } from "@/systems/types";
import { UNIT_TYPES } from "@/systems/types";

export function unitCost(type: UnitType): number {
  return UNITS[type].goldCost + UNITS[type].materialCost;
}

/** Find a nation's army sitting on a region, if any. */
export function armyAt(state: GameState, nationId: number, regionId: number): Army | undefined {
  return state.armies.find((a) => a.owner === nationId && a.location === regionId);
}

/**
 * Raise `count` units of a type at a region the nation owns, if it can pay.
 * New units join (or create) the nation's army stationed there.
 */
export function raiseUnits(
  state: GameState,
  nationId: number,
  regionId: number,
  type: UnitType,
  count: number,
): boolean {
  const nation = state.nations[nationId];
  const region = state.regions[regionId];
  if (!nation || !region || region.owner !== nationId) return false;
  const cost = unitCost(type) * count;
  if (nation.treasury < cost || count <= 0) return false;
  nation.treasury = Math.round((nation.treasury - cost) * 100) / 100;
  let army = armyAt(state, nationId, regionId);
  if (!army) {
    army = { id: state.nextArmyId++, owner: nationId, location: regionId, units: emptyUnits(), moved: false };
    state.armies.push(army);
  }
  army.units[type] += count;
  return true;
}

/** Raise a fortification level on an owned region for a flat gold cost. */
export function buildFort(state: GameState, nationId: number, regionId: number): boolean {
  const nation = state.nations[nationId];
  const region = state.regions[regionId];
  if (!nation || !region || region.owner !== nationId) return false;
  const cost = 20 + region.fort * 12;
  if (nation.treasury < cost || region.fort >= 4) return false;
  nation.treasury = Math.round((nation.treasury - cost) * 100) / 100;
  region.fort += 1;
  return true;
}

export interface MoveResult {
  ok: boolean;
  attack?: AttackOutcome;
  log?: string;
}

/**
 * Move an army to an adjacent region, resolving combat if it is hostile.
 * Friendly arrivals auto-merge with any army already there — this *is* the
 * in-game act of concentrating force.
 */
export function moveArmy(state: GameState, rng: Rng, armyId: number, toId: number): MoveResult {
  const army = state.armies.find((a) => a.id === armyId);
  if (!army || army.moved) return { ok: false };
  const from = state.regions[army.location];
  if (!from.adj.includes(toId)) return { ok: false };
  const target = state.regions[toId];
  const hostile = target.owner !== army.owner;

  if (!hostile) {
    army.location = toId;
    army.moved = true;
    mergeCoLocated(state, toId, army.owner);
    return { ok: true };
  }

  const outcome = resolveAttack(state, rng, army, toId);
  army.moved = true;
  state.log.push(outcome.log);
  // Clean up an attacker that was wiped out.
  state.armies = state.armies.filter((a) => totalUnits(a.units) > 0);
  if (outcome.captured) mergeCoLocated(state, toId, army.owner);
  return { ok: true, attack: outcome, log: outcome.log };
}

/** Merge every same-owner army on a region into a single stack. */
export function mergeCoLocated(state: GameState, regionId: number, owner: number): void {
  const here = state.armies.filter((a) => a.location === regionId && a.owner === owner);
  if (here.length <= 1) return;
  const keep = here[0];
  for (let i = 1; i < here.length; i++) {
    for (const type of UNIT_TYPES) keep.units[type] += here[i].units[type];
    keep.moved = keep.moved || here[i].moved;
  }
  const merged = new Set(here.slice(1).map((a) => a.id));
  state.armies = state.armies.filter((a) => !merged.has(a.id));
}

/** Reset per-turn movement flags (called at the start of a nation's turn). */
export function resetMovement(state: GameState, nationId: number): void {
  for (const army of state.armies) if (army.owner === nationId) army.moved = false;
}
