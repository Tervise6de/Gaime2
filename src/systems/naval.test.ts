import { describe, expect, it } from "vitest";
import { createGame } from "@/systems/turn";
import { emptyUnits, emptyWares, BARBARIAN_ID, PLAYER_ID, armySize, type GameState, type TradeRoute } from "@/systems/state";
import { armyIsAtSea, armyIsFleet, moveArmy, sailToSeaZone } from "@/systems/military";
import { routeBlockaded, routeDisrupted, stepTrade } from "@/systems/trade";
import { runNationTurn } from "@/systems/ai";
import { createRng } from "@/systems/rng";

function hansa(): GameState {
  const state = createGame({ seed: 17, playerFaction: "England" });
  return {
    ...state,
    regions: state.regions.map((r) => r.id === 5 ? { ...r, ownerId: BARBARIAN_ID } : r),
    armies: [],
  };
}

describe("functional naval layer", () => {
  it("moves a fleet into the North Sea and lands carried troops at Bruges", () => {
    const state = hansa();
    const withFleet: GameState = {
      ...state,
      armies: [{ id: 900, ownerId: PLAYER_ID, regionId: 0, units: { ...emptyUnits(), war_cog: 1, infantry: 2 }, movesLeft: 2 }],
    };
    const atSea = sailToSeaZone(withFleet, 900, "north_sea");
    expect(armyIsAtSea(atSea.armies[0]!)).toBe(true);
    expect(atSea.armies[0]!.seaZoneId).toBe("north_sea");
    const landed = moveArmy(atSea, 900, 5);
    expect(landed.armies[0]!.seaZoneId).toBeUndefined();
    expect(landed.armies[0]!.regionId).toBe(5);
    expect(landed.regions[5]!.ownerId).toBe(PLAYER_ID);
  });

  it("resolves an interception with the shared deterministic battle report", () => {
    const state = hansa();
    const enemyId = state.nations.find((n) => !n.isBarbarian && !n.isPlayer)!.id;
    const withFleets: GameState = {
      ...state,
      armies: [
        { id: 901, ownerId: PLAYER_ID, regionId: 0, units: { ...emptyUnits(), war_cog: 4 }, movesLeft: 2 },
        { id: 902, ownerId: enemyId, regionId: 5, seaZoneId: "north_sea", units: { ...emptyUnits(), war_cog: 1 }, movesLeft: 0 },
      ],
      treaties: { ...state.treaties, [`${Math.min(PLAYER_ID, enemyId)}-${Math.max(PLAYER_ID, enemyId)}`]: "war" },
    };
    const next = sailToSeaZone(withFleets, 901, "north_sea");
    expect(next.battles?.at(-1)?.terrainName).toBe("Open sea");
    expect(next.rngState).not.toBe(withFleets.rngState);
  });

  it("lets a hostile fleet blockade a route touching its sea lane", () => {
    const state = hansa();
    const enemyId = state.nations.find((n) => !n.isBarbarian && !n.isPlayer)!.id;
    const route: TradeRoute = { id: 77, ownerId: PLAYER_ID, good: "grain", fromRegionId: 0, toKontorId: "bruges", lane: [0, 5] };
    const blocked: GameState = {
      ...state,
      routes: [route],
      armies: [{ id: 903, ownerId: enemyId, regionId: 5, seaZoneId: "north_sea", units: { ...emptyUnits(), war_cog: 1 }, movesLeft: 0 }],
      treaties: { ...state.treaties, [`${Math.min(PLAYER_ID, enemyId)}-${Math.max(PLAYER_ID, enemyId)}`]: "war" },
    };
    expect(routeBlockaded(blocked, route)).toBe(true);
    expect(routeDisrupted(blocked, route)).toBe(true);
    const next = stepTrade(blocked);
    expect(next.routes?.[0]?.blockaded).toBe(true);
    expect(next.routes?.[0]?.lastIncome).toBe(0);
  });

  it("gives an aggressive rival a working navy when it can afford one", () => {
    const state = hansa();
    const rival = state.nations.find((n) => !n.isBarbarian && !n.isPlayer)!;
    const port = state.regions.find((r) => r.ownerId === rival.id && r.terrain === "coast");
    expect(port).toBeDefined();
    const funded: GameState = {
      ...state,
      nations: state.nations.map((n) => n.id === rival.id
        ? { ...n, personality: { archetype: n.personality?.archetype ?? "warlord", aggression: 0.95, expansion: n.personality?.expansion ?? 0.8, economy: n.personality?.economy ?? 0.5, trustworthiness: n.personality?.trustworthiness ?? 0.3 }, stocks: { ...n.stocks, gold: 1000 }, wares: { ...emptyWares(), timber: 100, naval_stores: 100 } }
        : n),
    };
    const after = runNationTurn(funded, rival.id, createRng(991));
    expect(after.armies.some((a) => a.ownerId === rival.id && armyIsFleet(a.units) && armySize(a.units) > 0)).toBe(true);
  });
});
