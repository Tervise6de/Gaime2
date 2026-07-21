/**
 * Military — armies, recruitment, movement, and the conquest that ties combat
 * back into the economy (docs/game-design.md §3.4).
 *
 * These are state transitions (intents) used by the UI and, later, the AI:
 *   - `raiseUnit`  spends gold+arms wares to add a unit to a region's army
 *   - `moveArmy`   walks an army along the adjacency graph; entering a hostile
 *                  region triggers `resolveCombat`, and wiping the defender (or
 *                  walking into an undefended enemy region) captures it.
 *
 * All are pure over `GameState`. Combat consumes randomness from the state's
 * advancing `rngState`, so resolution stays deterministic and reproducible.
 */

import { UNITS, UNIT_TYPES, NAVAL_UNIT_TYPES, type UnitType } from "@/data/units";
import { GOODS, type GoodId } from "@/data/goods";
import {
  COMMANDER_DISLOYAL,
  COMMANDER_LOYALTY_EROSION,
  COMMANDER_LOYALTY_RECOVERY,
  commanderAttack,
  commanderDefense,
  commanderTitle,
  generateCommander,
} from "@/data/commanders";
import { TERRAIN, type StrategicResource } from "@/data/terrain";
import { recordChronicle, chronicleName } from "@/systems/chronicle";
import { traitUnitCostMult } from "@/data/traits";
import { focusUnitCostMult, type FocusId } from "@/data/focuses";
import { createRng } from "@/systems/rng";
import { resolveCombat, type UnitCounts } from "@/systems/combat";
import { soldiersDisplay } from "@/systems/format";
import { atWar, declareWar, getTreaty } from "@/systems/diplomacy";
import {
  BARBARIAN_ID,
  CONQUEST_UNREST,
  MAX_ENTRENCH,
  PLAYER_ID,
  UNREST_BASE,
  UNREST_MAX,
  UNREST_PENALTY_START,
  UNREST_REVOLT,
  armySize,
  emptyUnits,
  canAfford,
  spendWares,
  type Army,
  type GameState,
  type Nation,
  type Region,
} from "@/systems/state";

