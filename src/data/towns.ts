/**
 * The Hansa's towns — the League's actual members, on the map.
 *
 * A province on this board is a *region*, and the sixteen realms own all of
 * them from turn one. The Hanseatic League was not that: it was a league of
 * towns — somewhere between seventy and two hundred of them, most of them not
 * subjects of any of these realms in any sense a modern map would recognise, and
 * many of them (Lübeck, Hamburg, Bremen, Dortmund) imperial free cities
 * answering to nobody nearer than the Emperor. `hansa times.md` §3: "no state,
 * no standing army, no permanent navy, no common treasury, no written
 * constitution" — only the towns.
 *
 * The board cannot be redrawn to give each of them a province without redoing
 * the geometry, and a seventy-province Hansa would be a worse game besides. What
 * it can do is stop pretending they were not there. Every town below is real,
 * dated, and placed in the province that actually contains it — so Stralsund,
 * whose peace of 1370 is the League's defining moment, is on the map; so is
 * Lüneburg, whose salt the whole herring trade ran on; so is the Westphalian
 * group, which was a third of the League and had no ground here at all.
 *
 * They are counted, not simulated: a realm's standing in the League is read from
 * the Hansa towns it holds (systems/league.ts), which is how the Diet actually
 * worked — the towns voted, not the princes. Serialisable content only.
 */

/** The League's regional groupings — its "thirds", later "quarters". */
export type HansaQuarter = "wendish" | "westphalian" | "saxon" | "prussian" | "gotland" | "outside";

export const QUARTER_LABEL: Record<HansaQuarter, string> = {
  wendish: "Wendish",
  westphalian: "Westphalian–Rhenish",
  saxon: "Saxon",
  prussian: "Prussian–Livonian",
  gotland: "Gotland–Livonian",
  outside: "Outside the League",
};

export interface HansaTown {
  name: string;
  /** Province (data/maps/hansa-geo.ts index) this town sits in. */
  regionId: number;
  quarter: HansaQuarter;
  /**
   * Weight in the Diet: 3 for Lübeck, which carried the League and hosted its
   * Diet; 2 for the towns that led a quarter or a Kontor; 1 for the rest. A
   * crude stand-in for the real thing, which was precedence and money rather
   * than a vote count.
   */
  weight: number;
  /** One clause on why this town mattered. */
  note: string;
}

/**
 * The League's principal members. Not exhaustive — it never could be — but
 * every town that mattered to the story in `hansa times.md`.
 */
