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
import { BUILDINGS, type BuildingId } from "@/data/buildings";
import type { TraitId } from "@/data/traits";
import { TERRAIN, type TerrainId } from "@/data/terrain";
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
  callToArms,
  declareWar,
  establishTrade,
  getRelation,
  getTreaty,
  gift,
  hasTrade,
  makePeace,
  nationPower,
  peaceReparations,
  setPact,
  sharedBorders,
  wouldAccept,
  wouldJoinWar,
} from "@/systems/diplomacy";
import { researchFrontier, selectTech, isBuildingUnlockedFor } from "@/systems/tech";
import { TECHS, type TechId, type TechBranch } from "@/data/techs";
import type { Rng } from "@/systems/rng";
import {
  BARBARIAN_ID,
  DIFFICULTY,
  FORT_PER_LEVEL,
  FRIENDLY_THRESHOLD,
  PLAYER_ID,
  WONDER_GOAL,
  UNREST_REVOLT,
  SECESSION_REVOLT_TURNS,
  nationInstability,
  armySize,
  clampTax,
  emptyUnits,
  type Army,
  type GameState,
  type Nation,
  type Region,
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

  // Tax policy: aim higher when calm and poorer; ease off when unrest bites, and
  // cut hard when any one province is tipping toward secession (a cheaper save
  // than marching an army to garrison it).
  const p = nation.personality;
  s = setTax(s, nationId, desiredTaxRate(nation, owned));

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
    const choice = chooseBuilding(
      region,
      done,
      nation.wonders,
      pursuesWonders && !wonderInProgress,
      nation.trait,
    );
    if (choice) {
      s = queueFor(s, region.id, choice, nationId);
      if (choice === "wonder") wonderInProgress = true;
    }
  }
  return s;
}

/** A province at/above this unrest is trending toward revolt (below the revolt line). */
const NEAR_REVOLT_UNREST = 60;

/**
 * The tax rate a nation aims for. Higher when calm and poorer (economy/aggression
 * push it up); eased when the realm's *average* unrest is high; and cut **hard**
 * when its *worst* province is in or near revolt — a single crisis province is
 * invisible to an average, yet losing it to secession is a free loss, so cutting
 * tax to calm it is worth the income. Clamped to the legal band. Pure.
 */
export function desiredTaxRate(nation: Nation, owned: Region[]): number {
  const p = nation.personality;
  let target = 0.15 + (p?.economy ?? 0.5) * 0.1 + (p?.aggression ?? 0.4) * 0.1;
  if (!owned.length) return clampTax(target);

  const avgUnrest = owned.reduce((a, r) => a + r.unrest, 0) / owned.length;
  if (avgUnrest > 45) target -= 0.1;

  const maxUnrest = owned.reduce((m, r) => Math.max(m, r.unrest), 0);
  if (maxUnrest >= UNREST_REVOLT) target -= 0.1; // a province is revolting — de-escalate
  else if (maxUnrest >= NEAR_REVOLT_UNREST) target -= 0.05; // trending toward revolt

  if (nation.stocks.gold > 300) target -= 0.05;
  return clampTax(target);
}

/** The research branch a nation should favour, given the personality thresholds. */
function personalityBranch(nation: Nation): TechBranch {
  const p = nation.personality;
  return (p?.aggression ?? 0) > 0.6 ? "military" : (p?.economy ?? 0) > 0.6 ? "economy" : "civics";
}

/**
 * The research branch a nation prefers, biased first by its national TRAIT so a
 * realm rushes the tech path that plays to its strength — a Scholarly nation up
 * the knowledge/civics line, a Martial one the military line, economic traits
 * the economy line. With no trait it falls back to the personality branch.
 */
export function preferredTechBranch(nation: Nation): TechBranch {
  switch (nation.trait) {
    case "scholarly":
      return "civics";
    case "martial":
      return "military";
    case "mercantile":
    case "industrious":
    case "fertile":
      return "economy";
    default:
      return personalityBranch(nation);
  }
}

