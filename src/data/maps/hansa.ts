/**
 * The Hanseatic World — a real-coastline scenario spanning the whole trading
 * world of the Hansa: the North Sea and the Baltic, from England and the cloth
 * towns of Flanders in the west, up through Norway and Denmark, along the
 * German and Wendish shore, across to Sweden, Gotland, Finland, and the Livonian,
 * Rus, Prussian and Polish lands in the east. Sixteen realms start on their own
 * ground; the League's future is theirs to make.
 *
 * The landmasses are traced from real geography (`hansa-coast.ts`, ten polygons
 * with the continent at index 0 and the isles after it). Regions are real towns
 * placed by the shared (lon,lat) → game projection
 *   x = (lon + 8) * 0.024390 ,  y = (66 - lat) * 0.044785
 * so every town sits where it truly is on the coast. Coordinates normalised
 * [0,1], north up (y = 0 top). Serialisable data only — no logic, no DOM.
 */

import type { ScriptedMap } from "@/data/maps/types";
import { HANSA_LAND } from "@/data/maps/hansa-coast";

export const HANSA_MAP: ScriptedMap = {
  id: "hansa",
  name: "The Hanseatic World",
  blurb:
    "The whole world of the Hansa on real coastlines — England, Flanders and the Low Countries, the German and Wendish shore, Denmark, Norway, Sweden, Gotland, and the Finnish, Livonian, Rus, Prussian and Polish Baltic.",
  land: HANSA_LAND,
  // Real towns at their true positions (projected from lon/lat). Author order is
  // the region id; the factions below own them by these indices.
  regions: [
    // England — the island kingdom (Great Britain)
    { name: "London", x: 0.1919, y: 0.6494, terrain: "coast" },
    { name: "Hull", x: 0.1868, y: 0.5491, terrain: "coast" },
    { name: "Boston", x: 0.1946, y: 0.5831, terrain: "coast" },
    { name: "York", x: 0.1688, y: 0.5392, terrain: "plains" },
    // Flanders — the cloth towns of the Low Countries
    { name: "Bruges", x: 0.2737, y: 0.6624, terrain: "coast" },
    { name: "Antwerp", x: 0.3024, y: 0.6619, terrain: "coast" },
    { name: "Kampen", x: 0.3393, y: 0.6024, terrain: "coast" },
    // Cologne — the Rhineland
    { name: "Cologne", x: 0.3649, y: 0.6745, terrain: "plains" },
    { name: "Dortmund", x: 0.3773, y: 0.6489, terrain: "hills", resource: "iron" },
    { name: "Münster", x: 0.3812, y: 0.6288, terrain: "plains" },
    // Saxony — the German inland (Magdeburg its seat)
    { name: "Bremen", x: 0.4098, y: 0.5786, terrain: "coast" },
    { name: "Lüneburg", x: 0.449, y: 0.571, terrain: "forest" },
    { name: "Braunschweig", x: 0.4517, y: 0.6149, terrain: "plains", resource: "horses" },
    { name: "Magdeburg", x: 0.4788, y: 0.6212, terrain: "plains" },
    // Lübeck — the Wendish coast, queen of the Hansa
    { name: "Hamburg", x: 0.439, y: 0.5576, terrain: "coast" },
    { name: "Lübeck", x: 0.4561, y: 0.5432, terrain: "coast" },
    { name: "Wismar", x: 0.4746, y: 0.5423, terrain: "coast" },
    { name: "Rostock", x: 0.4912, y: 0.5334, terrain: "coast" },
    { name: "Stralsund", x: 0.5144, y: 0.5235, terrain: "coast" },
    // Denmark — Jutland and the isles (Copenhagen on Zealand)
    { name: "Ribe", x: 0.4088, y: 0.4779, terrain: "coast" },
    { name: "Aalborg", x: 0.4371, y: 0.4008, terrain: "coast" },
    { name: "Copenhagen", x: 0.5, y: 0.4605, terrain: "coast" },
    { name: "Roskilde", x: 0.4898, y: 0.464, terrain: "plains" },
    // Norway — fjord and fishery
    { name: "Bergen", x: 0.3249, y: 0.2512, terrain: "coast", resource: "iron" },
    { name: "Oslo", x: 0.4573, y: 0.2727, terrain: "coast" },
    { name: "Trondheim", x: 0.4488, y: 0.1151, terrain: "coast" },
    // Sweden — the Swedish mainland (Stockholm its seat)
    { name: "Lund", x: 0.5168, y: 0.4613, terrain: "plains" },
    { name: "Kalmar", x: 0.5935, y: 0.4164, terrain: "coast" },
    { name: "Skara", x: 0.5229, y: 0.3408, terrain: "plains", resource: "iron" },
    { name: "Stockholm", x: 0.6358, y: 0.2987, terrain: "coast" },
    // Gotland — Visby's island Hansa
    { name: "Visby", x: 0.6412, y: 0.3744, terrain: "coast" },
    // Finland — the far northern shore
    { name: "Åbo", x: 0.7383, y: 0.2486, terrain: "coast" },
    { name: "Viborg", x: 0.8963, y: 0.2369, terrain: "hills" },
    // Estonia — the northern tribes (Arensburg on Saaremaa/Ösel)
    { name: "Reval", x: 0.7988, y: 0.2938, terrain: "coast" },
    { name: "Dorpat", x: 0.8468, y: 0.3413, terrain: "forest" },
    { name: "Narva", x: 0.8827, y: 0.2965, terrain: "hills" },
    { name: "Arensburg", x: 0.7434, y: 0.3471, terrain: "coast" },
    // Livonia — Riga and the Livonian coast
    { name: "Riga", x: 0.7829, y: 0.4053, terrain: "coast" },
    { name: "Wenden", x: 0.8115, y: 0.3892, terrain: "hills" },
    // Novgorod — the Rus north-east
    { name: "Novgorod", x: 0.9578, y: 0.335, terrain: "forest" },
    { name: "Pskov", x: 0.8861, y: 0.3663, terrain: "plains" },
    { name: "Polotsk", x: 0.8973, y: 0.4707, terrain: "forest" },
    // Lithuania — the pagan grand duchy
    { name: "Vilnius", x: 0.8117, y: 0.5065, terrain: "forest" },
    { name: "Kaunas", x: 0.778, y: 0.4971, terrain: "plains", resource: "horses" },
    { name: "Memel", x: 0.7107, y: 0.4608, terrain: "coast" },
    // Prussia — the Baltic shore
    { name: "Königsberg", x: 0.6951, y: 0.5061, terrain: "coast" },
    // Poland — the Vistula lands (Danzig its port)
    { name: "Danzig", x: 0.65, y: 0.5217, terrain: "coast" },
    { name: "Thorn", x: 0.6488, y: 0.5818, terrain: "plains" },
    { name: "Kulm", x: 0.6446, y: 0.5665, terrain: "plains", resource: "horses" },
  ],
  // Sixteen historical realms of the Hanseatic world, each on its home ground.
  // Every region belongs to exactly one; region indices match the order above.
  // Colours mirror the roster (data/factions.ts); the five western realms
  // (England, Flanders, Cologne, Saxony, Norway) are new roster entries.
  factions: [
    // West — England and the Low Countries / Rhineland
    { name: "England", color: "#d83a2f", capital: 0, regions: [0, 1, 2, 3] },
    { name: "Flanders", color: "#7d4fa8", capital: 4, regions: [4, 5, 6] },
    { name: "Cologne", color: "#2f8f7f", capital: 7, regions: [7, 8, 9] },
    { name: "Saxony", color: "#4e9b45", capital: 13, regions: [10, 11, 12, 13] },
    // The Wendish coast — the League's head
    { name: "Lübeck", color: "#b0273b", capital: 15, regions: [14, 15, 16, 17, 18] },
    // The North — Denmark, Norway, Sweden
    { name: "Denmark", color: "#d0796e", capital: 21, regions: [19, 20, 21, 22] },
    { name: "Norway", color: "#3877a0", capital: 24, regions: [23, 24, 25] },
    { name: "Sweden", color: "#5b8bd0", capital: 29, regions: [26, 27, 28, 29] },
    { name: "Gotland", color: "#9aa4b2", capital: 30, regions: [30] },
    // The East — Finland, the Livonian, Rus, Baltic and Polish lands
    { name: "Finland", color: "#9ec96b", capital: 31, regions: [31, 32] },
    { name: "Estonia", color: "#6fc2d8", capital: 33, regions: [33, 34, 35, 36] },
    { name: "Livonia", color: "#4fb0a0", capital: 37, regions: [37, 38] },
    { name: "Novgorod", color: "#b06ec0", capital: 39, regions: [39, 40, 41] },
    { name: "Lithuania", color: "#6cae7a", capital: 42, regions: [42, 43, 44] },
    { name: "Prussia", color: "#8f86d8", capital: 45, regions: [45] },
    { name: "Poland", color: "#d64f7d", capital: 46, regions: [46, 47, 48] },
  ],
};
