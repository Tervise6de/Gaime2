import { describe, it, expect } from "vitest";
import {
  regionSources,
  regionGoodOutput,
  laneFor,
  createRoute,
  closeRoute,
  routeOptions,
  distanceFactor,
  routeIncome,
  projectedRouteIncome,
  routeDisrupted,
  stepTrade,
  seedKontore,
  crossesSound,
  soundHolderId,
  setSoundToll,
  setSoundEmbargo,
  activeEmbargoes,
} from "@/systems/trade";
import { declareWar } from "@/systems/diplomacy";
import { SOUND } from "@/data/sound";
import { GOODS } from "@/data/goods";
import { KONTORE, KONTOR_IDS } from "@/data/kontore";
import {
  PLAYER_ID,
  BARBARIAN_ID,
  UNREST_REVOLT,
  UNREST_PENALTY_START,
  MAX_ROUTES_PER_NATION,
  TRADE_DIST_CAP,
  type GameState,
  type Region,
  type TradeRoute,
} from "@/systems/state";

const RIVAL = 2;

// Kontor host region ids on the real Hansa map (kept out of the tests' literals so
// re-seating the map never silently breaks these synthetic fixtures).
const BRUGES = KONTORE.bruges.regionId; // 5 on the current map

function reg(over: Partial<Region> = {}): Region {
  return {
    id: 0, name: "R", terrain: "plains", ownerId: PLAYER_ID, population: 5, unrest: 0,
    fortification: 0, resource: null, buildings: [], construction: null, adjacency: [], x: 0, y: 0, ...over,
  };
}

/** Build a regions array whose index === id, applying per-index overrides. */
function regionsOf(count: number, overrides: Record<number, Partial<Region>> = {}): Region[] {
  return Array.from({ length: count }, (_, i) => reg({ id: i, ownerId: BARBARIAN_ID, ...(overrides[i] ?? {}) }));
}

function state(regions: Region[], over: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    nations: [
      { id: PLAYER_ID, name: "You", isPlayer: true, isBarbarian: false, alive: true, stocks: { gold: 100, food: 0, materials: 0, knowledge: 0 } },
      { id: BARBARIAN_ID, name: "Free", isPlayer: false, isBarbarian: true, alive: true, stocks: { gold: 0, food: 0, materials: 0, knowledge: 0 } },
      { id: RIVAL, name: "Rival", isPlayer: false, isBarbarian: false, alive: true, stocks: { gold: 50, food: 0, materials: 0, knowledge: 0 } },
    ],
    regions, armies: [], nextArmyId: 0, routes: [], nextRouteId: 0,
    relations: {}, treaties: {}, offers: [], nextOfferId: 0, difficulty: "normal", outcome: "playing", log: [],
    ...over,
  } as unknown as GameState;
}

