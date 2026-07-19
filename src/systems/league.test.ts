import { describe, it, expect } from "vitest";
import {
  foundLeague,
  joinLeague,
  leaveLeague,
  canFoundLeague,
  canJoinLeague,
  leagueLeader,
  kontoreHeldBy,
  setLeagueBoycott,
  isBoycotted,
  kontorBlockedFor,
  leagueSeversRoute,
  stepLeague,
  leagueDividendPool,
} from "@/systems/league";
import { declareWar } from "@/systems/diplomacy";
import { KONTORE } from "@/data/kontore";
import { PLAYER_ID, BARBARIAN_ID, type GameState, type Region, type TradeRoute } from "@/systems/state";

const A = PLAYER_ID; // 0 — the player
const B = 2;
const C = 3;
const LONDON = KONTORE.london.regionId; // 0
const BRUGES = KONTORE.bruges.regionId; // 5
const BERGEN = KONTORE.bergen.regionId; // 30
const NOV = KONTORE.novgorod.regionId; // 62

function reg(over: Partial<Region> = {}): Region {
  return {
    id: 0, name: "R", terrain: "coast", ownerId: BARBARIAN_ID, population: 5, unrest: 0,
    fortification: 0, resource: null, buildings: [], construction: null, adjacency: [], x: 0, y: 0, ...over,
  };
}
function regionsOf(count: number, overrides: Record<number, Partial<Region>> = {}): Region[] {
  return Array.from({ length: count }, (_, i) => reg({ id: i, ...(overrides[i] ?? {}) }));
}
const nat = (id: number, gold = 100) => ({ id, name: `N${id}`, isPlayer: id === PLAYER_ID, isBarbarian: id === BARBARIAN_ID, alive: true, stocks: { gold, food: 0, materials: 0, knowledge: 0 } });

function state(regions: Region[], over: Partial<GameState> = {}): GameState {
  return {
    turn: 5, mapId: "hansa",
    nations: [nat(A), nat(BARBARIAN_ID, 0), nat(B), nat(C)],
    regions, armies: [], nextArmyId: 0, routes: [], nextRouteId: 0,
    relations: {}, treaties: {}, offers: [], nextOfferId: 0, difficulty: "normal", outcome: "playing", log: [],
    ...over,
  } as unknown as GameState;
}
const route = (id: number, owner: number, kontor: "london" | "bruges" | "bergen" | "novgorod"): TradeRoute => ({
  id, ownerId: owner, good: "iron", fromRegionId: 1, toKontorId: kontor, lane: [1, KONTORE[kontor].regionId],
});

describe("founding & joining the League", () => {
  it("only a trading power (enough routes) may found it, once, on the Hansa map", () => {
    const twoRoutes = state(regionsOf(63), { routes: [route(0, A, "london"), route(1, A, "bruges")] });
    expect(canFoundLeague(twoRoutes, A)).toBe(false); // under the route threshold
    const threeRoutes = state(regionsOf(63), { routes: [route(0, A, "london"), route(1, A, "bruges"), route(2, A, "bergen")] });
    expect(canFoundLeague(threeRoutes, A)).toBe(true);
    const founded = foundLeague(threeRoutes, A);
    expect(founded.league!.members).toEqual([A]);
    expect(canFoundLeague(founded, B)).toBe(false); // only one League
    // Not on a procedural map.
    expect(canFoundLeague({ ...threeRoutes, mapId: undefined }, A)).toBe(false);
  });

  it("a realm joins only at peace with every member", () => {
    const s = state(regionsOf(63), { league: { members: [A], foundedTurn: 1, boycotts: [] } });
    expect(canJoinLeague(s, B)).toBe(true);
    expect(joinLeague(s, B).league!.members).toEqual([A, B]);
    const atWarState = declareWar(s, B, A);
    expect(canJoinLeague(atWarState, B)).toBe(false); // war with a member bars joining
  });

  it("leaving cools relations with those left behind; the last member dissolves it", () => {
    const s = state(regionsOf(63), { league: { members: [A, B], foundedTurn: 1, boycotts: [] } });
    const left = leaveLeague(s, B);
    expect(left.league!.members).toEqual([A]);
    expect(left.relations["0-2"]).toBeLessThan(0); // A↔B cooled
    expect(leaveLeague(left, A).league).toBeUndefined(); // empties → dissolves
  });
});

