/**
 * Map-presentation style — the centralised knobs for the island-world look.
 *
 * Everything the territory view's framing, coastline, ocean and political ink
 * can be tuned with lives in this table, mirroring the data-driven content
 * philosophy: re-balancing the map's *look* is editing numbers here, not
 * renderer code. Serialisable constants only — no DOM, no logic.
 */

/** How the landmass is presented; chosen from map size + seed (island.ts). */
export type IslandArchetype = "small" | "medium" | "large" | "archipelago";

export interface IslandFrame {
  /** Fraction of the canvas width/height kept as ocean margin around the land. */
  marginX: number;
  marginY: number;
  /** Outward padding (normalised units) from the outer sites to the coastline. */
  coastPad: number;
  /** Decorative offshore islets to scatter around the landmass. */
  isletCount: number;
}

/**
 * Per-archetype framing: a small island floats in generous ocean; a large one
 * fills most of the view; the archipelago sits in between with many islets.
 */
export const ISLAND_FRAME: Record<IslandArchetype, IslandFrame> = {
  small: { marginX: 0.16, marginY: 0.17, coastPad: 0.085, isletCount: 6 },
  medium: { marginX: 0.12, marginY: 0.13, coastPad: 0.075, isletCount: 4 },
  large: { marginX: 0.085, marginY: 0.095, coastPad: 0.055, isletCount: 3 },
  archipelago: { marginX: 0.1, marginY: 0.11, coastPad: 0.06, isletCount: 7 },
};

/** Region-count ceilings: ≤ small → "small", ≤ medium → "medium", else "large". */
export const ARCHETYPE_REGION_LIMITS = { small: 18, medium: 26 } as const;

/** 1-in-N qualifying seeds present as an archipelago instead of one island. */
export const ARCHIPELAGO_ROLL = 4;
/** Minimum region count before an archipelago presentation is considered. */
export const ARCHIPELAGO_MIN_REGIONS = 20;

/** Coastline fractal: midpoint displacement relative to segment length. */
export const COAST_ROUGHNESS = 0.24;
/** Subdivision rounds applied to the coast outline. */
export const COAST_DETAIL = 3;
/** Longest outline segment (normalised) before resampling splits it. */
export const COAST_MAX_SEGMENT = 0.055;

/** Ocean & coastline palette (the terrain palette stays in data/terrain.ts). */
export const OCEAN = {
  /** Radial vignette centre/edge — the open water. */
  inner: "#141c28",
  outer: "#090c12",
  /** Land underlay colour and its drop shadow (under the terrain fills). */
  landBase: "#1b222c",
  shadow: "rgba(0, 0, 0, 0.55)",
  /** Shallow-water glow hugging the coastline (narrow bright + wide faint). */
  shallow: "rgba(116, 170, 206, 0.13)",
  shallowWide: "rgba(116, 170, 206, 0.07)",
  /** Coastline ink: dark outer line + pale inner highlight. */
  coastLine: "rgba(9, 11, 15, 0.9)",
  coastHighlight: "rgba(226, 216, 186, 0.2)",
  /** Offshore wave dashes and islet rock colours. */
  wave: "rgba(140, 180, 212, 0.14)",
  islet: "#232b35",
  isletEdge: "rgba(210, 220, 235, 0.12)",
  /** Dashed sea lane marking a cross-water adjacency (archipelago). */
  lane: "rgba(150, 185, 215, 0.3)",
} as const;
