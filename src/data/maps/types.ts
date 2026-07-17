/**
 * Scripted maps — hand-authored real-geography scenarios (the Baltic, Europe),
 * as an alternative to the procedural "random realm". A scripted map supplies
 * its own landmass outlines and fixed regions (real positions, names, terrain);
 * the sim derives movement adjacency from the Voronoi of those sites, and the
 * renderer clips its cells to the authored coastline instead of a generated
 * island. Serialisable data only — no logic, no DOM.
 *
 * Geography is land-around-sea, so each map is authored as SEPARATE landmass
 * blobs with open water between them (the sea and its gulfs). That fits the
 * existing multi-blob renderer (archipelago mode) and needs no polygon holes;
 * cross-water region pairs simply draw as sea lanes.
 */

import type { StrategicResource, TerrainId } from "@/data/terrain";

/** An authored coordinate, [x, y] in normalised [0,1] space (compact to type). */
export type Coord = [number, number];

export interface ScriptedRegion {
  name: string;
  /** Normalised position in [0,1] (x right, y down = north-up), inside a landmass. */
  x: number;
  y: number;
  terrain: TerrainId;
  /** Strategic resource on this region (else none). */
  resource?: StrategicResource | null;
}

export interface ScriptedMap {
  id: string;
  name: string;
  /** One-line description for the world picker. */
  blurb: string;
  /** Landmass outlines in normalised space (closed polygons; sea is the gaps). */
  land: Coord[][];
  /** Decorative offshore islets (never interactive). */
  islets?: Coord[][];
  /** Fixed regions, in author order (index === region id). */
  regions: ScriptedRegion[];
}

import { BALTIC_MAP } from "@/data/maps/baltic";
import { EUROPE_MAP } from "@/data/maps/europe";

/** All scripted maps, by id. */
export const SCRIPTED_MAPS: Record<string, ScriptedMap> = {
  [BALTIC_MAP.id]: BALTIC_MAP,
  [EUROPE_MAP.id]: EUROPE_MAP,
};

/** Look up a scripted map by id (undefined = procedural / random realm). */
export function scriptedMap(id: string | undefined | null): ScriptedMap | undefined {
  return id ? SCRIPTED_MAPS[id] : undefined;
}
