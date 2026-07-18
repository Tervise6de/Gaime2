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

import { UNITS, UNIT_TYPES, type UnitType } from "@/data/units";
import { TERRAIN, type StrategicResource } from "@/data/terrain";
import { traitUnitCostMult } from "@/data/traits";
import { focusUnitCostMult, type FocusId } from "@/data/focuses";
import { createRng } from "@/systems/rng";
import { resolveCombat, type UnitCounts } from "@/systems/combat";
import { soldiersDisplay } from "@/systems/format";
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
  type Nation,
  type Region,
} from "@/systems/state";

/** Unit gold+materials cost after the owner's national trait (Martial discount). */
export function unitCost(
  nation: Nation | undefined,
  unit: UnitType,
  focus?: FocusId,
): { gold: number; materials: number } {
  const c = UNITS[unit].cost;
  const m = traitUnitCostMult(nation?.trait) * focusUnitCostMult(focus); // Garrison focus discounts musters
  return { gold: Math.round(c.gold * m), materials: Math.round(c.materials * m) };
}

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
  if (def.requiresTech && !nation.research.done.includes(def.requiresTech)) {
    return { ok: false, reason: `Requires ${def.requiresTech.replace(/_/g, " ")}.` };
  }
  const cost = unitCost(nation, unit, region.focus);
  if (nation.stocks.gold < cost.gold) return { ok: false, reason: "Not enough gold." };
  if (nation.stocks.materials < cost.materials) {
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
  const owner = state.nations.find((n) => n.id === ownerId);
  const cost = unitCost(owner, unit, state.regions[regionId]?.focus);

  const nations = state.nations.map((n) =>
    n.id === ownerId
      ? {
          ...n,
          stocks: {
            ...n.stocks,
            gold: round1(n.stocks.gold - cost.gold),
            materials: round1(n.stocks.materials - cost.materials),
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
  const defenderOwnerId = enemyAtTarget?.ownerId ?? target.ownerId;
  if (
    defenderOwnerId !== null &&
    defenderOwnerId !== BARBARIAN_ID &&
    defenderOwnerId !== owner &&
    !atWar(working, owner, defenderOwnerId)
  ) {
    working = declareWar(working, owner, defenderOwnerId);
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
  const attackerNation = state.nations.find((n) => n.id === owner);
  const defenderNation = state.nations.find((n) => n.id === enemyAtTarget.ownerId);
  const atkName = attackerNation?.name ?? "Army";
  const myLoss = armySize(result.attackerLosses);
  const theirLoss = armySize(result.defenderLosses);
  log.push(
    `${atkName} ${result.attackerWins ? "won" : "was repelled"} at ${target.name}` +
      (result.captured ? ` — ${target.name} captured!` : ".") +
      ` (losses ${soldiersDisplay(myLoss)} vs ${soldiersDisplay(theirLoss)} soldiers)`,
  );

  // Enrich the battle report with the names the resolver couldn't know, and
  // record it (transiently) so the UI can replay player-involved fights.
  const report = {
    ...result.report,
    regionName: target.name,
    terrainName: TERRAIN[target.terrain].name,
    attackerName: attackerNation?.isPlayer ? "Your realm" : atkName,
    defenderName: defenderNation?.isBarbarian
      ? "Free Tribes"
      : defenderNation?.isPlayer
        ? "Your realm"
        : (defenderNation?.name ?? "the garrison"),
    attackerIsPlayer: !!attackerNation?.isPlayer,
    defenderIsPlayer: !!defenderNation?.isPlayer,
  };

  // Update both armies with survivors; drop empty stacks.
  let armies = state.armies
    .map((a) => {
      if (a.id === army.id) return { ...a, units: result.attackerRemaining };
      if (a.id === enemyAtTarget.id) return { ...a, units: result.defenderRemaining };
      return a;
    })
    .filter((a) => armySize(a.units) > 0);

  let next: GameState = {
    ...state,
    armies,
    rngState,
    log: appendLog(state, log),
    battles: [...(state.battles ?? []), report],
  };

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

/**
 * Move a chosen SUBSET of an army's units to an adjacent region you own — the
 * split / detach / reinforce primitive (M1). The remainder holds in place; the
 * detachment either forms a new stack in an empty own region or merges into a
 * friendly stack already standing there. Only your own territory is a legal
 * destination — attacking still commits the whole stack via `moveArmy`, so this
 * never resolves combat. Selecting the entire stack degrades to a normal
 * `moveArmy`. Pure over `GameState`.
 */
export function moveDetachment(
  state: GameState,
  armyId: number,
  targetRegionId: number,
  subset: Partial<Record<UnitType, number>>,
): GameState {
  const army = state.armies.find((a) => a.id === armyId);
  if (!army || army.movesLeft <= 0) return state;
  const from = state.regions[army.regionId];
  const target = state.regions[targetRegionId];
  if (!from || !target || !from.adjacency.includes(targetRegionId)) return state;
  // Detachments manoeuvre within your realm; capture/attack uses moveArmy.
  if (target.ownerId !== army.ownerId) return state;

  const take = clampSubset(army, subset);
  if (!take) return state; // nothing selected
  const remaining = subtractUnits(army.units, take);
  // Selecting everything is just a whole-stack move — keep its id and merge logic.
  if (armySize(remaining) === 0) return moveArmy(state, armyId, targetRegionId);

  const arrivedMoves = Math.max(0, army.movesLeft - 1);
  // The parent stays put with the remainder; only the detachment spends a move.
  const withoutParent = state.armies.map((a) =>
    a.id === army.id ? { ...a, units: remaining } : a,
  );
  const friendly = armyAt(state, targetRegionId, army.ownerId);

  let armies: Army[];
  let nextArmyId = state.nextArmyId;
  let reinforced = false;
  if (friendly && friendly.id !== army.id) {
    // Reinforce the standing stack; the arriving detachment limits its moves.
    reinforced = true;
    armies = withoutParent.map((a) =>
      a.id === friendly.id
        ? { ...a, units: addUnits(a.units, take), movesLeft: Math.min(a.movesLeft, arrivedMoves) }
        : a,
    );
  } else {
    // Empty own region: the detachment becomes a new stack that can keep moving.
    armies = [
      ...withoutParent,
      { id: nextArmyId, ownerId: army.ownerId, regionId: targetRegionId, units: take, movesLeft: arrivedMoves },
    ];
    nextArmyId += 1;
  }

  const owner = state.nations.find((n) => n.id === army.ownerId);
  const who = owner?.isPlayer ? "Your" : `${owner?.name ?? "A rival"}'s`;
  const line = `${who} ${soldiersDisplay(armySize(take))} soldiers ${reinforced ? "reinforced" : "detached to"} ${target.name}.`;
  return { ...state, armies, nextArmyId, log: appendLog(state, [line]) };
}

/**
 * Voluntarily disband a subset of an army's units, cutting future upkeep (no
 * refund — you're standing them down, not selling them). Empties the stack if
 * everything is disbanded. Pure.
 */
export function disbandUnits(
  state: GameState,
  armyId: number,
  subset: Partial<Record<UnitType, number>>,
): GameState {
  const army = state.armies.find((a) => a.id === armyId);
  if (!army) return state;
  const take = clampSubset(army, subset);
  if (!take) return state;
  const remaining = subtractUnits(army.units, take);
  const armies =
    armySize(remaining) === 0
      ? state.armies.filter((a) => a.id !== army.id)
      : state.armies.map((a) => (a.id === army.id ? { ...a, units: remaining } : a));
  const owner = state.nations.find((n) => n.id === army.ownerId);
  const who = owner?.isPlayer ? "Your realm" : (owner?.name ?? "A rival");
  const line = `${who} disbanded ${soldiersDisplay(armySize(take))} soldiers.`;
  return { ...state, armies, log: appendLog(state, [line]) };
}

// --- internal helpers -------------------------------------------------------

/** Clamp a requested unit subset to what the army actually holds; null if empty. */
function clampSubset(
  army: Army,
  want: Partial<Record<UnitType, number>>,
): UnitCounts | null {
  const take = emptyUnits();
  let any = false;
  for (const t of UNIT_TYPES) {
    const n = Math.max(0, Math.min(Math.floor(want[t] ?? 0), army.units[t]));
    take[t] = n;
    if (n > 0) any = true;
  }
  return any ? take : null;
}

/** Per-type difference a − b over all unit types. */
function subtractUnits(a: UnitCounts, b: UnitCounts): UnitCounts {
  const out = { ...a };
  for (const t of UNIT_TYPES) out[t] = a[t] - b[t];
  return out;
}

function relocateOrMerge(
  state: GameState,
  army: Army,
  targetRegionId: number,
): GameState {
  const target = armyAt(state, targetRegionId, army.ownerId);
  let armies: Army[];
  if (target && target.id !== army.id) {
    // Merge moving army into the destination stack (CK3-style: walking onto
    // your own army combines the two). Logged so the merge is never silent.
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
    const where = state.regions[targetRegionId]?.name ?? "the field";
    const owner = state.nations.find((n) => n.id === army.ownerId);
    const line =
      `${owner?.isPlayer ? "Your armies" : `${owner?.name ?? "A rival"}'s armies`} merged at ${where} — ` +
      `${soldiersDisplay(armySize(army.units))} + ${soldiersDisplay(armySize(target.units))} = ` +
      `${soldiersDisplay(armySize(mergedUnits))} soldiers.`;
    return { ...state, armies, log: appendLog(state, [line]) };
  }
  armies = state.armies.map((a) =>
    a.id === army.id
      ? { ...a, regionId: targetRegionId, movesLeft: a.movesLeft - 1 }
      : a,
  );
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
      // Remember the displaced owner (for the reclaim casus belli), unless the
      // region was unowned or we're just re-taking our own land.
      priorOwnerId: wasForeign ? r.ownerId : r.priorOwnerId,
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