/** Unit gold+ware cost after the owner's national trait (Martial discount). */
export function unitCost(
  nation: Nation | undefined,
  unit: UnitType,
  focus?: FocusId,
): { gold: number; wares: Partial<Record<GoodId, number>> } {
  const c = UNITS[unit].cost;
  const m = traitUnitCostMult(nation?.trait) * focusUnitCostMult(focus); // Garrison focus discounts musters
  const wares: Partial<Record<GoodId, number>> = {};
  for (const id of Object.keys(c.wares) as GoodId[]) {
    wares[id] = Math.round((c.wares[id] ?? 0) * m);
  }
  return { gold: Math.round(c.gold * m), wares };
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

/** Whether an army is a fleet — it holds at least one warship. A fleet is
    coast-locked: raised at a coastal port, and only able to enter coastal
    regions (it sails the shore rather than marching inland). Pure. */
export function armyIsFleet(units: UnitCounts): boolean {
  return NAVAL_UNIT_TYPES.some((t) => units[t] > 0);
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
  if (def.naval && region.terrain !== "coast") {
    return { ok: false, reason: "Ships must be built at a coastal port." };
  }
  const cost = unitCost(nation, unit, region.focus);
  if (nation.stocks.gold < cost.gold) return { ok: false, reason: "Not enough gold." };
  if (!canAfford(nation.wares, cost.wares)) {
    const short = (Object.keys(cost.wares) as GoodId[]).find((id) => nation.wares[id] < (cost.wares[id] ?? 0));
    return { ok: false, reason: `Not enough ${short ? GOODS[short].name.toLowerCase() : "wares"}.` };
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
          stocks: { ...n.stocks, gold: round1(n.stocks.gold - cost.gold) },
          wares: spendWares(n.wares, cost.wares),
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

/** Which adjacent regions an army could move into this turn (has moves left).
    A fleet is confined to coastal regions — it sails the shore, never inland. */
export function reachableRegions(state: GameState, army: Army): number[] {
  if (army.movesLeft <= 0) return [];
  const region = state.regions[army.regionId];
  if (!region) return [];
  if (armyIsFleet(army.units)) {
    return region.adjacency.filter((id) => state.regions[id]?.terrain === "coast");
  }
  return region.adjacency.slice();
}

/**
 * Dig an army in where it stands (M3). It forgoes the rest of this turn's
 * movement to entrench; its region's defence then climbs one level per held turn
 * (up to MAX_ENTRENCH), grown in the turn pipeline. Attacking or relocating
 * clears the stance. No-op for an empty stack or one already dug in. Pure.
 */
export function fortifyArmy(state: GameState, armyId: number): GameState {
  const army = state.armies.find((a) => a.id === armyId);
  if (!army || armySize(army.units) === 0 || army.fortifying) return state;
  const armies = state.armies.map((a) =>
    a.id === armyId ? { ...a, fortifying: true, movesLeft: 0 } : a,
  );
  const owner = state.nations.find((n) => n.id === army.ownerId);
  const where = state.regions[army.regionId]?.name ?? "the field";
  const who = owner?.isPlayer ? "Your army" : `${owner?.name ?? "A rival"}'s army`;
  return { ...state, armies, log: appendLog(state, [`${who} dug in at ${where}.`]) };
}

/**
 * Appoint a commander to lead an army (M4). Draws a deterministic officer from
 * the state RNG and attaches them; re-appointing replaces the incumbent. Their
 * martial rating then feeds this army's combat, and a disloyal one foments
 * unrest where it stands. No-op for an empty stack. Pure (advances rngState).
 */
export function appointCommander(state: GameState, armyId: number): GameState {
  const army = state.armies.find((a) => a.id === armyId);
  if (!army || armySize(army.units) === 0) return state;
  const rng = createRng(state.rngState);
  const commander = generateCommander(rng);
  const armies = state.armies.map((a) => (a.id === armyId ? { ...a, commander } : a));
  const owner = state.nations.find((n) => n.id === army.ownerId);
  const where = state.regions[army.regionId]?.name ?? "the field";
  const who = owner?.isPlayer ? "Your" : `${owner?.name ?? "A rival"}'s`;
  const line = `${who} army at ${where} is now led by ${commanderTitle(commander)} (martial ${commander.martial}).`;
  return { ...state, armies, rngState: rng.seed, log: appendLog(state, [line]) };
}

/** Unrest a disloyal commander foments each turn in the home region they occupy. */
export const DISLOYAL_UNREST = 1;

/**
 * Per-turn commander effects (M4/E5), all at "home" (a region the army's own realm
 * holds): loyalty drifts with the province's mood — eroding amid unrest, recovering
 * when calm — and a commander who has slipped to disloyal (≤ COMMANDER_DISLOYAL)
 * foments extra unrest where they stand. This is the slow fuse: neglect a province
 * and its garrison's officer turns against you (see `applyDefection`). Pure.
 */
export function applyCommanderEffects(state: GameState): GameState {
  const bump = new Map<number, number>();
  const armies = state.armies.map((a) => {
    const c = a.commander;
    if (!c) return a;
    const r = state.regions[a.regionId];
    if (!r || r.ownerId !== a.ownerId) return a; // effects only apply at home
    const loyalty =
      r.unrest >= UNREST_PENALTY_START
        ? Math.max(0, c.loyalty - COMMANDER_LOYALTY_EROSION)
        : Math.min(100, c.loyalty + COMMANDER_LOYALTY_RECOVERY);
    if (loyalty <= COMMANDER_DISLOYAL) {
      bump.set(a.regionId, (bump.get(a.regionId) ?? 0) + DISLOYAL_UNREST);
    }
    return loyalty === c.loyalty ? a : { ...a, commander: { ...c, loyalty } };
  });
  const regions =
    bump.size === 0
      ? state.regions
      : state.regions.map((r) =>
          bump.has(r.id) ? { ...r, unrest: Math.min(UNREST_MAX, r.unrest + bump.get(r.id)!) } : r,
        );
  return { ...state, armies, regions };
}

/**
 * Defection (E5): a disloyal commander (loyalty ≤ COMMANDER_DISLOYAL) whose army
 * garrisons one of its realm's own regions that has fallen into open revolt
 * (unrest ≥ UNREST_REVOLT) turns his coat — seizing the region for himself as a
 * *named pretender*. The region and the army pass to the Free Towns with the
 * commander still at their head (a led rebel stack, harder to retake), and the
 * province settles under its new master. Your own appointment becomes the threat.
 * Pure — runs before secession so a defected region is not also processed there.
 */
export function applyDefection(state: GameState): GameState {
  const defectors = state.armies.filter((a) => {
    const c = a.commander;
    if (!c || c.loyalty > COMMANDER_DISLOYAL || a.ownerId === BARBARIAN_ID) return false;
    const r = state.regions[a.regionId];
    return !!r && r.ownerId === a.ownerId && r.unrest >= UNREST_REVOLT;
  });
  if (defectors.length === 0) return state;
  const defectArmyIds = new Set(defectors.map((a) => a.id));
  const defectRegionIds = new Set(defectors.map((a) => a.regionId));
  const armies = state.armies.map((a) =>
    defectArmyIds.has(a.id)
      ? { ...a, ownerId: BARBARIAN_ID, fortifying: false, entrenchment: 0 }
      : a,
  );
  const regions = state.regions.map((r) =>
    defectRegionIds.has(r.id)
      ? { ...r, ownerId: BARBARIAN_ID, priorOwnerId: r.ownerId, unrest: UNREST_BASE, construction: null, revoltTurns: 0 }
      : r,
  );
  let log = state.log;
  for (const a of defectors) {
    const r = state.regions[a.regionId]!;
    const former = state.nations.find((n) => n.id === a.ownerId);
    log = [
      ...log,
      `${commanderTitle(a.commander!)} turns his coat, seizing ${r.name} from ${former?.isPlayer ? "your realm" : (former?.name ?? "its ruler")}!`,
    ].slice(-50);
  }
  let next: GameState = { ...state, armies, regions, log };
  for (const a of defectors) {
    next = recordChronicle(
      next,
      "betrayal",
      `${commanderTitle(a.commander!)} turned traitor, seizing ${state.regions[a.regionId]!.name} from ${chronicleName(next, a.ownerId)}.`,
    );
  }
  return next;
}

/** Grow one turn's worth of entrenchment on every dug-in army (called by the turn pipeline). */
export function tickEntrenchment(armies: Army[]): Army[] {
  return armies.map((a) =>
    a.fortifying
      ? { ...a, entrenchment: Math.min(MAX_ENTRENCH, (a.entrenchment ?? 0) + 1) }
      : a,
  );
}

/** Whether `other` is an army an army of `ownerId` must fight (enemy or barbarian). */
function isHostileOwner(state: GameState, ownerId: number, other: number): boolean {
  if (other === ownerId) return false;
  if (other === BARBARIAN_ID || ownerId === BARBARIAN_ID) return true;
  return atWar(state, ownerId, other);
}

/**
 * Zone of control (M3): a region lies in an enemy ZoC when an adjacent region
 * holds a hostile army. Marching into such a region ends the turn's movement, so
 * armies can no longer slip past an enemy stack — the stack pins the ground around
 * it. Allies and non-belligerents exert no ZoC.
 */
export function inEnemyZoc(state: GameState, regionId: number, ownerId: number): boolean {
  const region = state.regions[regionId];
  if (!region) return false;
  return region.adjacency.some((nb) =>
    state.armies.some(
      (a) => a.regionId === nb && armySize(a.units) > 0 && isHostileOwner(state, ownerId, a.ownerId),
    ),
  );
}

/** Remaining moves after entering `regionId` — clamped to 0 inside an enemy ZoC. */
function zocClampedMoves(state: GameState, regionId: number, ownerId: number, moves: number): number {
  if (moves <= 0) return Math.max(0, moves);
  return inEnemyZoc(state, regionId, ownerId) ? 0 : moves;
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
  // A fleet may only sail to another coastal region; it cannot march inland.
  if (armyIsFleet(army.units) && target.terrain !== "coast") return state;

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

  // Defended: rally the neighbourhood into a combined defence (M2), then resolve
  // the assault once against the pooled stack.
  const defenders = ralliedDefenders(state, target, enemyAtTarget);

  // Allies who answered the call are drawn into the war against the aggressor
  // (the alliance honoured as a defensive pact). Same-realm reinforcements are
  // already at war by definition; only distinct allied realms declare.
  const answering = new Set<number>();
  for (const d of defenders) {
    if (d.ownerId !== enemyAtTarget.ownerId && d.ownerId !== owner) answering.add(d.ownerId);
  }
  for (const allyId of answering) {
    if (!atWar(state, owner, allyId)) state = declareWar(state, allyId, owner, "ally_call");
  }

  const combinedDefender = defenders.reduce(
    (acc, d) => addUnits(acc, d.units),
    emptyUnits(),
  );
  const reinforcements = armySize(combinedDefender) - armySize(enemyAtTarget.units);

  // A dug-in garrison fights as if the region held extra fortification (M3); the
  // attacker's siege still strips it inside resolveCombat.
  const entrenchFort = target.fortification + (enemyAtTarget.entrenchment ?? 0);
  const rng = createRng(state.rngState);
  const result = resolveCombat(
    army.units,
    combinedDefender,
    {
      terrainDefense: TERRAIN[target.terrain].defense,
      fortification: entrenchFort,
      // Commanders lead their side (M4): the attacker's own, the defence's garrison.
      attackerCommand: commanderAttack(army.commander),
      defenderCommand: commanderDefense(enemyAtTarget.commander),
    },
    rng,
  );
  const rngState = rng.seed;

  // Split the combined defender's casualties back across the stacks that rallied,
  // proportional to each stack's contribution of every unit type.
  const perDefenderLosses = distributeLosses(defenders, result.defenderLosses);

  const log: string[] = [];
  const attackerNation = state.nations.find((n) => n.id === owner);
  const defenderNation = state.nations.find((n) => n.id === enemyAtTarget.ownerId);
  const atkName = attackerNation?.name ?? "Army";
  const myLoss = armySize(result.attackerLosses);
  const theirLoss = armySize(result.defenderLosses);
  if (reinforcements > 0) {
    const defName = defenderNation?.isPlayer ? "Your" : `${defenderNation?.name ?? "The"}'s`;
    log.push(
      `${defName} neighbouring garrisons rallied to ${target.name} (+${soldiersDisplay(reinforcements)} soldiers).`,
    );
  }
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
      ? "Free Towns"
      : defenderNation?.isPlayer
        ? "Your realm"
        : (defenderNation?.name ?? "the garrison"),
    attackerIsPlayer: !!attackerNation?.isPlayer,
    defenderIsPlayer: !!defenderNation?.isPlayer,
    defenderReinforcements: reinforcements,
  };

  // Update the armies with survivors: attacker keeps its remainder; each rallied
  // stack sheds its share; reinforcements that marched to the fight spend a move.
  // Drop any stack wiped out.
  const lossById = new Map<number, UnitCounts>();
  defenders.forEach((d, i) => lossById.set(d.id, perDefenderLosses[i]));
  let armies = state.armies
    .map((a) => {
      if (a.id === army.id) return { ...a, units: result.attackerRemaining };
      const loss = lossById.get(a.id);
      if (loss) {
        const spentMove = a.id !== enemyAtTarget.id; // the garrison in place holds; rallies march
        return {
          ...a,
          units: subtractUnits(a.units, loss),
          movesLeft: spentMove ? Math.max(0, a.movesLeft - 1) : a.movesLeft,
        };
      }
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

// --- Marching: movement that takes time (in-transit orders) -----------------

/**
 * The first region on the shortest path from `fromId` to `destId` over region
 * adjacency (breadth-first, lowest-id tie-break for a reproducible route), or
 * null if the destination is unreachable / already reached. Pure.
 */
export function nextHopToward(state: GameState, fromId: number, destId: number): number | null {
  if (fromId === destId) return null;
  const regions = state.regions;
  const prev = new Map<number, number>();
  const seen = new Set<number>([fromId]);
  const queue: number[] = [fromId];
  while (queue.length) {
    const n = queue.shift()!;
    if (n === destId) break;
    for (const m of [...(regions[n]?.adjacency ?? [])].sort((a, b) => a - b)) {
      if (!seen.has(m)) {
        seen.add(m);
        prev.set(m, n);
        queue.push(m);
      }
    }
  }
  if (!seen.has(destId)) return null;
  let cur = destId;
  while (prev.get(cur) !== undefined && prev.get(cur) !== fromId) cur = prev.get(cur)!;
  return prev.get(cur) === fromId ? cur : null;
}

/**
 * Give an army a standing march order toward `destId`: it will travel there over
 * turns (a step of its move rate each turn, fighting whatever it meets), until it
 * arrives or is stopped. A no-op unless a path exists; ordering a march to where
 * the army already stands cancels any order. Clears entrenchment intent (it's
 * moving now). Pure.
 */
export function orderMarch(state: GameState, armyId: number, destId: number): GameState {
  const army = state.armies.find((a) => a.id === armyId);
  if (!army) return state;
  if (destId === army.regionId) return cancelMarch(state, armyId);
  if (!state.regions[destId]) return state;
  if (nextHopToward(state, army.regionId, destId) === null) return state;
  return {
    ...state,
    armies: state.armies.map((a) => (a.id === armyId ? { ...a, dest: destId, fortifying: false } : a)),
  };
}

/** Cancel an army's standing march order (it holds where it stands). Pure. */
export function cancelMarch(state: GameState, armyId: number): GameState {
  const army = state.armies.find((a) => a.id === armyId);
  if (!army || army.dest == null) return state;
  return { ...state, armies: state.armies.map((a) => (a.id === armyId ? { ...a, dest: null } : a)) };
}

/** Turns an army with orders needs to reach its destination at its move rate. */
export function marchEta(state: GameState, army: Army): number | null {
  if (army.dest == null) return null;
  let hops = 0;
  let at = army.regionId;
  const guard = new Set<number>();
  while (at !== army.dest && !guard.has(at)) {
    guard.add(at);
    const next = nextHopToward(state, at, army.dest);
    if (next === null) return null;
    hops += 1;
    at = next;
  }
  return Math.max(1, Math.ceil(hops / Math.max(1, armyMoves(army.units))));
}

/**
 * Advance every army that carries a march order one turn's travel toward its
 * destination: it steps `armyMoves` regions along the shortest path, using
 * `moveArmy` for each hop so it fights whatever it steps into. The order clears
 * when it arrives, is repelled/blocked, is destroyed, or the path is cut; it is
 * kept (to resume next turn) when the army simply runs out of moves en route.
 * Deterministic (ascending army id). Pure — advances the shared RNG via moveArmy.
 */
export function advanceMarches(state: GameState): GameState {
  let s = state;
  const ids = s.armies
    .filter((a) => a.dest != null)
    .map((a) => a.id)
    .sort((a, b) => a - b);
  for (const id of ids) {
    const start = s.armies.find((a) => a.id === id);
    if (!start || start.dest == null) continue;
    const dest = start.dest;
    let clear = false;
    let died = false;
    let guard = 0;
    while (guard++ < 80) {
      const army = s.armies.find((a) => a.id === id);
      if (!army) { died = true; break; }
      if (army.regionId === dest) { clear = true; break; } // arrived
      if (army.movesLeft <= 0) break; // out of moves — resume next turn (keep the order)
      const next = nextHopToward(s, army.regionId, dest);
      if (next === null) { clear = true; break; } // path cut
      const before = army.regionId;
      s = moveArmy(s, id, next);
      const after = s.armies.find((a) => a.id === id);
      if (!after) { died = true; break; } // destroyed in the fight
      if (after.regionId === before) { clear = true; break; } // repelled/blocked — the march ends here
      // else advanced (or captured and advanced); loop for the next hop
    }
    if (died) continue; // the stack is gone — nothing to update
    // moveArmy builds fresh army objects that drop `dest`; re-apply (or clear it).
    s = { ...s, armies: s.armies.map((a) => (a.id === id ? { ...a, dest: clear ? null : dest } : a)) };
  }
  return s;
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

/**
 * Combined defence (M2): the stacks that fight a defended region as one. That is
 * the garrison standing in the region, plus every army of the *same realm* in an
 * adjacent region that still has a move to spend — they march to the sound of the
 * guns. The garrison is always first. Barbarians never coordinate, so a barbarian
 * holder stands alone and no rally is ever raised on its behalf.
 */
function ralliedDefenders(state: GameState, target: Region, garrison: Army): Army[] {
  if (garrison.ownerId === BARBARIAN_ID) return [garrison];
  const realm = garrison.ownerId;
  const reinforcements = state.armies.filter((a) => {
    if (a.id === garrison.id || a.movesLeft <= 0) return false;
    if (a.ownerId === BARBARIAN_ID) return false;
    if (!target.adjacency.includes(a.regionId)) return false;
    // Same realm always rallies; a formal ally answers the defensive call.
    return a.ownerId === realm || getTreaty(state, realm, a.ownerId) === "alliance";
  });
  return [garrison, ...reinforcements];
}

/**
 * Split a combined stack's losses back across the armies that contributed to it,
 * proportional to each army's share of every unit type. Uses the largest-
 * remainder method per type so the per-stack casualties always sum back exactly
 * to `losses`, and never removes more of a type than a stack actually holds.
 * Deterministic: fractional ties break by contributor order.
 */
function distributeLosses(contributors: Army[], losses: UnitCounts): UnitCounts[] {
  const out = contributors.map(() => emptyUnits());
  for (const t of UNIT_TYPES) {
    let toAssign = losses[t];
    if (toAssign <= 0) continue;
    const held = contributors.map((a) => a.units[t]);
    const total = held.reduce((s, n) => s + n, 0);
    if (total === 0) continue;
    const exact = held.map((n) => (losses[t] * n) / total);
    const alloc = exact.map((v) => Math.floor(v));
    let assigned = alloc.reduce((s, n) => s + n, 0);
    // Hand out the remainder to the largest fractional parts first.
    const order = exact
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (let k = 0; assigned < toAssign && k < order.length; k++) {
      const idx = order[k].i;
      if (alloc[idx] < held[idx]) {
        alloc[idx] += 1;
        assigned += 1;
      }
    }
    // Safety net if capacity caps blocked the remainder: spill onto any stack with room.
    for (let i = 0; assigned < toAssign && i < contributors.length; i++) {
      while (assigned < toAssign && alloc[i] < held[i]) {
        alloc[i] += 1;
        assigned += 1;
      }
    }
    for (let i = 0; i < contributors.length; i++) out[i][t] = Math.min(alloc[i], held[i]);
  }
  return out;
}

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
              movesLeft: zocClampedMoves(
                state,
                targetRegionId,
                a.ownerId,
                Math.min(a.movesLeft, army.movesLeft - 1),
              ),
              // Fresh troops arriving break the standing stack's entrenchment.
              fortifying: false,
              entrenchment: 0,
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
      ? {
          ...a,
          regionId: targetRegionId,
          movesLeft: zocClampedMoves(state, targetRegionId, a.ownerId, a.movesLeft - 1),
          fortifying: false,
          entrenchment: 0,
        }
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

/** Move an army into a region and spend its move (entering an enemy ZoC halts it). */
function advanceInto(state: GameState, armyId: number, regionId: number): GameState {
  const armies = state.armies.map((a) =>
    a.id === armyId
      ? {
          ...a,
          regionId,
          movesLeft: zocClampedMoves(state, regionId, a.ownerId, a.movesLeft - 1),
          fortifying: false,
          entrenchment: 0,
        }
      : a,
  );
  return { ...state, armies };
}

function spendMove(state: GameState, armyId: number): GameState {
  // A repelled attacker sortied — it is no longer dug in.
  const armies = state.armies.map((a) =>
    a.id === armyId ? { ...a, movesLeft: a.movesLeft - 1, fortifying: false, entrenchment: 0 } : a,
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
