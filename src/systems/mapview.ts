/** Presentation-only map view helpers. Simulation adjacency remains authoritative. */

export type MapRenderMode = "province" | "strategy";

export interface GraphRegion {
  id: number;
  adjacency: readonly number[];
  /** Neighbours reached only across open water (systems/state.ts `seaLinks`). */
  seaLinks?: readonly number[];
}

/**
 * Return each valid adjacency pair once, in stable id order.
 *
 * The graph view consumes this projection of the simulation graph; it never
 * rewrites adjacency or creates a second map topology.
 */
export function graphEdges(regions: readonly GraphRegion[]): [number, number][] {
  const ids = new Set(regions.map((region) => region.id));
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  for (const region of regions) {
    for (const neighbour of region.adjacency) {
      if (!ids.has(neighbour) || neighbour === region.id) continue;
      const a = Math.min(region.id, neighbour);
      const b = Math.max(region.id, neighbour);
      const key = `${a}:${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([a, b]);
    }
  }
  edges.sort(([a1, b1], [a2, b2]) => a1 - a2 || b1 - b2);
  return edges;
}

/**
 * The borders that are open water, once each, in stable id order.
 *
 * The map draws these as dashed ferry lines, and the line carries a rule: trade
 * lanes cross it and armies cannot. So the geometry is derived from the game's
 * own `seaLinks` rather than re-inferred from the coastline — the two disagree
 * at a dozen borders, and the drawing must not be the one that is wrong.
 *
 * Returns an empty list for a map that draws no distinction, which is the
 * caller's cue to fall back to its own geometry.
 */
export function seaCrossingEdges(regions: readonly GraphRegion[]): [number, number][] {
  const ids = new Set(regions.map((region) => region.id));
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  for (const region of regions) {
    for (const neighbour of region.seaLinks ?? []) {
      if (!ids.has(neighbour) || neighbour === region.id) continue;
      // A crossing that is not also an adjacency would draw a line the sim does
      // not have; skip it rather than invent a link on the map.
      if (!region.adjacency.includes(neighbour)) continue;
      const a = Math.min(region.id, neighbour);
      const b = Math.max(region.id, neighbour);
      const key = `${a}:${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([a, b]);
    }
  }
  edges.sort(([a1, b1], [a2, b2]) => a1 - a2 || b1 - b2);
  return edges;
}
