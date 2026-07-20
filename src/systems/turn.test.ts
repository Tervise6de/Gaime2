import { describe, it, expect } from "vitest";
import {
  createGame,
  resolveTurn,
  setTaxRate,
  queueBuilding,
  cancelConstruction,
  canQueueBuilding,
  canEnqueueBuilding,
  enqueueBuilding,
  removeQueuedBuilding,
  clearBuildQueue,
  startQueuedBuildings,
  applySecession,
} from "@/systems/turn";
import { nationalProduction, round1 } from "@/systems/economy";
import { routeIncome, nationalWareOutput } from "@/systems/trade";
import { GOOD_IDS, contentmentWares, type GoodId } from "@/data/goods";
import { factionByName } from "@/data/factions";
import { totalUpkeep } from "@/systems/military";
import { regionCapacity } from "@/systems/population";
import { DEFAULT_MAP_OPTIONS } from "@/systems/mapgen";
import { BUILDINGS } from "@/data/buildings";
import {
  PLAYER_ID,
  BARBARIAN_ID,
  UNREST_REVOLT,
  SECESSION_REVOLT_TURNS,
  REBEL_GARRISON,
  armySize,
  emptyUnits,
  TAX_MAX,
  TAX_MIN,
  clampTax,
  playerNation,
  TREASURY_RESERVE,
  type GameState,
  type Region,
  type Army,
  type TradeRoute,
} from "@/systems/state";

describe("createGame", () => {
  it("is deterministic for a seed", () => {
    expect(createGame({ seed: 999 })).toEqual(createGame({ seed: 999 }));
  });

  it("pins the player's opening trait when a scenario forces one; rivals keep their faction's", () => {
    const g = createGame({ seed: 7, rivals: 3, playerTrait: "scholarly" });
    expect(playerNation(g).trait).toBe("scholarly"); // override wins over the faction's
    // Rivals still carry their own faction's signature trait.
    const rivals = g.nations.filter((n) => !n.isPlayer && !n.isBarbarian);
    for (const r of rivals) expect(r.trait).toBe(factionByName(r.name)?.trait);
  });

  it("leaves trait assignment (and determinism) unchanged when playerTrait is unset", () => {
    // Same seed with no forced trait must be byte-identical to the legacy path.
    expect(createGame({ seed: 55, rivals: 3 })).toEqual(createGame({ seed: 55, rivals: 3, playerTrait: undefined }));
  });

  it("starts at turn 1 with a small player realm and barbarian rest", () => {
    const g = createGame({ seed: 1 });
    expect(g.turn).toBe(1);
    const owned = g.regions.filter((r) => r.ownerId === PLAYER_ID);
    expect(owned.length).toBeGreaterThan(0);
    expect(owned.length).toBeLessThan(g.regions.length);
    expect(g.regions.some((r) => r.ownerId !== PLAYER_ID)).toBe(true);
    expect(playerNation(g).stocks.gold).toBeGreaterThan(0);
    // The player begins with a field army.
    expect(g.armies.some((a) => a.ownerId === PLAYER_ID)).toBe(true);
    // Rival nations exist.
    expect(g.nations.some((n) => !n.isPlayer && !n.isBarbarian)).toBe(true);
  });

  it("seats the authored Hansa roster regardless of deprecated map/rival options", () => {
    const big = createGame({ seed: 4, rivals: 5, map: { ...DEFAULT_MAP_OPTIONS, regionCount: 30 } });
    const small = createGame({ seed: 4, rivals: 5, map: { ...DEFAULT_MAP_OPTIONS, regionCount: 16 } });
    expect(big.regions.length).toBe(74);
    expect(small.regions.length).toBe(74);
    for (const g of [big, small]) {
      const placed = new Set(g.regions.map((r) => r.ownerId).filter((o) => o !== null && o !== BARBARIAN_ID));
      expect(placed.size).toBe(g.nations.filter((n) => !n.isBarbarian).length);
    }
  });

  it("keeps the authored Hansa map size and seats every nation", () => {
    const small = createGame({ seed: 3, rivals: 3, map: { ...DEFAULT_MAP_OPTIONS, regionCount: 16 } });
    const large = createGame({ seed: 3, rivals: 3, map: { ...DEFAULT_MAP_OPTIONS, regionCount: 30 } });
    expect(small.regions.length).toBe(74);
    expect(large.regions.length).toBe(74);
    for (const g of [small, large]) {
      const owners = new Set(g.regions.map((r) => r.ownerId).filter((o) => o !== null && o !== BARBARIAN_ID));
      expect(owners.size).toBe(g.nations.filter((n) => !n.isBarbarian).length);
    }
  });

  it("records each nation's capital: an owned, lightly fortified region", () => {
    const g = createGame({ seed: 42 });
    for (const n of g.nations) {
      if (n.isBarbarian) {
        expect(n.capitalRegionId).toBeUndefined();
        continue;
      }
      const capital = g.regions[n.capitalRegionId!];
      expect(capital).toBeDefined();
      expect(capital!.ownerId).toBe(n.id);
      expect(capital!.fortification).toBe(1);
    }
  });
});

