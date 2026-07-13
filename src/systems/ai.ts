/**
 * Rival AI — rule-based utility scoring with personality archetypes
 * (docs/game-design.md §5).
 *
 * HARD CONSTRAINT: this is plain TypeScript that runs entirely in the browser.
 * It makes no LLM/API calls, needs no key, and consumes no credits — playing is
 * free and offline. Claude is used only at development time to write these rules.
 *
 * Each rival runs the same framework under the same scarcity as the player:
 * assess the situation into scalars, score candidate actions weighted by its
 * personality, and commit the affordable ones. It *feels* reactive because it
 * responds to real state — attacking weakness, hesitating against strength,
 * cooling toward armies on its border — not because of scripts.
 *
 * Pure over `GameState`; all randomness comes from the passed-in Rng.
 */

import { UNITS, UNIT_TYPES, type UnitType } from "@/data/units";
import type { BuildingId } from "@/data/buildings";
import { sideStrength, type UnitCounts } from "@/systems/combat";
import {
  canRaiseUnit,
  moveArmy,
  raiseUnit,
  strategicAccess,
} from "@/systems/military";
import {
  addOffer,
  atWar,
  declareWar,
  getRelation,
  getTreaty,
  gift,
  makePeace,
  nationPower,
  setPact,
  sharedBorders,
} from "@/systems/diplomacy";
import { researchFrontier, selectTech, isBuildingUnlockedFor } from "@/systems/tech";
import { TECHS, type TechId } from "@/data/techs";
import type { Rng } from "@/systems/rng";
import {
  BARBARIAN_ID,
  DIFFICULTY,
  PLAYER_ID,
  WONDER_GOAL,
  armySize,
  clampTax,
  emptyUnits,
  type GameState,
  type Nation,
} from "@/systems/state";

/** Turns rivals leave the player alone at the start (scales with difficulty). */
function earlyPeaceTurns(state: GameState): number {
  return DIFFICULTY[state.difficulty].earlyPeace;
}

/** Run a rival nation's full turn. */
export function runNationTurn(state: GameState, nationId: number, rng: Rng): GameState {
  let s = state;
  s = manageEconomy(s, nationId);
  s = doDiplomacy(s, nationId, rng);
  s = doMilitary(s, nationId, rng);
  return s;
}

// --- economy ---------------------------------------------------------------

function manageEconomy(state: GameState, nationId: number): GameState {
  const nation = state.nations.find((n) => n.id === nationId);
  if (!nation) return state;
  const owned = state.regions.filter((r) => r.ownerId === nationId);
  if (!owned.length) return state;

  let s = state;

  // Research: keep a tech in progress, chosen by personality branch.
  if (!nation.research.current) {
    const pick = pickTech(nation.research.done, nation);
    if (pick) s = chooseTech(s, nationId, pick);
  }

  // Tax policy: aim higher when calm and poorer; ease off when unrest bites.
  const avgUnrest = owned.reduce((a, r) => a + r.unrest, 0) / owned.length;
  const p = nation.personality;
  let target = 0.15 + (p?.economy ?? 0.5) * 0.1 + (p?.aggression ?? 0.4) * 0.1;
  if (avgUnrest > 45) target -= 0.1;
  if (nation.stocks.gold > 300) target -= 0.05;
  s = setTax(s, nationId, target);

  // Buildings: fill empty slots with the best unlocked option. A Great Work is
  // a national project — only one may be under construction at a time, so the
  // AI can't win by spamming wonders in every region at once.
  const done = s.nations.find((n) => n.id === nationId)!.research.done;
  // Only economy-minded nations chase a Great Works win; aggressive nations
  // spend on military and seek domination instead. This makes the endgame
  // follow personality rather than everyone racing the same wonder path.
  const pursuesWonders = (p?.economy ?? 0.5) >= 0.6;
  let wonderInProgress = s.regions.some(
    (r) => r.ownerId === nationId && r.construction?.building === "wonder",
  );
  for (const region of s.regions) {
    if (region.ownerId !== nationId || region.construction) continue;
    const choice = chooseBuilding(region, done, nation.wonders, pursuesWonders && !wonderInProgress);
    if (choice) {
      s = queueFor(s, region.id, choice, nationId);
      if (choice === "wonder") wonderInProgress = true;
    }
  }
  return s;
}

