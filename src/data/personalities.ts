/**
 * AI personality archetypes (docs/game-design.md §5).
 *
 * Weights (0..1) shift decision *thresholds*, not the decision framework — a
 * Warlord declares war at a less favourable power ratio; a Merchant prefers
 * trades and only fights when cornered. Same code (ai.ts), different feel.
 */

import type { Personality } from "@/systems/state";

export const ARCHETYPES: Personality[] = [
  { archetype: "warlord", aggression: 0.9, expansion: 0.8, economy: 0.3, trustworthiness: 0.2 },
  { archetype: "merchant", aggression: 0.2, expansion: 0.5, economy: 0.9, trustworthiness: 0.85 },
  { archetype: "builder", aggression: 0.2, expansion: 0.3, economy: 0.9, trustworthiness: 0.6 },
  { archetype: "opportunist", aggression: 0.55, expansion: 0.75, economy: 0.5, trustworthiness: 0.3 },
];

export const ARCHETYPE_LABEL: Record<Personality["archetype"], string> = {
  warlord: "Warlord",
  merchant: "Merchant",
  builder: "Builder",
  opportunist: "Opportunist",
};

/** A short one-line flavour of how each archetype plays, for the realm picker. */
export const ARCHETYPE_BLURB: Record<Personality["archetype"], string> = {
  warlord: "wars readily and trusts little",
  merchant: "prefers trade and keeps its word",
  builder: "turns inward to grow, slow to fight",
  opportunist: "strikes at weakness, expands hard",
};

/** The archetype id → its Personality weights (falls back to the opportunist mean). */
export function personalityByArchetype(archetype: Personality["archetype"]): Personality {
  return ARCHETYPES.find((p) => p.archetype === archetype) ?? ARCHETYPES[3]!;
}
