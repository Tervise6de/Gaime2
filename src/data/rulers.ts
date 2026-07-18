/**
 * Rulers (E1) — the named figure at the head of each realm. Pure presentation
 * over the existing personality AI: a realm's diplomacy and the chronicle speak
 * as "Visvaldis the Cruel" rather than "Lithuania", turning an anonymous colour
 * on the map into someone with a reputation. Deterministic — drawn from the
 * seeded RNG, so a given game always raises the same rulers. Data only, no DOM.
 */
import type { Rng } from "@/systems/rng";
import type { Personality } from "@/systems/state";

export interface Ruler {
  name: string;
  epithet: string;
}

// A broad Baltic/Northern-crusades name pool (the CK3 heartland the game leans
// into). Kept gender-neutral in presentation — the sim never assumes.
const NAMES = [
  "Visvaldis", "Mindaugas", "Gediminas", "Vytautas", "Kęstutis", "Traidenis",
  "Daumantas", "Švitrigaila", "Skirgaila", "Vykintas", "Algirdas", "Butigeidis",
  "Hermann", "Konrad", "Albrecht", "Dietrich", "Heinrich", "Wenzel", "Otto",
  "Berthold", "Rüdiger", "Ulrich", "Sigrid", "Ingrid", "Astrid", "Halldóra",
  "Ragnhild", "Toila", "Lembit", "Kaupo", "Nameisis", "Viesthard", "Thorvald",
];

// Epithets biased by archetype — a warlord earns a different reputation than a
// merchant. Each list is the "flavour" pool; a generic pool backstops them.
const EPITHETS: Record<Personality["archetype"], string[]> = {
  warlord: ["the Cruel", "the Conqueror", "the Iron", "the Wrathful", "the Bloody", "the Dread"],
  merchant: ["the Rich", "the Shrewd", "the Gilded", "the Trader", "the Prosperous"],
  builder: ["the Wise", "the Great", "the Builder", "the Learned", "the Just"],
  opportunist: ["the Cunning", "the Fox", "the Serpent", "the Sly", "the Bold"],
};

const GENERIC_EPITHETS = ["the Elder", "the Younger", "the Grim", "the Fair", "the Old", "the Silent"];

/** Draw a ruler from the RNG (advances the stream), flavoured by archetype. */
export function generateRuler(rng: Rng, archetype?: Personality["archetype"]): Ruler {
  const name = rng.pick(NAMES);
  const pool = archetype ? EPITHETS[archetype].concat(GENERIC_EPITHETS) : GENERIC_EPITHETS;
  const epithet = rng.pick(pool);
  return { name, epithet };
}

/** Display name — "Visvaldis the Cruel". */
export function rulerTitle(r: Ruler): string {
  return `${r.name} ${r.epithet}`;
}
