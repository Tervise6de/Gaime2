/**
 * Staples — what a *place* was known for, over and above what its ground gives.
 *
 * Goods are otherwise sourced from terrain alone (data/goods.ts): any coast
 * makes stockfish, any forest makes furs. That keeps the rules clean but it
 * empties the map of provenance — Bergen becomes an ordinary coast that happens
 * to be well placed, and the Scanian herring market, the Flemish cloth halls and
 * the Wendish export breweries are nowhere. The Hansa's whole trade was these
 * particular towns selling these particular things.
 *
 * A staple does two things: it lets a province source its good even where the
 * terrain would not, and it adds to what the province ships. Everything else
 * about trade is unchanged — a staple still needs a Kontor that demands it and a
 * lane to carry it.
 *
 * Every entry is a claim from `hansa times.md` §5 and §13. Serialisable content
 * only — no logic, no DOM; balancing is editing this table.
 */

import type { GoodId } from "@/data/goods";

export interface Staple {
  good: GoodId;
  /** Extra output beyond whatever the terrain already yields. */
  amount: number;
  /** Why this place, in one clause — shown in the region panel. */
  note: string;
}

/**
 * Province id → the trades that province is known for (data/maps/hansa-geo.ts
 * order). Only the Hansa board uses it; other maps simply have none.
 */
export const HANSA_STAPLES: Record<number, Staple[]> = {
  // --- the west: English wool, Flemish cloth ---------------------------------
  0: [{ good: "wool", amount: 2, note: "the wool staple — English fleece, the western trade's backbone" }],
  2: [{ good: "wool", amount: 2, note: "the Midland wool country" }],
  3: [{ good: "wool", amount: 2, note: "East Anglian fleece and the cloth towns" }],
  4: [{ good: "wool", amount: 2, note: "the Yorkshire clip" }],
  5: [{ good: "cloth", amount: 3, note: "the Flemish cloth halls — the great western clearing-house" }],
  6: [{ good: "cloth", amount: 2, note: "the Brabant weaving towns" }],
  8: [{ good: "cloth", amount: 2, note: "Holland cloth, and the Dutch shipping that came with it" }],

  // --- the Wendish shore: salt, beer, and the Elbe ---------------------------
  12: [{ good: "beer", amount: 3, note: "Lübeck's export breweries — hopped beer, the most valued in the north" }],
  13: [{ good: "beer", amount: 2, note: "Hamburg brewed for export before it did anything else" }],
  14: [{ good: "beer", amount: 2, note: "Rostock and Wismar, brewing for the Baltic trade" }],
  15: [{ good: "salt", amount: 3, note: "Lüneburg's salt — the white gold the whole herring trade ran on" }],

  // --- the north: stockfish, herring, and the ore mountains ------------------
  30: [{ good: "stockfish", amount: 3, note: "Bryggen — Lofoten cod dried and shipped to all Europe" }],
  32: [{ good: "stockfish", amount: 2, note: "the Lofoten fishery itself" }],
  26: [{ good: "herring", amount: 3, note: "the Scanian herring market — the greatest fair in the north" }],
  25: [{ good: "herring", amount: 2, note: "the Limfjord fishery" }],
  34: [{ good: "copper", amount: 2, note: "Falun and the copper mountain — Sweden's other metal" }],
  29: [{ good: "iron", amount: 2, note: "Norwegian mountain iron, worked since the Iron Age" }],

  // --- the east: grain, furs, wax, amber -------------------------------------
  66: [{ good: "grain", amount: 3, note: "Danzig, where Prussian and Polish grain met the sea" }],
  67: [{ good: "grain", amount: 2, note: "the Vistula grain lands above Thorn" }],
  69: [{ good: "grain", amount: 2, note: "the Polish granary" }],
  62: [{ good: "furs", amount: 2, note: "the Peterhof — the gateway to the Russian fur country" }, { good: "wax", amount: 2, note: "Russian hive-wax for candles and seals" }],
  63: [{ good: "furs", amount: 2, note: "the Ladoga fur road" }],
  68: [{ good: "amber", amount: 2, note: "the Samland shore — the Order's amber monopoly" }],
  39: [{ good: "wax", amount: 1, note: "Visby, the Gotland staple that handled everything" }],
};
