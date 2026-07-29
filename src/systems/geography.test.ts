import { describe, it, expect } from "vitest";
import { createGame } from "@/systems/turn";
import { moveArmy, sailToSeaZone, reachableRegions, armyIsFleet } from "@/systems/military";
import { laneFor, regionSources, regionGoodOutput, goodTradeValue } from "@/systems/trade";
import { leagueLeader, townWeightHeldBy } from "@/systems/league";
import { HANSA_SEA_CROSSINGS } from "@/data/maps/hansa";
import { HANSA_TOWNS } from "@/data/towns";
import { SEA_ZONES } from "@/data/sea";
import { emptyUnits, isSeaCrossing, landNeighbours, type GameState } from "@/systems/state";

const LONDON = 0;
const BRUGES = 5;
const HAMBURG = 13;
const LUBECK = 12;
const BERGEN = 30;
const SCANIA = 26;
const BERGSLAGEN = 34;
const VISBY = 39;
const ZEALAND = 23;
const OSEL = 50;

function board(): GameState {
  return createGame({ seed: 5 });
}

/** Connected components of the graph an army can actually walk. */
function landComponents(state: GameState): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const r of state.regions) {
    if (seen.has(r.id)) continue;
    const comp: number[] = [];
    const stack = [r.id];
    seen.add(r.id);
    while (stack.length) {
      const n = stack.pop()!;
      comp.push(n);
      for (const nb of landNeighbours(state, n)) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
    }
    out.push(comp);
  }
  return out;
}

describe("the sea is an obstacle", () => {
  it("makes islands of the islands, and leaves the mainland whole", () => {
    const g = board();
    const comps = landComponents(g).sort((a, b) => b.length - a.length);
    // One continent, and four places you can only reach by ship.
    expect(comps.length).toBe(5);
    expect(comps[0]!.length).toBeGreaterThan(60);
    const islands = comps.slice(1).map((c) => c.slice().sort((a, b) => a - b));
    expect(islands).toContainEqual([VISBY]);
    expect(islands).toContainEqual([ZEALAND]);
    expect(islands).toContainEqual([OSEL]);
    // ...and England, whole but cut off.
    expect(islands.some((c) => c.includes(LONDON) && c.length === 5)).toBe(true);
  });

  it("gives the region panel what it needs to say 'island' or 'across water'", () => {
    const g = board();
    // The panel picks its wording from exactly these two reads, so pin them:
    // no land road at all → "An island"; some land road → "Across water: …".
    for (const island of [VISBY, ZEALAND, OSEL]) {
      expect(landNeighbours(g, island).length).toBe(0);
      expect((g.regions[island]!.seaLinks ?? []).length).toBeGreaterThan(0);
    }
    // A coastal province with both: Scania keeps its Swedish land border and
    // still has water between it and Zealand, Danzig and Stettin.
    expect(landNeighbours(g, SCANIA).length).toBeGreaterThan(0);
    expect((g.regions[SCANIA]!.seaLinks ?? []).length).toBeGreaterThan(0);
    // ...and an inland province has nothing to say at all.
    const inland = g.regions.find((r) => r.terrain === "forest" && (r.seaLinks?.length ?? 0) === 0)!;
    expect(inland.seaLinks ?? []).toEqual([]);
  });

  it("refuses a march over water, and still lets a fleet sail it", () => {
    const g = board();
    expect(g.regions[LONDON]!.adjacency).toContain(BRUGES); // still neighbours
    expect(isSeaCrossing(g, LONDON, BRUGES)).toBe(true);

    const soldiers: GameState = {
      ...g,
      armies: [{ id: 900, ownerId: g.regions[LONDON]!.ownerId!, regionId: LONDON, units: { ...emptyUnits(), infantry: 6 }, movesLeft: 1 }],
    };
    // The Channel is not a road.
    expect(moveArmy(soldiers, 900, BRUGES)).toBe(soldiers);
    expect(reachableRegions(soldiers, soldiers.armies[0]!)).not.toContain(BRUGES);

    // A hull, on the other hand, sails — that is the whole point of a hull.
    const fleet: GameState = {
      ...g,
      armies: [{ id: 901, ownerId: g.regions[LONDON]!.ownerId!, regionId: LONDON, units: { ...emptyUnits(), war_cog: 2 }, movesLeft: 1 }],
    };
    expect(armyIsFleet(fleet.armies[0]!.units)).toBe(true);
    const sailed = sailToSeaZone(fleet, 901, "north_sea");
    expect(sailed.armies[0]!.seaZoneId).toBe("north_sea");
  });

  it("lets a loaded stack land where it could not march", () => {
    const g = board();
    const owner = g.regions[BRUGES]!.ownerId!;
    // Soldiers and hulls in one stack, standing off London in the North Sea.
    const invasion: GameState = {
      ...g,
      regions: g.regions.map((r) => (r.id === LONDON ? { ...r, fortification: 0 } : r)),
      armies: [
        {
          id: 902,
          ownerId: owner,
          regionId: BRUGES,
          seaZoneId: "north_sea",
          units: { ...emptyUnits(), infantry: 12, war_cog: 2 },
          movesLeft: 1,
        },
      ],
      treaties: { ...g.treaties, [`${Math.min(owner, g.regions[LONDON]!.ownerId!)}-${Math.max(owner, g.regions[LONDON]!.ownerId!)}`]: "war" },
    };
    expect(SEA_ZONES.north_sea.coastalRegions).toContain(LONDON);
    const landed = moveArmy(invasion, 902, LONDON);
    expect(landed).not.toBe(invasion); // the landing happened
  });

  it("still carries trade over the water — a lane is a ship, not a road", () => {
    const g = board();
    // Every authored crossing is a real adjacency, or it would be inert.
    for (const [a, b] of HANSA_SEA_CROSSINGS) {
      expect(g.regions[a]!.adjacency).toContain(b);
      expect(isSeaCrossing(g, a, b)).toBe(true);
      expect(isSeaCrossing(g, b, a)).toBe(true);
    }
    // ...and a Baltic province can still run a route to a Kontor across the sea.
    expect(laneFor(g, VISBY, "london").length).toBeGreaterThan(0);
    expect(laneFor(g, VISBY, "bruges").length).toBeGreaterThan(0);
  });
});

