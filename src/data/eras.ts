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
  /** Ordinal (0-based) — techs reference this to gate research by age. */
  index: number;
  /** First turn of the era (eras are contiguous and ordered). */
  fromTurn: number;
  name: string;
  /** One-line flavour for tooltips. */
  blurb: string;
}

/**
 * The ages of the world, in order. Turn ranges span the ~220-turn game so a
 * full campaign is a long arc through every age (research is era-gated — you
 * cannot pull a tech forward before its age dawns; see `data/techs.ts`).
 */
export const ERAS: readonly Era[] = [
  { index: 0, fromTurn: 1, name: "Age of Founding", blurb: "Petty realms rise from scattered halls; every border is still a suggestion." },
  { index: 1, fromTurn: 45, name: "Age of Banners", blurb: "Levies march under fresh-sewn banners; the first rivalries harden." },
  { index: 2, fromTurn: 90, name: "Age of Crowns", blurb: "Kings are crowned and courts intrigue; wars are fought for legitimacy." },
  { index: 3, fromTurn: 140, name: "Age of Conquest", blurb: "The strong swallow the weak; the map is redrawn by campaign seasons." },
  { index: 4, fromTurn: 185, name: "Age of Legacy", blurb: "The chronicles close; what stands now is what history will remember." },
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

/** The 0-based index of the age a turn falls in — the research gate (0..ERAS-1). */
export function eraIndexForTurn(turn: number): number {
  return eraForTurn(turn).index;
}

/** The era an ordinal names (clamped), for naming a tech's required age. */
export function eraByIndex(index: number): Era {
  return ERAS[Math.max(0, Math.min(ERAS.length - 1, index))]!;
}