describe("trade layer (goods → Kontore)", () => {
  it("createGame opens the four Kontore and an empty route registry", () => {
    const g = createGame({ seed: 1 });
    expect(g.routes).toEqual([]);
    expect(g.nextRouteId).toBe(0);
    expect(g.kontore).toHaveLength(4);
    expect(g.kontore!.every((k) => k.open)).toBe(true);
  });

  it("resolveTurn runs stepTrade — a live route credits its income on top of production", () => {
    const g = setTaxRate(createGame({ seed: 5, rivals: 0 }), 0);
    const pRegion = g.regions.find((r) => r.ownerId === PLAYER_ID)!;
    // Inject a route to the London Kontor (host region 0). With no rivals there is
    // no war, so the route is undisrupted and pays each turn.
    const route: TradeRoute = {
      id: 0, ownerId: PLAYER_ID, good: "iron", fromRegionId: pRegion.id, toKontorId: "london", lane: [pRegion.id, 0],
    };
    const withRoute: GameState = { ...g, routes: [route], nextRouteId: 1 };
    const income = routeIncome(withRoute, route); // market includes the route (sole-supplier premium)
    expect(income).toBeGreaterThan(0);
    // Same seed/flow either way; the only difference is the injected route, so the
    // gold delta after one turn is exactly the route income.
    const base = resolveTurn(g);
    const traded = resolveTurn(withRoute);
    expect(traded.nations[PLAYER_ID]!.stocks.gold).toBeCloseTo(base.nations[PLAYER_ID]!.stocks.gold + income, 5);
    expect(traded.routes![0]!.lastIncome).toBe(income);
    expect(traded.routes![0]!.disrupted).toBe(false);
  });
});

describe("clampTax", () => {
  it("clamps into the legal band", () => {
    expect(clampTax(-1)).toBe(TAX_MIN);
    expect(clampTax(5)).toBe(TAX_MAX);
    expect(clampTax(0.2)).toBe(0.2);
  });
});

describe("setTaxRate", () => {
  it("returns a new state without mutating the input", () => {
    const g = createGame({ seed: 1 });
    const next = setTaxRate(g, 0.3);
    expect(playerNation(next).taxRate).toBe(0.3);
    expect(playerNation(g).taxRate).not.toBe(0.3);
    expect(next).not.toBe(g);
  });
});

