/**
 * Start scenarios — hand-set opening configurations for replay variety
 * (serialisable content). Each bundles the map size, rival count and difficulty,
 * and an optional themed twist (a forced opening trait for the player). "Custom"
 * is not listed here — it's the UI's escape hatch to the free selectors.
 */

import type { TraitId } from "@/data/traits";

export interface Scenario {
  id: string;
  name: string;
  blurb: string;
  rivals: number;
  /** Region count — matches the map-size options (16 small / 22 medium / 30 large). */
  regionCount: 16 | 22 | 30;
  difficulty: "easy" | "normal" | "hard";
  /** Optional twist: force the player's opening national trait for a theme. */
  playerTrait?: TraitId;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "classic",
    name: "Classic Realm",
    blurb: "A balanced footing: three rivals on a middling map. The standard contest.",
    rivals: 3,
    regionCount: 22,
    difficulty: "normal",
  },
  {
    id: "border_duel",
    name: "Border Duel",
    blurb: "One neighbour, one small land — a tight head-to-head with nowhere to hide.",
    rivals: 1,
    regionCount: 16,
    difficulty: "normal",
  },
  {
    id: "age_of_warlords",
    name: "Age of Warlords",
    blurb: "Five hungry powers on a broad, brutal continent. Survival is not assured.",
    rivals: 5,
    regionCount: 30,
    difficulty: "hard",
  },
  {
    id: "the_long_peace",
    name: "The Long Peace",
    blurb: "A sprawling land and few rivals — room to build toward a Great Works or prestige win.",
    rivals: 2,
    regionCount: 30,
    difficulty: "easy",
  },
  {
    id: "scholar_kings",
    name: "Scholar-Kings",
    blurb: "Your realm prizes learning above all — you open with the Scholarly trait.",
    rivals: 3,
    regionCount: 22,
    difficulty: "normal",
    playerTrait: "scholarly",
  },
  {
    id: "the_warhost",
    name: "The Warhost",
    blurb: "Forged for war, on a hard footing — you open with the Martial trait.",
    rivals: 3,
    regionCount: 22,
    difficulty: "hard",
    playerTrait: "martial",
  },
];
