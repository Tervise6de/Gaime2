/**
 * World ages — the game's sense of time. Purely presentational and derived
 * from the turn number alone (no state, no RNG), so the HUD can show a year
 * and an age without touching the sim. The calendar is *stretched*: each turn
 * spans ~YEARS_PER_TURN years, so a standard ~220-turn game arcs across the
 * whole Hanseatic lifecycle — from the Gotlandic trade dawn (~900 AD) to the
 * League's twilight (~1500 AD) — WITHOUT changing turn-based pacing (the turn
 * count is the session length; years-per-turn set the span; docs/hansa-plan.md
 * §3). Era boundaries stay on their turn numbers so tech era-gating is
 * untouched — only the shown year and the era flavour change.
 *
 * Serialisable data + pure helpers only (design guardrail: content lives in
 * tables, logic stays trivial).
 */

/** The calendar year shown for turn 1. */
export const BASE_YEAR = 900;

/**
 * Calendar years elapsed per game turn. The turn-based sim never reads this —
 * it only stretches the *displayed* year so ~220 turns span ~900→~1500 AD (the
 * Hansa arc). Re-spacing the calendar is a one-number change here, with no
 * effect on gameplay pacing or era boundaries.
 */
export const YEARS_PER_TURN = 2.8;

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
  { index: 0, fromTurn: 1, name: "Trade Dawn", blurb: "Longships and laden cogs work a wild sea; Visby's beach-market is the whole north's counting-house." },
  { index: 1, fromTurn: 45, name: "The Gotland Age", blurb: "Gotland's guild-brothers rule the amber road; every Baltic shore answers to Visby's wharves." },
  { index: 2, fromTurn: 90, name: "The League Rises", blurb: "Lübeck is founded and the towns swear common cause; a league of merchants learns it can bind kings." },
  { index: 3, fromTurn: 140, name: "Peak of the Hansa", blurb: "Kontore glow from Novgorod to Bruges; the League's word shuts ports and unmakes crowns." },
  { index: 4, fromTurn: 185, name: "The Turning", blurb: "Princes chafe and rival sails crowd the lanes; the League's long noon tips toward evening." },
] as const;

/**
 * The calendar year for a turn — turn 1 → BASE_YEAR, then ~YEARS_PER_TURN years
 * per turn (rounded). Presentation only; the sim is turn-based and never reads
 * the year. Nonsense turns (< 1) clamp to the base year.
 */
export function yearForTurn(turn: number): number {
  return BASE_YEAR + Math.round(Math.max(0, Math.floor(turn) - 1) * YEARS_PER_TURN);
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