function pickTech(done: TechId[], nation: Nation): TechId | null {
  const frontier = researchFrontier(done);
  if (!frontier.length) return null;
  const p = nation.personality;
  const branchPref =
    (p?.aggression ?? 0) > 0.6 ? "military" : (p?.economy ?? 0) > 0.6 ? "economy" : "civics";
  // Prefer the personality's branch, then anything cheapest.
  const inBranch = frontier.filter((t) => TECHS[t].branch === branchPref);
  const pool = inBranch.length ? inBranch : frontier;
  return pool.reduce((best, t) => (TECHS[t].cost < TECHS[best].cost ? t : best), pool[0]!);
}

function chooseBuilding(
  region: { unrest: number; buildings: BuildingId[] },
  done: TechId[],
  wonders: number,
  canStartWonder: boolean,
): BuildingId | null {
  const has = (b: BuildingId) => region.buildings.includes(b);
  const unlocked = (b: BuildingId) => isBuildingUnlockedFor(done, b);
  if (region.unrest > 35 && !has("temple")) return "temple";
  // Chase a Great Works victory — but only one wonder at a time (national project).
  if (canStartWonder && unlocked("wonder") && !has("wonder") && wonders < WONDER_GOAL) {
    return "wonder";
  }
  const order: BuildingId[] = [
    "market", "bank", "workshop", "university", "farm", "aqueduct", "library", "temple", "fortress",
  ];
  for (const b of order) if (unlocked(b) && !has(b)) return b;
  return null;
}

function chooseTech(state: GameState, nationId: number, tech: TechId): GameState {
  const nations = state.nations.map((n) =>
    n.id === nationId ? { ...n, research: selectTech(n.research, tech) } : n,
  );
  return { ...state, nations };
}

// --- diplomacy --------------------------------------------------------------

function doDiplomacy(state: GameState, nationId: number, rng: Rng): GameState {
  const me = state.nations.find((n) => n.id === nationId);
  if (!me) return state;
  const p = me.personality;
  const aggression = p?.aggression ?? 0.4;
  const trust = p?.trustworthiness ?? 0.5;

  const others = state.nations.filter(
    (n) => !n.isBarbarian && n.alive && n.id !== nationId,
  );
  const myPower = nationPower(state, nationId);

  let s = state;
  let actions = 0;
  for (const o of others) {
    if (actions >= 1) break; // at most one diplomatic move per turn
    const rel = getRelation(s, nationId, o.id);
    const treaty = getTreaty(s, nationId, o.id);
    const theirPower = nationPower(s, o.id) || 1;
    const ratio = myPower / theirPower;
    const border = sharedBorders(s, nationId, o.id) > 0;

    if (treaty === "war") {
      // Losing badly → sue for peace (more readily if unaggressive).
      if (ratio < 0.7 - aggression * 0.2) {
        s = suePeace(s, nationId, o);
        actions++;
      }
      continue;
    }

    // Opportunistic war: hostile, bordering, and I'm stronger. Warlords pounce
    // at worse odds; peaceful types need a big edge. The player gets an
    // early-game grace period so a new realm isn't snuffed out immediately.
    const earlyGraceForPlayer = o.isPlayer && s.turn < earlyPeaceTurns(s);
    const warThreshold = 1.5 - aggression;
    if (border && rel < -25 && ratio > warThreshold && !earlyGraceForPlayer) {
      s = openWar(s, nationId, o);
      actions++;
      continue;
    }

    // Trustworthy types shore up relations with a pact or a gift.
    if (trust > 0.55 && rel > 15 && treaty === "peace" && border) {
      s = offerPact(s, nationId, o, rel > 45 ? "alliance" : "nap");
      actions++;
      continue;
    }

    // A merchant appeases a much stronger, unfriendly neighbour with a gift.
    if ((p?.economy ?? 0) > 0.7 && ratio < 0.6 && rel < 0 && me.stocks.gold > 80) {
      s = gift(s, nationId, o.id, 30);
      actions++;
    }
  }
  // Small random chance a warlord with no target still probes a neighbour.
  void rng;
  return s;
}