describe("the Alderman (leader) is the member holding the most Kontore", () => {
  it("shifts with Kontor ownership, breaking ties to the founder", () => {
    const regions = regionsOf(63, { [LONDON]: { ownerId: A }, [BRUGES]: { ownerId: A }, [BERGEN]: { ownerId: B } });
    const s = state(regions, { league: { members: [A, B], foundedTurn: 1, boycotts: [] } });
    expect(kontoreHeldBy(s, A)).toBe(2);
    expect(leagueLeader(s)).toBe(A);
    // B takes Novgorod too → 2 each → tie breaks to the founder (A, listed first).
    const tied = { ...s, regions: s.regions.map((r) => (r.id === NOV ? { ...r, ownerId: B } : r)) };
    expect(leagueLeader(tied)).toBe(A);
    // B seizes a third → B leads.
    const bLeads = { ...tied, regions: tied.regions.map((r) => (r.id === BRUGES ? { ...r, ownerId: B } : r)) };
    expect(leagueLeader(bLeads)).toBe(B);
  });
});

describe("Kontor access & the trade dividend", () => {
  const regions = regionsOf(63, { [LONDON]: { ownerId: A }, [BRUGES]: { ownerId: A }, [BERGEN]: { ownerId: B }, [NOV]: { ownerId: C } });
  const league = { members: [A, B], foundedTurn: 1, boycotts: [] as number[] };

  it("shuts non-members out of League-held Kontore, but lets members trade", () => {
    const s = state(regions, { league });
    expect(kontorBlockedFor(s, C, "london")).toBe(true); // C is not a member; London is League-held
    expect(kontorBlockedFor(s, B, "london")).toBe(false); // B is a member
    expect(kontorBlockedFor(s, C, "novgorod")).toBe(false); // Novgorod is held by C (non-member) — open to them
    expect(leagueSeversRoute(s, route(0, C, "london"))).toBe(true);
    expect(leagueSeversRoute(s, route(0, B, "london"))).toBe(false);
  });

  it("pays members an equal share of their Kontore's league income", () => {
    const s = state(regions, { league });
    // London(5) + Bruges(5) held by A, Bergen(2) by B → pool 12; Novgorod (C, non-member) excluded.
    const pool = leagueDividendPool(s);
    expect(pool).toBe(KONTORE.london.leagueIncome + KONTORE.bruges.leagueIncome + KONTORE.bergen.leagueIncome);
    const share = pool / 2;
    const after = stepLeague(s);
    expect(after.nations.find((n) => n.id === A)!.stocks.gold).toBeCloseTo(100 + share, 5);
    expect(after.nations.find((n) => n.id === B)!.stocks.gold).toBeCloseTo(100 + share, 5);
    expect(after.nations.find((n) => n.id === C)!.stocks.gold).toBe(100); // non-member: nothing
  });
});

describe("the collective boycott (the ultimate weapon)", () => {
  const regions = regionsOf(63, { [LONDON]: { ownerId: A }, [NOV]: { ownerId: C } });

  it("only the Alderman may call one; it levies the Pfundzoll and cuts the target off entirely", () => {
    const s = state(regions, { league: { members: [A, B], foundedTurn: 1, boycotts: [] } });
    expect(setLeagueBoycott(s, B, C, true)).toBe(s); // B is not the leader (A holds London) → no-op
    const boycotted = setLeagueBoycott(s, A, C, true);
    expect(isBoycotted(boycotted, C)).toBe(true);
    expect(boycotted.nations.find((n) => n.id === A)!.stocks.gold).toBeLessThan(100); // paid the levy
    // A boycott is total: even C's own Novgorod route is severed.
    expect(leagueSeversRoute(boycotted, route(0, C, "novgorod"))).toBe(true);
    expect(boycotted.relations["0-3"]).toBeLessThan(0); // C resents the League
  });
});

describe("peace among members", () => {
  it("a member cannot declare war on a fellow member (must leave first)", () => {
    const s = state(regionsOf(63), { league: { members: [A, B], foundedTurn: 1, boycotts: [] } });
    expect(declareWar(s, A, B)).toBe(s); // no-op while both are members
    const afterLeave = leaveLeague(s, A);
    expect(declareWar(afterLeave, A, B)).not.toBe(afterLeave); // once out, war is possible
  });
});