function pickTech(done: TechId[], nation: Nation): TechId | null {
  const frontier = researchFrontier(done);
  if (!frontier.length) return null;
  // Prefer the trait-driven branch, then the personality branch, then anything.
  const traitBranch = preferredTechBranch(nation);
  const persBranch = personalityBranch(nation);
  const inTrait = frontier.filter((t) => TECHS[t].branch === traitBranch);
  const inPers = frontier.filter((t) => TECHS[t].branch === persBranch);
  const pool = inTrait.length ? inTrait : inPers.length ? inPers : frontier;
  // Cheapest of the chosen candidate set (deterministic, never null here).
  return pool.reduce((best, t) => (TECHS[t].cost < TECHS[best].cost ? t : best), pool[0]!);
}

/** Base build order when a nation's trait expresses no preference. */
const BASE_BUILD_ORDER: BuildingId[] = [
  "market", "harbor", "bank", "guildhall", "workshop", "mine", "university", "forum", "farm", "aqueduct", "library", "temple", "fortress",
];

/** Buildings a trait rushes first, so rivals open along their strength. */
const TRAIT_BUILD_PRIORITY: Record<TraitId, BuildingId[]> = {
  fertile: ["farm", "aqueduct"],
  industrious: ["workshop", "mine", "guildhall"],
  mercantile: ["market", "harbor", "bank", "guildhall"],
  scholarly: ["library", "university", "forum"],
  martial: ["fortress", "workshop"],
};

export function chooseBuilding(
  region: { unrest: number; buildings: BuildingId[]; terrain: TerrainId },
  done: TechId[],
  wonders: number,
  canStartWonder: boolean,
  trait?: TraitId,
): BuildingId | null {
  const has = (b: BuildingId) => region.buildings.includes(b);
  const unlocked = (b: BuildingId) => isBuildingUnlockedFor(done, b);
  const fits = (b: BuildingId) => {
    const t = BUILDINGS[b].requiresTerrain;
    return !t || region.terrain === t;
  };
  if (region.unrest > 35 && !has("temple")) return "temple";
  // Chase a Great Works victory — but only one wonder at a time (national project).
  if (canStartWonder && unlocked("wonder") && !has("wonder") && wonders < WONDER_GOAL) {
    return "wonder";
  }
  // Trait-preferred buildings first, then the generalist order.
  const order = [...new Set([...(trait ? TRAIT_BUILD_PRIORITY[trait] : []), ...BASE_BUILD_ORDER])];
  for (const b of order) if (unlocked(b) && !has(b) && fits(b)) return b;
  return null;
}

function chooseTech(state: GameState, nationId: number, tech: TechId): GameState {
  const nations = state.nations.map((n) =>
    n.id === nationId ? { ...n, research: selectTech(n.research, tech) } : n,
  );
  return { ...state, nations };
}

// --- diplomacy --------------------------------------------------------------

/** A leader must be this much stronger than the next nation to be "runaway". */
const LEADER_POWER_RATIO = 1.6;
/** …and hold at least this share of all owned (non-barbarian) regions. */
const LEADER_REGION_SHARE = 0.4;
/** Join the coalition once its combined power reaches the leader × this. */
const COALITION_MARGIN = 0.85;

/**
 * The runaway leader's id, or null. A runaway both out-powers the second-place
 * nation by `LEADER_POWER_RATIO` and holds `LEADER_REGION_SHARE` of the map.
 * Needs at least three living nations, so there's a coalition to form.
 */
export function runawayLeader(state: GameState): number | null {
  const nations = state.nations.filter((n) => !n.isBarbarian && n.alive);
  if (nations.length < 3) return null;
  const powers = nations
    .map((n) => ({ id: n.id, p: nationPower(state, n.id) }))
    .sort((a, b) => b.p - a.p);
  const first = powers[0]!;
  const second = powers[1]!;
  if (first.p < second.p * LEADER_POWER_RATIO) return null;
  const owned = state.regions.filter(
    (r) => r.ownerId !== null && r.ownerId !== BARBARIAN_ID,
  ).length || 1;
  const leaderRegions = state.regions.filter((r) => r.ownerId === first.id).length;
  if (leaderRegions / owned < LEADER_REGION_SHARE) return null;
  return first.id;
}

