/**
 * Commanders (M4) — the characters who lead armies. A commander is a data row:
 * a name, an epithet, a martial rating, and a trait. Martial feeds the combat
 * maths (a well-led army hits and holds harder); loyalty makes a strong general
 * a liability at home. Deterministic — every field is drawn from the seeded RNG,
 * so the same seed always raises the same officers. Pure data + helpers; no DOM.
 */
import type { Rng } from "@/systems/rng";

export type CommanderTrait =
  | "brilliant"
  | "bold"
  | "cautious"
  | "reckless"
  | "ambitious"
  | "steadfast";

export const COMMANDER_TRAIT_IDS: CommanderTrait[] = [
  "brilliant",
  "bold",
  "cautious",
  "reckless",
  "ambitious",
  "steadfast",
];

export interface CommanderTraitDef {
  id: CommanderTrait;
  label: string;
  /** Added to the attack multiplier when this commander leads an assault. */
  attack: number;
  /** Added to the defence multiplier when this commander holds a region. */
  defense: number;
  /** Nudges starting loyalty (×5 points) — ambitious officers start restless. */
  loyaltyBias: number;
  blurb: string;
}

/** Trait effects are flat modifiers on top of the martial scaling. */
export const COMMANDER_TRAITS: Record<CommanderTrait, CommanderTraitDef> = {
  brilliant: { id: "brilliant", label: "Brilliant", attack: 0.1, defense: 0.1, loyaltyBias: 0, blurb: "A gifted tactician — sharper on attack and defence." },
  bold: { id: "bold", label: "Bold", attack: 0.15, defense: 0, loyaltyBias: 0, blurb: "Presses the attack hard; no help on defence." },
  cautious: { id: "cautious", label: "Cautious", attack: 0, defense: 0.15, loyaltyBias: 1, blurb: "Fights a careful defence; slow to press an assault." },
  reckless: { id: "reckless", label: "Reckless", attack: 0.2, defense: -0.1, loyaltyBias: 0, blurb: "All-out on attack, careless in defence." },
  ambitious: { id: "ambitious", label: "Ambitious", attack: 0.05, defense: 0.05, loyaltyBias: -3, blurb: "Capable, but eyes your throne — a loyalty risk." },
  steadfast: { id: "steadfast", label: "Steadfast", attack: 0.05, defense: 0.1, loyaltyBias: 3, blurb: "Reliable and loyal — a steady hand." },
};

/** Per-point-of-martial multiplier bonus (martial 9 ≈ +18% before the trait). */
export const COMMANDER_MARTIAL_SCALE = 0.02;

/** Loyalty at or below this foments unrest where the army stands, and — in a
 *  region already in open revolt — tips the commander into defection (a liability). */
export const COMMANDER_DISLOYAL = 30;

/** Loyalty lost per turn a commander sits in a high-unrest province (it erodes them). */
export const COMMANDER_LOYALTY_EROSION = 3;

/** Loyalty regained per turn a commander sits in a calm province (a contented officer). */
export const COMMANDER_LOYALTY_RECOVERY = 1;

export interface Commander {
  name: string;
  epithet: string;
  /** 2..9 tactical skill; feeds combat via the martial scaling + trait. */
  martial: number;
  trait: CommanderTrait;
  /** 0..100; low loyalty is a liability (foments unrest at home). */
  loyalty: number;
}

// Baltic-crusades flavour (the CK3 heartland the design leans into).
const GIVEN_NAMES = [
  "Visvaldis", "Konrad", "Mindaugas", "Hermann", "Vytautas", "Albrecht", "Kęstutis",
  "Dietrich", "Gediminas", "Wenzel", "Traidenis", "Rüdiger", "Švitrigaila", "Otto",
  "Daumantas", "Berthold", "Skirgaila", "Ulrich", "Vykintas", "Heinrich",
];

const EPITHETS_MARTIAL = [
  "the Bold", "the Iron", "the Victorious", "the Unbroken", "the Lionheart",
  "the Hammer", "the Fearless", "the Conqueror",
];

const EPITHETS_PLAIN = [
  "the Grim", "the Younger", "the Wolf", "the Silent", "the Elder", "the Red",
  "the Crow", "the Stern", "the Fox", "the Pale",
];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Draw a fresh commander from the RNG (advances the stream). Deterministic. */
export function generateCommander(rng: Rng): Commander {
  const trait = rng.pick(COMMANDER_TRAIT_IDS);
  const martial = rng.int(2, 9);
  const loyalty = clamp(rng.int(40, 85) + COMMANDER_TRAITS[trait].loyaltyBias * 5, 0, 100);
  const name = rng.pick(GIVEN_NAMES);
  const epithet = rng.pick(martial >= 7 ? EPITHETS_MARTIAL : EPITHETS_PLAIN);
  return { name, epithet, martial, trait, loyalty };
}

/** Attack-side strength multiplier a commander confers (1 = unled). */
export function commanderAttack(c: Commander | undefined): number {
  if (!c) return 1;
  return 1 + COMMANDER_MARTIAL_SCALE * c.martial + COMMANDER_TRAITS[c.trait].attack;
}

/** Defence-side strength multiplier a commander confers (1 = unled). */
export function commanderDefense(c: Commander | undefined): number {
  if (!c) return 1;
  return 1 + COMMANDER_MARTIAL_SCALE * c.martial + COMMANDER_TRAITS[c.trait].defense;
}

/** Display name — "Visvaldis the Bold". */
export function commanderTitle(c: Commander): string {
  return `${c.name} ${c.epithet}`;
}
