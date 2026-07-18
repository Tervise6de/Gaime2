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
import type { TechId } from "@/data/techs";
import type { UnitType } from "@/data/units";
import type { FocusId } from "@/data/focuses";
import type { Personality } from "@/systems/state";

/**
 * A faction's unique edge beyond its signature trait — a small, thematic opening
 * advantage applied once at game start (so it never couples to the live economy
 * or combat loops). All fields optional and data-driven; balance by editing.
 */
export interface FactionBonus {
  /** Short name for the picker ("Viking host", "Sound toll"). */
  label: string;
  /** One-line effect for the picker. */
  detail: string;
  /** Extra opening treasury. */
  startGold?: number;
  /** Extra regiments in the starting army (added to the capital stack). */
  startUnits?: Partial<Record<UnitType, number>>;
  /** A free opening technology — must be an Age-of-Founding (era 0) tech. */
  startTech?: TechId;
}

export interface FactionDef {
  /** Display name — also the join key with the scripted maps' faction list. */
  name: string;
  /** Map colour when AI-controlled (the human's realm is always the player gold). */
  color: string;
  /** Signature national trait — the faction's gameplay identity. */
  trait: TraitId;
  /** One-line flavour for the realm picker. */
  blurb: string;
  /** The faction's unique opening edge (beyond the trait). */
  bonus: FactionBonus;
  /**
   * The AI **disposition** this realm plays with when computer-controlled — its
   * signature diplomatic temperament (`data/personalities.ts`), so a warlike realm
   * wars readily while a mercantile one prefers trade. A per-faction difference
   * beyond the one-off opening bonus; ignored for the human's own realm. Optional:
   * absent falls back to the shuffled round-robin (legacy behaviour).
   */
  disposition?: Personality["archetype"];
  /**
   * The specialisation this realm's **capital begins with** (data/focuses.ts) — a
   * martial seat starts a Garrison, a Hansa one a Market town — so factions read
   * distinctly from turn 1 and the focus system is introduced by example. Just a
   * pre-set of a normal player choice (the player may re-focus it); no new maths.
   * Optional — absent leaves the capital unspecialised.
   */
  homeFocus?: FocusId;
}

/**
 * The roster (13). Colours are well-spaced hues kept clear of the player gold
 * and the Free Tribes' brown. Traits spread across the five so no realm feels
 * like a strict upgrade of another; each also carries a distinct opening bonus
 * of roughly comparable value (a free Age-of-Founding tech, ~35-55 gold, or a
 * regiment or two).
 */
export const FACTIONS: FactionDef[] = [
  { name: "Sweden", color: "#5b8bd0", trait: "martial", disposition: "warlord", homeFocus: "garrison", blurb: "Northern warrior-kings — armies raised cheap and fierce.",
    bonus: { label: "Viking host", detail: "Begin with a veteran Infantry regiment.", startUnits: { infantry: 1 } } },
  { name: "Denmark", color: "#d0796e", trait: "mercantile", disposition: "merchant", homeFocus: "market", blurb: "A seafaring crown that lives by Baltic trade and gold.",
    bonus: { label: "Sound toll", detail: "Begin with +45 gold from the strait tolls.", startGold: 45 } },
  { name: "Novgorod", color: "#b06ec0", trait: "scholarly", disposition: "builder", homeFocus: "academy", blurb: "A Rus merchant-republic of chronicles and learning.",
    bonus: { label: "The Chronicles", detail: "Begin with Writing already known.", startTech: "writing" } },
  { name: "Lithuania", color: "#6cae7a", trait: "martial", disposition: "opportunist", homeFocus: "garrison", blurb: "Pagan grand-dukes and their dreaded horse-armies.",
    bonus: { label: "The horse levy", detail: "Begin with two extra Militia regiments.", startUnits: { militia: 2 } } },
  { name: "Prussia", color: "#8f86d8", trait: "industrious", disposition: "builder", homeFocus: "workshop", blurb: "Baltic tribes turned tireless builders of the shore.",
    bonus: { label: "The builders", detail: "Begin with Pottery already known (the Granary).", startTech: "pottery" } },
  { name: "Livonia", color: "#4fb0a0", trait: "industrious", disposition: "builder", homeFocus: "workshop", blurb: "Order-forts and stone towns rise across the coast.",
    bonus: { label: "Stone towns", detail: "Begin with +35 gold from the burgher charters.", startGold: 35 } },
  { name: "Poland", color: "#d64f7d", trait: "fertile", disposition: "opportunist", homeFocus: "farmland", blurb: "The rich Vistula grainlands feed a growing realm.",
    bonus: { label: "The breadbasket", detail: "Begin with Agriculture already known.", startTech: "agriculture" } },
  { name: "Curonia", color: "#d99a4f", trait: "mercantile", disposition: "merchant", homeFocus: "market", blurb: "Amber-coast traders and raiders of the western sea.",
    bonus: { label: "Amber trade", detail: "Begin with +40 gold from the amber road.", startGold: 40 } },
  { name: "Estonia", color: "#6fc2d8", trait: "fertile", disposition: "builder", homeFocus: "farmland", blurb: "Free tribal farmers of the northern woods and bogs.",
    bonus: { label: "Tribal levies", detail: "Begin with two extra Militia regiments.", startUnits: { militia: 2 } } },
  { name: "Finland", color: "#9ec96b", trait: "industrious", disposition: "builder", homeFocus: "workshop", blurb: "Forest-folk and craftsmen of the far northern shore.",
    bonus: { label: "Forest wardens", detail: "Begin with Warcraft already known (the Barracks).", startTech: "warcraft" } },
  { name: "Gotland", color: "#9aa4b2", trait: "mercantile", disposition: "merchant", homeFocus: "market", blurb: "Visby's island Hansa — the trading heart of the sea.",
    bonus: { label: "Hansa heart", detail: "Begin with +55 gold — the richest opening.", startGold: 55 } },
  { name: "Samogitia", color: "#c56b6b", trait: "martial", disposition: "warlord", homeFocus: "garrison", blurb: "Fierce pagan holdouts who bow to no crusader.",
    bonus: { label: "Pagan holdouts", detail: "Begin with an Infantry and a Militia regiment.", startUnits: { infantry: 1, militia: 1 } } },
  { name: "Lübeck", color: "#b0273b", trait: "mercantile", disposition: "merchant", homeFocus: "market", blurb: "Queen of the Hansa — the Wendish sea's chief town and the League's future head.",
    bonus: { label: "Queen of the Hansa", detail: "Begin with +50 gold from the burgher charters.", startGold: 50 } },
];

export const FACTION_NAMES: string[] = FACTIONS.map((f) => f.name);

/** Look up a faction's definition by name (undefined if not in the roster). */
export function factionByName(name: string | undefined | null): FactionDef | undefined {
  if (!name) return undefined;
  return FACTIONS.find((f) => f.name === name);
}
