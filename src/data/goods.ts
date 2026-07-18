/**
 * Trade goods — the merchant layer's tradeable wares (hansa-plan.md §6).
 *
 * Goods sit *beside* the four-resource economy (food/materials/gold/knowledge),
 * not inside it: a region's terrain and strategic resource make it *able to
 * source* a good, but a good only becomes wealth when a trade route carries it to
 * a Kontor that demands it (systems/trade.ts). This keeps `regionProduction`
 * (economy.ts) untouched — goods are a parallel derived quantity, so the core
 * economy and its tests are unaffected.
 *
 * This slice ships the four terrain/resource-derived staples. Amber, salt,
 * herring and cloth are deferred: they need map-level seeding (special nodes and
 * the Bruges cloth import), which lands with the Hansa map wiring.
 *
 * Serialisable content only — no logic, no DOM. Balancing is editing this table.
 */

import type { StrategicResource, TerrainId } from "@/data/terrain";
import type { KontorId } from "@/data/kontore";

export type GoodId = "grain" | "timber" | "furs" | "iron";

/**
 * What lets a region source a good: a matching terrain (any of `terrain`) and/or
 * the presence of a strategic `resource`. `baseOutput` is the quantity a
 * qualifying region yields before its unrest penalty is applied.
 */
export interface GoodSource {
  /** Terrains that source this good (a region matching any one qualifies). */
  terrain?: TerrainId[];
  /** Strategic resource that sources this good, if any. */
  resource?: StrategicResource;
  /** Units of the good a qualifying region produces (pre-unrest). */
  baseOutput: number;
}

export interface GoodDef {
  id: GoodId;
  name: string;
  /** Emoji used by the (later) trade UI. */
  glyph: string;
  /** Gold each unit fetches at a demanding Kontor (before distance/scarcity). */
  value: number;
  /** Where the good comes from (terrain / resource). */
  source: GoodSource;
  /** Kontore that pay for this good — the inverse of KontorDef.demands. */
  demandedAt: KontorId[];
}

/**
 * The four staple goods. Numbers are illustrative starting values for tuning.
 * `value` and `demandedAt` are kept consistent with data/kontore.ts `demands`
 * (goods.test.ts asserts the two views agree, so they can never drift apart).
 */
export const GOODS: Record<GoodId, GoodDef> = {
  grain: {
    id: "grain",
    name: "Grain",
    glyph: "🌾",
    value: 2,
    source: { terrain: ["plains"], baseOutput: 3 },
    // Grain-poor Norway (Bergen) and the crowded Low Countries (Bruges) buy Baltic grain.
    demandedAt: ["bergen", "bruges"],
  },
  timber: {
    id: "timber",
    name: "Timber",
    glyph: "🪵",
    value: 2,
    source: { terrain: ["forest"], baseOutput: 3 },
    // The eastern forest road: timber gathered and traded through Novgorod.
    demandedAt: ["novgorod"],
  },
  furs: {
    id: "furs",
    name: "Furs",
    glyph: "🦫",
    value: 5,
    source: { terrain: ["forest"], baseOutput: 1 },
    // The great fur emporium (Novgorod) and the luxury market at London.
    demandedAt: ["novgorod", "london"],
  },
  iron: {
    id: "iron",
    name: "Iron",
    glyph: "⚒️",
    value: 3,
    source: { resource: "iron", baseOutput: 2 },
    // Worked in the western markets — Flanders (Bruges) and England (London).
    demandedAt: ["bruges", "london"],
  },
};

export const GOOD_IDS = Object.keys(GOODS) as GoodId[];