/** Combined power of `joinerId` plus everyone already at war with `leaderId`. */
export function coalitionPowerAgainst(
  state: GameState,
  leaderId: number,
  joinerId: number,
): number {
  let power = nationPower(state, joinerId);
  for (const n of state.nations) {
    if (n.isBarbarian || !n.alive || n.id === leaderId || n.id === joinerId) continue;
    if (atWar(state, n.id, leaderId)) power += nationPower(state, n.id);
  }
  return power;
}

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
  const leaderId = runawayLeader(state);
  // A realm already struggling to hold itself together (a province in open
  // revolt) puts new wars of *conquest* on hold until it restores order — quell
  // unrest before grabbing more land. Defensive wars, suing for peace, and
  // coalitions against a runaway leader are unaffected.
  const overstretched = state.regions.some(
    (r) => r.ownerId === nationId && r.unrest >= UNREST_REVOLT,
  );

  let s = state;
  let actions = 0;
  for (const o of others) {
    if (actions >= 1) break; // at most one diplomatic move per turn
    const rel = getRelation(s, nationId, o.id);
    const treaty = getTreaty(s, nationId, o.id);
    const theirPower = nationPower(s, o.id) || 1;
    const ratio = myPower / theirPower;
    const border = sharedBorders(s, nationId, o.id) > 0;
    const earlyGraceForPlayer = o.isPlayer && s.turn < earlyPeaceTurns(s);

    if (treaty === "war") {
      // Losing badly → sue for peace (more readily if unaggressive). But hold the
      // line against a runaway leader: don't hand the snowball an easy white peace.
      if (ratio < 0.7 - aggression * 0.2 && o.id !== leaderId) {
        s = suePeace(s, nationId, o);
        actions++;
      }
      continue;
    }

    // Gang up on a runaway leader: once the coalition already fighting it (plus
    // me) collectively rivals its power, pile on — even at unfavourable 1v1 odds.
    // This is the anti-snowball brake (design §5), respecting NAPs/alliances and
    // the player's early grace.
    if (
      o.id === leaderId &&
      border &&
      treaty === "peace" &&
      rel < FRIENDLY_THRESHOLD &&
      !earlyGraceForPlayer &&
      coalitionPowerAgainst(s, leaderId, nationId) >= nationPower(s, leaderId) * COALITION_MARGIN
    ) {
      s = openWar(s, nationId, o);
      actions++;
      continue;
    }

    // Opportunistic war: hostile, bordering, and I'm stronger. Warlords pounce
    // at worse odds; peaceful types need a big edge. The player gets an
    // early-game grace period so a new realm isn't snuffed out immediately.
    // A rival that is internally weak — a province in open revolt, or gripped by
    // famine or bankruptcy — is distracted and poorly placed to defend, so it's a
    // tempting moment: the required power edge drops. (The complement to the
    // `overstretched` restraint: strike weakness, don't compound your own.)
    const targetUnstable = nationInstability(state, o.id).reeling;
    const warThreshold = 1.5 - aggression - (targetUnstable ? 0.3 : 0);
    if (border && rel < -25 && ratio > warThreshold && !earlyGraceForPlayer && !overstretched) {
      s = openWar(s, nationId, o);
      actions++;
      continue;
    }

    // Extortion short of war: a strong, bordering rival that is unfriendly (but
    // not yet hostile enough to invade — that case warred above) demands tribute
    // of the player. Pay up, or refuse and watch relations sour toward the war
    // it foreshadows. Only the player can weigh such an offer, and only one
    // stands at a time (dedup); ignoring it never itself triggers war.
    if (
      o.isPlayer &&
      border &&
      treaty === "peace" &&
      !earlyGraceForPlayer &&
      rel < 0 &&
      ratio > 1.35 &&
      !s.offers.some((of) => of.from === nationId && of.to === o.id && of.type === "tribute")
    ) {
      s = demandTribute(s, nationId, o.id, Math.min(50, Math.round(18 + (ratio - 1) * 25)));
      actions++;
      continue;
    }

    // Trustworthy types shore up relations with a pact or a gift.
    if (trust > 0.55 && rel > 15 && treaty === "peace" && border) {
      s = offerPact(s, nationId, o, rel > 45 ? "alliance" : "nap");
      actions++;
      continue;
    }

    // Open a trade route with a peaceful, non-hostile neighbour — economic realms
    // especially. Profitable for both, and a future war would sever it. The player
    // gets an offer to weigh; a willing AI opens the route directly.
    if (
      border &&
      rel > -10 &&
      (p?.economy ?? 0.5) >= 0.45 &&
      !hasTrade(s, nationId, o.id)
    ) {
      if (o.isPlayer) {
        if (!s.offers.some((of) => of.from === nationId && of.to === o.id && of.type === "trade")) {
          s = addOffer(s, nationId, o.id, "trade");
          actions++;
          continue;
        }
      } else if (wouldAccept(s, nationId, o.id, "trade")) {
        s = establishTrade(s, nationId, o.id);
        actions++;
        continue;
      }
    }

    // A merchant appeases a much stronger, unfriendly neighbour with a gift.
    if ((p?.economy ?? 0) > 0.7 && ratio < 0.6 && rel < 0 && me.stocks.gold > 80) {
      s = gift(s, nationId, o.id, 30);
      actions++;
    }
  }
  // Rally an ally into a war I'm LOSING (call to arms) — at most one per turn, and
  // only when the enemy out-powers me, so it's a genuine cry for help rather than
  // an automatic dogpile (which would end games too fast). wouldJoinWar declines
  // for a player ally, so the AI never forces the player into a war.
  rally: for (const ally of others) {
    if (getTreaty(s, nationId, ally.id) !== "alliance") continue;
    for (const enemy of others) {
      if (enemy.id === ally.id) continue;
      if (
        atWar(s, nationId, enemy.id) &&
        nationPower(s, enemy.id) > nationPower(s, nationId) * 1.1 &&
        wouldJoinWar(s, ally.id, nationId, enemy.id)
      ) {
        s = callToArms(s, nationId, ally.id, enemy.id);
        break rally;
      }
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
  if (target.isPlayer) {
    // Sweeten the bid with reparations when clearly the weaker party — a losing AI
    // buys its way out, giving the player a concrete reason to grant peace.
    const reparations = peaceReparations(state, from, target.id);
    return addOffer(state, from, target.id, "peace", reparations > 0 ? reparations : undefined);
  }
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

/** A strong rival demands gold of the player. `addOffer` logs the ultimatum. */
function demandTribute(state: GameState, from: number, playerId: number, gold: number): GameState {
  // The player-facing announcement (with terms) is emitted by addOffer; dedup is
  // handled there too (it returns state unchanged when a demand already stands).
  return addOffer(state, from, playerId, "tribute", gold);
}

// --- military ---------------------------------------------------------------

/** An army retreats when a bordering enemy's attack exceeds its defence by this. */
const RETREAT_RATIO = 1.35;

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

  // Phase 2 — reposition idle armies (no winnable attack this turn):
  //   • badly outmatched where it stands → retreat to a safer owned region
  //     (don't feed the army into a losing fight);
  //   • holding a defensible threatened region → stay put and garrison it;
  //   • otherwise march to reinforce the nearest threatened region, or, failing
  //     that, concentrate toward the offensive frontier (previous behaviour).
  for (const army of myArmies()) {
    const live = s.armies.find((a) => a.id === army.id);
    if (!live || live.movesLeft <= 0) continue;
    if (bestTarget(s, live, nationId) !== null) continue;

    if (isBadlyOutmatched(s, live, nationId)) {
      const refuge = retreatStep(s, live, nationId);
      if (refuge !== null) s = moveArmy(s, live.id, refuge);
      continue; // if nowhere safer, hold and sell it dearly rather than advance
    }

    // Concentration of force: gather toward the anvil next to a high-value target
    // that no single army can crack, massing (and merging) over turns until the
    // combined stack wins — instead of dribbling armies onto the front piecemeal.
    // This takes priority over a *passive* garrison (the anvil is itself on the
    // front), but never overrides the retreat above, and never strips the
    // capital's own garrison — a realm keeps its seat of power defended.
    const capitalId = s.nations.find((n) => n.id === nationId)?.capitalRegionId;
    const holdingCapital = live.regionId === capitalId && regionIsThreatened(s, live.regionId, nationId);
    if (!holdingCapital) {
      const focus = focusTarget(s, nationId);
      if (focus !== null) {
        const muster = musterRegion(s, nationId, focus);
        if (muster !== null) {
          if (live.regionId === muster) continue; // already massing here — hold and build up
          const toMuster = firstStepTowards(s, live.regionId, nationId, (rid) => rid === muster);
          if (toMuster !== null) {
            s = moveArmy(s, live.id, toMuster);
            continue;
          }
        }
      }
    }

    // Defensible and already under threat here → garrison in place.
    if (regionIsThreatened(s, live.regionId, nationId)) continue;

    // Internal order: an army standing in one of the nation's own revolting
    // regions is suppressing it (a garrison resets the secession counter), so
    // hold there rather than let the province break away.
    const here = s.regions[live.regionId];
    if (here && here.ownerId === nationId && here.unrest >= UNREST_REVOLT) continue;

    // Otherwise, if a restless region is about to secede, march to quell it
    // before reinforcing the front — losing a province to revolt is a free loss.
    const atRisk = secessionRiskRegion(s, nationId);
    if (atRisk !== null) {
      const toRisk = firstStepTowards(s, live.regionId, nationId, (rid) => rid === atRisk);
      if (toRisk !== null) {
        s = moveArmy(s, live.id, toRisk);
        continue;
      }
    }

    // Otherwise reinforce the nearest threatened region, then stage at the front.
    const defend = defendStep(s, live, nationId);
    if (defend !== null) {
      s = moveArmy(s, live.id, defend);
      continue;
    }

    const step = advanceStep(s, live, nationId);
    if (step !== null) s = moveArmy(s, live.id, step);
  }
  return s;
}

/** Enemy (rival, at-war) armies standing in regions adjacent to `regionId`. */
function adjacentThreats(state: GameState, regionId: number, nationId: number): Army[] {
  const region = state.regions[regionId];
  if (!region) return [];
  const out: Army[] = [];
  for (const nb of region.adjacency) {
    for (const a of state.armies) {
      if (a.regionId !== nb) continue;
      if (a.ownerId === nationId || a.ownerId === null || a.ownerId === BARBARIAN_ID) continue;
      if (atWar(state, nationId, a.ownerId)) out.push(a);
    }
  }
  return out;
}

/** Whether an owned region has a mobile enemy stack poised on its border. */
export function regionIsThreatened(state: GameState, regionId: number, nationId: number): boolean {
  const r = state.regions[regionId];
  if (!r || r.ownerId !== nationId) return false;
  return adjacentThreats(state, regionId, nationId).length > 0;
}

/**
 * The nation's owned region most in danger of seceding — in full revolt, with no
 * friendly garrison to hold it, and within a couple of turns of breaking away —
 * or null. Prefers the region closest to seceding, then the most populous (worth
 * saving most). Lets the AI march a spare army in to suppress the revolt.
 */
export function secessionRiskRegion(state: GameState, nationId: number): number | null {
  const imminent = Math.max(1, SECESSION_REVOLT_TURNS - 2);
  let best: { id: number; turns: number; pop: number } | null = null;
  for (const r of state.regions) {
    if (r.ownerId !== nationId || r.unrest < UNREST_REVOLT) continue;
    if ((r.revoltTurns ?? 0) < imminent) continue;
    const garrisoned = state.armies.some(
      (a) => a.regionId === r.id && a.ownerId === nationId && armySize(a.units) > 0,
    );
    if (garrisoned) continue;
    const turns = r.revoltTurns ?? 0;
    if (!best || turns > best.turns || (turns === best.turns && r.population > best.pop)) {
      best = { id: r.id, turns, pop: r.population };
    }
  }
  return best ? best.id : null;
}

/** Our defensive strength for `units` standing in `regionId` against `enemy`. */
function defenseAt(
  state: GameState,
  units: UnitCounts,
  regionId: number,
  enemy: UnitCounts,
): number {
  const r = state.regions[regionId];
  if (!r) return 0;
  const fortMult = 1 + r.fortification * FORT_PER_LEVEL;
  return sideStrength(units, enemy, "defense") * TERRAIN[r.terrain].defense * fortMult;
}

/** How hard the strongest bordering enemy would hit an army where it stands. */
function incomingPressure(state: GameState, army: Army, nationId: number): number {
  let worst = 0;
  for (const threat of adjacentThreats(state, army.regionId, nationId)) {
    const atk = sideStrength(threat.units, army.units, "attack");
    if (atk > worst) worst = atk;
  }
  return worst;
}

/** An army is badly outmatched if a bordering enemy clearly beats its defence. */
export function isBadlyOutmatched(state: GameState, army: Army, nationId: number): boolean {
  const pressure = incomingPressure(state, army, nationId);
  if (pressure <= 0) return false;
  const threats = adjacentThreats(state, army.regionId, nationId);
  const enemyUnits = strongestOf(threats);
  const def = defenseAt(state, army.units, army.regionId, enemyUnits);
  return pressure > def * RETREAT_RATIO;
}

/** The units of the strongest (by size) army in a list, for counter maths. */
function strongestOf(armies: Army[]): UnitCounts {
  let best: UnitCounts = emptyUnits();
  let bestSize = -1;
  for (const a of armies) {
    const size = armySize(a.units);
    if (size > bestSize) {
      bestSize = size;
      best = a.units;
    }
  }
  return best;
}

/**
 * The adjacent owned region that is safest to retreat into — the one facing the
 * least incoming enemy pressure, and strictly safer than staying put. Null if no
 * owned neighbour is any safer (then the army holds and fights where it is).
 */
export function retreatStep(state: GameState, army: Army, nationId: number): number | null {
  const here = state.regions[army.regionId];
  if (!here) return null;
  const hereThreat = adjacentThreats(state, army.regionId, nationId).reduce(
    (m, a) => Math.max(m, sideStrength(a.units, army.units, "attack")),
    0,
  );
  let best: number | null = null;
  let bestThreat = hereThreat;
  for (const nb of here.adjacency) {
    const r = state.regions[nb];
    if (!r || r.ownerId !== nationId) continue; // retreat only into our own land
    // Pressure the army would face there next turn.
    let threat = 0;
    for (const a of state.armies) {
      const ar = state.regions[a.regionId];
      if (!ar || a.ownerId === nationId || a.ownerId === null || a.ownerId === BARBARIAN_ID) continue;
      if (!atWar(state, nationId, a.ownerId)) continue;
      if (ar.adjacency.includes(nb)) threat = Math.max(threat, sideStrength(a.units, army.units, "attack"));
    }
    if (threat < bestThreat) {
      bestThreat = threat;
      best = nb;
    }
  }
  return best;
}

/**
 * Breadth-first march through *own land only*: the first step (an owned
 * neighbour) along the shortest owned path from `start` to the nearest region
 * satisfying `isGoal`. Null if `start` already satisfies `isGoal` or no owned
 * path reaches one. Shared by the defend / advance / muster routers so they
 * never blunder a march through hostile territory.
 */
function firstStepTowards(
  state: GameState,
  start: number,
  nationId: number,
  isGoal: (regionId: number) => boolean,
): number | null {
  if (isGoal(start)) return null;
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
      if (isGoal(nb)) return step;
      queue.push({ node: nb, first: step });
    }
  }
  return null;
}

