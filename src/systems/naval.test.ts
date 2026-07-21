/**
 * The functional sea layer (docs/game-design.md §Military): open water is a real
 * barrier. Land armies cannot cross a sea crossing; only a fleet (a stack holding a
 * warship, incl. an amphibious troops+ships stack) sails it, and only puts in at a
 * coastal region. Rival AI lays down fleets to contest overseas targets, and an
 * at-war enemy fleet blockades trade running through the node it sits on.
 *
 * These run on the real hansa geometry, where Visby (Gotland) is a true island and
 * every sea target is one hop from a coastal port.
 */

import { describe, it, expect } from "vitest";
import { createGame } from "@/systems/turn";
import {
  moveArmy,
  reachableRegions,
  nextHopToward,
  armyPassability,
  armyIsFleet,
} from "@/systems/military";
import { routeDisrupted, blockadedBy } from "@/systems/trade";
import { runNationTurn } from "@/systems/ai";
import { declareWar, makePeace } from "@/systems/diplomacy";
import { createRng } from "@/systems/rng";
import { GOOD_IDS } from "@/data/goods";
import { KONTORE, KONTOR_IDS } from "@/data/kontore";
import { PLAYER_ID, emptyUnits, type Army, type GameState, type TradeRoute } from "@/systems/state";

const game = () => createGame({ seed: 1 });
const rid = (g: GameState, name: string): number => g.regions.find((r) => r.name === name)!.id;
const nid = (g: GameState, name: string): number => g.nations.find((n) => n.name === name)!.id;
const own = (g: GameState, regionId: number, ownerId: number): GameState => ({
  ...g,
  regions: g.regions.map((r) => (r.id === regionId ? { ...r, ownerId } : r)),
});
const withArmy = (g: GameState, a: Army): GameState => ({ ...g, armies: [...g.armies, a], nextArmyId: (g.nextArmyId ?? 0) + 1 });
const army = (id: number, regionId: number, units: Partial<Record<string, number>>, ownerId = PLAYER_ID): Army => ({
  id,
  ownerId,
  regionId,
  units: { ...emptyUnits(), ...units } as Army["units"],
  movesLeft: 2,
});

describe("sea barrier", () => {
  it("bars a land army from crossing open water", () => {
    let g = game();
    const stockholm = rid(g, "Stockholm");
    const visby = rid(g, "Visby");
    g = own(own(g, stockholm, PLAYER_ID), visby, PLAYER_ID); // own both, so it would be a legal relocate if not for the sea
    g = { ...g, armies: [army(0, stockholm, { militia: 3 })], nextArmyId: 1 };
    expect(moveArmy(g, 0, visby).armies[0]!.regionId).toBe(stockholm); // land stays ashore
  });

  it("lets a fleet sail across open water to a coastal region", () => {
    let g = game();
    const stockholm = rid(g, "Stockholm");
    const visby = rid(g, "Visby");
    g = own(own(g, stockholm, PLAYER_ID), visby, PLAYER_ID);
    g = { ...g, armies: [army(0, stockholm, { war_cog: 1 })], nextArmyId: 1 };
    expect(moveArmy(g, 0, visby).armies[0]!.regionId).toBe(visby); // the fleet made the crossing
  });

  it("keeps a fleet out of an inland region", () => {
    let g = game();
    const visby = rid(g, "Visby");
    const ost = rid(g, "Östergötland"); // a plains sea-neighbour of Visby
    g = own(own(g, visby, PLAYER_ID), ost, PLAYER_ID);
    g = { ...g, armies: [army(0, visby, { war_cog: 1 })], nextArmyId: 1 };
    expect(moveArmy(g, 0, ost).armies[0]!.regionId).toBe(visby); // plains → no landing
  });

  it("carries embarked troops across on a mixed (amphibious) stack", () => {
    let g = game();
    const stockholm = rid(g, "Stockholm");
    const visby = rid(g, "Visby");
    g = own(own(g, stockholm, PLAYER_ID), visby, PLAYER_ID);
    g = { ...g, armies: [army(0, stockholm, { war_cog: 1, militia: 4 })], nextArmyId: 1 };
    const moved = moveArmy(g, 0, visby).armies[0]!;
    expect(moved.regionId).toBe(visby);
    expect(moved.units.militia).toBe(4); // the soldiers rode the fleet over
  });
});

