import { describe, expect, it } from "vitest";
import { graphEdges, type GraphRegion } from "@/systems/mapview";

describe("strategy map graph projection", () => {
  it("deduplicates reciprocal links and ignores unknown nodes", () => {
    const regions: GraphRegion[] = [
      { id: 8, adjacency: [3, 3, 99] },
      { id: 3, adjacency: [8, 4] },
      { id: 4, adjacency: [3] },
    ];
    expect(graphEdges(regions)).toEqual([[3, 4], [3, 8]]);
  });

  it("is stable even when the input array is shuffled", () => {
    const a: GraphRegion[] = [
      { id: 0, adjacency: [2, 1] },
      { id: 1, adjacency: [0, 2] },
      { id: 2, adjacency: [0, 1] },
    ];
    const b = [a[2]!, a[0]!, a[1]!];
    expect(graphEdges(a)).toEqual(graphEdges(b));
    expect(graphEdges(a)).toEqual([[0, 1], [0, 2], [1, 2]]);
  });

  it("does not mutate simulation adjacency", () => {
    const regions: GraphRegion[] = [
      { id: 1, adjacency: [2, 0] },
      { id: 2, adjacency: [1] },
      { id: 0, adjacency: [1] },
    ];
    const before = regions.map((region) => [...region.adjacency]);
    graphEdges(regions);
    expect(regions.map((region) => region.adjacency)).toEqual(before);
  });
});
