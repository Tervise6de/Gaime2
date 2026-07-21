import { describe, it, expect } from "vitest";
import { laneExposure, raidChance, findGuardFleet, stepPiracy } from "@/systems/piracy";
import { routeFlows } from "@/systems/trade";
import { PIRACY } from "@/data/piracy";
import { emptyUnits, PLAYER_ID, type Army, type GameState, type Nation, type Region, type TradeRoute } from "@/systems/state";

// --- Fixtures (current shapes; no retired `materials` field) ----------------

function reg(over: Partial<Region> = {}): Region {
  return {
    id: 0, name: "R", terrain: "coast", ownerId: PLAYER_ID, population: 5, unrest: 0,
    fortification: 0, resource: null, buildings: [], construction: null, adjacency: [], x: 0, y: 0, ...over,
  } as Region;
}

/** regions[i].id === i, all coast, owned by the player unless overridden. */
function coastLine(count: number): Region[] {
  return Array.from({ length: count }, (_, i) => reg({ id: i }));
}

function nation(id: number, over: Partial<Nation> = {}): Nation {
  return {
    id, name: `N${id}`, isPlayer: id === PLAYER_ID, isBarbarian: id === 1, alive: true,
    stocks: { gold: 100, food: 0, knowledge: 0 }, wares: {}, taxRate: 0,
    research: { current: null, progress: 0, done: [] },
    famine: false, bankrupt: false,
    ...over,
  } as unknown as Nation;
}

function route(over: Partial<TradeRoute> = {}): TradeRoute {
  return { id: 0, ownerId: PLAYER_ID, good: "herring", fromRegionId: 0, toKontorId: "bruges", lane: [0, 1, 2, 3, 4], lastIncome: 60, ...over };
}

function fleet(id: number, regionId: number, over: Partial<Army> = {}): Army {
  return { id, ownerId: PLAYER_ID, regionId, units: { ...emptyUnits(), war_cog: 6 }, movesLeft: 0, ...over };
}

function base(over: Partial<GameState> = {}): GameState {
  return {
    turn: 5, seed: 1, mapId: "hansa", rngState: 1234, nations: [nation(PLAYER_ID), nation(1)],
    regions: coastLine(6), armies: [], nextArmyId: 1, routes: [route()], nextRouteId: 1,
    relations: {}, treaties: {}, offers: [], nextOfferId: 0, difficulty: "normal", outcome: "playing",
    log: [], piracy: { pressure: 0.6, defeatedCaptains: [] }, ...over,
  } as unknown as GameState;
}

/** Run stepPiracy across many seeds by varying rngState. */
function sample(over: Partial<GameState>, seeds: number): GameState[] {
  return Array.from({ length: seeds }, (_, i) => stepPiracy(base({ ...over, rngState: (i * 2654435761) >>> 0 })));
}

// --- laneExposure -----------------------------------------------------------

describe("laneExposure", () => {
  it("is 0 for a single-node lane and grows with length", () => {
    expect(laneExposure(route({ lane: [0] }))).toBe(0);
    expect(laneExposure(route({ lane: [0, 1, 2] }))).toBeGreaterThan(0);
    expect(laneExposure(route({ lane: [0, 1, 2, 3, 4] }))).toBeGreaterThan(laneExposure(route({ lane: [0, 1] })));
  });

  it("caps at 1 for very long lanes", () => {
    expect(laneExposure(route({ lane: Array.from({ length: 30 }, (_, i) => i) }))).toBe(1);
  });
});

// --- raidChance -------------------------------------------------------------

describe("raidChance", () => {
  it("is zero when the era is calm (pressure 0)", () => {
    expect(raidChance(base(), nation(PLAYER_ID), route(), 0)).toBe(0);
  });

  it("rises with pressure and never exceeds the cap", () => {
    const lo = raidChance(base(), nation(PLAYER_ID), route(), 0.2);
    const hi = raidChance(base(), nation(PLAYER_ID), route(), 0.9);
    expect(hi).toBeGreaterThan(lo);
    expect(raidChance(base(), nation(PLAYER_ID), route({ lastIncome: 100000 }), 1)).toBeLessThanOrEqual(PIRACY.raidCap);
  });

  it("is reduced by the Naval Power doctrine", () => {
    const plain = raidChance(base(), nation(PLAYER_ID), route(), 0.8);
    const naval = raidChance(base(), nation(PLAYER_ID, { research: { current: null, progress: 0, done: ["sea_escorts"] } } as Partial<Nation>), route(), 0.8);
    expect(naval).toBeLessThan(plain);
  });
});