describe("regionGoodOutput", () => {
  it("plains source grain and beer (in GOOD_IDS order)", () => {
    expect(regionGoodOutput(reg({ terrain: "plains" }))).toEqual([
      { good: "grain", amount: GOODS.grain.source.baseOutput },
      { good: "beer", amount: GOODS.beer.source.baseOutput },
    ]);
  });

  it("coast sources herring; salt/amber come from their strategic resource", () => {
    expect(regionGoodOutput(reg({ terrain: "coast" })).map((g) => g.good)).toEqual(["herring"]);
    expect(regionGoodOutput(reg({ terrain: "hills", resource: "salt" })).map((g) => g.good)).toEqual(["salt"]);
    expect(regionGoodOutput(reg({ terrain: "coast", resource: "amber" })).map((g) => g.good)).toEqual([
      "herring", "amber",
    ]);
  });

  it("forest sources both timber and furs (in GOOD_IDS order)", () => {
    expect(regionGoodOutput(reg({ terrain: "forest" }))).toEqual([
      { good: "timber", amount: GOODS.timber.source.baseOutput },
      { good: "furs", amount: GOODS.furs.source.baseOutput },
    ]);
  });

  it("an iron-resource region sources iron (terrain aside)", () => {
    expect(regionGoodOutput(reg({ terrain: "hills", resource: "iron" }))).toEqual([
      { good: "iron", amount: GOODS.iron.source.baseOutput },
    ]);
  });

  it("a region can source terrain AND resource goods at once", () => {
    // Forest + iron: timber, furs (forest) and iron (resource).
    expect(regionGoodOutput(reg({ terrain: "forest", resource: "iron" })).map((g) => g.good)).toEqual([
      "timber", "furs", "iron",
    ]);
  });

  it("a revolting region ships nothing", () => {
    expect(regionGoodOutput(reg({ terrain: "forest", unrest: UNREST_REVOLT }))).toEqual([]);
  });

  it("applies the same unrest penalty as the economy (partial unrest → less output)", () => {
    const calm = regionGoodOutput(reg({ terrain: "plains", unrest: 0 }))[0]!.amount;
    const strained = regionGoodOutput(reg({ terrain: "plains", unrest: UNREST_PENALTY_START + 25 }))[0]!.amount;
    expect(strained).toBeGreaterThan(0);
    expect(strained).toBeLessThan(calm);
  });

  it("a barren region (no matching terrain/resource) sources nothing", () => {
    expect(regionGoodOutput(reg({ terrain: "mountains", resource: null }))).toEqual([]);
    expect(regionSources(reg({ terrain: "mountains" }), "grain")).toBe(false);
  });
});

describe("laneFor", () => {
  it("returns the BFS shortest path from a region to the Kontor host", () => {
    // 0 = London host; chain 3 → 1 → 0.
    const regions = regionsOf(4, {
      0: { adjacency: [1] },
      1: { adjacency: [0, 3] },
      3: { adjacency: [1] },
    });
    expect(laneFor(state(regions), 3, "london")).toEqual([3, 1, 0]);
  });

  it("breaks ties toward the lowest-id path (deterministic)", () => {
    // From 5 to London(0): two equal-length routes via 1 or via 2 — lowest id wins.
    const regions = regionsOf(6, {
      0: { adjacency: [1, 2] },
      1: { adjacency: [0, 5] },
      2: { adjacency: [0, 5] },
      5: { adjacency: [1, 2] },
    });
    expect(laneFor(state(regions), 5, "london")).toEqual([5, 1, 0]);
  });

  it("a zero-hop lane (source is the host) is the single node", () => {
    expect(laneFor(state(regionsOf(1, { 0: { adjacency: [] } })), 0, "london")).toEqual([0]);
  });

  it("returns [] when the Kontor host is unreachable or off this map", () => {
    const regions = regionsOf(2, { 0: { adjacency: [] }, 1: { adjacency: [] } });
    expect(laneFor(state(regions), 1, "london")).toEqual([]); // no path to 0
    expect(laneFor(state(regions), 1, "bergen")).toEqual([]); // Bergen host absent from this map
  });
});

