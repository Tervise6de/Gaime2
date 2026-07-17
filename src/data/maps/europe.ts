/**
 * Europe — a real-geography scenario at continental scale. The continental
 * mainland (France through the Rus lands and down the Balkans), with Iberia,
 * Italy, Scandinavia, and the British Isles as their own landmasses across the
 * surrounding seas (Atlantic, North Sea, Baltic, Mediterranean). Regions are
 * real cities at roughly real positions.
 *
 * Coordinates normalised [0,1], north up. Authored by eye and refined against
 * the rendered map — recognisably Europe, not survey-accurate.
 */

import type { ScriptedMap } from "@/data/maps/types";

export const EUROPE_MAP: ScriptedMap = {
  id: "europe",
  name: "Europe",
  blurb: "The whole continent — Iberia, France, the German and Italian lands, the Balkans and the Rus, with Britain and Scandinavia across the seas.",
  land: [
    // Continental mainland: France → Germany → Poland → Rus → Balkans, with
    // the Iberian and Italian peninsulas hanging off the south.
    [
      [0.20, 0.42], [0.30, 0.37], [0.42, 0.35], [0.54, 0.37], [0.66, 0.40],
      [0.82, 0.40], [0.93, 0.50], [0.92, 0.66], [0.86, 0.76], [0.78, 0.80],
      [0.70, 0.84], [0.66, 0.80], [0.60, 0.80], [0.54, 0.74], [0.52, 0.82],
      [0.50, 0.92], [0.44, 0.88], [0.42, 0.78], [0.40, 0.73], [0.34, 0.72],
      [0.26, 0.74], [0.18, 0.80], [0.11, 0.86], [0.06, 0.80], [0.10, 0.72],
      [0.18, 0.68], [0.15, 0.58], [0.16, 0.48],
    ],
    // Scandinavia — the Norwegian/Swedish peninsula across the North Sea/Baltic.
    [
      [0.40, 0.06], [0.50, 0.04], [0.58, 0.08], [0.60, 0.18], [0.54, 0.26],
      [0.46, 0.30], [0.40, 0.24], [0.36, 0.14],
    ],
    // Britain
    [[0.14, 0.24], [0.22, 0.22], [0.26, 0.30], [0.22, 0.38], [0.14, 0.36], [0.12, 0.30]],
    // Ireland
    [[0.02, 0.28], [0.09, 0.27], [0.10, 0.35], [0.04, 0.38], [0.01, 0.33]],
  ],
  islets: [
    // Sicily — the triangle off the toe of Italy.
    [[0.495, 0.925], [0.565, 0.945], [0.525, 0.99]],
    // Gotland (Baltic)
    [[0.60, 0.34], [0.63, 0.35], [0.62, 0.40], [0.59, 0.39]],
  ],
  regions: [
    // British Isles
    { name: "London", x: 0.19, y: 0.30, terrain: "plains" },
    { name: "York", x: 0.18, y: 0.26, terrain: "hills" },
    { name: "Dublin", x: 0.05, y: 0.32, terrain: "coast" },
    // Scandinavia
    { name: "Bergen", x: 0.42, y: 0.12, terrain: "mountains" },
    { name: "Oslo", x: 0.48, y: 0.16, terrain: "hills" },
    { name: "Uppsala", x: 0.54, y: 0.18, terrain: "forest", resource: "iron" },
    // Iberia
    { name: "León", x: 0.13, y: 0.72, terrain: "hills" },
    { name: "Lisbon", x: 0.08, y: 0.78, terrain: "coast" },
    { name: "Toledo", x: 0.16, y: 0.78, terrain: "plains" },
    { name: "Barcelona", x: 0.24, y: 0.72, terrain: "coast" },
    // France
    { name: "Bordeaux", x: 0.22, y: 0.62, terrain: "plains" },
    { name: "Paris", x: 0.28, y: 0.48, terrain: "plains" },
    { name: "Tours", x: 0.24, y: 0.55, terrain: "forest" },
    { name: "Marseille", x: 0.34, y: 0.68, terrain: "coast" },
    // Low Countries / Germany
    { name: "Cologne", x: 0.36, y: 0.46, terrain: "forest" },
    { name: "Hamburg", x: 0.40, y: 0.40, terrain: "coast" },
    { name: "Frankfurt", x: 0.40, y: 0.52, terrain: "hills", resource: "iron" },
    // Italy
    { name: "Milan", x: 0.42, y: 0.66, terrain: "plains" },
    { name: "Venice", x: 0.48, y: 0.64, terrain: "coast" },
    { name: "Rome", x: 0.46, y: 0.78, terrain: "hills" },
    { name: "Naples", x: 0.49, y: 0.85, terrain: "coast" },
    // Central Europe
    { name: "Prague", x: 0.48, y: 0.48, terrain: "forest" },
    { name: "Vienna", x: 0.54, y: 0.54, terrain: "plains" },
    { name: "Kraków", x: 0.58, y: 0.48, terrain: "hills", resource: "iron" },
    { name: "Gniezno", x: 0.56, y: 0.42, terrain: "plains" },
    // Balkans
    { name: "Buda", x: 0.62, y: 0.58, terrain: "plains", resource: "horses" },
    { name: "Belgrade", x: 0.66, y: 0.66, terrain: "hills" },
    { name: "Ragusa", x: 0.62, y: 0.76, terrain: "coast" },
    // Eastern Europe / Rus
    { name: "Kiev", x: 0.82, y: 0.60, terrain: "plains", resource: "horses" },
    { name: "Minsk", x: 0.78, y: 0.52, terrain: "forest" },
    { name: "Smolensk", x: 0.84, y: 0.50, terrain: "forest" },
    { name: "Novgorod", x: 0.85, y: 0.47, terrain: "forest" },
    { name: "Lwów", x: 0.72, y: 0.56, terrain: "plains" },
  ],
  // Great powers of high-medieval Europe, each on its home ground. Every region
  // belongs to exactly one. (Region indices match the order above.)
  factions: [
    { name: "England", color: "#d0796e", capital: 0, regions: [0, 1, 2] },
    { name: "Norway", color: "#4fb0a0", capital: 4, regions: [3, 4, 5] },
    { name: "Castile", color: "#cf7a4a", capital: 8, regions: [6, 7, 8, 9] },
    { name: "France", color: "#5b8bd0", capital: 11, regions: [10, 11, 12, 13] },
    { name: "Germany", color: "#8a8f9e", capital: 16, regions: [14, 15, 16] },
    { name: "Italy", color: "#b06ec0", capital: 19, regions: [17, 18, 19, 20] },
    { name: "Poland", color: "#d64f7d", capital: 23, regions: [21, 22, 23, 24] },
    { name: "Hungary", color: "#6cae7a", capital: 25, regions: [25, 26, 27] },
    { name: "Rus", color: "#7a86d8", capital: 28, regions: [28, 29, 30, 31, 32] },
  ],
  // Outer-world context beyond the continent, framing it.
  context: {
    land: [
      // The far north, above Scandinavia.
      [[0.2, -0.3], [1.1, -0.3], [1.15, 0.03], [0.6, 0.04], [0.38, 0.0]],
      // The Eurasian steppe, east of the Rus.
      [[0.95, 0.34], [1.4, 0.3], [1.45, 0.86], [1.0, 0.92], [0.94, 0.6]],
      // North Africa, across the Mediterranean.
      [[-0.15, 0.98], [0.62, 0.96], [0.66, 1.32], [-0.2, 1.32]],
      // Byzantium & Anatolia, south-east beyond the Balkans.
      [[0.66, 0.96], [1.3, 0.9], [1.35, 1.32], [0.66, 1.32]],
    ],
    labels: [
      { text: "The North", x: 0.72, y: -0.07 },
      { text: "The Steppe", x: 1.1, y: 0.55 },
      { text: "Africa", x: 0.24, y: 1.08 },
      { text: "Byzantium", x: 1.0, y: 1.04 },
    ],
  },
};
