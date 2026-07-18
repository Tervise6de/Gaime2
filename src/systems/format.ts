/**
 * Presentation-scale formatting for population and armies. The sim tracks both
 * in abstract units (a region holds ~1–20; a stack ~1–20); the world presents
 * them as *people* and *soldiers* at different scales, so armies read as a
 * believable fraction of the population they stand among:
 *
 *   population — 1 unit = POP_SCALE souls        → "4/10"  reads "4,000 / 10,000"
 *   army       — 1 unit = SOLDIERS_PER_UNIT men  → a 3-unit stack is "750 soldiers"
 *
 * A single ×1,000 scale for both made armies look absurd (an 8-unit stack read
 * as "8,000" beside a "10,000"-population province — most of the populace under
 * arms). Soldiers now scale at a quarter of that, so one unit is a ~250-strong
 * company/retinue: a garrison is a sliver of its town, a doom-stack a real field
 * army, never a nation-in-arms. Pure string helpers, no DOM — the sim's own
 * numbers never change scale.
 */

export const POP_SCALE = 1000;

/** One army unit is a company/retinue of this many soldiers (a quarter of a
    population unit, so an army reads as a small fraction of the land's people). */
export const SOLDIERS_PER_UNIT = 250;

/** Thousands-separated count at a given per-unit scale (4.3 × 1000 → "4,300"). */
function scaled(units: number, scale: number): string {
  const n = Math.round(units * scale);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Compact count for tight spots: 0.3×1000 → "300", 4.32×1000 → "4.3k", 12.4×1000 → "12k". */
function scaledCompact(units: number, scale: number): string {
  const n = Math.round(units * scale);
  if (n < 1000) return String(n);
  const k = n / 1000;
  return k < 10 ? `${(Math.round(k * 10) / 10).toString()}k` : `${Math.round(k)}k`;
}

/** Thousands-separated people count: 4.3 units → "4,300". */
export function popDisplay(units: number): string {
  return scaled(units, POP_SCALE);
}

/**
 * Compact people count for tight spots (the map's population chip):
 * 0.3 → "300", 4.32 → "4.3k", 12.4 → "12k".
 */
export function popCompact(units: number): string {
  return scaledCompact(units, POP_SCALE);
}

/**
 * Armies present at their own scale: one sim unit = a company of
 * SOLDIERS_PER_UNIT soldiers. A 3-unit army reads "750 soldiers" (map badge:
 * "750"), a fraction of the ×1,000 population it moves among.
 */
export function soldiersDisplay(units: number): string {
  return scaled(units, SOLDIERS_PER_UNIT);
}

export function soldiersCompact(units: number): string {
  return scaledCompact(units, SOLDIERS_PER_UNIT);
}
