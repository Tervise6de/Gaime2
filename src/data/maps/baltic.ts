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
    // Gotland — inhabited island in the middle of the sea (Visby).
    [[0.40, 0.51], [0.47, 0.52], [0.46, 0.61], [0.40, 0.62], [0.37, 0.56]],
    // Ösel / Saaremaa — inhabited island off the Livonian coast (Arensburg).
    [[0.55, 0.45], [0.64, 0.45], [0.64, 0.53], [0.56, 0.54], [0.53, 0.49]],
  ],
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
};