describe("createRoute", () => {
  // 4 = plains (grain) owned by player, adjacent to the Bruges host (coast), also player.
  const base = () =>
    state(
      regionsOf(BRUGES + 1, {
        4: { terrain: "plains", ownerId: PLAYER_ID, adjacency: [BRUGES] }, // grain source
        [BRUGES]: { terrain: "coast", ownerId: PLAYER_ID, adjacency: [4] }, // Bruges host
      }),
    );

  it("founds a valid route (grain → Bruges) and bumps nextRouteId", () => {
    const next = createRoute(base(), PLAYER_ID, 4, "grain", "bruges");
    expect(next.routes).toHaveLength(1);
    expect(next.routes![0]).toMatchObject({
      id: 0, ownerId: PLAYER_ID, good: "grain", fromRegionId: 4, toKontorId: "bruges", lane: [4, BRUGES],
    });
    expect(next.nextRouteId).toBe(1);
  });

  it("rejects a good the Kontor does not demand", () => {
    // Bruges demands grain/iron, not timber → no-op.
    const s = createRoute(base(), PLAYER_ID, 4, "timber", "bruges");
    expect(s.routes).toEqual([]);
  });

  it("rejects a region that does not source the good", () => {
    // Region 4 is plains (no iron), Bruges demands iron → no-op.
    expect(createRoute(base(), PLAYER_ID, 4, "iron", "bruges").routes).toEqual([]);
  });

  it("rejects a region the owner does not hold", () => {
    expect(createRoute(base(), RIVAL, 4, "grain", "bruges").routes).toEqual([]);
  });

  it("rejects when no lane reaches the Kontor host (off-map Kontor)", () => {
    // Bergen's host region is absent from this small map → no lane.
    const regions = regionsOf(6, { 4: { terrain: "plains", ownerId: PLAYER_ID, adjacency: [] } });
    expect(createRoute(state(regions), PLAYER_ID, 4, "grain", "bergen").routes).toEqual([]);
  });

  it("rejects trading into a Kontor whose host you are at war with", () => {
    const regions = regionsOf(BRUGES + 1, {
      4: { terrain: "plains", ownerId: PLAYER_ID, adjacency: [BRUGES] },
      [BRUGES]: { terrain: "coast", ownerId: RIVAL, adjacency: [4] }, // Bruges host held by a foe
    });
    const atWarState = state(regions, { treaties: { "0-2": "war" } });
    expect(createRoute(atWarState, PLAYER_ID, 4, "grain", "bruges").routes).toEqual([]);
  });

  it("enforces the per-nation route cap", () => {
    let s = base();
    for (let i = 0; i < MAX_ROUTES_PER_NATION; i++) s = createRoute(s, PLAYER_ID, 4, "grain", "bruges");
    expect(s.routes).toHaveLength(MAX_ROUTES_PER_NATION);
    // One more is refused.
    s = createRoute(s, PLAYER_ID, 4, "grain", "bruges");
    expect(s.routes).toHaveLength(MAX_ROUTES_PER_NATION);
  });

  it("is a no-op that does not mutate its input on an invalid request", () => {
    const s = base();
    const snap = JSON.stringify(s);
    createRoute(s, PLAYER_ID, 4, "timber", "bruges");
    expect(JSON.stringify(s)).toBe(snap);
  });
});

describe("routeIncome & distanceFactor", () => {
  const route = (lane: number[]): TradeRoute => ({
    id: 0, ownerId: PLAYER_ID, good: "grain", fromRegionId: 5, toKontorId: "bruges", lane,
  });

  it("distanceFactor is 1 at a single node and grows with length, capped", () => {
    expect(distanceFactor(1)).toBe(1);
    expect(distanceFactor(3)).toBeCloseTo(1.3, 5);
    expect(distanceFactor(1000)).toBe(TRADE_DIST_CAP);
  });

  it("routeIncome = good.value × distanceFactor(lane length)", () => {
    const s = state(regionsOf(6));
    // grain value 2; lane of 2 nodes → 2 × 1.15 = 2.3.
    expect(routeIncome(s, route([5, 4]))).toBe(2.3);
    // A single-node lane pays exactly the good's value.
    expect(routeIncome(s, route([4]))).toBe(GOODS.grain.value);
  });

  it("a longer lane pays more, up to the cap", () => {
    const s = state(regionsOf(6));
    expect(routeIncome(s, route([1, 2, 3, 4]))).toBeGreaterThan(routeIncome(s, route([3, 4])));
    // A very long lane is capped at value × TRADE_DIST_CAP.
    const long = Array.from({ length: 100 }, (_, i) => i);
    expect(routeIncome(s, route(long))).toBe(GOODS.grain.value * TRADE_DIST_CAP);
  });
});

