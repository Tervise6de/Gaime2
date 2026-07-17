/**
 * World ages — the game's sense of time. Purely presentational and derived
 * from the turn number alone (no state, no RNG), so the HUD can show a year
 * and an age without touching the sim. One turn = one year, opening in the
 * early-medieval world the petty kingdoms inhabit.
 *
 * Serialisable data + pure helpers only (design guardrail: content lives in
 * tables, logic stays trivial).
 */

/** The calendar year shown for turn 1. */
export const BASE_YEAR = 900;

export interface Era {
  /** First turn of the era (eras are contiguous and ordered). */
  fromTurn: number;
  name: string;
  /** One-line flavour for tooltips. */
  blurb: string;
}

/** The ages of the world, in order. Turn ranges cover the 150-turn game. */
export const ERAS: readonly Era[] = [
  { fromTurn: 1, name: "Age of Founding", blurb: "Petty realms rise from scattered halls; every border is still a suggestion." },
  { fromTurn: 26, name: "Age of Banners", blurb: "Levies march under fresh-sewn banners; the first rivalries harden." },
  { fromTurn: 61, name: "Age of Crowns", blurb: "Kings are crowned and courts intrigue; wars are fought for legitimacy." },
  { fromTurn: 101, name: "Age of Conquest", blurb: "The strong swallow the weak; the map is redrawn by campaign seasons." },
  { fromTurn: 136, name: "Age of Legacy", blurb: "The chronicles close; what stands now is what history will remember." },
] as const;

/** The calendar year for a turn (turn 1 → BASE_YEAR, one year per turn). */
export function yearForTurn(turn: number): number {
  return BASE_YEAR + Math.max(0, Math.floor(turn) - 1);
}

/** The age of the world a turn falls in (turns below 1 clamp to the first era). */
export function eraForTurn(turn: number): Era {
  let era = ERAS[0]!;
  for (const e of ERAS) {
    if (turn >= e.fromTurn) era = e;
    else break;
  }
  return era;
}
