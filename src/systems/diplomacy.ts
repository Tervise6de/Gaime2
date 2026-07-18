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
import { recordChronicle, chronicleName } from "@/systems/chronicle";
import {
  BARBARIAN_ID,
  GIFT_RELATION,
  HOSTILE_THRESHOLD,
  RELATION_MAX,
  RELATION_MIN,
  RELATION_WAR_HIT,
  TRADE_INCOME_BASE,
  TRADE_INCOME_MAX,
  TRADE_INCOME_PER_REGION,
  armySize,
  nationInstability,
  pairKey,
  type GameState,
  type OpinionEvent,
  type TreatyStatus,
} from "@/systems/state";

// --- relations & treaties ---------------------------------------------------

export function getRelation(state: GameState, a: number, b: number): number {
  return state.relations[pairKey(a, b)] ?? 0;
}

export function setRelation(state: GameState, a: number, b: number, value: number): GameState {
  // `|| 0` normalises a rounded -0 (Math.round of a small negative) back to +0,
  // so the scalar round-trips through JSON identically — JSON has no signed zero.
  const v = clamp(Math.round(value), RELATION_MIN, RELATION_MAX) || 0;
  return { ...state, relations: { ...state.relations, [pairKey(a, b)]: v } };
}

export function adjustRelation(state: GameState, a: number, b: number, delta: number): GameState {
  return setRelation(state, a, b, getRelation(state, a, b) + delta);
}

// --- opinion log: the dated "why" behind relations --------------------------

/** Labels for logged dealings (keyed by OpinionEvent.reason; the pair key is
    order-independent, so phrasings stay direction-neutral). */
export const OPINION_LABEL: Record<string, string> = {
  war: "The war between us",
  peace: "We made peace",
  nap: "Non-aggression pact",
  alliance: "Our alliance",
  gift: "Gifts given",
  trade: "Our trade route",
  aggression: "Your wars of aggression",
  betrayal: "You broke your word to me",
  broken_word: "Their broken pacts",
};

/**
 * Adjust a pair's relations AND log the dated reason, so the change is legible
 * later. Same numeric effect on the scalar as `adjustRelation` (what the AI
 * acts on); the log is explanatory. Events merge by reason — repeat dealings
 * accumulate into one decaying entry — so the list stays short.
 */
export function recordOpinion(state: GameState, a: number, b: number, delta: number, reason: string): GameState {
  const next = adjustRelation(state, a, b, delta);
  if (delta === 0) return next;
  const key = pairKey(a, b);
  const list = (next.opinions?.[key] ?? []).map((e) => ({ ...e }));
  const existing = list.find((e) => e.reason === reason);
  if (existing) {
    existing.delta = clamp(existing.delta + delta, RELATION_MIN, RELATION_MAX);
    existing.turn = next.turn;
  } else {
    list.push({ reason, delta, turn: next.turn });
  }
  const pruned = list.filter((e) => e.delta !== 0);
  return { ...next, opinions: { ...(next.opinions ?? {}), [key]: pruned } };
}

/**
 * Decay the opinion log toward zero each turn (grudges and goodwill fade), so
 * only live dealings show; spent entries are pruned. Mirrors the relations
 * scalar's drift. Pure.
 */
export function decayOpinions(state: GameState): GameState {
  if (!state.opinions) return state;
  const opinions: Record<string, OpinionEvent[]> = {};
  for (const [key, list] of Object.entries(state.opinions)) {
    const decayed = list
      .map((e) => ({ ...e, delta: e.delta > 0 ? e.delta - 1 : e.delta + 1 }))
      .filter((e) => e.delta !== 0);
    if (decayed.length) opinions[key] = decayed;
  }
  return { ...state, opinions };
}

/** One line of an opinion breakdown: a dated dealing, or an ongoing pull. */
export interface OpinionReason {
  label: string;
  delta: number;
  kind: "event" | "standing";
  /** Turn the dealing last happened (events only). */
  turn?: number;
  /**
   * A standing entry whose `delta` is a settled *level* the relation is held at,
   * not a per-turn rate (e.g. kept-the-peace goodwill). The UI omits the "/turn"
   * suffix for these. Undefined = a per-turn pull, like border friction.
   */
  level?: boolean;
}

/**
 * Why `to` feels about `from` as it does: the recent dated dealings (from the
 * log) plus the ongoing standing forces (border friction, shared enemies, an
 * alliance) — the same pulls `driftRelations` applies. Pure; for the UI.
 */