describe("passability-aware reach & pathing", () => {
  it("reachableRegions strands a land army on an island but lets a fleet sail the coast", () => {
    const g = game();
    const visby = g.regions.find((r) => r.name === "Visby")!;
    expect(reachableRegions(g, army(0, visby.id, { militia: 2 }))).toEqual([]);
    const reach = reachableRegions(g, army(1, visby.id, { war_cog: 1 }));
    expect(reach.length).toBeGreaterThan(0);
    expect(reach.every((id) => g.regions[id]!.terrain === "coast")).toBe(true);
  });

  it("nextHopToward routes a fleet off the island where a land army has no path", () => {
    const g = game();
    const visby = rid(g, "Visby");
    const stockholm = rid(g, "Stockholm");
    const land = army(0, visby, { militia: 2 });
    const fleet = army(1, visby, { war_cog: 1 });
    expect(nextHopToward(g, visby, stockholm, armyPassability(g, land))).toBeNull();
    expect(nextHopToward(g, visby, stockholm, armyPassability(g, fleet))).toBe(stockholm); // one hop over the water
  });
});

describe("naval blockade of trade", () => {
  it("blockadedBy detects only an at-war enemy fleet", () => {
    let g = game();
    const foe = nid(g, "England");
    const node = rid(g, "Bruges");
    g = declareWar(g, PLAYER_ID, foe);
    const withFleet = withArmy(g, army(900, node, { war_cog: 1 }, foe));
    expect(blockadedBy(withFleet, node, PLAYER_ID)).toBe(true);
    // A land army is not a blockade…
    expect(blockadedBy(withArmy(g, army(900, node, { militia: 3 }, foe)), node, PLAYER_ID)).toBe(false);
    // …and peace lifts it.
    expect(blockadedBy(makePeace(withFleet, PLAYER_ID, foe), node, PLAYER_ID)).toBe(false);
  });

  it("a blockading fleet severs a route running through that node", () => {
    let g = game();
    const foe = nid(g, "England");
    const node = rid(g, "Holland");
    const k = KONTOR_IDS[0]!;
    g = own(g, node, PLAYER_ID); // we hold the land — only the sea is contested
    g = own(g, KONTORE[k].regionId, PLAYER_ID); // neutralise the Kontor-host war check
    g = declareWar(g, PLAYER_ID, foe);
    const route: TradeRoute = { id: 0, ownerId: PLAYER_ID, good: GOOD_IDS[0], fromRegionId: node, toKontorId: k, lane: [node] };
    expect(routeDisrupted(g, route)).toBe(false); // at war, but no enemy at sea on the lane
    const blockaded = withArmy(g, army(900, node, { war_cog: 1 }, foe));
    expect(routeDisrupted(blockaded, route)).toBe(true); // the cog chokes it
  });
});

describe("rival AI navy", () => {
  it("lays down a fleet to contest an overseas island", () => {
    let g = game();
    const sweden = nid(g, "Sweden");
    const gotland = nid(g, "Gotland");
    g = declareWar(g, sweden, gotland); // Stockholm now faces Visby across the water
    // Make sure Sweden can pay for a cog (gold + timber + naval stores).
    g = {
      ...g,
      nations: g.nations.map((n) =>
        n.id === sweden
          ? { ...n, stocks: { ...n.stocks, gold: 400 }, wares: { ...n.wares, timber: 40, naval_stores: 40 } }
          : n,
      ),
    };
    const before = g.armies.filter((a) => a.ownerId === sweden && armyIsFleet(a.units)).length;
    const after = runNationTurn(g, sweden, createRng(g.rngState));
    const fleets = after.armies.filter((a) => a.ownerId === sweden && armyIsFleet(a.units)).length;
    expect(before).toBe(0);
    expect(fleets).toBeGreaterThan(0);
  });
});
