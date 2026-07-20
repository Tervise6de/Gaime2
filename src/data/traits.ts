/**
 * National traits (docs/game-design.md §6).
 *
 * Each nation (player and rivals) draws one trait per game, nudging it toward a
 * different opening: a production multiplier on one resource, or — for Martial —
 * a discount on unit costs. Traits are pure data; the economy and military read
 * them so balancing is editing this table, not code. Numbers are illustrative
 * starting values for tuning.
 */

import type { ResourceYield } from "@/data/terrain";

export type TraitId = "fertile" | "industrious" | "martial" | "mercantile" | "scholarly";

export interface TraitInfo {
  id: TraitId;
  label: string;
  blurb: string;
  /** Per-resource production multipliers on gold/food/knowledge (1 = no change). */
  yield: ResourceYield;
  /** Multiplier on all ware output (1 = no change) — the wares analogue of `yield`. */
  wareMult: number;
  /** Multiplier on unit gold+ware cost (1 = no change). */
  unitCostMult: number;
}

const NO_YIELD: ResourceYield = { food: 1, gold: 1, knowledge: 1 };

export const TRAITS: Record<TraitId, TraitInfo> = {
  fertile: {
    id: "fertile",
    label: "Fertile",
    blurb: "Rich soil — +25% food.",
    yield: { ...NO_YIELD, food: 1.25 },
    wareMult: 1,
    unitCostMult: 1,
  },
  industrious: {
    id: "industrious",
    label: "Industrious",
    blurb: "Tireless workers — +25% ware output.",
    yield: { ...NO_YIELD },
    wareMult: 1.25,
    unitCostMult: 1,
  },
  martial: {
    id: "martial",
    label: "Martial",
    blurb: "Warrior culture — units cost 20% less.",
    yield: { ...NO_YIELD },
    wareMult: 1,
    unitCostMult: 0.8,
  },
  mercantile: {
    id: "mercantile",
    label: "Mercantile",
    blurb: "Shrewd traders — +20% gold.",
    yield: { ...NO_YIELD, gold: 1.2 },
    wareMult: 1,
    unitCostMult: 1,
  },
  scholarly: {
    id: "scholarly",
    label: "Scholarly",
    blurb: "Keen minds — +30% knowledge.",
    yield: { ...NO_YIELD, knowledge: 1.3 },
    wareMult: 1,
    unitCostMult: 1,
  },
};

export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

/** A trait's production multipliers, or all-ones when no trait is set. */
export function traitYield(trait: TraitId | undefined): ResourceYield {
  return trait ? TRAITS[trait].yield : NO_YIELD;
}

/** A trait's ware-output multiplier, or 1 when no trait is set. */
export function traitWareMult(trait: TraitId | undefined): number {
  return trait ? TRAITS[trait].wareMult : 1;
}

/** A trait's unit-cost multiplier, or 1 when no trait is set. */
export function traitUnitCostMult(trait: TraitId | undefined): number {
  return trait ? TRAITS[trait].unitCostMult : 1;
}
