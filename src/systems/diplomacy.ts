/**
 * Diplomacy — relations, treaties, and the diplomatic action set
 * (docs/game-design.md §3.5).
 *
 * Relations are a pairwise scalar in −100..+100 that drifts toward neutral and
 * shifts on actions (war, gifts, broken deals) and standing conditions (border
 * friction). Treaties are a pairwise status (war / peace / nap / alliance).
 * The action set is deliberately small but expressive: declare war, make peace,
 * non-aggression pact, alliance, gift, demand tribute.
 *
 * All functions are pure over `GameState`. AI accept/reject decisions are
 * deterministic functions of state (relations, relative power, personality), so
 * player-initiated proposals resolve immediately without a pending queue.
 */

import { UNITS, type UnitType } from "@/data/units";
import {
  BARBARIAN_ID,
  GIFT_RELATION,
  HOSTILE_THRESHOLD,
  RELATION_MAX,
  RELATION_MIN,
  RELATION_WAR_HIT,
  armySize,
  nationInstability,
  pairKey,
  type GameState,
  type TreatyStatus,
} from "@/systems/state";

// --- relations & treaties ---------------------------------------------------

export function getRelation(state: GameState, a: number, b: number): number {
  return state.relations[pairKey(a, b)] ?? 0;
}

export function setRelation(state: GameState, a: number, b: number, value: number): GameState {
  const v = clamp(Math.round(value), RELATION_MIN, RELATION_MAX);
  return { ...state, relations: { ...state.relations, [pairKey(a, b)]: v } };
}

export function adjustRelation(state: GameState, a: number, b: number, delta: number): GameState {
  return setRelation(state, a, b, getRelation(state, a, b) + delta);
}

export function getTreaty(state: GameState, a: number, b: number): TreatyStatus {
  return state.treaties[pairKey(a, b)] ?? "peace";
}

export function setTreaty(state: GameState, a: number, b: number, status: TreatyStatus): GameState {
  return { ...state, treaties: { ...state.treaties, [pairKey(a, b)]: status } };
}

export function atWar(state: GameState, a: number, b: number): boolean {
  return getTreaty(state, a, b) === "war";
}

// --- power & geography ------------------------------------------------------

/** A crude power score: army strength + territory + treasury cushion. */
export function nationPower(state: GameState, id: number): number {
  let army = 0;
  for (const a of state.armies) {
    if (a.ownerId !== id) continue;
    for (const t of Object.keys(a.units) as UnitType[]) {
      army += a.units[t] * (UNITS[t].attack + UNITS[t].defense);
    }
  }
  const regions = state.regions.filter((r) => r.ownerId === id).length;
  const nation = state.nations.find((n) => n.id === id);
  const treasury = nation ? Math.max(0, nation.stocks.gold) / 40 : 0;
  return army + regions * 6 + treasury;
}

/**
 * How many living nations both `a` and `b` are at war with — their common
 * enemies. `pool` defaults to all living non-barbarian nations.
 */
export function sharedEnemies(
  state: GameState,
  a: number,
  b: number,
  pool?: Array<{ id: number; isBarbarian: boolean; alive: boolean }>,
): number {
  const nations = pool ?? state.nations.filter((n) => !n.isBarbarian && n.alive);
  let count = 0;
  for (const c of nations) {
    if (c.isBarbarian || !c.alive || c.id === a || c.id === b) continue;
    if (atWar(state, a, c.id) && atWar(state, b, c.id)) count++;
  }
  return count;
}

/** Number of adjacent region pairs bordering nations a and b. */
export function sharedBorders(state: GameState, a: number, b: number): number {
  let count = 0;
  for (const r of state.regions) {
    if (r.ownerId !== a) continue;
    for (const n of r.adjacency) {
      if (state.regions[n]?.ownerId === b) count++;
    }
  }
  return count;
}

// --- actions ----------------------------------------------------------------

