/**
 * Presentation-scale formatting for population. The sim tracks population in
 * abstract units (a region holds ~1–20); the world presents them as people —
 * one unit = POP_SCALE souls — so "4/10" reads as "4,000 / 10,000". Pure
 * string helpers, no DOM: the sim itself never changes scale.
 */

export const POP_SCALE = 1000;

/** Thousands-separated people count: 4.3 units → "4,300". */
export function popDisplay(units: number): string {
  const people = Math.round(units * POP_SCALE);
  return people.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Compact people count for tight spots (the map's population chip):
 * 0.3 → "300", 4.32 → "4.3k", 12.4 → "12k".
 */
export function popCompact(units: number): string {
  const people = Math.round(units * POP_SCALE);
  if (people < 1000) return String(people);
  const k = people / 1000;
  return k < 10 ? `${(Math.round(k * 10) / 10).toString()}k` : `${Math.round(k)}k`;
}

/**
 * Armies use the same presentation scale: one sim unit = a regiment of
 * 1,000 soldiers. A 3-unit army reads "3,000 soldiers" (map badge: "3k"),
 * matching the population's ×1,000 world.
 */
export const SOLDIERS_PER_UNIT = POP_SCALE;
export const soldiersDisplay = popDisplay;
export const soldiersCompact = popCompact;