describe("secession (revolt → break away)", () => {
  function reg(over: Partial<Region> = {}): Region {
    return {
      id: 0, name: "Rebelton", terrain: "plains", ownerId: PLAYER_ID, population: 3,
      unrest: UNREST_REVOLT, fortification: 0, resource: null, buildings: [],
      construction: null, adjacency: [], x: 0.5, y: 0.5, ...over,
    };
  }
  function stateOf(regions: Region[], armies: Army[] = []): GameState {
    return {
      turn: 20, armies, log: [], nextArmyId: 100,
      nations: [
        { id: PLAYER_ID, name: "You", isPlayer: true, isBarbarian: false },
        { id: BARBARIAN_ID, name: "Free Peoples", isPlayer: false, isBarbarian: true },
      ],
      regions,
    } as unknown as GameState;
  }

  it("counts up turns in ungarrisoned revolt without seceding before the threshold", () => {
    let s = stateOf([reg({ revoltTurns: 0 })]);
    for (let i = 1; i < SECESSION_REVOLT_TURNS; i++) {
      s = applySecession(s);
      expect(s.regions[0]!.ownerId).toBe(PLAYER_ID); // still ours
      expect(s.regions[0]!.revoltTurns).toBe(i);
    }
  });

  it("secedes to the barbarians at the threshold, spawning a rebel garrison", () => {
    const s = applySecession(stateOf([reg({ revoltTurns: SECESSION_REVOLT_TURNS - 1 })]));
    expect(s.regions[0]!.ownerId).toBe(BARBARIAN_ID);
    expect(s.regions[0]!.revoltTurns).toBe(0);
    expect(s.regions[0]!.construction).toBeNull();
    const rebels = s.armies.find((a) => a.regionId === 0 && a.ownerId === BARBARIAN_ID);
    expect(rebels && armySize(rebels.units)).toBe(REBEL_GARRISON);
    expect(rebels!.commander).toBeDefined(); // led by a named pretender (E5)
    expect(s.regions[0]!.priorOwnerId).toBe(PLAYER_ID); // remembers who to reclaim from
    expect(s.log.some((l) => /seceding from/.test(l))).toBe(true);
  });

  it("a friendly garrison holds the region — it never secedes while troops stand there", () => {
    const armies: Army[] = [
      { id: 1, ownerId: PLAYER_ID, regionId: 0, units: { ...emptyUnits(), infantry: 2 }, movesLeft: 0 },
    ];
    const s = applySecession(stateOf([reg({ revoltTurns: SECESSION_REVOLT_TURNS - 1 })], armies));
    expect(s.regions[0]!.ownerId).toBe(PLAYER_ID);
    expect(s.regions[0]!.revoltTurns).toBe(0); // garrison resets the countdown
  });

  it("calm below the revolt threshold resets the countdown", () => {
    const s = applySecession(stateOf([reg({ unrest: UNREST_REVOLT - 1, revoltTurns: 2 })]));
    expect(s.regions[0]!.ownerId).toBe(PLAYER_ID);
    expect(s.regions[0]!.revoltTurns).toBe(0);
  });

  it("leaves barbarian-held regions alone", () => {
    const s = applySecession(stateOf([reg({ ownerId: BARBARIAN_ID, revoltTurns: 5 })]));
    expect(s.regions[0]!.ownerId).toBe(BARBARIAN_ID);
    expect(s.armies.length).toBe(0); // no new rebels spawned
  });
});