/**
 * First step (an owned neighbour) along the shortest own-land path toward the
 * nearest threatened owned region — reinforcing where enemies are massing.
 * Null if the army is already at the threatened region or none is reachable.
 */
export function defendStep(state: GameState, army: Army, nationId: number): number | null {
  return firstStepTowards(state, army.regionId, nationId, (rid) =>
    regionIsThreatened(state, rid, nationId),
  );
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
  const isFrontier = (rid: number): boolean => {
    const r = state.regions[rid];
    return (
      !!r && r.ownerId === nationId && r.adjacency.some((n) => isAttackable(state, n, nationId))
    );
  };
  return firstStepTowards(state, army.regionId, nationId, isFrontier);
}

// --- concentration of force -------------------------------------------------

/**
 * Whether some single owned army adjacent to `targetId` can already win there on
 * its own (mirrors `bestTarget`'s winnable test). If so, the target needs no
 * massing — normal attack handling takes it.
 */
function soloWinnable(state: GameState, targetId: number, nationId: number): boolean {
  const target = state.regions[targetId];
  if (!target) return false;
  const defender = state.armies.find((a) => a.regionId === targetId && a.ownerId !== nationId);
  for (const a of state.armies) {
    if (a.ownerId !== nationId) continue;
    const ar = state.regions[a.regionId];
    if (!ar || !ar.adjacency.includes(targetId)) continue;
    const atk = sideStrength(a.units, zeroUnits(), "attack");
    const def = defender
      ? sideStrength(defender.units, a.units, "defense") * 1.2 + target.fortification * 3
      : 0;
    if (atk > def * 1.1) return true;
  }
  return false;
}