export function declareWar(state: GameState, a: number, b: number): GameState {
  let next = setTreaty(state, a, b, "war");
  next = adjustRelation(next, a, b, -RELATION_WAR_HIT);
  return { ...next, log: [...next.log, `${name(next, a)} declared war on ${name(next, b)}!`].slice(-50) };
}

export function makePeace(state: GameState, a: number, b: number): GameState {
  let next = setTreaty(state, a, b, "peace");
  next = adjustRelation(next, a, b, +10);
  return { ...next, log: [...next.log, `${name(next, a)} and ${name(next, b)} made peace.`].slice(-50) };
}

export function setPact(
  state: GameState,
  a: number,
  b: number,
  status: "nap" | "alliance",
): GameState {
  let next = setTreaty(state, a, b, status);
  next = adjustRelation(next, a, b, status === "alliance" ? +20 : +10);
  const label = status === "alliance" ? "an alliance" : "a non-aggression pact";
  return { ...next, log: [...next.log, `${name(next, a)} and ${name(next, b)} signed ${label}.`].slice(-50) };
}

/** Transfer gold as a gift, improving relations. */
export function gift(state: GameState, from: number, to: number, gold: number): GameState {
  const sender = state.nations.find((n) => n.id === from);
  if (!sender || sender.stocks.gold < gold || gold <= 0) return state;
  const nations = state.nations.map((n) => {
    if (n.id === from) return { ...n, stocks: { ...n.stocks, gold: round1(n.stocks.gold - gold) } };
    if (n.id === to) return { ...n, stocks: { ...n.stocks, gold: round1(n.stocks.gold + gold) } };
    return n;
  });
  let next: GameState = { ...state, nations };
  const bump = Math.min(25, Math.round(gold * GIFT_RELATION));
  next = adjustRelation(next, from, to, bump);
  return { ...next, log: [...next.log, `${name(next, from)} gifted ${gold}g to ${name(next, to)}.`].slice(-50) };
}

/**
 * Whether nation `target` would accept a proposal from `proposer`. Deterministic
 * from relations, relative power and (for the AI) personality.
 */
export function wouldAccept(
  state: GameState,
  proposer: number,
  target: number,
  type: "peace" | "nap" | "alliance" | "tribute",
): boolean {
  const targetNation = state.nations.find((n) => n.id === target);
  if (!targetNation) return false;
  // The player always decides for themselves via the UI; this is for AI targets.
  if (targetNation.isPlayer || targetNation.isBarbarian) return false;

  const rel = getRelation(state, proposer, target);
  const powerRatio = nationPower(state, proposer) / (nationPower(state, target) || 1);
  const p = targetNation.personality;
  const trust = p?.trustworthiness ?? 0.5;
  const aggression = p?.aggression ?? 0.5;

  switch (type) {
    case "peace":
      // Accept peace when relations aren't terrible or when outmatched.
      return rel > -60 || powerRatio > 1.3 || aggression < 0.4;
    case "nap":
      return rel > -10 - trust * 30;
    case "alliance":
      return rel > 45 - trust * 20 && powerRatio > 0.7;
    case "tribute":
      // Pay tribute only when clearly weaker and not too proud.
      return powerRatio > 1.6 && aggression < 0.7;
  }
}

/** Total gold upkeep-scaled strength lost/needed — helper for AI (re-exported). */
export function armyStrengthOf(units: Record<UnitType, number>): number {
  let s = 0;
  for (const t of Object.keys(units) as UnitType[]) s += units[t] * (UNITS[t].attack + UNITS[t].defense);
  return s;
}

// --- offers (AI → player, awaiting the player's decision) -------------------

export function addOffer(
  state: GameState,
  from: number,
  to: number,
  type: "peace" | "nap" | "alliance" | "tribute",
  gold?: number,
): GameState {
  // Avoid duplicate pending offers of the same kind.
  if (state.offers.some((o) => o.from === from && o.to === to && o.type === type)) return state;
  const offer = { id: state.nextOfferId, from, to, type, gold };
  return { ...state, offers: [...state.offers, offer], nextOfferId: state.nextOfferId + 1 };
}

