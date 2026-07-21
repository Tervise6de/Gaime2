import { describe, it, expect } from "vitest";
import { createGame } from "@/systems/turn";
import { seaCrossings, isSeaCrossing } from "@/systems/seaways";
import type { GameState } from "@/systems/state";

describe("seaways", () => {
  it("detects the Baltic/North-Sea open-water crossings on the hansa map", () => {
    const g = createGame({ seed: 1 });
    expect(seaCrossings(g).size).toBeGreaterThan(20);
  });

  it("classes every island (Gotland) link as a sea crossing", () => {
    const g = createGame({ seed: 1 });
    const gotland = g.regions.find((r) => r.name === "Visby")!;
    expect(gotland.adjacency.length).toBeGreaterThan(0);
    for (const nb of gotland.adjacency) {
      expect(isSeaCrossing(g, gotland.id, nb)).toBe(true);
    }
  });

  it("does not class a contiguous inland realm's borders as sea", () => {
    const g = createGame({ seed: 1 });
    const cologne = g.regions.find((r) => r.name === "Cologne")!;
    // An inland province has land neighbours — not every border is water.
    expect(cologne.adjacency.some((nb) => !isSeaCrossing(g, cologne.id, nb))).toBe(true);
  });

  it("has no sea crossings on a map without polygon data (procedural / fixtures)", () => {
    const fixture = {
      mapId: undefined,
      regions: [
        { id: 0, x: 0.5, y: 0.5, adjacency: [1] },
        { id: 1, x: 0.9, y: 0.5, adjacency: [0] },
      ],
    } as unknown as GameState;
    expect(seaCrossings(fixture).size).toBe(0);
    expect(isSeaCrossing(fixture, 0, 1)).toBe(false);
  });
});
