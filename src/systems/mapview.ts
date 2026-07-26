/** Presentation-only map view helpers. Simulation adjacency remains authoritative. */

export type MapRenderMode = "province" | "strategy";

export interface GraphRegion {
  id: number;
  adjacency: readonly number[];
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
