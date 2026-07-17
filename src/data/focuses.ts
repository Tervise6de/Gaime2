/**
 * Region focus / specialisation — the Civ-style "what is this province for?"
 * (docs/game-design.md §9.4). A cheap identity you assign to your own regions
 * that biases their output, without a city-management screen.
 *
 * Six focuses: **Balanced** (no lean) plus one per core resource — Farmland
 * (food + growth), Market town (gold), Workshops (materials), Academy
 * (knowledge) — and **Garrison** (a muster town: cheaper local troops and a
 * calmer province). Effects plug into the existing hooks (economy yields,
 * population cap, stability, unit cost) via the helpers below, so balancing is
 * editing this table. Serialisable content only — no logic, no DOM.
 */

import type { ResourceYield } from "@/data/terrain";

export type FocusId = "balanced" | "farmland" | "market" | "workshop" | "academy" | "garrison";

export interface FocusDef {
  id: FocusId;
  label: string;
  /** Emoji marker for the picker / region chip. */
  icon: string;
  /** One-line description of the lean. */
  blurb: string;
  /** Per-resource output multiplier for the region (1 = unchanged). */
  yield: Partial<ResourceYield>;
  /** Added to the region's population capacity (Farmland). */
  popCapacity?: number;
  /** Change to the region's unrest target — negative = calmer (Garrison). */
  unrest?: number;
  /** Multiplier on the cost of units mustered here — <1 = cheaper (Garrison). */
  unitCostMult?: number;
}

export const FOCUSES: Record<FocusId, FocusDef> = {
  balanced: {
    id: "balanced",
    label: "Balanced",
    icon: "⚖",
    blurb: "No specialisation — even, unbiased output.",
    yield: {},
  },
  farmland: {
    id: "farmland",
    label: "Farmland",
    icon: "🌾",
    blurb: "+30% food and more room to grow (higher population cap).",
    yield: { food: 1.3 },
    popCapacity: 5,
  },
  market: {
    id: "market",
    label: "Market town",
    icon: "🪙",
    blurb: "+30% gold — a hub of trade and coin.",
    yield: { gold: 1.3 },
  },
  workshop: {
    id: "workshop",
    label: "Workshops",
    icon: "⛏",
    blurb: "+30% materials — craftsmen and forges.",
    yield: { materials: 1.3 },
  },
  academy: {
    id: "academy",
    label: "Academy",
    icon: "📖",
    blurb: "+40% knowledge — scholars and scriptoria.",
    yield: { knowledge: 1.4 },
  },
  garrison: {
    id: "garrison",
    label: "Garrison",
    icon: "🛡",
    blurb: "Troops mustered here cost 20% less, and the province stays calmer.",
    yield: {},
    unrest: -4,
    unitCostMult: 0.8,
  },
};

export const FOCUS_IDS = Object.keys(FOCUSES) as FocusId[];

/** Full per-resource multiplier for a focus (1s for unset / balanced). */
export function focusYieldMult(focus: FocusId | undefined): ResourceYield {
  const y = focus ? FOCUSES[focus].yield : undefined;
  return {
    food: y?.food ?? 1,
    materials: y?.materials ?? 1,
    gold: y?.gold ?? 1,
    knowledge: y?.knowledge ?? 1,
  };
}

/** Population-capacity bonus from a focus (Farmland). */
export function focusPopCapacity(focus: FocusId | undefined): number {
  return focus ? FOCUSES[focus].popCapacity ?? 0 : 0;
}

/** Unrest reduction from a focus (positive = calmer; Garrison). */
export function focusCalm(focus: FocusId | undefined): number {
  const u = focus ? FOCUSES[focus].unrest ?? 0 : 0;
  return u === 0 ? 0 : -u; // normalise -0 → 0
}

/** Unit-cost multiplier for troops mustered in a focus region (<1 = cheaper). */
export function focusUnitCostMult(focus: FocusId | undefined): number {
  return focus ? FOCUSES[focus].unitCostMult ?? 1 : 1;
}
