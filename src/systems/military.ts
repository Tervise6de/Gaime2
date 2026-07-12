/**
 * Military — armies, recruitment, movement, and the conquest that ties combat
 * back into the economy (docs/game-design.md §3.4).
 *
 * These are state transitions (intents) used by the UI and, later, the AI:
 *   - `raiseUnit`  spends gold+materials to add a unit to a region's army
 *   - `moveArmy`   walks an army along the adjacency graph; entering a hostile
 *                  region triggers `resolveCombat`, and wiping the defender (or
 *                  walking into an undefended enemy region) captures it.
 *
 * All are pure over `GameState`. Combat consumes randomness from the state's
 * advancing `rngState`, so resolution stays deterministic and reproducible.
 */

import { UNITS, type UnitType } from "@/data/units";
import { TERRAIN, type StrategicResource } from "@/data/terrain";
import { createRng } from "@/systems/rng";
import { resolveCombat, type UnitCounts } from "@/systems/combat";
import { atWar, declareWar } from "@/systems/diplomacy";
import {
  BARBARIAN_ID,
  CONQUEST_UNREST,
  PLAYER_ID,
  UNREST_MAX,
  armySize,
  emptyUnits,
  type Army,
  type GameState,
  type Region,
} from "@/systems/state";

/** The army of a given owner standing in a region, if any. */
export function armyAt(
  state: GameState,
  regionId: number,
  ownerId: number,
): Army | undefined {
  return state.armies.find((a) => a.regionId === regionId && a.ownerId === ownerId);
}

/** Any army (of any owner) in a region. */
export function anyArmyAt(state: GameState, regionId: number): Army | undefined {
  return state.armies.find((a) => a.regionId === regionId);
}

/** Strategic resources a nation can draw on (via the regions it owns). */
export function strategicAccess(
  state: GameState,
  ownerId: number,
): Set<StrategicResource> {
  const set = new Set<StrategicResource>();
  for (const r of state.regions) {
    if (r.ownerId === ownerId && r.resource) set.add(r.resource);
  }
  return set;
}

/** An army moves at the pace of its slowest unit. */
export function armyMoves(units: UnitCounts): number {
  let min = Infinity;
  for (const t of Object.keys(units) as UnitType[]) {
    if (units[t] > 0) min = Math.min(min, UNITS[t].moves);
  }
  return min === Infinity ? 0 : min;
}

export interface RaiseCheck {
  ok: boolean;
  reason?: string;
}

/** Whether a nation can currently raise a unit type in a region. */
export function canRaiseUnit(
  state: GameState,
  regionId: number,
  unit: UnitType,
  ownerId: number,
): RaiseCheck {
  const region = state.regions[regionId];
  if (!region || region.ownerId !== ownerId) {
    return { ok: false, reason: "You must own the region." };
  }
  const nation = state.nations.find((n) => n.id === ownerId);
  if (!nation) return { ok: false, reason: "Unknown nation." };
  const def = UNITS[unit];
  if (nation.stocks.gold < def.cost.gold) return { ok: false, reason: "Not enough gold." };
  if (nation.stocks.materials < def.cost.materials) {
    return { ok: false, reason: "Not enough materials." };
  }
  if (def.requires && !strategicAccess(state, ownerId).has(def.requires)) {
    return { ok: false, reason: `Requires access to ${def.requires}.` };
  }
  return { ok: true };
}

/** Raise a unit in a region, paying its cost. Pure. Newly raised units deploy next turn. */
export function raiseUnit(
  state: GameState,
  regionId: number,
  unit: UnitType,
  ownerId = PLAYER_ID,
): GameState {
  if (!canRaiseUnit(state, regionId, unit, ownerId).ok) return state;
  const def = UNITS[unit];

  const nations = state.nations.map((n) =>
    n.id === ownerId
      ? {
          ...n,
          stocks: {
            ...n.stocks,
            gold: round1(n.stocks.gold - def.cost.gold),
            materials: round1(n.stocks.materials - def.cost.materials),
          },
        }
      : n,
  );

  const existing = armyAt(state, regionId, ownerId);
  let armies: Army[];
  let nextArmyId = state.nextArmyId;
  if (existing) {
    armies = state.armies.map((a) =>
      a.id === existing.id
        ? { ...a, units: { ...a.units, [unit]: a.units[unit] + 1 } }
        : a,
    );
  } else {
    armies = [
      ...state.armies,
      {
        id: nextArmyId,
        ownerId,
        regionId,
        units: { ...emptyUnits(), [unit]: 1 },
        movesLeft: 0, // deploys next turn
      },
    ];
    nextArmyId += 1;
  }

  return { ...state, nations, armies, nextArmyId };
}

/** Which adjacent regions an army could move into this turn (has moves left). */
export function reachableRegions(state: GameState, army: Army): number[] {
  if (army.movesLeft <= 0) return [];
  const region = state.regions[army.regionId];
  return region ? region.adjacency.slice() : [];
}

/**
 * Move (or attack with) an army into an adjacent region. Pure; resolves combat
 * using the state's RNG stream and returns a new state with rngState advanced.
 */