export function opinionReasons(state: GameState, from: number, to: number): OpinionReason[] {
  const out: OpinionReason[] = [];
  for (const e of state.opinions?.[pairKey(from, to)] ?? []) {
    out.push({ label: OPINION_LABEL[e.reason] ?? e.reason, delta: e.delta, kind: "event", turn: e.turn });
  }
  const borders = sharedBorders(state, from, to);
  if (borders > 0) out.push({ label: "Bordering my lands", delta: -Math.max(1, Math.round(borders * 0.5)), kind: "standing" });
  const shared = sharedEnemies(state, from, to);
  if (shared > 0) out.push({ label: "We share an enemy", delta: 2 * shared, kind: "standing" });
  if (getTreaty(state, from, to) === "alliance") out.push({ label: "Our alliance holds", delta: 2, kind: "standing" });
  const peace = keptPeaceGoodwill(state, from, to);
  if (peace > 0) {
    out.push({ label: `Kept the peace (${keptPeaceTurns(state, from, to)} turns)`, delta: peace, kind: "standing", level: true });
  }
  return out;
}

/** A nation's standing with every other living realm — for the rival-to-rival view. */
export function foreignRelations(
  state: GameState,
  id: number,
): { wars: number[]; allies: number[]; naps: number[] } {
  const wars: number[] = [];
  const allies: number[] = [];
  const naps: number[] = [];
  for (const n of state.nations) {
    if (n.isBarbarian || !n.alive || n.id === id) continue;
    const t = getTreaty(state, id, n.id);
    if (t === "war") wars.push(n.id);
    else if (t === "alliance") allies.push(n.id);
    else if (t === "nap") naps.push(n.id);
  }
  return { wars, allies, naps };
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

// --- casus belli: how justified a war is ------------------------------------

export type CasusBelli = "ally_call" | "reclaim" | "border" | "none";

export interface CasusBelliInfo {
  id: CasusBelli;
  label: string;
  /** A justified war draws no third-party censure. */
  justified: boolean;
  /** Standing lost with every *other* realm when war is declared on this pretext. */
  thirdPartyPenalty: number;
}

export const CASUS_BELLI: Record<CasusBelli, CasusBelliInfo> = {
  ally_call: { id: "ally_call", label: "Answering an ally's war", justified: true, thirdPartyPenalty: 0 },
  reclaim: { id: "reclaim", label: "Reclaiming lost land", justified: true, thirdPartyPenalty: 0 },
  border: { id: "border", label: "A border dispute", justified: false, thirdPartyPenalty: 3 },
  none: { id: "none", label: "Naked aggression", justified: false, thirdPartyPenalty: 7 },
};

/**
 * The strongest war justification `a` holds against `b` right now: answering an
 * ally already at war with b, reclaiming land b took from a, a standing border
 * dispute, or — failing all — naked aggression. Pure.
 */
export function casusBelli(state: GameState, a: number, b: number): CasusBelli {
  const allies = state.nations.filter(
    (n) => !n.isBarbarian && n.alive && n.id !== a && getTreaty(state, a, n.id) === "alliance",
  );
  if (allies.some((ally) => atWar(state, ally.id, b))) return "ally_call";
  if (state.regions.some((r) => r.ownerId === b && r.priorOwnerId === a)) return "reclaim";
  if (sharedBorders(state, a, b) > 0) return "border";
  return "none";
}

// --- treaty-breaking: the price of a broken word (C4) -----------------------

/**
 * What it costs to break a given pact by declaring war on the partner. A NAP is
 * a promise; an alliance is a bond — so betraying an alliance wounds the
 * betrayed party more (`bilateral`, on top of the ordinary war hit) and brands
 * the oath-breaker harder with *every other* court (`thirdParty`, the reputation
 * cost that makes coalitions form against a serial betrayer). See `declareWar`.
 */
export const TREATY_BREAK: Record<"nap" | "alliance", { bilateral: number; thirdParty: number }> = {
  nap: { bilateral: 15, thirdParty: 10 },
  alliance: { bilateral: 30, thirdParty: 18 },
};

/**
 * Whether AI nation `aggressor` would break its standing pact with `target` to
 * strike now. With no pact in place it is always free to attack. Breaking one is
 * treachery, so only a realm whose word is *cheap* (low trustworthiness) does
 * it, and only for a genuinely tempting prize (a clear power edge, lower still
 * against a reeling target) — because the broken word is punished by every court
 * (`TREATY_BREAK.thirdParty`). Alliances are far more sacred than NAPs: betraying
 * one needs both lower trust and a bigger opportunity. Deterministic and pure;
 * the player is never auto-betrayed into anything (their pacts are their own to
 * break through the UI). Used by the rival AI's opportunistic-war logic.
 */
export function wouldBreakTreaty(state: GameState, aggressor: number, target: number): boolean {
  const treaty = getTreaty(state, aggressor, target);
  if (treaty !== "nap" && treaty !== "alliance") return true; // no word to keep
  const me = state.nations.find((n) => n.id === aggressor);
  if (!me || me.isPlayer || me.isBarbarian) return false;
  const trust = me.personality?.trustworthiness ?? 0.5;
  // Only the genuinely faithless break their word — the bottom tier of trust, and
  // an alliance is far more sacred than a NAP.
  const trustCeil = treaty === "alliance" ? 0.18 : 0.3;
  if (trust >= trustCeil) return false; // keeps its word
  const ratio = nationPower(state, aggressor) / (nationPower(state, target) || 1);
  // A *tempting* strike, not a routine one: either a foe caught reeling (famine,
  // revolt, bankruptcy — a real vulnerability window) with a solid edge, or an
  // overwhelming edge outright. Both bars sit high enough that treachery is an
  // occasional, memorable act rather than the everyday route to war.
  const reeling = nationInstability(state, target).reeling;
  const reelNeed = treaty === "alliance" ? 2.0 : 1.5;
  const bigNeed = treaty === "alliance" ? 3.0 : 2.2;
  return (reeling && ratio >= reelNeed) || ratio >= bigNeed;
}

// --- actions ----------------------------------------------------------------

/**
 * Declare war. Beyond the direct relation hit, war carries a reputation term
 * with every *other* realm:
 *  - **Treachery** — breaking a standing NAP or alliance (C4) — is the gravest:
 *    a steep extra wound to the betrayed party and a broad standing hit with all
 *    other courts (`TREATY_BREAK`), so oath-breakers become pariahs and
 *    coalitions gather against them. It supersedes any casus belli (you cannot
 *    "justify" stabbing a partner) — except honouring an ally's call, which is a
 *    deeper duty, not treachery.
 *  - Otherwise an *unjustified* war (naked aggression / a border pretext) draws
 *    the lighter casus-belli censure, while a justified war — ally's call,
 *    reclaiming lost land — draws none.
 * The casus belli is auto-detected unless passed.
 */
export function declareWar(state: GameState, a: number, b: number, cb?: CasusBelli): GameState {
  const reason = cb ?? casusBelli(state, a, b);
  const prevTreaty = getTreaty(state, a, b);
  // Breaking a pact is treachery — unless it is to answer an ally's call to a
  // war they are already in (a higher obligation, kept justified).
  const broke =
    (prevTreaty === "nap" || prevTreaty === "alliance") && reason !== "ally_call"
      ? prevTreaty
      : null;
  // A genuinely new war is a chronicle beat; re-affirming an active war is not.
  const newWar = prevTreaty !== "war";
  let next = setTreaty(state, a, b, "war");
  next = clearPeaceSince(next, a, b); // swords drawn — the peace clock stops
  next = recordOpinion(next, a, b, -RELATION_WAR_HIT, "war");
  next = severTrade(next, a, b); // war ends commerce
  if (broke) {
    const cost = TREATY_BREAK[broke];
    next = recordOpinion(next, a, b, -cost.bilateral, "betrayal");
    for (const c of next.nations) {
      if (c.isBarbarian || !c.alive || c.id === a || c.id === b) continue;
      next = recordOpinion(next, a, c.id, -cost.thirdParty, "broken_word");
    }
  } else {
    const penalty = CASUS_BELLI[reason].thirdPartyPenalty;
    if (penalty > 0) {
      for (const c of next.nations) {
        if (c.isBarbarian || !c.alive || c.id === a || c.id === b) continue;
        next = recordOpinion(next, a, c.id, -penalty, "aggression");
      }
    }
  }
  const suffix = broke
    ? `, breaking ${broke === "alliance" ? "their alliance" : "a non-aggression pact"}!`
    : CASUS_BELLI[reason].justified
      ? ` (${CASUS_BELLI[reason].label.toLowerCase()})!`
      : "!";
  next = { ...next, log: [...next.log, `${name(next, a)} declared war on ${name(next, b)}${suffix}`].slice(-50) };
  if (!newWar) return next;
  // Chronicle beat (E2): a betrayal and an honest war are different stories.
  if (broke) {
    return recordChronicle(
      next,
      "betrayal",
      `${chronicleName(next, a)} betrayed ${chronicleName(next, b)}, breaking ${broke === "alliance" ? "a sworn alliance" : "a pact of peace"}.`,
    );
  }
  const called = reason === "ally_call" ? " — answering the call" : "";
  return recordChronicle(
    next,
    "war",
    `${chronicleName(next, a)} declared war on ${chronicleName(next, b)}${called}.`,
  );
}

// --- trade routes (economic diplomacy) --------------------------------------

/** Whether an active trade route runs between `a` and `b`. */
export function hasTrade(state: GameState, a: number, b: number): boolean {
  return state.trades?.[pairKey(a, b)] === true;
}

/** Gold each partner earns per turn from a trade route between `a` and `b`. Pure. */
export function tradeIncome(state: GameState, a: number, b: number): number {
  const count = (id: number) => state.regions.filter((r) => r.ownerId === id).length;
  const smaller = Math.min(count(a), count(b));
  return Math.min(TRADE_INCOME_MAX, TRADE_INCOME_BASE + TRADE_INCOME_PER_REGION * smaller);
}

/** The living, non-barbarian nations `id` currently trades with. */
export function tradePartners(state: GameState, id: number): number[] {
  return state.nations
    .filter((n) => !n.isBarbarian && n.alive && n.id !== id && hasTrade(state, id, n.id))
    .map((n) => n.id);
}

/** Open a trade route between `a` and `b` (a small goodwill bump), logging it. */
export function establishTrade(state: GameState, a: number, b: number): GameState {
  if (hasTrade(state, a, b)) return state;
  let next: GameState = { ...state, trades: { ...(state.trades ?? {}), [pairKey(a, b)]: true } };
  next = recordOpinion(next, a, b, +8, "trade");
  return { ...next, log: [...next.log, `${name(next, a)} and ${name(next, b)} opened a trade route.`].slice(-50) };
}

/** Sever any trade route between `a` and `b` (on war). Silent — the war line covers it. */
export function severTrade(state: GameState, a: number, b: number): GameState {
  const key = pairKey(a, b);
  if (!state.trades?.[key]) return state;
  const trades = { ...state.trades };
  delete trades[key];
  return { ...state, trades };
}

export function makePeace(state: GameState, a: number, b: number): GameState {
  let next = setTreaty(state, a, b, "peace");
  next = setPeaceSince(next, a, b, next.turn); // a fresh peace clock starts now
  next = recordOpinion(next, a, b, +10, "peace");
  // Peace lifts the war grudge, so relations can recover instead of staying pinned.
  const key = pairKey(a, b);
  if (next.opinions?.[key]) {
    next = { ...next, opinions: { ...next.opinions, [key]: next.opinions[key]!.filter((e) => e.reason !== "war") } };
  }
  return { ...next, log: [...next.log, `${name(next, a)} and ${name(next, b)} made peace.`].slice(-50) };
}

export function setPact(
  state: GameState,
  a: number,
  b: number,
  status: "nap" | "alliance",
): GameState {
  let next = setTreaty(state, a, b, status);
  next = recordOpinion(next, a, b, status === "alliance" ? +20 : +10, status);
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
  next = recordOpinion(next, from, to, bump, "gift");
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
  type: "peace" | "nap" | "alliance" | "tribute" | "trade",
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
  const economy = p?.economy ?? 0.5;

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
    case "trade":
      // Trade is mutually profitable: accept unless relations are hostile, and
      // never with someone you're at war with. Economic realms are keener.
      return !atWar(state, proposer, target) && rel > -20 + (economy >= 0.6 ? -10 : 0);
  }
}

