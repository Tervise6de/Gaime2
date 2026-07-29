import { describe, expect, it } from "vitest";
import { graphEdges, seaCrossingEdges, type GraphRegion } from "@/systems/mapview";
import { createGame } from "@/systems/turn";
import { HANSA_SEA_CROSSINGS } from "@/data/maps/hansa";

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

describe("seaCrossingEdges", () => {
  it("returns each water border once, in stable order", () => {
    const regions: GraphRegion[] = [
      { id: 2, adjacency: [0, 1], seaLinks: [0] },
      { id: 0, adjacency: [1, 2], seaLinks: [2, 1] },
      { id: 1, adjacency: [0, 2], seaLinks: [0] },
    ];
    expect(seaCrossingEdges(regions)).toEqual([[0, 1], [0, 2]]);
  });

  it("draws nothing for a map that makes no distinction", () => {
    const regions: GraphRegion[] = [
      { id: 0, adjacency: [1] },
      { id: 1, adjacency: [0] },
    ];
    // Empty is the caller's cue to fall back to its own coastline geometry.
    expect(seaCrossingEdges(regions)).toEqual([]);
  });

  it("never invents a link the simulation does not have", () => {
    const regions: GraphRegion[] = [
      // A crossing to a region it does not border, and one to a region that
      // does not exist: both would draw a line the sim cannot walk or ship.
      { id: 0, adjacency: [1], seaLinks: [1, 2, 99] },
      { id: 1, adjacency: [0], seaLinks: [0] },
      { id: 2, adjacency: [], seaLinks: [] },
    ];
    expect(seaCrossingEdges(regions)).toEqual([[0, 1]]);
  });

  it("ignores a region listing itself", () => {
    const regions: GraphRegion[] = [{ id: 0, adjacency: [0], seaLinks: [0] }];
    expect(seaCrossingEdges(regions)).toEqual([]);
  });

  it("leaves the simulation's arrays untouched", () => {
    const regions: GraphRegion[] = [
      { id: 0, adjacency: [1], seaLinks: [1] },
      { id: 1, adjacency: [0], seaLinks: [0] },
    ];
    const before = regions.map((r) => [[...r.adjacency], [...(r.seaLinks ?? [])]]);
    seaCrossingEdges(regions);
    expect(regions.map((r) => [r.adjacency, r.seaLinks])).toEqual(before);
  });

  it("matches the real board's crossings", () => {
    const g = createGame({ seed: 5 });
    const edges = seaCrossingEdges(g.regions);
    expect(edges.length).toBe(HANSA_SEA_CROSSINGS.length);
    for (const [a, b] of HANSA_SEA_CROSSINGS) {
      expect(edges).toContainEqual([Math.min(a, b), Math.max(a, b)]);
    }
  });
});
