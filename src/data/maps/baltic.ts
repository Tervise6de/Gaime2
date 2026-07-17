/**
 * The Baltic — a real-geography scenario (~900 AD onward). The Baltic Sea sits
 * in the centre; land wraps around it: Sweden to the west, Finland to the
 * north-east, the Livonian/Rus lands to the east, Prussia and Poland to the
 * south, Denmark to the south-west, with Gotland and Ösel in the sea. Regions
 * are real towns placed at roughly real positions.
 *
 * Coordinates are normalised [0,1], north up (y = 0 top). Authored by eye and
 * refined against the rendered map; not survey-accurate, but recognisably the
 * Baltic. Sea = anywhere not inside a landmass polygon.
 */

import type { ScriptedMap } from "@/data/maps/types";

export const BALTIC_MAP: ScriptedMap = {
  id: "baltic",
  name: "The Baltic",
  blurb: "The Baltic Sea and its shores — Sweden, Finland, the Livonian and Rus lands, Prussia, Poland and Denmark.",
  land: [
    // Sweden — a tall peninsula down the west, coast bulging east into the sea.
    [
      [0.14, 0.05], [0.24, 0.07], [0.27, 0.16], [0.24, 0.26], [0.30, 0.34],
      [0.29, 0.44], [0.33, 0.53], [0.28, 0.62], [0.18, 0.66], [0.10, 0.58],
      [0.06, 0.44], [0.05, 0.28], [0.08, 0.14],
    ],
    // Finland — across the north-east, above the Gulf of Finland.
    [
      [0.40, 0.06], [0.58, 0.03], [0.76, 0.05], [0.90, 0.12], [0.88, 0.22],
      [0.74, 0.27], [0.58, 0.26], [0.46, 0.20], [0.39, 0.13],
    ],
    // Livonia & Rus — the eastern wall (Estonia, Livonia, Lithuania, Novgorod).
    [
      [0.72, 0.33], [0.86, 0.32], [0.96, 0.42], [0.98, 0.58], [0.94, 0.74],
      [0.84, 0.86], [0.72, 0.84], [0.66, 0.72], [0.63, 0.58], [0.66, 0.44],
    ],
    // Prussia & Poland — the southern shore.
    [
      [0.26, 0.76], [0.42, 0.82], [0.58, 0.85], [0.70, 0.88], [0.68, 0.97],
      [0.48, 0.99], [0.30, 0.97], [0.20, 0.90], [0.20, 0.82],
    ],
    // Denmark — Jutland and the isles, south-west between Sweden and Poland.
    [
      [0.06, 0.66], [0.16, 0.68], [0.19, 0.78], [0.14, 0.87], [0.05, 0.85],
      [0.02, 0.75],
    ],
    // Gotland — a long, narrow island running north–south (Visby on its west).
    [
      [0.42, 0.50], [0.452, 0.515], [0.46, 0.55], [0.455, 0.59], [0.44, 0.625],
      [0.42, 0.635], [0.405, 0.61], [0.40, 0.575], [0.405, 0.54], [0.412, 0.516],
    ],
    // Saaremaa (Ösel) — an irregular island with the Sõrve peninsula to the
    // south-west (Arensburg on it).
    [
      [0.55, 0.455], [0.585, 0.443], [0.625, 0.448], [0.648, 0.47], [0.638, 0.495],
      [0.606, 0.505], [0.578, 0.516], [0.552, 0.528], [0.536, 0.508], [0.548, 0.486],
      [0.54, 0.468],
    ],
  ],
  // Outer-world context: the wider realms beyond the Baltic shore, faded and
  // uninteractive, framing the play area so it reads as the Baltic.
  context: {
    land: [
      // Norway & the Scandinavian mountains, west of Sweden.
      [[-0.35, -0.15], [0.05, -0.05], [0.02, 0.3], [0.05, 0.55], [-0.05, 0.75], [-0.3, 0.7], [-0.4, 0.25]],
      // Lappland and the far north, above Finland.
      [[0.2, -0.3], [1.15, -0.3], [1.2, 0.0], [0.85, 0.05], [0.5, 0.0], [0.3, 0.03]],
      // The Rus interior, east of Novgorod and Polotsk.
      [[0.98, 0.28], [1.4, 0.22], [1.45, 0.78], [1.0, 0.9], [0.97, 0.6]],
      // The Empire — the German and Polish interior, south of the shore.
      [[-0.1, 0.98], [1.1, 0.98], [1.15, 1.35], [-0.15, 1.35]],
    ],
    labels: [
      { text: "Norway", x: -0.07, y: 0.34 },
      { text: "Lappland", x: 0.5, y: -0.07 },
      { text: "The Rus", x: 1.09, y: 0.5 },
      { text: "The Empire", x: 0.5, y: 1.07 },
    ],
  },
  regions: [
    // Sweden (west)
    { name: "Sigtuna", x: 0.19, y: 0.22, terrain: "hills", resource: "iron" },
    { name: "Skara", x: 0.15, y: 0.36, terrain: "plains" },
    { name: "Kalmar", x: 0.22, y: 0.50, terrain: "coast" },
    { name: "Lund", x: 0.17, y: 0.60, terrain: "plains" },
    { name: "Birka", x: 0.24, y: 0.30, terrain: "forest" },
    // Finland (north-east)
    { name: "Åbo", x: 0.50, y: 0.14, terrain: "coast" },
    { name: "Tavastia", x: 0.66, y: 0.14, terrain: "forest" },
    { name: "Viborg", x: 0.80, y: 0.18, terrain: "hills" },
    // Estonia / Livonia / Rus (east)
    { name: "Reval", x: 0.72, y: 0.40, terrain: "coast" },
    { name: "Dorpat", x: 0.80, y: 0.46, terrain: "forest" },
    { name: "Narva", x: 0.90, y: 0.44, terrain: "hills" },
    { name: "Novgorod", x: 0.92, y: 0.60, terrain: "forest" },
    { name: "Pskov", x: 0.86, y: 0.54, terrain: "plains" },
    { name: "Riga", x: 0.72, y: 0.55, terrain: "coast" },
    { name: "Wenden", x: 0.79, y: 0.63, terrain: "hills" },
    { name: "Polotsk", x: 0.90, y: 0.72, terrain: "forest" },
    { name: "Vilna", x: 0.78, y: 0.76, terrain: "forest", resource: "horses" },
    { name: "Kovno", x: 0.70, y: 0.70, terrain: "plains", resource: "horses" },
    // Prussia / Poland (south)
    { name: "Memel", x: 0.34, y: 0.79, terrain: "coast" },
    { name: "Königsberg", x: 0.46, y: 0.84, terrain: "coast" },
    { name: "Danzig", x: 0.58, y: 0.87, terrain: "coast" },
    { name: "Thorn", x: 0.40, y: 0.91, terrain: "plains" },
    { name: "Kulm", x: 0.52, y: 0.94, terrain: "plains", resource: "horses" },
    { name: "Płock", x: 0.62, y: 0.93, terrain: "forest" },
    // Denmark (south-west)
    { name: "Roskilde", x: 0.11, y: 0.74, terrain: "coast" },
    { name: "Hedeby", x: 0.08, y: 0.82, terrain: "plains" },
    // Islands
    { name: "Visby", x: 0.43, y: 0.56, terrain: "coast" },
    { name: "Arensburg", x: 0.60, y: 0.49, terrain: "coast" },
  ],
  // Historical realms of the Baltic rim, each on its home ground. Ten seated
  // realms (of the full roster in `data/factions.ts`); every region belongs to
  // exactly one. Colours mirror the roster. (Region indices match the order above.)
  factions: [
    // Sweden — the Swedish heartland.
    { name: "Sweden", color: "#5b8bd0", capital: 0, regions: [0, 1, 2, 3, 4] },
    // Finland — Åbo, Tavastia and the Karelian marches.
    { name: "Finland", color: "#9ec96b", capital: 6, regions: [5, 6, 7] },
    // Estonia — Reval, Dorpat and the northern tribes.
    { name: "Estonia", color: "#6fc2d8", capital: 8, regions: [8, 9, 10] },
    // Novgorod — Pskov and the Rus north-east.
    { name: "Novgorod", color: "#b06ec0", capital: 11, regions: [11, 12, 15] },
    // Livonia — Riga and the Livonian coast.
    { name: "Livonia", color: "#4fb0a0", capital: 13, regions: [13, 14] },
    // Lithuania — the pagan grand duchy.
    { name: "Lithuania", color: "#6cae7a", capital: 16, regions: [16, 17] },
    // Prussia — the Baltic tribes of the southern shore.
    { name: "Prussia", color: "#8f86d8", capital: 19, regions: [18, 19] },
    // Poland — the Vistula lands.
    { name: "Poland", color: "#d64f7d", capital: 20, regions: [20, 21, 22, 23] },
    // Denmark — Jutland and the isles.
    { name: "Denmark", color: "#d0796e", capital: 24, regions: [24, 25] },
    // Gotland — Visby's Hansa and Ösel, the island realms.
    { name: "Gotland", color: "#9aa4b2", capital: 26, regions: [26, 27] },
  ],
};
