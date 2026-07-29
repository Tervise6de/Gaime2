/** Navigable sea lanes for the Hansa board.  Sea zones are data, not regions:
 * fleets keep their last coastal port as an anchor while sailing between them. */

export type SeaZoneId =
  | "norwegian_sea"
  | "north_sea"
  | "kattegat"
  | "baltic_sea"
  | "bothnia"
  | "gulf_of_finland";

export interface SeaZone {
  id: SeaZoneId;
  name: string;
  /** Map position in world units, matching the renderer's sea labels. */
  x: number;
  y: number;
  neighbors: SeaZoneId[];
  /** Ports and islands from which this zone can be entered or landed in. */
  coastalRegions: number[];
  /**
   * How deep this water reads on the chart, 0 (a shoal you could wade) → 1
   * (blue-water ocean), scaled from the real mean depths: the Kattegat ~23 m and
   * the Baltic basins ~40–55 m are shelf water, the North Sea ~95 m is deeper,
   * and the Norwegian Sea drops past 2,000 m. Presentation only — the renderer
   * tints the water by it; no rule reads it.
   */
  depth: number;
}

export const SEA_ZONE_IDS: readonly SeaZoneId[] = [
  "norwegian_sea",
  "north_sea",
  "kattegat",
  "baltic_sea",
  "bothnia",
  "gulf_of_finland",
];

export const SEA_ZONES: Record<SeaZoneId, SeaZone> = {
  norwegian_sea: {
    id: "norwegian_sea",
    name: "Norwegian Sea",
    x: 0.235,
    y: 0.15,
    neighbors: ["north_sea"],
    // Bergen and Hålogaland — the stockfish coast north of the Naze.
    coastalRegions: [30, 32],
    depth: 1,
  },
  north_sea: {
    id: "north_sea",
    name: "North Sea",
    x: 0.315,
    y: 0.6,
    neighbors: ["norwegian_sea", "kattegat"],
    // London on the Thames, Bruges and Holland on the Flemish shore, Frisia,
    // Bremen on the Weser and **Hamburg on the Elbe** — which the old table left
    // out of the North Sea entirely while listing it on the Kattegat. Oslo and
    // Bergen close the northern end.
    coastalRegions: [0, 5, 8, 11, 13, 16, 27, 30],
    depth: 0.42,
  },
  kattegat: {
    id: "kattegat",
    name: "Kattegat",
    x: 0.452,
    y: 0.485,
    neighbors: ["north_sea", "baltic_sea"],
    // The Danish waters proper: Zealand, Scania and the Norwegian shore of the
    // Skagerrak (Jutland and Funen are coastal in life but plains on this board,
    // and only coast provinces are ports). Lübeck sits on the Baltic and Hamburg
    // on the North Sea; neither belongs here, and Stockholm is 700 km away.
    coastalRegions: [23, 26, 27],
    depth: 0.08,
  },
  baltic_sea: {
    id: "baltic_sea",
    name: "Baltic Sea",
    x: 0.585,
    y: 0.63,
    neighbors: ["kattegat", "bothnia", "gulf_of_finland"],
    // The Wendish shore (Lübeck, Stettin), the Prussian and Livonian coast,
    // Gotland and Ösel, the Swedish east coast, and Scania on its Baltic side.
    // Hamburg is not on the Baltic and never was.
    coastalRegions: [12, 23, 26, 33, 39, 40, 47, 49, 50, 55, 57, 66, 68, 73],
    depth: 0.22,
  },
  bothnia: {
    id: "bothnia",
    name: "Gulf of Bothnia",
    x: 0.66,
    y: 0.27,
    neighbors: ["baltic_sea"],
    // The gulf between Sweden and Finland: Stockholm, the Finnish south-west,
    // and the Ostrobothnian shore at its head.
    coastalRegions: [33, 40, 46],
    depth: 0.13,
  },
  gulf_of_finland: {
    id: "gulf_of_finland",
    name: "Gulf of Finland",
    x: 0.815,
    y: 0.4,
    neighbors: ["baltic_sea"],
    // The gulf itself: the Finnish south coast and the Estonian north coast.
    // Riga, Ösel and the Wiek lie on the Gulf of Riga, out in the Baltic — the
    // old table had them here, several hundred kilometres from this water.
    coastalRegions: [40, 43, 47],
    depth: 0.12,
  },
};

export function seaZoneTouchesRegion(zoneId: SeaZoneId, regionId: number): boolean {
  return SEA_ZONES[zoneId].coastalRegions.includes(regionId);
}

