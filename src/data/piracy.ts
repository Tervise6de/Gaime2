/**
 * Piracy content & balance (data layer — serialisable, no logic).
 *
 * The ongoing "Victual Brothers" pirate era: raidable trade routes and the named
 * captains who lead the raids. History is grounded in `hansa times.md` §7 (Klaus
 * Störtebeker — **flagged there as largely legend**), §9 (the Vitalienbrüder /
 * "Likedeeler"), and §13's design hook *"Pirate raid (Victual Brothers) — lose a
 * trade convoy unless escorted."* Numbers are **illustrative starting values for
 * tuning** (edit the table, not the code). The system that consumes this is
 * `src/systems/piracy.ts`.
 */

import type { UnitType } from "@/data/units";
import type { PiracyState } from "@/systems/state";

/** A fresh, dormant piracy era (pressure 0 ⇒ the raid system is a no-op). */
export function defaultPiracyState(): PiracyState {
  return { pressure: 0, defeatedCaptains: [] };
}

/** Balance dials for the piracy era. Illustrative — tune freely. */
export const PIRACY = {
  /** Pressure the Victual Brothers epoch event sets the era to (0..1). */
  epochPressure: 0.6,
  /** Pressure eased each turn — the age of piracy rises and passes. */
  decayPerTurn: 0.04,
  /** Master multiplier on per-route raid chance. */
  raidCoeff: 0.5,
  /** Hard ceiling on a single route's per-turn raid chance. */
  raidCap: 0.4,
  /** Route income (gold/turn) that counts as "1× attractive" to raiders. */
  valueRef: 30,
  /** Lane length (region hops) at which a route is fully exposed. */
  exposureLenRef: 6,
  /** The Naval Power doctrine ("guarded lanes") cuts raid chance by this fraction. */
  navalDeterrence: 0.4,
  /** Pressure gained when a raid lands (success emboldens the raiders). */
  raidSuccessGain: 0.05,
  /** Pressure lost when a guard-fleet repels a raid. */
  repelDrop: 0.04,
  /** Extra pressure lost when a named captain is taken. */
  captainDrop: 0.12,
  /** Chance a fired raid is led by a named captain (when one is available). */
  captainChance: 0.4,
  /** Base war-cogs in a raider stack. */
  raiderBase: 2,
  /** War-cogs added in proportion to pressure. */
  raiderPerPressure: 4,
} as const;

export type PirateCaptainId = "wichmann" | "wigbold" | "michels" | "stortebeker";

export interface PirateCaptainDef {
  readonly id: PirateCaptainId;
  readonly name: string;
  readonly epithet: string;
  /** The era must be at least this lawless for this captain to appear. */
  readonly minPressure: number;
  /** War-cogs this captain adds to the raider stack he leads. */
  readonly extraShips: number;
  /** His flagship, added to the stack (a hulk makes a marquee captain a hard fight). */
  readonly flagship: UnitType;
  /** Gold bounty for taking him. */
  readonly bounty: number;
  /** A saga-worthy capture (records a chronicle beat). */
  readonly marquee: boolean;
  /** Flavour — legend flagged where the history is (see hansa times.md §7). */
  readonly note: string;
}

/**
 * The named Likedeeler captains, in rising notoriety. The hotter the era, the more
 * infamous the captain it summons — Störtebeker only rides at the height of the
 * troubles. Each recurs until a guard-fleet takes him.
 */
export const PIRATE_CAPTAINS: Record<PirateCaptainId, PirateCaptainDef> = {
  wichmann: {
    id: "wichmann",
    name: "Hennig Wichmann",
    epithet: "the Likedeeler",
    minPressure: 0.25,
    extraShips: 2,
    flagship: "war_cog",
    bounty: 60,
    marquee: false,
    note: "One of the four named leaders of the Victual Brothers; taken in the Hamburg sweep of 1401–02.",
  },
  wigbold: {
    id: "wigbold",
    name: "Magister Wigbold",
    epithet: "the Learned",
    minPressure: 0.3,
    extraShips: 2,
    flagship: "war_cog",
    bounty: 75,
    marquee: false,
    note: "The scholar-pirate, 'Master of the Seven Arts' — a slippery navigator who knows every current.",
  },
  michels: {
    id: "michels",
    name: "Gödeke Michels",
    epithet: "",
    minPressure: 0.4,
    extraShips: 3,
    flagship: "war_cog",
    bounty: 95,
    marquee: false,
    note: "Störtebeker's co-captain — the raids do not stop when the marquee falls; Michels sails on until 1402.",
  },
  stortebeker: {
    id: "stortebeker",
    name: "Klaus Störtebeker",
    epithet: "the Likedeeler",
    minPressure: 0.5,
    extraShips: 4,
    flagship: "hulk",
    bounty: 130,
    marquee: true,
    note: "The era's emblem of piracy — reputedly beheaded with ~70 of his crew at Hamburg's Grasbrook (1400/1401). Much of the biography is chronicle legend (hansa times.md §7).",
  },
};

export const PIRATE_CAPTAIN_IDS = Object.keys(PIRATE_CAPTAINS) as PirateCaptainId[];