export function moveArmy(
  state: GameState,
  armyId: number,
  targetRegionId: number,
): GameState {
  const army = state.armies.find((a) => a.id === armyId);
  if (!army || army.movesLeft <= 0) return state;
  const from = state.regions[army.regionId];
  const target = state.regions[targetRegionId];
  if (!from || !target || !from.adjacency.includes(targetRegionId)) return state;

  const owner = army.ownerId;
  const friendlyAtTarget = armyAt(state, targetRegionId, owner);
  const enemyAtTarget = state.armies.find(
    (a) => a.regionId === targetRegionId && a.ownerId !== owner,
  );

  // Friendly destination: merge stacks (or just relocate) and spend a move.
  if (target.ownerId === owner || friendlyAtTarget) {
    return relocateOrMerge(state, army, targetRegionId);
  }

  // Attacking a rival nation's territory is an act of war.
  let working = state;
  const defenderNation = enemyAtTarget?.ownerId ?? target.ownerId;
  if (
    defenderNation !== null &&
    defenderNation !== BARBARIAN_ID &&
    defenderNation !== owner &&
    !atWar(working, owner, defenderNation)
  ) {
    working = declareWar(working, owner, defenderNation);
  }
  state = working;

  // Hostile / neutral destination.
  if (!enemyAtTarget) {
    // Undefended: walk in and capture.
    return occupyAndCapture(state, army, target);
  }

  // Defended: resolve combat.
  const rng = createRng(state.rngState);
  const result = resolveCombat(
    army.units,
    enemyAtTarget.units,
    { terrainDefense: TERRAIN[target.terrain].defense, fortification: target.fortification },
    rng,
  );
  const rngState = rng.seed;

  const log: string[] = [];
  const atkName = state.nations.find((n) => n.id === owner)?.name ?? "Army";
  log.push(
    `${atkName} ${result.attackerWins ? "won" : "was repelled"} at ${target.name}` +
      (result.captured ? ` — ${target.name} captured!` : "."),
  );

  // Update both armies with survivors; drop empty stacks.
  let armies = state.armies
    .map((a) => {
      if (a.id === army.id) return { ...a, units: result.attackerRemaining };
      if (a.id === enemyAtTarget.id) return { ...a, units: result.defenderRemaining };
      return a;
    })
    .filter((a) => armySize(a.units) > 0);

  let next: GameState = { ...state, armies, rngState, log: appendLog(state, log) };

  if (result.captured) {
    // Attacker advances into the captured region and takes ownership.
    next = advanceInto(next, army.id, target.id);
    next = captureRegion(next, target.id, owner);
  } else {
    // Repelled or non-decisive: the move is still spent.
    next = spendMove(next, army.id);
  }
  return next;
}

// --- internal helpers -------------------------------------------------------

function relocateOrMerge(
  state: GameState,
  army: Army,
  targetRegionId: number,
): GameState {
  const target = armyAt(state, targetRegionId, army.ownerId);
  let armies: Army[];
  if (target && target.id !== army.id) {
    // Merge moving army into the destination stack.
    const mergedUnits = addUnits(target.units, army.units);
    armies = state.armies
      .filter((a) => a.id !== army.id)
      .map((a) =>
        a.id === target.id
          ? {
              ...a,
              units: mergedUnits,
              movesLeft: Math.min(a.movesLeft, army.movesLeft - 1),
            }
          : a,
      );
  } else {
    armies = state.armies.map((a) =>
      a.id === army.id
        ? { ...a, regionId: targetRegionId, movesLeft: a.movesLeft - 1 }
        : a,
    );
  }
  return { ...state, armies };
}

function occupyAndCapture(state: GameState, army: Army, target: Region): GameState {
  let next = advanceInto(state, army.id, target.id);
  next = captureRegion(next, target.id, army.ownerId);
  const name = state.nations.find((n) => n.id === army.ownerId)?.name ?? "Army";
  return { ...next, log: appendLog(next, [`${name} occupied ${target.name}.`]) };
}

/** Move an army into a region and spend its move. */
function advanceInto(state: GameState, armyId: number, regionId: number): GameState {
  const armies = state.armies.map((a) =>
    a.id === armyId ? { ...a, regionId, movesLeft: a.movesLeft - 1 } : a,
  );
  return { ...state, armies };
}

function spendMove(state: GameState, armyId: number): GameState {
  const armies = state.armies.map((a) =>
    a.id === armyId ? { ...a, movesLeft: a.movesLeft - 1 } : a,
  );
  return { ...state, armies };
}

/** Transfer a region to a new owner, applying conquest unrest if foreign. */
function captureRegion(state: GameState, regionId: number, ownerId: number): GameState {
  const regions = state.regions.map((r) => {
    if (r.id !== regionId) return r;
    const wasForeign = r.ownerId !== null && r.ownerId !== ownerId;
    return {
      ...r,
      ownerId,
      unrest: wasForeign ? Math.min(UNREST_MAX, r.unrest + CONQUEST_UNREST) : r.unrest,
    };
  });
  return { ...state, regions };
}

function addUnits(a: UnitCounts, b: UnitCounts): UnitCounts {
  const out = { ...a };
  for (const t of Object.keys(out) as UnitType[]) out[t] = a[t] + b[t];
  return out;
}

/** Total gold upkeep for a nation's standing armies. */
export function totalUpkeep(state: GameState, ownerId: number): number {
  let sum = 0;
  for (const army of state.armies) {
    if (army.ownerId !== ownerId) continue;
    for (const t of Object.keys(army.units) as UnitType[]) {
      sum += army.units[t] * UNITS[t].upkeep;
    }
  }
  return sum;
}

function appendLog(state: GameState, lines: string[]): string[] {
  return [...state.log, ...lines].slice(-50);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
