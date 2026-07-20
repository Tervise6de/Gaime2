/**
 * Wares — the era commodities that ARE the economy (docs/game-design.md
 * "Resources — the Wares economy").
 *
 * The old abstract "Materials" resource is retired. In its place the game runs a
 * single unified layer of ~15 Hanseatic wares (grounded in `hansa times.md`
 * §5/§13). A ware is produced regionally, stockpiled per nation
 * (`Nation.wares`), and either **consumed** to meet a need (build / arms / food)
 * or **traded** to a Kontor that demands it for gold (systems/trade.ts).
 *
 * Each ware carries a `roles` tag driving consumption and UI grouping:
 *   - build   — construction & shipbuilding (timber, naval stores, brick, iron)
 *   - arms    — recruitment beyond gold (iron, copper)
 *   - food    — feeds population (grain, herring, stockfish, beer, honey)
 *   - luxury  — high-value export, little domestic use (furs, wax, amber, cloth)
 *   - industry— an input that gates other chains (salt preserves fish — R3)
 * Most wares are multi-role: iron builds AND arms AND trades; grain feeds AND
 * trades. A ware's `value`/`demandedAt` are the trade view (kept consistent with
 * data/kontore.ts `demands`; goods.test.ts asserts the two never drift).
 *
 * Serialisable content only — no logic, no DOM. Balancing is editing this table.
 */

import type { StrategicResource, TerrainId } from "@/data/terrain";
import type { KontorId } from "@/data/kontore";

export type GoodId =
  | "grain"
  | "herring"
  | "stockfish"
  | "beer"
  | "timber"
  | "naval_stores"
  | "brick"
  | "iron"
  | "copper"
  | "salt"
  | "furs"
  | "wax"
  | "amber"
  | "cloth"
  | "honey";

/** What a ware is used for (drives consumption and the wares-ledger grouping). */
export type WareRole = "build" | "arms" | "food" | "luxury" | "industry";

/**
 * What lets a region source a ware: a matching terrain (any of `terrain`) and/or
 * the presence of a strategic `resource`. `baseOutput` is the quantity a
 * qualifying region yields per turn before its unrest penalty is applied.
 */
export interface GoodSource {
  /** Terrains that source this ware (a region matching any one qualifies). */
  terrain?: TerrainId[];
  /** Strategic resource that sources this ware, if any. */
  resource?: StrategicResource;
  /** Units of the ware a qualifying region produces (pre-unrest, pre-multiplier). */
  baseOutput: number;
}

export interface GoodDef {
  id: GoodId;
  name: string;
  /** Emoji used by the trade UI and the wares ledger. */
  glyph: string;
  /** What the ware is used for — consumption + UI grouping. */
  roles: WareRole[];
  /** Gold each unit fetches at a demanding Kontor (before distance/scarcity). */
  value: number;
  /** Where the ware comes from (terrain / resource). */
  source: GoodSource;
  /** Kontore that pay for this ware — the inverse of KontorDef.demands. */
  demandedAt: KontorId[];
}

/**
 * The ~15 Hanseatic wares. Ordered raw-staples → build → metals → luxuries so the
 * wares ledger and `regionGoodOutput` (which walks GOOD_IDS) read sensibly.
 * `value`/`demandedAt` are kept consistent with data/kontore.ts `demands`.
 * Numbers are illustrative starting values for tuning (balance pass is R2).
 */