describe("the sea zones say where the water is", () => {
  it("puts Hamburg on the North Sea and keeps Lübeck out of the Kattegat", () => {
    // The Elbe mouth is a North Sea port and always was; the old table had it
    // on the Kattegat and nowhere near the North Sea.
    expect(SEA_ZONES.north_sea.coastalRegions).toContain(HAMBURG);
    expect(SEA_ZONES.kattegat.coastalRegions).not.toContain(HAMBURG);
    // Lübeck is on the Baltic, 200 km from the Kattegat.
    expect(SEA_ZONES.baltic_sea.coastalRegions).toContain(LUBECK);
    expect(SEA_ZONES.kattegat.coastalRegions).not.toContain(LUBECK);
    // Riga and Ösel are in the Gulf of Riga, not the Gulf of Finland.
    expect(SEA_ZONES.gulf_of_finland.coastalRegions).not.toContain(55);
    expect(SEA_ZONES.gulf_of_finland.coastalRegions).not.toContain(OSEL);
    expect(SEA_ZONES.baltic_sea.coastalRegions).toContain(55);
  });

  it("lists only ports that exist and are coastal", () => {
    const g = board();
    for (const zone of Object.values(SEA_ZONES)) {
      for (const id of zone.coastalRegions) {
        expect(g.regions[id]).toBeDefined();
        expect(g.regions[id]!.terrain).toBe("coast");
      }
    }
  });
});

describe("places carry their trades", () => {
  it("gives Bergen its stockfish and Scania its herring, over and above the coast", () => {
    const g = board();
    const bergen = g.regions[BERGEN]!;
    const scania = g.regions[SCANIA]!;
    expect(bergen.staples?.some((s) => s.good === "stockfish")).toBe(true);
    expect(scania.staples?.some((s) => s.good === "herring")).toBe(true);
    // A staple is *more* than the terrain gives, not merely the same thing.
    const plainCoast = g.regions.find((r) => r.terrain === "coast" && !r.staples?.length)!;
    const bergenFish = regionGoodOutput(bergen).find((o) => o.good === "stockfish")!.amount;
    const plainFish = regionGoodOutput(plainCoast).find((o) => o.good === "stockfish")!.amount;
    expect(bergenFish).toBeGreaterThan(plainFish);
  });

  it("lets a place source what its ground never would", () => {
    const g = board();
    // Falun's copper mountain: a strategic deposit, not a terrain.
    expect(g.regions[BERGSLAGEN]!.resource).toBe("copper");
    expect(regionSources(g.regions[BERGSLAGEN]!, "copper")).toBe(true);
    // Danzig is a coast, and coasts do not grow grain — but Danzig shipped it.
    const danzig = g.regions[66]!;
    expect(danzig.terrain).toBe("coast");
    expect(regionSources(danzig, "grain")).toBe(true);
  });
});

describe("the League is its towns", () => {
  it("names the towns the map could not draw", () => {
    const names = HANSA_TOWNS.map((t) => t.name);
    for (const missing of ["Stralsund", "Wismar", "Lüneburg", "Dortmund", "Deventer", "Elbing"]) {
      expect(names).toContain(missing);
    }
    // Every town sits in a province that exists.
    const g = board();
    for (const town of HANSA_TOWNS) expect(g.regions[town.regionId]).toBeDefined();
  });

  it("reads precedence from the towns held, not from who founded it", () => {
    const g = board();
    const [a, b] = g.nations.filter((n) => !n.isBarbarian).map((n) => n.id);
    const league: GameState = { ...g, league: { members: [a!, b!], foundedTurn: 1, boycotts: [] } };
    // Hand the second member Lübeck, Hamburg and Stralsund's province.
    const townsToB: GameState = {
      ...league,
      regions: league.regions.map((r) => ([LUBECK, HAMBURG, 14].includes(r.id) ? { ...r, ownerId: b! } : { ...r, ownerId: r.ownerId === b! ? a! : r.ownerId })),
    };
    expect(townWeightHeldBy(townsToB, b!)).toBeGreaterThan(townWeightHeldBy(townsToB, a!));
    // The founder's precedence does not survive holding none of the League.
    expect(leagueLeader(townsToB)).toBe(b);
  });
});

describe("history can move a price", () => {
  it("cheapens a good for everyone when the Bay fleets come in", () => {
    const g = board();
    const before = goodTradeValue(g, "salt");
    const glutted: GameState = { ...g, goodGlut: { salt: 0.6 } };
    expect(goodTradeValue(glutted, "salt")).toBeCloseTo(before * 0.6, 5);
    // Nothing else moves.
    expect(goodTradeValue(glutted, "herring")).toBe(goodTradeValue(g, "herring"));
  });
});