function openWar(state: GameState, from: number, target: Nation): GameState {
  if (target.isPlayer) {
    // War is declared immediately (no consent needed).
    return declareWar(state, from, target.id);
  }
  return declareWar(state, from, target.id);
}

function suePeace(state: GameState, from: number, target: Nation): GameState {
  if (target.isPlayer) return addOffer(state, from, target.id, "peace");
  // AI-to-AI peace resolves immediately.
  return makePeace(state, from, target.id);
}

function offerPact(
  state: GameState,
  from: number,
  target: Nation,
  kind: "nap" | "alliance",
): GameState {
  if (target.isPlayer) return addOffer(state, from, target.id, kind);
  return setPact(state, from, target.id, kind);
}

// --- military ---------------------------------------------------------------

function doMilitary(state: GameState, nationId: number, rng: Rng): GameState {
  let s = state;
  const nation = s.nations.find((n) => n.id === nationId);
  if (!nation) return s;

  // Recruit: keep an army if aggressive/at war and it's affordable.
  s = recruit(s, nationId, rng);

  // Phase 1 — attack: strongest armies first take their best winnable target.
  const myArmies = () => s.armies.filter((a) => a.ownerId === nationId);
  for (const army of [...myArmies()].sort((a, b) => armySize(b.units) - armySize(a.units))) {
    const live = s.armies.find((a) => a.id === army.id);
    if (!live || live.movesLeft <= 0) continue;
    const target = bestTarget(s, live, nationId);
    if (target !== null) s = moveArmy(s, live.id, target);
  }

  // Phase 2 — concentrate: armies with no winnable target march through friendly
  // territory toward the nearest frontier, converging and merging into one stack
  // strong enough to break defences a split force cannot.
  for (const army of myArmies()) {
    const live = s.armies.find((a) => a.id === army.id);
    if (!live || live.movesLeft <= 0) continue;
    if (bestTarget(s, live, nationId) !== null) continue;
    const step = advanceStep(s, live, nationId);
    if (step !== null) s = moveArmy(s, live.id, step);
  }
  return s;
}

/** Whether a nation may attack into a region (hostile, honouring player grace). */
function isAttackable(state: GameState, regionId: number, nationId: number): boolean {
  const r = state.regions[regionId];
  if (!r || r.ownerId === null || r.ownerId === nationId) return false;
  if (r.ownerId === BARBARIAN_ID) return true;
  if (r.ownerId === PLAYER_ID && state.turn < earlyPeaceTurns(state)) return false;
  return atWar(state, nationId, r.ownerId);
}

/**
 * The first step (an owned neighbour) toward the nearest frontier region — an
 * owned region bordering something attackable. Marches only through friendly
 * land, so the advance never blunders into a losing fight. Null if the army is
 * already at the front or no owned path reaches one.
 */
function advanceStep(
  state: GameState,
  army: { regionId: number },
  nationId: number,
): number | null {
  const start = army.regionId;
  const isFrontier = (rid: number): boolean => {
    const r = state.regions[rid];
    return (
      !!r && r.ownerId === nationId && r.adjacency.some((n) => isAttackable(state, n, nationId))
    );
  };
  if (isFrontier(start)) return null; // already staged at the front

  const visited = new Set<number>([start]);
  const queue: { node: number; first: number | null }[] = [{ node: start, first: null }];
  while (queue.length) {
    const { node, first } = queue.shift()!;
    for (const nb of state.regions[node]!.adjacency) {
      if (visited.has(nb)) continue;
      const nbR = state.regions[nb];
      if (!nbR || nbR.ownerId !== nationId) continue; // march only through own land
      visited.add(nb);
      const step = first ?? nb;
      if (isFrontier(nb)) return step;
      queue.push({ node: nb, first: step });
    }
  }
  return null;
}