export const GOODS: Record<GoodId, GoodDef> = {
  grain: {
    id: "grain",
    name: "Grain",
    glyph: "🌾",
    roles: ["food"],
    value: 2,
    source: { terrain: ["plains"], baseOutput: 3 },
    // Grain-poor Norway (Bergen) and the crowded Low Countries (Bruges) buy Baltic grain.
    demandedAt: ["bergen", "bruges"],
  },
  herring: {
    id: "herring",
    name: "Herring",
    glyph: "🐟",
    roles: ["food"],
    value: 3,
    source: { terrain: ["coast"], baseOutput: 3 },
    // Salted herring, distributed west through Bruges and London.
    demandedAt: ["bruges", "london"],
  },
  stockfish: {
    id: "stockfish",
    name: "Stockfish",
    glyph: "🐠",
    roles: ["food"],
    value: 3,
    source: { terrain: ["coast"], baseOutput: 2 },
    // Dried cod from the northern coasts, landed at Bergen and sold Europe-wide.
    demandedAt: ["bruges", "london"],
  },
  beer: {
    id: "beer",
    name: "Beer",
    glyph: "🍺",
    roles: ["food", "luxury"],
    value: 3,
    source: { terrain: ["plains"], baseOutput: 2 },
    // Wendish hopped beer, shipped to the grain-poor north and east (Bergen, Novgorod).
    demandedAt: ["bergen", "novgorod"],
  },
  timber: {
    id: "timber",
    name: "Timber",
    glyph: "🪵",
    roles: ["build"],
    value: 2,
    source: { terrain: ["forest"], baseOutput: 3 },
    // The eastern forest road: timber gathered and traded through Novgorod.
    demandedAt: ["novgorod"],
  },
  naval_stores: {
    id: "naval_stores",
    name: "Naval stores",
    glyph: "🛢️",
    roles: ["build"],
    value: 3,
    source: { terrain: ["coast"], baseOutput: 2 },
    // Pitch, tar and hemp from Baltic pine and shore — the sinews of shipbuilding.
    demandedAt: ["london", "bruges"],
  },
  brick: {
    id: "brick",
    name: "Brick",
    glyph: "🧱",
    roles: ["build"],
    value: 2,
    source: { terrain: ["hills"], baseOutput: 2 },
    // Fired-clay Backstein from the clay hills — the Baltic plain's building stone;
    // even ships it to stone-poor Norway (Bergen).
    demandedAt: ["bergen"],
  },
  iron: {
    id: "iron",
    name: "Iron",
    glyph: "⚒️",
    roles: ["build", "arms"],
    value: 3,
    source: { resource: "iron", baseOutput: 2 },
    // Worked in the western markets — Flanders (Bruges) and England (London).
    demandedAt: ["bruges", "london"],
  },
  copper: {
    id: "copper",
    name: "Copper",
    glyph: "🟤",
    roles: ["arms", "luxury"],
    value: 5,
    // Mined, not gathered: bare mountains yield copper only once a Mine works it
    // (data/buildings.ts). Cast into ordnance and sold as a luxury metal (Falun).
    source: { baseOutput: 1 },
    demandedAt: ["bruges", "bergen"],
  },
  salt: {
    id: "salt",
    name: "Salt",
    glyph: "🧂",
    roles: ["industry"],
    value: 4,
    source: { resource: "salt", baseOutput: 3 },
    // The "white gold" preserves fish — bought where the fisheries land (Bergen)
    // and the great western market (Bruges).
    demandedAt: ["bergen", "bruges"],
  },
  furs: {
    id: "furs",
    name: "Furs",
    glyph: "🦫",
    roles: ["luxury"],
    value: 5,
    source: { terrain: ["forest"], baseOutput: 1 },
    // The great fur emporium (Novgorod) and the luxury market at London.
    demandedAt: ["novgorod", "london"],
  },
  wax: {
    id: "wax",
    name: "Wax",
    glyph: "🕯️",
    roles: ["luxury"],
    value: 5,
    source: { terrain: ["forest"], baseOutput: 1 },
    // Russian and Polish hive-wax for candles and seals — a western luxury import.
    demandedAt: ["bruges", "london"],
  },
  amber: {
    id: "amber",
    name: "Amber",
    glyph: "🟠",
    roles: ["luxury"],
    value: 6,
    source: { resource: "amber", baseOutput: 1 },
    // The Baltic luxury — sold into the western markets at London and Bruges.
    demandedAt: ["london", "bruges"],
  },
  cloth: {
    id: "cloth",
    name: "Cloth",
    glyph: "🧵",
    roles: ["luxury"],
    value: 6,
    source: { terrain: ["coast"], baseOutput: 1 },
    // Woven in the coastal cloth-towns — the great manufacture, sold to the
    // grain-poor north and east (Bergen, Novgorod). (R4: refined from wool.)
    demandedAt: ["bergen", "novgorod"],
  },
  honey: {
    id: "honey",
    name: "Honey",
    glyph: "🍯",
    roles: ["food", "luxury"],
    value: 3,
    source: { terrain: ["forest"], baseOutput: 1 },
    // Forest honey and mead-stock from the eastern woods — a sweet western import.
    demandedAt: ["bruges", "bergen"],
  },
};

export const GOOD_IDS = Object.keys(GOODS) as GoodId[];

/** The wares that carry a given role, in GOOD_IDS order (for consumption/UI). */
export function waresWithRole(role: WareRole): GoodId[] {
  return GOOD_IDS.filter((id) => GOODS[id].roles.includes(role));
}