describe("routeDisrupted", () => {
  // Lane 4 → 3 → Bruges host: node 4 the source, 3 an intermediate, BRUGES the host.
  const route: TradeRoute = { id: 0, ownerId: PLAYER_ID, good: "grain", fromRegionId: 4, toKontorId: "bruges", lane: [4, 3, BRUGES] };

  it("is not disrupted at peace", () => {
    const regions = regionsOf(BRUGES + 1, { 4: { ownerId: PLAYER_ID }, 3: { ownerId: PLAYER_ID }, [BRUGES]: { ownerId: PLAYER_ID } });
    expect(routeDisrupted(state(regions), route)).toBe(false);
  });

  it("is disrupted when at war with the Kontor host's owner", () => {
    // Host (BRUGES) held by a foe the player is at war with.
    const regions = regionsOf(BRUGES + 1, { 4: { ownerId: PLAYER_ID }, 3: { ownerId: PLAYER_ID }, [BRUGES]: { ownerId: RIVAL } });
    expect(routeDisrupted(state(regions, { treaties: { "0-2": "war" } }), route)).toBe(true);
  });

  it("is disrupted when an enemy at war holds a node on the lane", () => {
    // Host (BRUGES) is friendly, but intermediate node 3 is held by a foe at war.
    const regions = regionsOf(BRUGES + 1, { 4: { ownerId: PLAYER_ID }, 3: { ownerId: RIVAL }, [BRUGES]: { ownerId: PLAYER_ID } });
    expect(routeDisrupted(state(regions, { treaties: { "0-2": "war" } }), route)).toBe(true);
  });
});

describe("stepTrade", () => {
  // Route grain 4 → Bruges host, lane [4, BRUGES]. Host owned by player = trivially at peace.
  function tradingState(over: Partial<GameState> = {}): GameState {
    const regions = regionsOf(BRUGES + 1, {
      4: { terrain: "plains", ownerId: PLAYER_ID, adjacency: [BRUGES] },
      [BRUGES]: { terrain: "coast", ownerId: PLAYER_ID, adjacency: [4] },
    });
    const routes: TradeRoute[] = [
      { id: 0, ownerId: PLAYER_ID, good: "grain", fromRegionId: 4, toKontorId: "bruges", lane: [4, BRUGES] },
    ];
    return state(regions, { routes, nextRouteId: 1, ...over });
  }

  it("credits a route's income to its owner and records lastIncome/disrupted", () => {
    const s = tradingState();
    const before = s.nations[PLAYER_ID]!.stocks.gold;
    const next = stepTrade(s);
    const income = routeIncome(s, s.routes![0]!);
    expect(income).toBeGreaterThan(0); // sole supplier here — earns the monopoly premium
    expect(next.nations[PLAYER_ID]!.stocks.gold).toBeCloseTo(before + income, 5);
    expect(next.routes![0]!.lastIncome).toBe(income);
    expect(next.routes![0]!.disrupted).toBe(false);
    expect(next.log.some((l) => /Trade routes carried \+.*g/.test(l))).toBe(true);
  });

  it("pays a disrupted route nothing (war on the host)", () => {
    // Bruges host held by a foe the player is at war with.
    const s = tradingState({
      regions: regionsOf(BRUGES + 1, {
        4: { terrain: "plains", ownerId: PLAYER_ID, adjacency: [BRUGES] },
        [BRUGES]: { terrain: "coast", ownerId: RIVAL, adjacency: [4] },
      }),
      routes: [{ id: 0, ownerId: PLAYER_ID, good: "grain", fromRegionId: 4, toKontorId: "bruges", lane: [4, BRUGES] }],
      treaties: { "0-2": "war" },
    });
    const before = s.nations[PLAYER_ID]!.stocks.gold;
    const next = stepTrade(s);
    expect(next.routes![0]!.disrupted).toBe(true);
    expect(next.routes![0]!.lastIncome).toBe(0);
    expect(next.nations[PLAYER_ID]!.stocks.gold).toBe(before); // no gold credited
  });

  it("is a no-op with no routes (returns the same reference)", () => {
    const s = state(regionsOf(2));
    expect(stepTrade(s)).toBe(s);
  });

  it("is deterministic and does not mutate its input", () => {
    const s = tradingState();
    const snap = JSON.stringify(s);
    expect(stepTrade(s)).toEqual(stepTrade(s));
    expect(JSON.stringify(s)).toBe(snap);
  });
});