/**
 * Reparations a suing nation `from` offers `to` to sweeten a peace bid — only the
 * clearly-weaker party buys its way out, spending a slice of its treasury (bounded).
 * Pure and deterministic; returns 0 when it isn't worth offering.
 */
export function peaceReparations(state: GameState, from: number, to: number): number {
  const me = state.nations.find((n) => n.id === from);
  if (!me) return 0;
  const ratio = nationPower(state, from) / (nationPower(state, to) || 1);
  if (ratio >= 0.75) return 0; // even footing: no need to pay for peace
  const amount = Math.min(40, Math.floor(me.stocks.gold * 0.25));
  return amount >= 10 ? amount : 0; // too small to bother offering
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
  type: "peace" | "nap" | "alliance" | "tribute" | "trade",
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
      // Reparations: a suing nation may sweeten peace with gold. It pays what it
      // still has (it may have spent since offering), then the war ends.
      if (offer.gold && offer.gold > 0) {
        const payer = next.nations.find((n) => n.id === offer.from);
        const pay = Math.min(offer.gold, payer?.stocks.gold ?? 0);
        if (pay > 0) {
          next = {
            ...next,
            nations: next.nations.map((n) =>
              n.id === offer.from
                ? { ...n, stocks: { ...n.stocks, gold: round1(n.stocks.gold - pay) } }
                : n.id === offer.to
                  ? { ...n, stocks: { ...n.stocks, gold: round1(n.stocks.gold + pay) } }
                  : n,
            ),
          };
        }
      }
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
    case "trade":
      next = establishTrade(next, offer.from, offer.to);
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
  type: "peace" | "nap" | "alliance" | "trade",
): GameState {
  const proposer = state.nations.find((n) => n.isPlayer)!.id;
  if (wouldAccept(state, proposer, target, type)) {
    if (type === "peace") return makePeace(state, proposer, target);
    if (type === "trade") return establishTrade(state, proposer, target);
    return setPact(state, proposer, target, type);
  }
  const label = type === "trade" ? "trade offer" : type;
  return { ...state, log: [...state.log, `${name(state, target)} refused your ${label}.`].slice(-50) };
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

// --- kept-the-peace goodwill: enduring peace builds trust -------------------

/** Turns of unbroken peace per goodwill step, relation points per step, and the
    ceiling. +5 per 10 turns, capped at +25 — a long peace makes trusted
    neighbours, never vassals. */
export const PEACE_GOODWILL_PERIOD = 10;
export const PEACE_GOODWILL_PER_STEP = 5;
export const PEACE_GOODWILL_MAX = 25;
/**
 * How fast relations climb toward the goodwill floor each turn (points/turn).
 * Set above the combined drift-to-neutral (−1) and border friction of all but the
 * longest shared frontiers (up to ~6 shared edges, −3/turn) so a peaceful pair
 * actually *reaches* and *holds* at its floor rather than stalling below it. The
 * `min(floor, …)` cap means it never overshoots, so there is no runaway warmth.
 */
const PEACE_GOODWILL_CLIMB = 4;

/**
 * How many turns `a` and `b` have held an unbroken peace: `turn − peaceSince`,
 * defaulting to peace since the founding (turn 1) when unrecorded. Zero while at
 * war — swords drawn reset the clock. Pure.
 */
export function keptPeaceTurns(state: GameState, a: number, b: number): number {
  if (atWar(state, a, b)) return 0;
  const since = state.peaceSince?.[pairKey(a, b)] ?? 1;
  return Math.max(0, state.turn - since);
}

/**
 * The relation floor an enduring peace guarantees between `a` and `b`: +5 for
 * every full 10 turns of unbroken peace, capped at +25. Below this floor a long
 * peace slowly lifts relations toward it (`driftRelations`); it never pushes past
 * it, so peace warms cold neighbours to trust without manufacturing allies. Pure.
 */
export function keptPeaceGoodwill(state: GameState, a: number, b: number): number {
  const steps = Math.floor(keptPeaceTurns(state, a, b) / PEACE_GOODWILL_PERIOD);
  return Math.min(PEACE_GOODWILL_MAX, steps * PEACE_GOODWILL_PER_STEP);
}

/** Start a fresh peace clock for the pair (a war just ended). */
function setPeaceSince(state: GameState, a: number, b: number, turn: number): GameState {
  return { ...state, peaceSince: { ...(state.peaceSince ?? {}), [pairKey(a, b)]: turn } };
}

/** Stop the peace clock for the pair (war declared) — goodwill can't accrue at war. */
function clearPeaceSince(state: GameState, a: number, b: number): GameState {
  const key = pairKey(a, b);
  if (state.peaceSince?.[key] === undefined) return state;
  const peaceSince = { ...state.peaceSince };
  delete peaceSince[key];
  return { ...state, peaceSince };
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

      // Kept-the-peace goodwill: an unbroken peace slowly lifts relations toward
      // a warm floor (never past it) — neighbours who never draw swords come to
      // trust one another over the long run. It only *warms an already-amicable*
      // peace (rel ≥ 0); it never rescues a souring relationship, so border
      // friction can still drive committed rivals to war (the AI's war trigger is
      // deep hostility). A zero floor / war is a no-op.
      if (treaty !== "war" && rel >= 0) {
        const floor = keptPeaceGoodwill(state, a, b);
        if (floor > 0 && rel < floor) rel = Math.min(floor, rel + PEACE_GOODWILL_CLIMB);
      }

      if (treaty === "war") rel = Math.min(rel, HOSTILE_THRESHOLD);

      // `|| 0` keeps a rounded -0 from being stored (JSON has no signed zero).
      relations[key] = clamp(Math.round(rel), RELATION_MIN, RELATION_MAX) || 0;
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