/** The player accepts an offer, applying its effect. */
export function acceptOffer(state: GameState, offerId: number): GameState {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return state;
  let next = removeOffer(state, offerId);
  switch (offer.type) {
    case "peace":
      next = makePeace(next, offer.from, offer.to);
      break;
    case "nap":
      next = setPact(next, offer.from, offer.to, "nap");
      break;
    case "alliance":
      next = setPact(next, offer.from, offer.to, "alliance");
      break;
    case "tribute":
      // The player pays the demanding nation to avoid conflict.
      next = gift(next, offer.to, offer.from, offer.gold ?? 0);
      break;
  }
  return next;
}

export function rejectOffer(state: GameState, offerId: number): GameState {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return state;
  let next = removeOffer(state, offerId);
  // Refusing a tribute demand sours relations.
  if (offer.type === "tribute") next = adjustRelation(next, offer.from, offer.to, -10);
  return next;
}

function removeOffer(state: GameState, offerId: number): GameState {
  return { ...state, offers: state.offers.filter((o) => o.id !== offerId) };
}

/**
 * Player-initiated proposal to an AI nation, resolved immediately by
 * `wouldAccept`. Returns the new state; logs acceptance or refusal.
 */
export function playerPropose(
  state: GameState,
  target: number,
  type: "peace" | "nap" | "alliance",
): GameState {
  const proposer = state.nations.find((n) => n.isPlayer)!.id;
  if (wouldAccept(state, proposer, target, type)) {
    if (type === "peace") return makePeace(state, proposer, target);
    return setPact(state, proposer, target, type);
  }
  return { ...state, log: [...state.log, `${name(state, target)} refused your ${type}.`].slice(-50) };
}

/** Gold a player tribute demand asks for (mirrors the fixed gift size). */
export const TRIBUTE_DEMAND = 30;

/**
 * The player demands tribute of a rival. It yields only when clearly weaker and
 * not too proud (`wouldAccept(..., "tribute")`, i.e. the player out-powers it
 * ≥1.6× and its aggression is modest); otherwise it scorns the threat. Either
 * way, being cowed or affronted sours relations. Pure — no immediate transfer
 * improves standing (unlike a gift).
 */
export function playerDemandTribute(state: GameState, target: number, gold = TRIBUTE_DEMAND): GameState {
  const player = state.nations.find((n) => n.isPlayer)!.id;
  const tn = state.nations.find((n) => n.id === target);
  if (tn && wouldAccept(state, player, target, "tribute")) {
    const pay = Math.min(gold, Math.max(0, Math.round(tn.stocks.gold)));
    const nations = state.nations.map((n) => {
      if (n.id === target) return { ...n, stocks: { ...n.stocks, gold: round1(n.stocks.gold - pay) } };
      if (n.id === player) return { ...n, stocks: { ...n.stocks, gold: round1(n.stocks.gold + pay) } };
      return n;
    });
    let next: GameState = { ...state, nations };
    next = adjustRelation(next, player, target, -6); // paid, but resentful
    return { ...next, log: [...next.log, `${name(next, target)} yields ${pay}g to your demand.`].slice(-50) };
  }
  const refused = adjustRelation(state, player, target, -6); // affronted by the threat
  return { ...refused, log: [...refused.log, `${name(refused, target)} scorns your demand for tribute.`].slice(-50) };
}

// --- call to arms (allies join your wars) -----------------------------------

/**
 * Whether AI nation `ally` would answer `requester`'s call to arms against
 * `enemy`. Deterministic and pure — an ally joins only when it is a committed
 * friend (alliance), the war is real, joining is not self-defeating, and it is
 * strong enough not to be signing its own death warrant.
 */
/**
 * The enemies `requester` is at war with that `ally` is not already fighting —
 * i.e. the wars an ally could be called into. Excludes the player, barbarians,
 * dead nations, and the two parties themselves. Pure; used to offer one
 * "call to arms" per open front in the UI.
 */