describe("seedKontore", () => {
  it("opens all four Kontore, holder = host region's owner", () => {
    // London host (0) owned by player; Bruges host owned by a rival; Bergen &
    // Novgorod hosts are off this small map.
    const regions = regionsOf(BRUGES + 1, { 0: { ownerId: PLAYER_ID }, [BRUGES]: { ownerId: RIVAL } });
    const kontore = seedKontore(state(regions, { turn: 1 }));
    expect(kontore).toHaveLength(4);
    expect(kontore.every((k) => k.open)).toBe(true);
    expect(kontore.map((k) => k.id).sort()).toEqual([...KONTOR_IDS].sort());
    const byId = Object.fromEntries(kontore.map((k) => [k.id, k]));
    expect(byId.london!.holderId).toBe(PLAYER_ID);
    expect(byId.bruges!.holderId).toBe(RIVAL);
    expect(byId.bergen!.holderId).toBeNull(); // host off-map
    expect(byId.novgorod!.holderId).toBeNull();
    expect(kontore.every((k) => k.sinceTurn === 1)).toBe(true);
  });

  it("treats a barbarian-held host as unheld (null)", () => {
    const regions = regionsOf(1, { 0: { ownerId: BARBARIAN_ID } });
    const london = seedKontore(state(regions)).find((k) => k.id === "london")!;
    expect(london.holderId).toBeNull();
  });
});

describe("closeRoute", () => {
  const withRoute = (): GameState =>
    state(
      regionsOf(BRUGES + 1, {
        4: { terrain: "plains", ownerId: PLAYER_ID, adjacency: [BRUGES] },
        [BRUGES]: { terrain: "coast", ownerId: PLAYER_ID, adjacency: [4] },
      }),
      { routes: [{ id: 7, ownerId: PLAYER_ID, good: "grain", fromRegionId: 4, toKontorId: "bruges", lane: [4, BRUGES] }], nextRouteId: 8 },
    );

  it("drops the owner's route by id", () => {
    expect(closeRoute(withRoute(), 7, PLAYER_ID).routes).toEqual([]);
  });

  it("is a no-op for a route the caller does not own, or a missing id", () => {
    expect(closeRoute(withRoute(), 7, RIVAL).routes).toHaveLength(1); // not yours
    expect(closeRoute(withRoute(), 99, PLAYER_ID).routes).toHaveLength(1); // no such route
  });
});

describe("routeOptions", () => {
  const base = (): GameState =>
    state(
      regionsOf(BRUGES + 1, {
        4: { terrain: "plains", ownerId: PLAYER_ID, adjacency: [BRUGES] }, // grain source
        [BRUGES]: { terrain: "coast", ownerId: PLAYER_ID, adjacency: [4] }, // Bruges host
      }),
    );

  it("offers a sourced good to a demanding, reachable Kontor", () => {
    const opts = routeOptions(base(), 4, PLAYER_ID);
    expect(opts.some((o) => o.good === "grain" && o.toKontorId === "bruges")).toBe(true);
    const bruges = opts.find((o) => o.toKontorId === "bruges")!;
    expect(bruges.income).toBeGreaterThan(0);
    expect(bruges.hops).toBe(2); // 4 → Bruges host
  });

  it("excludes a route already open from this region", () => {
    let s = base();
    s = createRoute(s, PLAYER_ID, 4, "grain", "bruges");
    expect(routeOptions(s, 4, PLAYER_ID).some((o) => o.good === "grain" && o.toKontorId === "bruges")).toBe(false);
  });

  it("offers nothing from a region that sources nothing, or one you don't hold", () => {
    const barren = state(regionsOf(BRUGES + 1, { 4: { terrain: "mountains", ownerId: PLAYER_ID, adjacency: [BRUGES] } }));
    expect(routeOptions(barren, 4, PLAYER_ID)).toEqual([]);
    expect(routeOptions(base(), 4, RIVAL)).toEqual([]); // not your region
  });
});