function recruit(state: GameState, nationId: number, rng: Rng): GameState {
  const nation = state.nations.find((n) => n.id === nationId);
  if (!nation) return state;
  const p = nation.personality;
  const aggression = p?.aggression ?? 0.4;
  const atWarNow = state.nations.some(
    (o) => !o.isBarbarian && o.id !== nationId && atWar(state, nationId, o.id),
  );
  const myUnits = state.armies
    .filter((a) => a.ownerId === nationId)
    .reduce((sum, a) => sum + armySize(a.units), 0);

  // Warlords keep a bigger standing army; everyone raises more in wartime.
  const wanted = 3 + Math.round(aggression * 6) + (atWarNow ? 3 : 0);
  if (myUnits >= wanted) return state;
  if (nation.stocks.gold < 30) return state;

  // Recruit in the capital-ish region (first owned with an army, else first owned).
  const home =
    state.armies.find((a) => a.ownerId === nationId)?.regionId ??
    state.regions.find((r) => r.ownerId === nationId)?.id;
  if (home === undefined) return state;

  // Composition-aware: bring siege against fortified frontier targets and units
  // that counter the enemy's actual mix, falling back to a generalist plan when
  // there's no intel — rather than always defaulting to infantry.
  const pref = planRecruitment(state, nationId);
  const pick = pref.find((u) => canRaiseUnit(state, home, u, nationId).ok);
  if (!pick) return state;
  void rng;
  return raiseUnit(state, home, pick, nationId);
}

/** What this nation is likely to fight next: enemy mix + toughest target fort. */
interface ThreatProfile {
  /** Summed unit counts of hostile armies on or next to our border. */
  composition: UnitCounts;
  /** Highest fortification among attackable frontier targets. */
  maxTargetFort: number;
  /** Whether any attackable target borders our territory at all. */
  hasTarget: boolean;
}

function assessThreat(state: GameState, nationId: number): ThreatProfile {
  const owned = state.regions.filter((r) => r.ownerId === nationId);
  const ownedIds = new Set(owned.map((r) => r.id));
  const targetIds = new Set<number>();
  let maxTargetFort = 0;
  for (const r of owned) {
    for (const nb of r.adjacency) {
      if (isAttackable(state, nb, nationId)) {
        targetIds.add(nb);
        maxTargetFort = Math.max(maxTargetFort, state.regions[nb]!.fortification);
      }
    }
  }

  // Hostile armies within reach: standing on a target, or one step from our land.
  const composition = emptyUnits();
  for (const a of state.armies) {
    if (a.ownerId === nationId || a.ownerId === null) continue;
    const hostile = a.ownerId === BARBARIAN_ID || atWar(state, nationId, a.ownerId);
    if (!hostile) continue;
    const onTarget = targetIds.has(a.regionId);
    const nearOurLand = state.regions[a.regionId]?.adjacency.some((n) => ownedIds.has(n));
    if (onTarget || nearOurLand) {
      for (const t of UNIT_TYPES) composition[t] += a.units[t];
    }
  }

  return { composition, maxTargetFort, hasTarget: targetIds.size > 0 };
}

/** The counter-loop unit that beats a given enemy field unit (null for siege). */
function counterTo(enemy: UnitType): UnitType | null {
  for (const t of UNIT_TYPES) if (UNITS[t].counters === enemy) return t;
  return null;
}

/** The enemy's most numerous field unit (siege excluded), or null if none seen. */
function dominantFieldUnit(composition: UnitCounts): UnitType | null {
  let best: UnitType | null = null;
  let bestCount = 0;
  for (const t of UNIT_TYPES) {
    if (t === "siege") continue;
    if (composition[t] > bestCount) {
      bestCount = composition[t];
      best = t;
    }
  }
  return best;
}

