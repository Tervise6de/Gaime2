/**
 * Playable factions — the realms of the medieval Baltic rim you can rule
 * (docs/game-design.md §3.1). A CK3/Civ-style roster: pick your people at the
 * start, in a random world or on the scripted Baltic map.
 *
 * Each faction carries an identity (name, map colour, flavour) and a **signature
 * national trait** — its current gameplay difference, drawn from the existing
 * trait system (`data/traits.ts`). Traits give a real, balanced edge (a yield
 * lean or cheaper armies) without new sim maths; richer per-faction bonuses can
 * hang off this same table later. Serialisable content only — no logic, no DOM.
 *
 * The scripted maps (`data/maps/*`) seat factions by **name**, so a realm plays
 * with the same identity and trait whether you meet it in a random game or on
 * the Baltic map.
 */

import type { TraitId } from "@/data/traits";

export interface FactionDef {
  /** Display name — also the join key with the scripted maps' faction list. */
  name: string;
  /** Map colour when AI-controlled (the human's realm is always the player gold). */
  color: string;
  /** Signature national trait — the faction's gameplay identity for now. */
  trait: TraitId;
  /** One-line flavour for the realm picker. */
  blurb: string;
}

/**
 * The roster (12). Colours are well-spaced hues kept clear of the player gold
 * and the Free Tribes' brown. Traits spread across the five so no realm feels
 * like a strict upgrade of another — every people leans a different way.
 */
export const FACTIONS: FactionDef[] = [
  { name: "Sweden", color: "#5b8bd0", trait: "martial", blurb: "Northern warrior-kings — armies raised cheap and fierce." },
  { name: "Denmark", color: "#d0796e", trait: "mercantile", blurb: "A seafaring crown that lives by Baltic trade and gold." },
  { name: "Novgorod", color: "#b06ec0", trait: "scholarly", blurb: "A Rus merchant-republic of chronicles and learning." },
  { name: "Lithuania", color: "#6cae7a", trait: "martial", blurb: "Pagan grand-dukes and their dreaded horse-armies." },
  { name: "Prussia", color: "#8f86d8", trait: "industrious", blurb: "Baltic tribes turned tireless builders of the shore." },
  { name: "Livonia", color: "#4fb0a0", trait: "industrious", blurb: "Order-forts and stone towns rise across the coast." },
  { name: "Poland", color: "#d64f7d", trait: "fertile", blurb: "The rich Vistula grainlands feed a growing realm." },
  { name: "Curonia", color: "#d99a4f", trait: "mercantile", blurb: "Amber-coast traders and raiders of the western sea." },
  { name: "Estonia", color: "#6fc2d8", trait: "fertile", blurb: "Free tribal farmers of the northern woods and bogs." },
  { name: "Finland", color: "#9ec96b", trait: "industrious", blurb: "Forest-folk and craftsmen of the far northern shore." },
  { name: "Gotland", color: "#9aa4b2", trait: "mercantile", blurb: "Visby's island Hansa — the trading heart of the sea." },
  { name: "Samogitia", color: "#c56b6b", trait: "martial", blurb: "Fierce pagan holdouts who bow to no crusader." },
];

export const FACTION_NAMES: string[] = FACTIONS.map((f) => f.name);

/** Look up a faction's definition by name (undefined if not in the roster). */
export function factionByName(name: string | undefined | null): FactionDef | undefined {
  if (!name) return undefined;
  return FACTIONS.find((f) => f.name === name);
}