describe("resolveTurn", () => {
  it("advances the turn counter", () => {
    const g = createGame({ seed: 1 });
    expect(resolveTurn(g).turn).toBe(g.turn + 1);
  });

  it("a stationed garrison calms its region's unrest over a turn", () => {
    const base = createGame({ seed: 1, rivals: 0 });
    const rid = base.regions.findIndex((r) => r.ownerId === PLAYER_ID);
    // Raise this region's unrest and clear any army already standing on it.
    const raised: GameState = {
      ...base,
      regions: base.regions.map((r) => (r.id === rid ? { ...r, unrest: 50 } : r)),
      armies: base.armies.filter((a) => a.regionId !== rid),
    };
    const garrisoned: GameState = {
      ...raised,
      armies: [
        ...raised.armies,
        { id: 999, ownerId: PLAYER_ID, regionId: rid, units: { ...emptyUnits(), infantry: 5 }, movesLeft: 0 },
      ],
    };
    // Unrest drifts a capped amount per turn, so let several turns pass for the
    // lower garrisoned target to separate from the ungarrisoned trajectory.
    let a = raised;
    let b = garrisoned;
    for (let i = 0; i < 8; i++) {
      a = resolveTurn(a);
      b = resolveTurn(b);
    }
    expect(b.regions[rid]!.unrest).toBeLessThan(a.regions[rid]!.unrest);
  });

  it("adds national production to stocks, net of army upkeep", () => {
    const g = createGame({ seed: 1, rivals: 0 });
    const flow = nationalProduction(g, PLAYER_ID);
    const wareOut = nationalWareOutput(g, PLAYER_ID);
    const upkeep = totalUpkeep(g, PLAYER_ID);
    const next = resolveTurn(g);
    const p0 = playerNation(g);
    const p1 = playerNation(next);
    expect(p1.stocks.gold).toBeCloseTo(p0.stocks.gold + flow.gold - upkeep, 5);
    // No construction is queued at game start, so build/arms/food wares accrue
    // exactly. The pure luxuries (furs/wax/amber/cloth/wool) may be drawn down a
    // little by burgher contentment (R5), so they accrue AT MOST their full output.
    const luxury = new Set<GoodId>(contentmentWares());
    for (const id of GOOD_IDS) {
      const full = round1(p0.wares[id] + wareOut[id]);
      if (luxury.has(id)) {
        expect(p1.wares[id]).toBeGreaterThanOrEqual(0);
        expect(p1.wares[id]).toBeLessThanOrEqual(full + 1e-9);
      } else {
        expect(p1.wares[id]).toBeCloseTo(full, 5);
      }
    }
  });

  it("luxury contentment eases unrest realm-wide (R5)", () => {
    // Force the player's provinces to plains (which source no *pure* luxury —
    // furs/wax/amber/cloth/wool), so contentment can come only from the stockpile.
    const flat = setTaxRate(createGame({ seed: 7, rivals: 0 }), TAX_MAX);
    const a: GameState = {
      ...flat,
      regions: flat.regions.map((r) => (r.ownerId === PLAYER_ID ? { ...r, terrain: "plains", resource: null } : r)),
    };
    // Same board, but this realm holds a deep luxury stockpile to keep it content.
    const b: GameState = {
      ...a,
      nations: a.nations.map((n) =>
        n.id === PLAYER_ID
          ? { ...n, wares: { ...n.wares, furs: 500, cloth: 500, wool: 500, wax: 500, amber: 500 } }
          : n,
      ),
    };
    let poor = a;
    let content = b;
    for (let i = 0; i < 8; i++) {
      poor = resolveTurn(poor);
      content = resolveTurn(content);
    }
    const avgUnrest = (s: GameState): number => {
      const rs = s.regions.filter((r) => r.ownerId === PLAYER_ID);
      return rs.reduce((x, r) => x + r.unrest, 0) / rs.length;
    };
    // The supplied realm's burghers are content, so its provinces settle lower…
    expect(avgUnrest(content)).toBeLessThan(avgUnrest(poor));
    // …and it has spent luxuries from the stockpile doing so.
    const held = (s: GameState): number => contentmentWares().reduce((x, id) => x + playerNation(s).wares[id], 0);
    expect(held(content)).toBeLessThan(500 * 5);
  });

  it("reinvests surplus treasury into renown, deploying the hoard (R6)", () => {
    const g = createGame({ seed: 3 });
    const rich: GameState = {
      ...g,
      nations: g.nations.map((n) => (n.id === PLAYER_ID ? { ...n, stocks: { ...n.stocks, gold: 10000 } } : n)),
    };
    let s = rich;
    for (let i = 0; i < 10; i++) s = resolveTurn(s);
    const p = playerNation(s);
    expect(p.renown ?? 0).toBeGreaterThan(50); // surplus became lasting renown
    expect(p.stocks.gold).toBeLessThan(10000); // the idle hoard was deployed
  });

  it("keeps the working reserve liquid — no renown below it (R6)", () => {
    const g = createGame({ seed: 3 });
    const poor: GameState = {
      ...g,
      nations: g.nations.map((n) => (n.id === PLAYER_ID ? { ...n, stocks: { ...n.stocks, gold: 500 } } : n)),
    };
    // 500 gold is well under the reserve, so nothing is siphoned to renown this turn.
    expect(playerNation(resolveTurn(poor)).renown ?? 0).toBe(0);
    expect(TREASURY_RESERVE).toBeGreaterThan(500);
  });

  it("does not mutate the input state", () => {
    const g = createGame({ seed: 1 });
    const snapshot = JSON.stringify(g);
    resolveTurn(g);
    expect(JSON.stringify(g)).toBe(snapshot);
  });

  it("is deterministic and reproducible over many turns", () => {
    const run = (): number => {
      let s = createGame({ seed: 2024, rivals: 0 });
      for (let i = 0; i < 30; i++) s = resolveTurn(s);
      return playerNation(s).stocks.gold;
    };
    expect(run()).toBe(run());
  });

  it("higher taxes yield more treasury over time", () => {
    const play = (tax: number): number => {
      let s = setTaxRate(createGame({ seed: 5, rivals: 0 }), tax);
      for (let i = 0; i < 10; i++) s = resolveTurn(s);
      return playerNation(s).stocks.gold;
    };
    expect(play(TAX_MAX)).toBeGreaterThan(play(TAX_MIN));
  });

  it("keeps the log bounded", () => {
    let s = createGame({ seed: 1 });
    for (let i = 0; i < 100; i++) s = resolveTurn(s);
    expect(s.log.length).toBeLessThanOrEqual(50);
  });

  it("grows player population over a calm game", () => {
    let s = setTaxRate(createGame({ seed: 3, rivals: 0 }), 0);
    const ownedPop = (g: typeof s) =>
      g.regions.filter((r) => r.ownerId === PLAYER_ID).reduce((a, r) => a + r.population, 0);
    const start = ownedPop(s);
    for (let i = 0; i < 20; i++) s = resolveTurn(s);
    expect(ownedPop(s)).toBeGreaterThan(start);
  });

  it("raises unrest in player regions under sustained high taxes", () => {
    let s = setTaxRate(createGame({ seed: 3, rivals: 0 }), TAX_MAX);
    for (let i = 0; i < 15; i++) s = resolveTurn(s);
    const owned = s.regions.filter((r) => r.ownerId === PLAYER_ID);
    const avgUnrest = owned.reduce((a, r) => a + r.unrest, 0) / owned.length;
    expect(avgUnrest).toBeGreaterThan(10);
  });
});