/**
 * A high-value enemy region worth *massing* against: attackable, bordering our
 * land, and NOT already beatable by a single adjacent army (else normal attack
 * takes it). Prize weighting mirrors `bestTarget` (population, resource, an enemy
 * capital), scaled by archetype. Deterministic — highest score, ties by lowest
 * id. Null when nothing needs massing.
 */
export function focusTarget(state: GameState, nationId: number): number | null {
  const owned = state.regions.filter((r) => r.ownerId === nationId);
  const p = state.nations.find((n) => n.id === nationId)?.personality;
  const capW = CAPITAL_VALUE * (0.5 + (p?.aggression ?? 0.4));
  const resW = RESOURCE_VALUE * (0.5 + (p?.economy ?? 0.5));
  const candidates = new Set<number>();
  for (const r of owned) {
    for (const nb of r.adjacency) if (isAttackable(state, nb, nationId)) candidates.add(nb);
  }
  let best: number | null = null;
  let bestScore = -Infinity;
  for (const id of [...candidates].sort((a, b) => a - b)) {
    if (soloWinnable(state, id, nationId)) continue; // handled by ordinary attack
    const t = state.regions[id]!;
    const isEnemy = t.ownerId !== null && t.ownerId !== BARBARIAN_ID && atWar(state, nationId, t.ownerId);
    const isCapital =
      isEnemy && state.nations.some((n) => n.id === t.ownerId && n.capitalRegionId === id);
    const value =
      t.population * REGION_POP_VALUE + (t.resource ? resW : 0) + (isCapital ? capW : 0) + (isEnemy ? 5 : 2);
    if (value > bestScore) {
      bestScore = value;
      best = id;
    }
  }
  return best;
}