export function warTargetsFor(
  state: GameState,
  requester: number,
  ally: number,
): number[] {
  const out: number[] = [];
  for (const n of state.nations) {
    if (n.isBarbarian || !n.alive || n.id === requester || n.id === ally) continue;
    if (atWar(state, requester, n.id) && !atWar(state, ally, n.id)) out.push(n.id);
  }
  return out;
}

export function wouldJoinWar(
  state: GameState,
  ally: number,
  requester: number,
  enemy: number,
): boolean {
  const allyNation = state.nations.find((n) => n.id === ally);
  // Only AI nations answer a call to arms — not the player, not barbarians.
  if (!allyNation || allyNation.isPlayer || allyNation.isBarbarian) return false;
  // Must be a formal ally of the requester.
  if (getTreaty(state, requester, ally) !== "alliance") return false;
  // The requester must actually be at war with the enemy.
  if (!atWar(state, requester, enemy)) return false;
  // The ally can't be the enemy, and won't double-declare an existing war.
  if (ally === enemy || atWar(state, ally, enemy)) return false;
  // Relations must be decent.
  if (getRelation(state, requester, ally) < 20) return false;
  // The ally won't suicide against an overwhelmingly stronger foe — but a foe
  // that is *reeling* (famine / bankruptcy / a province in open revolt) is
  // distracted and easier to pile onto, so the ally will answer the call at
  // worse odds against one. This mirrors the AI's own opportunist war logic
  // (`ai.ts` `doDiplomacy`), which likewise lowers its bar against a reeling
  // target — an ally is most useful exactly when finishing off a crumbling foe.
  const powerFloor = nationInstability(state, enemy).reeling ? 0.25 : 0.4;
  if (nationPower(state, ally) < powerFloor * nationPower(state, enemy)) return false;
  return true;
}

/**
 * `requester` calls their ally to war against `enemy`. If the ally would join,
 * it declares war and a call-to-arms line is logged on top of declareWar's own
 * line; otherwise the ally declines and only a log line is appended. Pure.
 */
export function callToArms(
  state: GameState,
  requester: number,
  ally: number,
  enemy: number,
): GameState {
  if (wouldJoinWar(state, ally, requester, enemy)) {
    const next = declareWar(state, ally, enemy);
    const line = `${name(next, ally)} answered ${name(next, requester)}'s call to arms against ${name(next, enemy)}!`;
    return { ...next, log: [...next.log, line].slice(-50) };
  }
  const line = `${name(state, ally)} declined the call to arms.`;
  return { ...state, log: [...state.log, line].slice(-50) };
}

// --- per-turn relations drift ----------------------------------------------

/**
 * Nudge all relations toward neutral, then apply standing pressures: border
 * friction cools relations, alliances warm them. War keeps relations low.
 */
export function driftRelations(state: GameState): GameState {
  const players = state.nations.filter((n) => !n.isBarbarian && n.alive);
  let relations = { ...state.relations };
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]!.id;
      const b = players[j]!.id;
      const key = pairKey(a, b);
      let rel = relations[key] ?? 0;
      const treaty = getTreaty(state, a, b);

      // Drift toward neutral.
      if (rel > 0) rel -= 1;
      else if (rel < 0) rel += 1;

      // Standing pressures.
      const borders = sharedBorders(state, a, b);
      rel -= borders * 0.5;
      if (treaty === "alliance") rel += 2;

      // Shared-enemy warmth: co-belligerents (both at war with the same third
      // power) draw closer, so coalitions against a common foe hold together
      // instead of eroding under border friction.
      rel += 2 * sharedEnemies(state, a, b, players);

      if (treaty === "war") rel = Math.min(rel, HOSTILE_THRESHOLD);

      relations[key] = clamp(Math.round(rel), RELATION_MIN, RELATION_MAX);
    }
  }
  return { ...state, relations };
}

// --- helpers ----------------------------------------------------------------

function name(state: GameState, id: number): string {
  if (id === BARBARIAN_ID) return "Free Peoples";
  return state.nations.find((n) => n.id === id)?.name ?? `Nation ${id}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Re-export for callers that need army size without importing state. */
export { armySize };