describe("goods ⇄ kontore host ids", () => {
  it("the Kontor host region ids match the design (London 0, Bruges 5, Bergen 30, Novgorod 62)", () => {
    expect(KONTORE.london.regionId).toBe(0);
    expect(KONTORE.bruges.regionId).toBe(5);
    expect(KONTORE.bergen.regionId).toBe(30);
    expect(KONTORE.novgorod.regionId).toBe(62);
  });
});

describe("the Øresund Sound toll (trade as power)", () => {
  const SOUND_REGION = SOUND.regionId; // Zealand / Copenhagen
  const BALTIC_SRC = 68; // Königsberg — a Baltic port (not in SOUND.westRegions)
  const WEST_SRC = 6; // Brabant — an Atlantic region
  const BRUGES_ID = KONTORE.bruges.regionId; // western Kontor host

  // A 70-region world: the Sound held by `holder`, the Bruges host left neutral so
  // only the Sound (never the host) can sever a crossing route in these tests.
  function soundState(holder: number, routes: TradeRoute[]): GameState {
    const regions = regionsOf(70, {
      [SOUND_REGION]: { ownerId: holder },
      [BALTIC_SRC]: { ownerId: RIVAL },
      [BRUGES_ID]: { ownerId: BARBARIAN_ID },
    });
    return state(regions, {
      sound: { regionId: SOUND_REGION, tollRate: SOUND.defaultRate, embargoes: [] },
      routes,
    });
  }
  const crossing = (owner: number): TradeRoute => ({
    id: 0, ownerId: owner, good: "amber", fromRegionId: BALTIC_SRC, toKontorId: "bruges", lane: [BALTIC_SRC, BRUGES_ID],
  });

  it("crossesSound: only Baltic→western routes cross the strait", () => {
    const s = soundState(PLAYER_ID, []);
    expect(crossesSound(s, crossing(RIVAL))).toBe(true);
    expect(crossesSound(s, { ...crossing(RIVAL), fromRegionId: WEST_SRC })).toBe(false); // Atlantic source
    expect(crossesSound(s, { ...crossing(RIVAL), toKontorId: "bergen" })).toBe(false); // not a western market
    expect(crossesSound(s, { ...crossing(RIVAL), toKontorId: "novgorod" })).toBe(false);
  });

  it("soundHolderId is the strait's owner, null when unheld/barbarian", () => {
    expect(soundHolderId(soundState(PLAYER_ID, []))).toBe(PLAYER_ID);
    expect(soundHolderId(soundState(BARBARIAN_ID, []))).toBe(null);
  });

  it("skims the toll from a crossing route to the strait-holder", () => {
    const route = crossing(RIVAL);
    const gross = routeIncome(soundState(PLAYER_ID, [route]), route); // same market stepTrade sees
    const after = stepTrade(soundState(PLAYER_ID, [route]));
    const r = after.routes![0]!;
    expect(r.tollPaid!).toBeGreaterThan(0);
    expect(r.tollPaid!).toBeLessThan(r.lastIncome!); // 25% skim < 75% kept
    expect(r.tollPaid! + r.lastIncome!).toBeCloseTo(gross, 5);
    const player = after.nations.find((n) => n.id === PLAYER_ID)!;
    const rival = after.nations.find((n) => n.id === RIVAL)!;
    expect(player.stocks.gold).toBeCloseTo(100 + r.tollPaid!, 5); // holder pockets the toll
    expect(rival.stocks.gold).toBeCloseTo(50 + r.lastIncome!, 5); // owner keeps the rest
  });

  it("passes the holder's own crossing trade free of toll", () => {
    const after = stepTrade(soundState(PLAYER_ID, [crossing(PLAYER_ID)]));
    const r = after.routes![0]!;
    expect(r.tollPaid).toBe(0);
    expect(r.lastIncome!).toBeGreaterThan(0);
  });

  it("closes the strait to a realm at war with the holder", () => {
    let s = soundState(PLAYER_ID, [crossing(RIVAL)]);
    s = declareWar(s, RIVAL, PLAYER_ID);
    const r = stepTrade(s).routes![0]!;
    expect(r.soundBlocked).toBe(true);
    expect(r.lastIncome).toBe(0);
  });

  it("closes the strait to an embargoed realm", () => {
    let s = soundState(PLAYER_ID, [crossing(RIVAL)]);
    s = setSoundEmbargo(s, PLAYER_ID, RIVAL, true);
    expect(activeEmbargoes(s)).toContain(RIVAL);
    const r = stepTrade(s).routes![0]!;
    expect(r.soundBlocked).toBe(true);
    expect(r.lastIncome).toBe(0);
  });

  it("only the holder sets the toll rate, clamped to the ceiling", () => {
    const s = soundState(PLAYER_ID, []);
    expect(setSoundToll(s, RIVAL, 0.1).sound!.tollRate).toBe(SOUND.defaultRate); // non-holder: no-op
    expect(setSoundToll(s, PLAYER_ID, 0.99).sound!.tollRate).toBe(SOUND.maxRate); // clamped up to ceiling
    expect(setSoundToll(s, PLAYER_ID, 0).sound!.tollRate).toBe(0);
  });

  it("embargoes fall dormant when the strait changes hands", () => {
    let s = soundState(PLAYER_ID, []);
    s = setSoundEmbargo(s, PLAYER_ID, RIVAL, true);
    expect(activeEmbargoes(s)).toEqual([RIVAL]);
    s = { ...s, regions: s.regions.map((r) => (r.id === SOUND_REGION ? { ...r, ownerId: RIVAL } : r)) };
    expect(activeEmbargoes(s)).toEqual([]); // the conqueror inherits no grudges
  });
});