describe("construction", () => {
  /** The id of a region the player owns at game start. */
  const ownedId = (g: ReturnType<typeof createGame>): number =>
    g.regions.find((r) => r.ownerId === PLAYER_ID)!.id;

  it("canQueueBuilding rejects a duplicate", () => {
    const g = createGame({ seed: 1 });
    const r = { ...g.regions[ownedId(g)]!, buildings: ["farm" as const] };
    expect(canQueueBuilding(r, "farm")).toBe(false);
    expect(canQueueBuilding(r, "market")).toBe(true);
  });

  it("canQueueBuilding rejects a region the player does not own", () => {
    const g = createGame({ seed: 1 });
    const barb = g.regions.find((r) => r.ownerId !== PLAYER_ID)!;
    expect(canQueueBuilding(barb, "market")).toBe(false);
  });

  it("canQueueBuilding gates the Harbor to coast terrain", () => {
    const g = createGame({ seed: 1 });
    const owned = g.regions[ownedId(g)]!;
    expect(canQueueBuilding({ ...owned, terrain: "coast" }, "harbor")).toBe(true);
    expect(canQueueBuilding({ ...owned, terrain: "plains" }, "harbor")).toBe(false);
  });

  it("canQueueBuilding needs BOTH the terrain and the tech for the Mine", () => {
    const g = createGame({ seed: 1 });
    const peak = { ...g.regions[ownedId(g)]!, terrain: "mountains" as const };
    expect(canQueueBuilding(peak, "mine")).toBe(false); // no Masonry yet
    expect(canQueueBuilding(peak, "mine", ["masonry"])).toBe(true);
    const flat = { ...peak, terrain: "plains" as const };
    expect(canQueueBuilding(flat, "mine", ["masonry"])).toBe(false);
  });

  it("canQueueBuilding needs BOTH the resource and the tech for the resource works (C2)", () => {
    const g = createGame({ seed: 1 });
    const owned = g.regions[ownedId(g)]!;
    const ironLand = { ...owned, resource: "iron" as const };
    const horseLand = { ...owned, resource: "horses" as const };
    const barren = { ...owned, resource: null };
    // Bloomery needs iron on the region AND Metallurgy.
    expect(canQueueBuilding(ironLand, "bloomery", ["metallurgy"])).toBe(true);
    expect(canQueueBuilding(ironLand, "bloomery", [])).toBe(false); // no tech
    expect(canQueueBuilding(barren, "bloomery", ["metallurgy"])).toBe(false); // no iron
    expect(canQueueBuilding(horseLand, "bloomery", ["metallurgy"])).toBe(false); // wrong resource
    // Stable needs horses on the region AND Husbandry.
    expect(canQueueBuilding(horseLand, "stable", ["husbandry"])).toBe(true);
    expect(canQueueBuilding(ironLand, "stable", ["husbandry"])).toBe(false); // wrong resource
  });

  it("queueBuilding refuses a terrain-bound building off its terrain", () => {
    const g = createGame({ seed: 1 });
    const id = ownedId(g);
    const inland = {
      ...g,
      regions: g.regions.map((r) => (r.id === id ? { ...r, terrain: "hills" as const } : r)),
    };
    expect(queueBuilding(inland, id, "harbor").regions[id]!.construction).toBeNull();
    const coastal = {
      ...g,
      regions: g.regions.map((r) => (r.id === id ? { ...r, terrain: "coast" as const } : r)),
    };
    expect(queueBuilding(coastal, id, "harbor").regions[id]!.construction).toEqual({
      building: "harbor",
      progress: 0,
    });
  });

  it("queueBuilding sets a construction order without mutating input", () => {
    const g = createGame({ seed: 1 });
    const id = ownedId(g);
    const next = queueBuilding(g, id, "market");
    expect(next.regions[id]!.construction).toEqual({ building: "market", progress: 0 });
    expect(g.regions[id]!.construction).toBeNull();
  });

  it("cancelConstruction clears the slot", () => {
    const base = createGame({ seed: 1 });
    const id = ownedId(base);
    let g = queueBuilding(base, id, "market");
    g = cancelConstruction(g, id);
    expect(g.regions[id]!.construction).toBeNull();
  });

  it("completes a queued building over enough turns", () => {
    let s = setTaxRate(createGame({ seed: 1, rivals: 0 }), 0);
    const id = ownedId(s);
    s = queueBuilding(s, id, "market");
    const turns = Math.ceil(BUILDINGS.market.cost / 6) + 3;
    for (let i = 0; i < turns; i++) s = resolveTurn(s);
    expect(s.regions[id]!.buildings).toContain("market");
  });

  describe("build queue", () => {
    it("enqueueBuilding starts the first build immediately, then queues the rest", () => {
      const g = createGame({ seed: 1 });
      const id = ownedId(g);
      let s = enqueueBuilding(g, id, "market");
      expect(s.regions[id]!.construction).toEqual({ building: "market", progress: 0 });
      expect(s.regions[id]!.buildQueue ?? []).toEqual([]);
      s = enqueueBuilding(s, id, "workshop");
      s = enqueueBuilding(s, id, "library");
      expect(s.regions[id]!.construction!.building).toBe("market"); // unchanged
      expect(s.regions[id]!.buildQueue).toEqual(["workshop", "library"]);
    });

    it("refuses to queue a duplicate, the in-progress job, or an already-built building", () => {
      const g = createGame({ seed: 1 });
      const id = ownedId(g);
      let s = enqueueBuilding(g, id, "market"); // now building market
      s = enqueueBuilding(s, id, "market"); // same as current job → no-op queue
      expect(s.regions[id]!.buildQueue ?? []).toEqual([]);
      s = enqueueBuilding(s, id, "workshop");
      s = enqueueBuilding(s, id, "workshop"); // dedup
      expect(s.regions[id]!.buildQueue).toEqual(["workshop"]);
      // Already-built is rejected by the gate.
      const built = { ...g.regions[id]!, buildings: ["library" as const] };
      expect(canEnqueueBuilding(built, "library")).toBe(false);
    });

    it("removeQueuedBuilding and clearBuildQueue edit the queue, current job intact", () => {
      const g = createGame({ seed: 1 });
      const id = ownedId(g);
      let s = enqueueBuilding(g, id, "market");
      s = enqueueBuilding(s, id, "workshop");
      s = enqueueBuilding(s, id, "library");
      s = removeQueuedBuilding(s, id, 0); // drop workshop
      expect(s.regions[id]!.buildQueue).toEqual(["library"]);
      s = clearBuildQueue(s, id);
      expect(s.regions[id]!.buildQueue).toBeUndefined();
      expect(s.regions[id]!.construction!.building).toBe("market"); // untouched
    });

    it("auto-starts the next queued build when the current one completes (real pipeline)", () => {
      let s = setTaxRate(createGame({ seed: 1, rivals: 0 }), 0);
      const id = ownedId(s);
      s = enqueueBuilding(s, id, "market");
      s = enqueueBuilding(s, id, "workshop");
      const turns = Math.ceil(BUILDINGS.market.cost / 6) + 2;
      for (let i = 0; i < turns; i++) s = resolveTurn(s);
      expect(s.regions[id]!.buildings).toContain("market");
      // Workshop has left the queue and is now the active construction.
      expect(s.regions[id]!.buildQueue ?? []).toEqual([]);
      expect(s.regions[id]!.construction?.building).toBe("workshop");
    });

    it("startQueuedBuildings skips a now-invalid entry and drops it", () => {
      const g = createGame({ seed: 1 });
      const id = ownedId(g);
      // Region idle, queue holds an already-built market then a valid workshop.
      const regions = g.regions.map((r) =>
        r.id === id ? { ...r, buildings: ["market" as const], construction: null, buildQueue: ["market" as const, "workshop" as const] } : r,
      );
      const next = startQueuedBuildings(regions, PLAYER_ID, []);
      expect(next[id]!.construction?.building).toBe("workshop"); // market skipped as built
      expect(next[id]!.buildQueue ?? []).toEqual([]);
    });
  });

  it("a completed market increases national gold output", () => {
    const seed = 1;
    let plain = setTaxRate(createGame({ seed, rivals: 0 }), 0);
    const id = ownedId(plain);
    let built = queueBuilding(plain, id, "market");
    for (let i = 0; i < 8; i++) {
      plain = resolveTurn(plain);
      built = resolveTurn(built);
    }
    expect(built.regions[id]!.buildings).toContain("market");
    const goldPlain = nationalProduction(plain, PLAYER_ID).gold;
    const goldBuilt = nationalProduction(built, PLAYER_ID).gold;
    expect(goldBuilt).toBeGreaterThan(goldPlain);
  });
});

