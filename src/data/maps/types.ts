/**
 * Scripted map data. The Hanseatic World supplies
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
  /** Real boundary in [0,1] game space; one or more rings (islands/multipart), open (first vertex not repeated). When every region of a scripted map has this, the renderer draws these as province cells instead of Voronoi. */
  polygon?: Coord[][];
}

/** A historical realm that starts on the map, owning its home regions. */
export interface ScriptedFaction {
  name: string;
  /** Map colour (the realm the human plays is re-coloured to the player gold). */
  color: string;
  /** Region index (into `regions`) that is this realm's capital. */
  capital: number;
  /** Region indices this realm owns at game start (must include `capital`). */
  regions: number[];
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
  /** Starting realms; every region should belong to exactly one. The human
      plays one of these (chosen in setup, or picked from the seed). */
  factions: ScriptedFaction[];
  /**
   * Outer-world context: faded, non-interactive land beyond the play area (the
   * wider continent) that frames it so the map reads as a real place, not
   * floating islands. Polygons may extend past [0,1] to bleed off the edges;
   * optional labels name the distant lands ("THE RUS", "THE EMPIRE"…).
   */
  context?: {
    land: Coord[][];
    labels?: { text: string; x: number; y: number }[];
  };
}

import { HANSA_MAP } from "@/data/maps/hansa";

/** All scripted maps, by id. */
export const SCRIPTED_MAPS: Record<string, ScriptedMap> = {
  [HANSA_MAP.id]: HANSA_MAP,
};

/** Look up an authored map by id. */
export function scriptedMap(id: string | undefined | null): ScriptedMap | undefined {
  return id ? SCRIPTED_MAPS[id] : undefined;
}