function myUnitCount(state: GameState, nationId: number, unit: UnitType): number {
  let sum = 0;
  for (const a of state.armies) if (a.ownerId === nationId) sum += a.units[unit];
  return sum;
}

/**
 * Ordered recruitment preference for a nation given the current threat picture:
 *   1. Siege, when a fortified target needs breaking and we lack enough of it.
 *   2. The counter to the enemy's dominant field unit.
 *   3. A generalist fallback (cavalry if we have horses, then infantry/ranged/militia).
 * Pure and deterministic — a plain function of state, easily unit-tested.
 */
export function planRecruitment(state: GameState, nationId: number): UnitType[] {
  const access = strategicAccess(state, nationId);
  const threat = assessThreat(state, nationId);
  const pref: UnitType[] = [];

  // 1) Siege to strip forts a split field force can't crack — but only up to the
  //    number of siege units needed for the toughest target, so armies don't turn
  //    into all-siege stacks (siege is weak in the open field).
  const neededSiege = Math.ceil(threat.maxTargetFort / UNITS.siege.siegePower);
  if (threat.maxTargetFort >= 1 && myUnitCount(state, nationId, "siege") < neededSiege) {
    pref.push("siege");
  }

  // 2) Counter the enemy's dominant field unit.
  const dominant = dominantFieldUnit(threat.composition);
  if (dominant) {
    const counter = counterTo(dominant);
    if (counter) pref.push(counter);
  }

  // 3) Generalist fallback / diversification.
  if (access.has("horses")) pref.push("cavalry");
  pref.push("infantry", "ranged", "militia");

  return [...new Set(pref)];
}

/** The best adjacent region for an army to attack, or null to hold. */
function bestTarget(state: GameState, army: { id: number; regionId: number; units: Record<UnitType, number> }, nationId: number): number | null {
  const region = state.regions[army.regionId];
  if (!region) return null;
  const atk = sideStrength(army.units, zeroUnits(), "attack");

  let best: number | null = null;
  let bestScore = 0;
  for (const nid of region.adjacency) {
    const target = state.regions[nid];
    if (!target || target.ownerId === nationId) continue;

    const isBarb = target.ownerId === BARBARIAN_ID;
    const isEnemy = target.ownerId !== null && !isBarb && atWar(state, nationId, target.ownerId);
    if (!isBarb && !isEnemy) continue; // don't attack nations we're at peace with
    // Honour the player's early-game grace: don't invade them before it lapses.
    if (target.ownerId === PLAYER_ID && state.turn < earlyPeaceTurns(state)) continue;

    const defender = state.armies.find((a) => a.regionId === nid && a.ownerId !== nationId);
    const def = defender
      ? sideStrength(defender.units, army.units, "defense") * 1.2 + target.fortification * 3
      : 0;

    // Winnable if our attack clearly exceeds their defence.
    if (atk > def * 1.1) {
      // Prefer softer targets (bigger margin) and richer regions.
      const score = atk - def + (isBarb ? 2 : 5);
      if (score > bestScore) {
        bestScore = score;
        best = nid;
      }
    }
  }
  return best;
}

// --- small helpers ----------------------------------------------------------

function setTax(state: GameState, nationId: number, rate: number): GameState {
  const nations = state.nations.map((n) =>
    n.id === nationId ? { ...n, taxRate: clampTax(rate) } : n,
  );
  return { ...state, nations };
}

function queueFor(state: GameState, regionId: number, building: BuildingId, ownerId: number): GameState {
  const region = state.regions[regionId];
  if (!region || region.ownerId !== ownerId || region.buildings.includes(building)) return state;
  const regions = state.regions.map((r) =>
    r.id === regionId ? { ...r, construction: { building, progress: 0 } } : r,
  );
  return { ...state, regions };
}

function zeroUnits(): Record<UnitType, number> {
  return { militia: 0, infantry: 0, ranged: 0, cavalry: 0, siege: 0 };
}
