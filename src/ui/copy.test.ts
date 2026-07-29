import { describe, it, expect } from "vitest";
import { embarkNote, landReachable, noRouteReason, waterNote } from "@/ui/copy";
import { createGame } from "@/systems/turn";
import { emptyUnits, landNeighbours, type Army, type GameState } from "@/systems/state";

const LONDON = 0;
const BRUGES = 5;
const VISBY = 39;
const SCANIA = 26;
const MERCIA = 2; // inland England
const THURINGIA = 19; // inland, nowhere near water

function board(): GameState {
  return createGame({ seed: 5 });
}

function stack(over: Partial<Army> = {}): Army {
  return { id: 900, ownerId: 0, regionId: LONDON, units: { ...emptyUnits(), infantry: 6 }, movesLeft: 1, ...over };
}

describe("what the region panel says about the water", () => {
  it("calls an island an island, and names the water it lies behind", () => {
    const g = board();
    const note = waterNote(g, VISBY)!;
    expect(note.island).toBe(true);
    expect(note.text).toMatch(/^An island\./);
    // It names the far shores, so the player can see where a landing could come from.
    for (const id of g.regions[VISBY]!.seaLinks ?? []) {
      expect(note.text).toContain(g.regions[id]!.name);
    }
    expect(note.text).toMatch(/warships/);
  });

  it("warns a province that has both roads and water, without calling it an island", () => {
    const g = board();
    const note = waterNote(g, SCANIA)!;
    expect(note.island).toBe(false);
    expect(note.text).toMatch(/^Across water:/);
    expect(note.text).not.toMatch(/island/);
    // The distinction is the point: Scania really does have a land border.
    expect(landNeighbours(g, SCANIA).length).toBeGreaterThan(0);
  });

  it("says nothing at all about a province with no water on any side", () => {
    const g = board();
    expect(waterNote(g, THURINGIA)).toBeNull();
    expect(waterNote(g, MERCIA)).toBeNull();
    expect(waterNote(g, 9999)).toBeNull();
  });

  it("agrees with the movement rule for every province on the board", () => {
    // The guard that matters: the copy is derived from the same two reads the
    // sim uses, so it cannot drift from the rule as the map changes.
    const g = board();
    for (const region of g.regions) {
      const note = waterNote(g, region.id);
      const wet = (region.seaLinks ?? []).length > 0;
      expect(note !== null).toBe(wet);
      if (note) expect(note.island).toBe(landNeighbours(g, region.id).length === 0);
    }
  });
});

describe("why an order was refused", () => {
  it("names the water when the border is water", () => {
    const g = board();
    const why = noRouteReason(g, stack({ regionId: LONDON }), BRUGES);
    expect(why).toContain(g.regions[BRUGES]!.name);
    expect(why).toMatch(/across open water/);
    expect(why).toMatch(/hull|warships/);
  });

  it("says a distant shore needs a ship, even where no border is shared", () => {
    const g = board();
    // Mercia is inland England; Visby is an island in the Baltic. No land road
    // exists, and they are nowhere near each other.
    const why = noRouteReason(g, stack({ regionId: MERCIA }), VISBY);
    expect(why).toMatch(/No land road/);
    expect(why).toContain("Visby");
  });

  it("tells a fleet it cannot put in inland", () => {
    const g = board();
    const fleet = stack({ regionId: LONDON, units: { ...emptyUnits(), war_cog: 2 } });
    expect(noRouteReason(g, fleet, MERCIA)).toMatch(/inland — a fleet can only put in at a port/);
  });

  it("tells a fleet at sea to sail to the right water first", () => {
    const g = board();
    const atSea = stack({
      regionId: LONDON,
      seaZoneId: "north_sea",
      units: { ...emptyUnits(), infantry: 4, war_cog: 2 },
    });
    // Visby is a Baltic island; the fleet is in the North Sea.
    expect(noRouteReason(g, atSea, VISBY)).toMatch(/not on North Sea/);
  });

  it("falls back to a plain refusal for an ordinary unreachable march", () => {
    const g = board();
    // Two English provinces with a land road between them: whatever stopped
    // this order, it was not the sea, and the copy must not claim it was.
    const why = noRouteReason(g, stack({ regionId: MERCIA }), LONDON);
    expect(why).not.toMatch(/water|hull|sail/i);
    expect(why).toContain("London");
  });

  it("never returns an empty or unpunctuated line", () => {
    const g = board();
    for (const dest of [LONDON, BRUGES, VISBY, SCANIA, MERCIA, THURINGIA, 9999]) {
      for (const army of [stack(), stack({ units: { ...emptyUnits(), war_cog: 1 } })]) {
        const why = noRouteReason(g, army, dest);
        expect(why.length).toBeGreaterThan(20);
        expect(why.trim().endsWith(".")).toBe(true);
      }
    }
  });
});

describe("what a stack on the shore is told", () => {
  it("offers the cheap answer when a cog can be raised where it stands", () => {
    const g = board();
    const note = embarkNote(g, stack({ regionId: LONDON }), true)!;
    expect(note.text).toMatch(/cannot cross open water/);
    expect(note.text).toMatch(/Raise a War-Cog here/);
  });

  it("sends it to a port when it cannot", () => {
    const g = board();
    const note = embarkNote(g, stack({ regionId: LONDON }), false)!;
    expect(note.text).toMatch(/Bring them to a port/);
  });

  it("says nothing to a fleet, a stack at sea, or a stack inland", () => {
    const g = board();
    expect(embarkNote(g, stack({ units: { ...emptyUnits(), war_cog: 1 } }), true)).toBeNull();
    expect(embarkNote(g, stack({ seaZoneId: "north_sea" }), true)).toBeNull();
    expect(embarkNote(g, stack({ regionId: THURINGIA }), true)).toBeNull();
  });
});

describe("landReachable", () => {
  it("walks the land graph and stops at the water", () => {
    const g = board();
    expect(landReachable(g, LONDON, MERCIA)).toBe(true); // both in England
    expect(landReachable(g, LONDON, BRUGES)).toBe(false); // the Channel
    expect(landReachable(g, VISBY, SCANIA)).toBe(false); // an island
    expect(landReachable(g, LONDON, LONDON)).toBe(true);
  });
});