export const HANSA_TOWNS: readonly HansaTown[] = [
  // --- Wendish quarter: the League's core, and its brewers ------------------
  { name: "Lübeck", regionId: 12, quarter: "wendish", weight: 3, note: "the Queen of the Hansa — the Diet met here, and the League's law was its law" },
  { name: "Hamburg", regionId: 13, quarter: "wendish", weight: 2, note: "the Elbe mouth, and Lübeck's partner in the salt road from the start" },
  { name: "Wismar", regionId: 14, quarter: "wendish", weight: 1, note: "a Wendish brewing town of the first rank" },
  { name: "Rostock", regionId: 14, quarter: "wendish", weight: 1, note: "export breweries and a university of its own" },
  { name: "Stralsund", regionId: 14, quarter: "wendish", weight: 2, note: "where the peace of 1370 was signed — the League at its height" },
  { name: "Greifswald", regionId: 14, quarter: "wendish", weight: 1, note: "the youngest of the Wendish towns" },
  { name: "Stettin", regionId: 73, quarter: "wendish", weight: 1, note: "the Oder's port, Pomerania's outlet to the sea" },
  { name: "Lüneburg", regionId: 15, quarter: "saxon", weight: 2, note: "the salt town — the white gold the whole herring trade ran on" },

  // --- Saxon quarter --------------------------------------------------------
  { name: "Bremen", regionId: 16, quarter: "saxon", weight: 2, note: "the Weser port, in and out of the League as it suited her" },
  { name: "Brunswick", regionId: 15, quarter: "saxon", weight: 1, note: "the inland Saxon head, and a Brick-Gothic town to match" },
  { name: "Magdeburg", regionId: 17, quarter: "saxon", weight: 1, note: "the Elbe's inland market and a law-giving town" },
  { name: "Goslar", regionId: 15, quarter: "saxon", weight: 1, note: "the Rammelsberg silver and lead below it" },
  { name: "Erfurt", regionId: 19, quarter: "saxon", weight: 1, note: "the woad town on the road south" },

  // --- Westphalian–Rhenish quarter: a third of the League, and its west -----
  { name: "Cologne", regionId: 20, quarter: "westphalian", weight: 2, note: "the greatest German town, and the one that broke ranks with England in 1468" },
  { name: "Dortmund", regionId: 20, quarter: "westphalian", weight: 1, note: "a free imperial town at the head of the Westphalian group" },
  { name: "Soest", regionId: 20, quarter: "westphalian", weight: 1, note: "the Soester Fehde town, whose law travelled further than it did" },
  { name: "Münster", regionId: 16, quarter: "westphalian", weight: 1, note: "the Westphalian bishop's town, in the League regardless" },
  { name: "Osnabrück", regionId: 16, quarter: "westphalian", weight: 1, note: "on the linen road between the Rhine and the sea" },
  { name: "Deventer", regionId: 9, quarter: "westphalian", weight: 1, note: "an IJssel town — the Dutch end of the League, before the Dutch became rivals" },
  { name: "Kampen", regionId: 9, quarter: "westphalian", weight: 1, note: "the other IJssel port, and an early carrier of Bay salt" },
  { name: "Groningen", regionId: 11, quarter: "westphalian", weight: 1, note: "the Frisian market town" },

  // --- Prussian–Livonian quarter -------------------------------------------
  { name: "Danzig", regionId: 66, quarter: "prussian", weight: 2, note: "where Prussian and Polish grain met the sea — the League's greatest grain port" },
  { name: "Elbing", regionId: 66, quarter: "prussian", weight: 1, note: "the Order's own foundation on the Vistula lagoon" },
  { name: "Thorn", regionId: 67, quarter: "prussian", weight: 1, note: "the Vistula crossing, and where the Order's peace was signed twice" },
  { name: "Kulm", regionId: 67, quarter: "prussian", weight: 1, note: "Kulm law, which chartered half of Prussia" },
  { name: "Königsberg", regionId: 68, quarter: "prussian", weight: 1, note: "the Samland amber shore and the Order's later seat" },
  { name: "Braunsberg", regionId: 68, quarter: "prussian", weight: 1, note: "a small Warmian port with a full vote" },

  // --- Gotland–Livonian quarter --------------------------------------------
  { name: "Visby", regionId: 39, quarter: "gotland", weight: 2, note: "the Gotland staple that led the League before Lübeck did — sacked by Valdemar IV in 1361" },
  { name: "Riga", regionId: 55, quarter: "gotland", weight: 2, note: "the Daugava's port, and the Livonian head" },
  { name: "Reval", regionId: 47, quarter: "gotland", weight: 1, note: "the Estonian port on the Novgorod road" },
  { name: "Dorpat", regionId: 51, quarter: "gotland", weight: 1, note: "the inland Livonian town that watched the Russian trade" },
  { name: "Pernau", regionId: 49, quarter: "gotland", weight: 1, note: "the Gulf of Riga's other port" },

  // --- The Kontor towns: outside the League, and the point of it ------------
  { name: "London", regionId: 0, quarter: "outside", weight: 2, note: "the Steelyard — walled, self-governing, and expelled at last in 1597" },
  { name: "Bruges", regionId: 5, quarter: "outside", weight: 2, note: "the western clearing-house where merchants from all the known world met" },
  { name: "Bergen", regionId: 30, quarter: "outside", weight: 2, note: "Bryggen — the stockfish Kontor, and the only one whose houses still stand" },
  { name: "Novgorod", regionId: 62, quarter: "outside", weight: 2, note: "the Peterhof — the gateway to the Russian fur country, shut by Ivan III in 1494" },
];

/** Towns in one province. */
export function townsIn(regionId: number): HansaTown[] {
  return HANSA_TOWNS.filter((t) => t.regionId === regionId);
}

/**
 * Diet weight of the towns in a province — what holding it is worth in the
 * League's own reckoning, where the towns voted and the princes did not.
 */
export function townWeightIn(regionId: number): number {
  return townsIn(regionId).reduce((sum, t) => sum + t.weight, 0);
}

/** Total weight of every League town on the board (the denominator for a share). */
export const TOTAL_TOWN_WEIGHT = HANSA_TOWNS.reduce((sum, t) => sum + t.weight, 0);