/**
 * The owned staging region (an "anvil") next to `focusId` where the nation should
 * gather its armies — the adjacent owned region already holding the most friendly
 * force, ties by lowest id. Null if no owned region borders the focus.
 */
export function musterRegion(state: GameState, nationId: number, focusId: number): number | null {
  const focus = state.regions[focusId];
  if (!focus) return null;
  let best: number | null = null;
  let bestForce = -1;
  for (const nb of [...focus.adjacency].sort((a, b) => a - b)) {
    const r = state.regions[nb];
    if (!r || r.ownerId !== nationId) continue;
    const force = state.armies
      .filter((a) => a.ownerId === nationId && a.regionId === nb)
      .reduce((s, a) => s + armySize(a.units), 0);
    if (force > bestForce) {
      bestForce = force;
      best = nb;
    }
  }
  return best;
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

  // Warlords keep a bigger standing army; everyone raises more in wartime; a
  // Martial realm (cheaper units) fields a larger host and leans on it.
  const wanted =
    3 + Math.round(aggression * 6) + (atWarNow ? 3 : 0) + (nation.trait === "martial" ? 3 : 0);
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
export function bestTarget(state: GameState, army: { id: number; regionId: number; units: Record<UnitType, number> }, nationId: number): number | null {
  const region = state.regions[army.regionId];
  if (!region) return null;
  const atk = sideStrength(army.units, zeroUnits(), "attack");

  // Archetype-weighted prizes: warlike nations covet enemy capitals (a
  // crippling strike at the rival's heartland), economic ones covet strategic
  // resources. Same scoring code, personality shifts what "valuable" means.
  const p = state.nations.find((n) => n.id === nationId)?.personality;
  const capitalValue = CAPITAL_VALUE * (0.5 + (p?.aggression ?? 0.4));
  const resourceValue = RESOURCE_VALUE * (0.5 + (p?.economy ?? 0.5));

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
      // Among winnable targets, prefer a bigger margin, an enemy nation over
      // neutral barbarians, and a *valuable* prize: population is economic
      // worth, a strategic resource unlocks units, an enemy CAPITAL is a
      // crippling strike — each weighted by this nation's archetype above.
      const isCapital =
        isEnemy &&
        state.nations.some((n) => n.id === target.ownerId && n.capitalRegionId === target.id);
      const value =
        target.population * REGION_POP_VALUE +
        (target.resource ? resourceValue : 0) +
        (isCapital ? capitalValue : 0);
      const score = atk - def + value + (isBarb ? 2 : 5);
      if (score > bestScore) {
        bestScore = score;
        best = nid;
      }
    }
  }
  return best;
}

/** How much a point of target population weighs in AI attack targeting. */
const REGION_POP_VALUE = 1.5;
/** Base weight for a target region holding a strategic resource (iron/horses). */
const RESOURCE_VALUE = 6;
/** Base weight for an enemy nation's capital (scaled by attacker aggression). */
const CAPITAL_VALUE = 10;

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