describe("market pricing — scarcity & monopoly (Plan 3B)", () => {
  const grainRoute = (id: number, owner: number): TradeRoute => ({
    id, ownerId: owner, good: "grain", fromRegionId: 4, toKontorId: "bruges", lane: [4, BRUGES],
  });
  const withRoutes = (routes: TradeRoute[]): GameState => state(regionsOf(BRUGES + 1), { routes });

  it("a sole supplier corners the market — a premium over a contested one", () => {
    const monopoly = withRoutes([grainRoute(0, PLAYER_ID)]);
    const contested = withRoutes([grainRoute(0, PLAYER_ID), grainRoute(1, RIVAL)]);
    expect(routeIncome(monopoly, monopoly.routes![0]!)).toBeGreaterThan(routeIncome(contested, contested.routes![0]!));
  });

  it("scarcity falls as more of a good pours into one Kontor, down to a floor", () => {
    const incomeWith = (n: number): number => {
      const s = withRoutes(Array.from({ length: n }, (_, i) => grainRoute(i, i))); // distinct owners → no monopoly
      return routeIncome(s, s.routes![0]!);
    };
    expect(incomeWith(2)).toBeGreaterThan(incomeWith(4)); // more supply, lower price
    // The floor holds: a heavy glut never pays less than 0.75× the base, and stays there.
    const base = GOODS.grain.value * distanceFactor(2);
    expect(incomeWith(6)).toBeCloseTo(round1Local(base * 0.75), 5);
    expect(incomeWith(12)).toBeCloseTo(incomeWith(6), 5);
  });

  it("projectedRouteIncome previews the market a new route would join", () => {
    const solo = projectedRouteIncome(withRoutes([]), PLAYER_ID, "grain", "bruges", 2); // sole supplier
    const shared = projectedRouteIncome(withRoutes([grainRoute(0, RIVAL)]), PLAYER_ID, "grain", "bruges", 2); // a rival already supplies
    expect(solo).toBeGreaterThan(shared);
  });
});

function round1Local(n: number): number {
  return Math.round(n * 10) / 10;
}