describe("temporary modifiers", () => {
  it("tick down each turn and expire", () => {
    const base = createGame({ seed: 1, rivals: 0 });
    let s = {
      ...base,
      nations: base.nations.map((n) =>
        n.id === PLAYER_ID ? { ...n, modifiers: [{ id: "prosperity" as const, turnsLeft: 2 }] } : n,
      ),
    };
    s = resolveTurn(s);
    expect(playerNation(s).modifiers).toEqual([{ id: "prosperity", turnsLeft: 1 }]);
    s = resolveTurn(s);
    expect(playerNation(s).modifiers).toBeUndefined(); // expired, dropped
  });
});

describe("war-weariness", () => {
  const wearyOf = (g: ReturnType<typeof createGame>) =>
    playerNation(g).modifiers?.find((m) => m.id === "war_weary");

  it("accrues while at war and lingers, then decays after peace", () => {
    // Put the player at war with rival 2 from the start.
    let s: GameState = { ...createGame({ seed: 1, rivals: 2 }), treaties: { "0-2": "war" } };
    s = resolveTurn(s);
    expect(wearyOf(s)?.turnsLeft).toBe(3); // refreshed while at war
    s = resolveTurn(s);
    expect(wearyOf(s)?.turnsLeft).toBe(3); // still refreshed

    // Make peace: the modifier should now tick down and expire.
    s = { ...s, treaties: {} };
    s = resolveTurn(s);
    expect(wearyOf(s)?.turnsLeft).toBe(2);
    s = resolveTurn(s);
    s = resolveTurn(s);
    expect(wearyOf(s)).toBeUndefined(); // gone
  });

  it("scales with the number of simultaneous wars, capped at 3", () => {
    // One war → 1 stack.
    let one: GameState = { ...createGame({ seed: 3, rivals: 3 }), treaties: { "0-2": "war" } };
    one = resolveTurn(one);
    expect(wearyOf(one)?.stacks).toBe(1);

    // Two simultaneous wars → 2 stacks (a heavier drag).
    let two: GameState = { ...createGame({ seed: 3, rivals: 3 }), treaties: { "0-2": "war", "0-3": "war" } };
    two = resolveTurn(two);
    expect(wearyOf(two)?.stacks).toBe(2);
  });
});

