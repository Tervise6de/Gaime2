/**
 * The Hanseatic World — the whole trading world of the Hansa on real medieval
 * geography: England and the cloth towns of Flanders in the west, up through
 * Denmark and Norway, along the German and Wendish shore, across to Sweden,
 * Gotland, Finland, and the Estonian, Livonian, Rus, Prussian and Polish lands
 * in the east. Sixteen realms start on their own ground; the League is theirs to
 * form, join or break.
 *
 * The 74 provinces are Natural Earth admin-1 units dissolved into their
 * medieval regions and projected to game space (see hansa-geo.ts). Every province
 * carries its real border polygon, so the renderer draws organic province cells.
 * Serialisable data only — no logic, no DOM.
 */
import type { ScriptedMap } from "@/data/maps/types";
import { HANSA_PROVINCES, HANSA_LAND, HANSA_CONTEXT } from "@/data/maps/hansa-geo";

/**
 * Where the map's "borders" are actually open water.
 *
 * Adjacency is derived from the Voronoi of the province centroids with a link
 * cap of ~550 km, which is generous enough that Gotland ends up bordering
 * Danzig and London bordering Bruges. That is right for a *trade lane* — the
 * Hansa's goods crossed exactly those waters — and wrong for an army, which
 * used to be able to walk from Sweden to Prussia by way of Gotland without a
 * hull. In a game about a league whose whole power was the sea, the sea cost
 * nothing to cross.
 *
 * These are the crossings. They are authored rather than computed: measuring
 * how much of each centroid-to-centroid line falls on land gives a first draft,
 * but the two populations overlap badly (real crossings run 0.09–0.82 of the
 * line on land, real land borders 0.64–1.00), because a line between two inland
 * provinces can clip a lake and a line across the Channel can clip Kent. So the
 * measurement produced the candidate list and geography decided each one.
 *
 * The effect is the map the period had: England, Gotland, Ösel and Zealand are
 * islands, the Danish straits are straits, and the Baltic must be sailed.
 */
export const HANSA_SEA_CROSSINGS: [number, number][] = [
  // The Channel and the North Sea — England to the Low Countries and Frisia.
  [0, 5], [1, 5], [1, 7], [3, 5], [3, 8], [3, 11], [4, 11],
  // The German Bight and the Danish isles.
  [11, 24], [12, 23], [14, 23], [14, 26], [23, 24], [23, 25], [23, 26],
  // The Skagerrak and the Kattegat.
  [24, 28], [25, 26], [25, 28], [25, 36], [28, 36],
  // The southern Baltic — Scania and Småland to the Wendish and Prussian shore.
  [26, 66], [26, 73], [37, 66],
  // The Åland sea and the Bothnian approaches.
  [33, 40], [33, 41], [38, 41],
  // Gotland, an island in the middle of everything.
  [33, 39], [35, 39], [37, 39], [39, 50], [39, 52], [39, 57], [39, 66],
  // The Gulf of Finland and the Estonian islands.
  [33, 50], [40, 47], [40, 49], [40, 50], [43, 47], [43, 48], [49, 50], [49, 52], [50, 52],
  // The Bay of Gdańsk.
  [57, 66],
];

export const HANSA_MAP: ScriptedMap = {
  id: "hansa",
  name: "The Hanseatic World",
  blurb:
    "The whole world of the Hansa on real medieval geography — England, Flanders and the Low Countries, the German and Wendish shore, Denmark, Norway, Sweden, Gotland, and the Finnish, Estonian, Livonian, Rus, Prussian and Polish Baltic.",
  land: HANSA_LAND,
  regions: HANSA_PROVINCES,
  context: HANSA_CONTEXT,
  seaCrossings: HANSA_SEA_CROSSINGS,
  // Sixteen historical realms of the Hanseatic world, each on its home ground.
  // Every province belongs to exactly one; indices match hansa-geo.ts order.
  factions: [
    { name: "England", color: "#d83a2f", capital: 0, regions: [0, 1, 2, 3, 4] },
    { name: "Flanders", color: "#7d4fa8", capital: 5, regions: [5, 6, 7, 8, 9, 10, 11] },
    { name: "Lübeck", color: "#b0273b", capital: 12, regions: [12, 13, 14] },
    { name: "Saxony", color: "#4e9b45", capital: 15, regions: [15, 16, 17, 18, 19] },
    { name: "Cologne", color: "#2f8f7f", capital: 20, regions: [20, 21, 22] },
    { name: "Denmark", color: "#d0796e", capital: 23, regions: [23, 24, 25, 26] },
    { name: "Norway", color: "#3877a0", capital: 30, regions: [27, 28, 29, 30, 31, 32] },
    { name: "Sweden", color: "#5b8bd0", capital: 33, regions: [33, 34, 35, 36, 37, 38] },
    { name: "Gotland", color: "#9aa4b2", capital: 39, regions: [39] },
    { name: "Finland", color: "#9ec96b", capital: 40, regions: [40, 41, 42, 43, 44, 45, 46] },
    { name: "Estonia", color: "#6fc2d8", capital: 47, regions: [47, 48, 49, 50, 51] },
    { name: "Livonia", color: "#4fb0a0", capital: 55, regions: [52, 53, 54, 55, 56] },
    { name: "Lithuania", color: "#6cae7a", capital: 60, regions: [57, 58, 59, 60, 61] },
    { name: "Novgorod", color: "#b06ec0", capital: 62, regions: [62, 63, 64, 65] },
    { name: "Prussia", color: "#8f86d8", capital: 66, regions: [66, 67, 68] },
    { name: "Poland", color: "#d64f7d", capital: 71, regions: [69, 70, 71, 72, 73] },
  ],
};
