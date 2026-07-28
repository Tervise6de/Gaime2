/**
 * The great rivers of the Hansa world — the roads that carried the trade before
 * the roads did. Grain came down the Vistula to Danzig, Rhenish wine down the
 * Rhine to the Low Countries, Russian furs and wax down the Düna to Riga; a
 * Kontor sat where a river met the sea.
 *
 * A river is stored as a chain of *region ids*, not as coordinates: the renderer
 * draws a smoothed course through those regions' centres. That keeps every
 * course on land by construction (each link is a real map adjacency, checked in
 * `rivers.test.ts`) and keeps the data honest — a river is "which provinces this
 * water runs through", which is exactly what the trade geography cares about.
 *
 * Presentation only: no rule reads a river. Hansa board only.
 */

export interface River {
  /** Era name, as a Hansa merchant would have written it. */
  name: string;
  /** Region ids from the headwaters down to the mouth. Each pair is adjacent. */
  course: number[];
  /** Relative water volume, 0.5 (a working stream) → 1 (a great artery). */
  flow: number;
}

export const RIVERS: River[] = [
  // England: the Thames, down from Mercia to the Steelyard at London.
  { name: "Thames", course: [2, 0], flow: 0.7 },
  // The Rhine: Mainz → Cologne → Guelders → the delta in Holland.
  { name: "Rhine", course: [21, 20, 9, 8], flow: 1 },
  // The Weser, out through Bremen.
  { name: "Weser", course: [15, 16], flow: 0.65 },
  // The Elbe, bending past Brunswick down to Hamburg.
  { name: "Elbe", course: [17, 15, 13], flow: 0.95 },
  // The Oder, out of Silesia to Stettin.
  { name: "Oder", course: [72, 73], flow: 0.8 },
  // The Vistula: Kraków → Masovia → Thorn → Danzig, the grain road.
  { name: "Vistula", course: [71, 70, 67, 66], flow: 1 },
  // The Memel (Nemunas), down past Kaunas to the Samogitian shore.
  { name: "Memel", course: [60, 59, 57], flow: 0.75 },
  // The Düna (Daugava), out of the Rus lands to Riga.
  { name: "Düna", course: [65, 58, 54, 55], flow: 0.85 },
  // The Kymi, through the Finnish lakeland to the Gulf.
  { name: "Kymi", course: [42, 43], flow: 0.55 },
  // The Volkhov, carrying Novgorod's trade north into Lake Ladoga.
  { name: "Volkhov", course: [62, 63], flow: 0.7 },
];