// --- findGuardFleet ---------------------------------------------------------

describe("findGuardFleet", () => {
  it("finds the owner's fleet parked on the lane", () => {
    const g = fleet(10, 2);
    expect(findGuardFleet(route(), [g])?.id).toBe(10);
  });

  it("ignores fleets off the lane, other owners, and land armies", () => {
    const offLane = fleet(10, 9);
    const rival = fleet(11, 2, { ownerId: 1 });
    const landArmy: Army = { id: 12, ownerId: PLAYER_ID, regionId: 2, units: { ...emptyUnits(), militia: 3 }, movesLeft: 0 };
    expect(findGuardFleet(route(), [offLane, rival, landArmy])).toBeUndefined();
  });
});

// --- stepPiracy: dormancy ---------------------------------------------------

describe("stepPiracy dormancy", () => {
  it("is a no-op (same reference) when there is no piracy state", () => {
    const s = base({ piracy: undefined });
    expect(stepPiracy(s)).toBe(s);
  });

  it("is a no-op when pressure has eased to zero", () => {
    const s = base({ piracy: { pressure: 0, defeatedCaptains: [] } });
    expect(stepPiracy(s)).toBe(s);
  });
});

// --- stepPiracy: raids ------------------------------------------------------

describe("stepPiracy raids", () => {
  it("is deterministic for a given state", () => {
    expect(stepPiracy(base())).toEqual(stepPiracy(base()));
  });

  it("an unguarded, exposed route in a hot era sometimes loses its convoy", () => {
    const results = sample({ piracy: { pressure: 0.9, defeatedCaptains: [] } }, 200);
    const piratedRuns = results.filter((s) => s.routes![0]!.pirated === true);
    expect(piratedRuns.length).toBeGreaterThan(0);
    // A pirated route then carries nothing (integration with trade).
    for (const s of piratedRuns) expect(routeFlows(s, s.routes![0]!)).toBe(false);
    // ...and on other seeds no raid fires, so the convoy gets through unpirated.
    expect(results.some((s) => !s.routes![0]!.pirated)).toBe(true);
  });

  it("a strong guard-fleet on the lane keeps the convoy far safer than none", () => {
    const guarded = sample({ piracy: { pressure: 0.9, defeatedCaptains: [] }, armies: [fleet(10, 2, { units: { ...emptyUnits(), war_cog: 30 } })] }, 200);
    const unguarded = sample({ piracy: { pressure: 0.9, defeatedCaptains: [] } }, 200);
    const lostGuarded = guarded.filter((s) => s.routes![0]!.pirated === true).length;
    const lostUnguarded = unguarded.filter((s) => s.routes![0]!.pirated === true).length;
    expect(lostGuarded).toBeLessThan(lostUnguarded);
  });

  it("a guard-fleet can take a named captain for a bounty", () => {
    const results = sample({ piracy: { pressure: 0.9, defeatedCaptains: [] }, armies: [fleet(10, 2, { units: { ...emptyUnits(), war_cog: 40 } })] }, 400);
    const bountyRun = results.find((s) => (s.piracy?.defeatedCaptains.length ?? 0) > 0);
    expect(bountyRun).toBeDefined();
    // The bounty was paid into the player's treasury (starting gold 100).
    const player = bountyRun!.nations.find((n) => n.id === PLAYER_ID)!;
    expect(player.stocks.gold).toBeGreaterThan(100);
  });

  it("eases pressure over a quiet stretch of turns", () => {
    let s = base({ armies: [], routes: [], piracy: { pressure: 0.6, defeatedCaptains: [] } });
    const start = s.piracy!.pressure;
    for (let i = 0; i < 3; i++) s = stepPiracy(s);
    expect(s.piracy!.pressure).toBeLessThan(start);
  });
});

// --- integration: routeFlows ------------------------------------------------

describe("routeFlows honours the pirated flag", () => {
  it("a pirated route does not flow; an unflagged one is unaffected by this clause", () => {
    expect(routeFlows(base(), route({ pirated: true }))).toBe(false);
  });
});
