/**
 * Kontore — the great Hanseatic trading posts (hansa-plan.md §6, §9).
 *
 * A Kontor is the far end of a trade route: goods carried to a Kontor that
 * *demands* them turn into gold (systems/trade.ts). The four historical Kontore
 * anchor the corners of the trading world — Novgorod in the Rus east, Bergen in
 * the Norwegian north, Bruges in the Flemish west, London across the Channel.
 *
 * Each names a host region on the Hansa map (region indices below), but this
 * table is map-independent content: the sim looks the host up by id and copes if
 * it is absent (a smaller/procedural map), so nothing here couples to hansa.ts.
 *
 * Serialisable content only — no logic, no DOM.
 */

import type { GoodId } from "@/data/goods";

export type KontorId = "novgorod" | "bergen" | "bruges" | "london";

export interface KontorDef {
  id: KontorId;
  name: string;
  /** Host region id on the Hansa map (London 0, Bruges 5, Bergen 30, Novgorod 62). */
  regionId: number;
  /** Goods this Kontor pays for — the inverse of GoodDef.demandedAt. */
  demands: GoodId[];
  /** Base League trade income the Kontor generates (used by the later League layer). */
  leagueIncome: number;
  blurb: string;
}

/**
 * The four Kontore. `demands` is kept consistent with data/goods.ts `demandedAt`
 * (goods.test.ts asserts the two agree). Host region ids match data/maps/hansa.ts.
 */
export const KONTORE: Record<KontorId, KontorDef> = {
  novgorod: {
    id: "novgorod",
    name: "Peterhof (Novgorod)",
    regionId: 62,
    demands: ["furs", "timber"],
    leagueIncome: 4,
    blurb: "The Peterhof on the Volkhov — the eastern terminus of the fur and timber road into the Rus.",
  },
  bergen: {
    id: "bergen",
    name: "Bryggen (Bergen)",
    regionId: 30,
    demands: ["grain"],
    leagueIncome: 2,
    blurb: "The Bryggen wharf — grain-poor Norway's lifeline and the staple of the northern fisheries.",
  },
  bruges: {
    id: "bruges",
    name: "Kontor of Bruges",
    regionId: 5,
    demands: ["grain", "iron"],
    leagueIncome: 5,
    blurb: "The great western market of Flanders, where Baltic wares meet the cloth of the Low Countries.",
  },
  london: {
    id: "london",
    name: "The Steelyard (London)",
    regionId: 0,
    demands: ["furs", "iron"],
    leagueIncome: 5,
    blurb: "The Steelyard on the Thames — the League's foothold in the English wool and cloth trade.",
  },
};

export const KONTOR_IDS = Object.keys(KONTORE) as KontorId[];