describe("score history", () => {
  it("seeds a one-entry series per non-barbarian nation at game start", () => {
    const g = createGame({ seed: 7, rivals: 2 });
    const expected = g.nations.filter((n) => !n.isBarbarian).map((n) => n.id).sort((a, b) => a - b);
    expect(Object.keys(g.scoreHistory!).map(Number).sort((a, b) => a - b)).toEqual(expected);
    expect(g.scoreHistory![PLAYER_ID]).toHaveLength(1);
    expect(g.scoreHistory![PLAYER_ID]![0]).toBeGreaterThan(0);
  });

  it("appends one sample per resolved turn to every series", () => {
    let s = createGame({ seed: 7, rivals: 1 });
    const before = s.scoreHistory![PLAYER_ID]!.length;
    s = resolveTurn(s);
    s = resolveTurn(s);
    expect(s.scoreHistory![PLAYER_ID]!.length).toBe(before + 2);
    // Series stay equal length (turns line up by index).
    const lengths = Object.values(s.scoreHistory!).map((a) => a.length);
    expect(new Set(lengths).size).toBe(1);
  });

  it("stays deterministic (same seed → identical history)", () => {
    const run = (seed: number) => {
      let s = createGame({ seed, rivals: 1 });
      for (let i = 0; i < 10; i++) s = resolveTurn(s);
      return s.scoreHistory;
    };
    expect(run(42)).toEqual(run(42));
  });

  it("does not grow history once the game is decided", () => {
    let s = createGame({ seed: 7, rivals: 0 });
    s = resolveTurn(s);
    s = { ...s, outcome: "victory" };
    const len = s.scoreHistory![PLAYER_ID]!.length;
    s = resolveTurn(s);
    expect(s.scoreHistory![PLAYER_ID]!.length).toBe(len);
  });
});

