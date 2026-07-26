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
    coastalRegions: [27, 30, 32],
  },
  north_sea: {
    id: "north_sea",
    name: "North Sea",
    x: 0.315,
    y: 0.6,
    neighbors: ["norwegian_sea", "kattegat"],
    coastalRegions: [0, 5, 8, 11, 16, 27, 30],
  },
  kattegat: {
    id: "kattegat",
    name: "Kattegat",
    x: 0.452,
    y: 0.485,
    neighbors: ["north_sea", "baltic_sea"],
    coastalRegions: [12, 13, 23, 26, 27, 33],
  },
  baltic_sea: {
    id: "baltic_sea",
    name: "Baltic Sea",
    x: 0.585,
    y: 0.63,
    neighbors: ["kattegat", "bothnia", "gulf_of_finland"],
    coastalRegions: [12, 13, 23, 26, 33, 39, 40, 43, 47, 49, 50, 55, 57, 66, 68, 73],
  },
  bothnia: {
    id: "bothnia",
    name: "Gulf of Bothnia",
    x: 0.66,
    y: 0.27,
    neighbors: ["baltic_sea"],
    coastalRegions: [33, 40, 46],
  },
  gulf_of_finland: {
    id: "gulf_of_finland",
    name: "Gulf of Finland",
    x: 0.815,
    y: 0.4,
    neighbors: ["baltic_sea"],
    coastalRegions: [40, 43, 47, 49, 50, 55],
  },
};

export function seaZoneTouchesRegion(zoneId: SeaZoneId, regionId: number): boolean {
  return SEA_ZONES[zoneId].coastalRegions.includes(regionId);
}

