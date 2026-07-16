/**
 * Alerts — a concise, prioritised list of the critical, player-relevant events
 * from the last turn, for a compact HUD banner. It folds the {@link TurnSummary}
 * diff together with the live {@link GameState} (to catch ongoing revolts that a
 * one-turn diff would miss) into at most a handful of entries, ordered
 * danger → warn → good so the scariest thing is always first.
 *
 * Each alert carries a headline `text` and an optional `hint` — a second line
 * that says *what it means or what to do about it*, so the strip teaches rather
 * than just announces (docs/game-design.md §8 M6).
 *
 * Pure and read-only: no DOM, no RNG, no mutation. The UI renders whatever it
 * returns.
 */

import { TECHS } from "@/data/techs";
import { PLAYER_ID, UNREST_REVOLT, type GameState, type DiplomaticOffer } from "@/systems/state";
import { victoryProgress, victoryThreatText, victoryCounterPlay } from "@/systems/victory";
import { tradeIncome } from "@/systems/diplomacy";
import type { TurnSummary } from "@/systems/summary";

export interface Alert {
  severity: "danger" | "warn" | "good";
  text: string;
  /** Optional secondary line: what the alert means, or what to do about it. */
  hint?: string;
}

/** Most alerts we ever show at once; excess (lowest priority) is dropped. */
const MAX_ALERTS = 6;
/** A rival at or above this share of its nearest win raises the loudest alarm. */
const LEADER_ALARM = 0.75;

/** A rival's display name (or a graceful fallback). */
function nationName(state: GameState, id: number): string {
  return state.nations.find((n) => n.id === id)?.name ?? "A rival";
}

/** A short, self-explaining line for an offer the player has been sent. */
function describeOffer(state: GameState, offer: DiplomaticOffer): string {
  const from = nationName(state, offer.from);
  switch (offer.type) {
    case "trade": {
      const inc = tradeIncome(state, offer.from, offer.to);
      return `${from} proposes a trade route (+${inc}g each per turn)`;
    }
    case "peace":
      return offer.gold
        ? `${from} sues for peace, offering ${offer.gold}g`
        : `${from} sues for peace`;
    case "nap":
      return `${from} proposes a non-aggression pact`;
    case "alliance":
      return `${from} proposes an alliance`;
    case "tribute":
      return `${from} demands ${offer.gold ?? 0}g in tribute`;
  }
}

/**
 * Derive the player's critical alerts for the current state and (optional) last
 * turn summary. When `summary` is null (e.g. turn 1, before any turn resolved)
 * only the state-derived alerts — active revolts, standing threats, pending
 * offers — are surfaced.
 */
export function deriveAlerts(state: GameState, summary: TurnSummary | null): Alert[] {
  const danger: Alert[] = [];
  const warn: Alert[] = [];
  const good: Alert[] = [];

  // Loudest of all: a rival on the brink of winning. State-derived, so it stands
  // every turn the threat persists — you should never lose without warning. The
  // hint spells out the concrete numbers and the counter-play, so "nears a
  // victory" is understandable, not cryptic (issue: victory progress legibility).
  for (const n of state.nations) {
    if (n.isBarbarian || n.isPlayer || !n.alive) continue;
    const vp = victoryProgress(state, n.id);
    if (vp.fraction >= LEADER_ALARM) {
      danger.push({
        severity: "danger",
        text: `${n.name} nears a ${vp.kind} victory (${Math.round(vp.fraction * 100)}%)`,
        hint: `${victoryThreatText(vp, n.name)} ${victoryCounterPlay(vp)}`,
      });
    }
  }

  if (summary) {
    for (const name of summary.regionsLost)
      danger.push({ severity: "danger", text: `Lost ${name}`, hint: "Muster an army to retake it, or shore up the front." });
    for (const name of summary.warsDeclared)
      danger.push({
        severity: "danger",
        text: `Now at war with ${name}`,
        hint: "Defend your borders; sue for peace or find allies in the Diplomacy panel.",
      });
    if (summary.famine)
      danger.push({
        severity: "danger",
        text: "Famine — population starving",
        hint: "Raise food output or cut taxes; hungry regions shed population and grow restless.",
      });
    if (summary.bankrupt)
      danger.push({
        severity: "danger",
        text: "Bankruptcy — troops disbanded",
        hint: "Income is below upkeep — raise taxes, or disband costly armies to balance the books.",
      });
  }

  // Active revolts come straight from state, so they surface even with no summary.
  for (const region of state.regions) {
    if (region.ownerId === PLAYER_ID && region.unrest >= UNREST_REVOLT) {
      warn.push({
        severity: "warn",
        text: `Revolt in ${region.name}`,
        hint: "Station an army here or cut taxes before it secedes to rebels.",
      });
    }
  }

  // Pending offers addressed to the player — so an incoming proposal is noticed,
  // not silently parked in the Diplomacy panel (issue: "X offers trade — I don't
  // see it"). A tribute demand is a threat (warn); the rest are opportunities.
  for (const offer of state.offers) {
    if (offer.to !== PLAYER_ID) continue;
    if (offer.type === "tribute") {
      warn.push({
        severity: "warn",
        text: describeOffer(state, offer),
        hint: "Pay in the Diplomacy panel, or refuse and risk their wrath.",
      });
    } else {
      good.push({
        severity: "good",
        text: describeOffer(state, offer),
        hint: "Review and accept or decline it in the Diplomacy panel.",
      });
    }
  }

  // Your own march on victory — a positive cue so you can read your progress and
  // press the advantage (worded to avoid the rival "nears a" phrasing).
  const pvp = victoryProgress(state, PLAYER_ID);
  if (pvp.fraction >= LEADER_ALARM) {
    good.push({
      severity: "good",
      text: `Victory within reach — ${pvp.kind}`,
      hint: victoryThreatText(pvp, "You"),
    });
  }

  if (summary) {
    for (const name of summary.regionsGained) good.push({ severity: "good", text: `Captured ${name}` });
    for (const name of summary.eliminated) good.push({ severity: "good", text: `${name} eliminated` });
    for (const id of summary.techsCompleted)
      good.push({ severity: "good", text: `Researched ${TECHS[id].name}` });
  }

  return [...danger, ...warn, ...good].slice(0, MAX_ALERTS);
}