describe("hansa town-size hierarchy", () => {
  it("gives historic hubs a bigger population cap than hinterland", () => {
    const g = createGame({ seed: 135625, mapId: "hansa" });
    const caps = g.regions.map((r) => regionCapacity(r));
    const max = Math.max(...caps);
    const min = Math.min(...caps);
    // A Kontor city / capital should out-scale a backwater by a clear margin.
    expect(max).toBeGreaterThanOrEqual(18);
    expect(max).toBeGreaterThan(min * 2);
  });

  it("sets a per-region baseCapacity on the hansa map", () => {
    const g = createGame({ seed: 42, mapId: "hansa" });
    expect(g.regions.every((r) => typeof r.baseCapacity === "number")).toBe(true);
  });
});

describe("hansa strategic resources (Plan 3B)", () => {
  it("seeds iron, horses, salt and amber on the Hansa board", () => {
    const g = createGame({ seed: 5, mapId: "hansa" });
    const resources = new Set(g.regions.map((r) => r.resource).filter(Boolean));
    expect(resources.has("iron")).toBe(true);
    expect(resources.has("horses")).toBe(true);
    expect(resources.has("salt")).toBe(true);
    expect(resources.has("amber")).toBe(true);
    // Königsberg (region 68) is the Samland amber coast; Bergslagen (34) the ore.
    expect(g.regions[68]!.resource).toBe("amber");
    expect(g.regions[34]!.resource).toBe("iron");
  });
});

describe("the Øresund Sound toll seeding (Plan 3B / trade-as-power)", () => {
  it("seeds the Sound on the Hansa board (Zealand as the tollhouse)", () => {
    const hansa = createGame({ seed: 5, mapId: "hansa" });
    expect(hansa.sound).toBeDefined();
    expect(hansa.sound!.regionId).toBe(23);
    expect(hansa.sound!.embargoes).toEqual([]);
    expect(hansa.sound!.tollRate).toBeGreaterThan(0);
  });
});
