import { describe, it, expect } from "vitest";
import {
  HANSA_HOLD_TURNS,
  HANSA_VICTORY,
  hansaControl,
  hansaLeader,
  hansaWinner,
  tickHansaHold,
} from "@/systems/hansa";
import { checkVictory, victoryRaces } from "@/systems/victory";
import { createGame } from "@/systems/turn";
import { KONTORE, KONTOR_IDS } from "@/data/kontore";
import { SEA_ZONES } from "@/data/sea";
import { PLAYER_ID, emptyUnits, type GameState, type TradeRoute } from "@/systems/state";

const RIVAL = 2;

/** The authored board, with the player holding nothing special. */
function board(): GameState {
  return createGame({ seed: 12 });
}

describe("hansaControl", () => {
  it("starts nobody near the win — the network is up for grabs", () => {
    const g = board();
    for (const n of g.nations) {
      if (n.isBarbarian) continue;
      expect(hansaControl(g, n.id).total).toBeLessThan(HANSA_VICTORY);
    }
  });

  it("counts a held Kontor town as full control of it, a route there as a foothold", () => {
    const g = board();
    const london = KONTORE.london.regionId;
    const holder: GameState = {
      ...g,
      regions: g.regions.map((r) => (r.id === london ? { ...r, ownerId: PLAYER_ID } : r)),
    };
    const trader: GameState = {
      ...g,
      routes: [
        { id: 0, ownerId: PLAYER_ID, good: "iron", fromRegionId: 8, toKontorId: "london", lane: [8, london] },
      ],
    };
    const none = hansaControl(g, PLAYER_ID).kontore;
    expect(hansaControl(holder, PLAYER_ID).kontore).toBeCloseTo(none + 1 / KONTOR_IDS.length, 5);
    // A foothold is worth a fraction of holding the town, and strictly less.
    const foothold = hansaControl(trader, PLAYER_ID).kontore;
    expect(foothold).toBeGreaterThan(none);
    expect(foothold).toBeLessThan(hansaControl(holder, PLAYER_ID).kontore);
  });

  it("gives a disrupted route no Kontor credit — severed trade is not trade power", () => {
    const g = board();
    const live: TradeRoute = { id: 0, ownerId: PLAYER_ID, good: "iron", fromRegionId: 8, toKontorId: "london", lane: [8, 0] };
    const open = hansaControl({ ...g, routes: [live] }, PLAYER_ID).kontore;
    const cut = hansaControl({ ...g, routes: [{ ...live, disrupted: true }] }, PLAYER_ID).kontore;
    expect(cut).toBeLessThan(open);
  });

  it("measures wares as a share of what the whole network earns, not route count", () => {
    const g = board();
    const routes: TradeRoute[] = [
      { id: 0, ownerId: PLAYER_ID, good: "iron", fromRegionId: 8, toKontorId: "london", lane: [8, 0], lastIncome: 30 },
      { id: 1, ownerId: RIVAL, good: "grain", fromRegionId: 14, toKontorId: "bruges", lane: [14, 5], lastIncome: 10 },
      { id: 2, ownerId: RIVAL, good: "grain", fromRegionId: 18, toKontorId: "bruges", lane: [18, 5], lastIncome: 10 },
    ];
    const s = { ...g, routes };
    // Outnumbered two routes to one, but carrying more: 30 of 50.
    expect(hansaControl(s, PLAYER_ID).wares).toBeCloseTo(0.6, 5);
    expect(hansaControl(s, RIVAL).wares).toBeCloseTo(0.4, 5);
  });

  it("scores League standing as outside / member / Alderman", () => {
    const g = board();
    expect(hansaControl(g, PLAYER_ID).league).toBe(0);
    const member: GameState = { ...g, league: { foundedTurn: 1, members: [RIVAL, PLAYER_ID], boycotts: [] } };
    expect(hansaControl(member, PLAYER_ID).league).toBeCloseTo(0.55, 5);
    // The Alderman is the member holding the most Kontore.
    const alderman: GameState = {
      ...member,
      regions: member.regions.map((r) =>
        r.id === KONTORE.london.regionId || r.id === KONTORE.bruges.regionId ? { ...r, ownerId: PLAYER_ID } : r,
      ),
    };
    expect(hansaControl(alderman, PLAYER_ID).league).toBe(1);
  });

  it("credits a sea lane for the ports held and the water a fleet can deny", () => {
    const g = board();
    const zone = SEA_ZONES.north_sea;
    const ports: GameState = {
      ...g,
      regions: g.regions.map((r) => (zone.coastalRegions.includes(r.id) ? { ...r, ownerId: PLAYER_ID } : r)),
    };
    const withFleet: GameState = {
      ...ports,
      armies: [
        { id: 900, ownerId: PLAYER_ID, regionId: zone.coastalRegions[0]!, seaZoneId: "north_sea", units: { ...emptyUnits(), war_cog: 2 }, movesLeft: 1 },
      ],
    };
    const contested: GameState = {
      ...withFleet,
      treaties: { ...g.treaties, [`${Math.min(PLAYER_ID, RIVAL)}-${Math.max(PLAYER_ID, RIVAL)}`]: "war" },
      armies: [
        ...withFleet.armies,
        { id: 901, ownerId: RIVAL, regionId: zone.coastalRegions[0]!, seaZoneId: "north_sea", units: { ...emptyUnits(), war_cog: 3 }, movesLeft: 1 },
      ],
    };
    const bare = hansaControl(g, PLAYER_ID).lanes;
    expect(hansaControl(ports, PLAYER_ID).lanes).toBeGreaterThan(bare);
    // A fleet on an uncontested sea adds denial on top of the harbours...
    expect(hansaControl(withFleet, PLAYER_ID).lanes).toBeGreaterThan(hansaControl(ports, PLAYER_ID).lanes);
    // ...and an enemy squadron in the same water takes that back.
    expect(hansaControl(contested, PLAYER_ID).lanes).toBeCloseTo(hansaControl(ports, PLAYER_ID).lanes, 5);
  });

  it("names the realm with the firmest grip", () => {
    const g = board();
    const rivalStrong: GameState = {
      ...g,
      regions: g.regions.map((r) =>
        KONTOR_IDS.some((id) => KONTORE[id].regionId === r.id) ? { ...r, ownerId: RIVAL } : r,
      ),
    };
    expect(hansaLeader(rivalStrong)?.id).toBe(RIVAL);
  });
});

describe("the Hansa win", () => {
  /** A board where the player holds the whole network. */
  function mastered(): GameState {
    const g = board();
    const seaPorts = new Set(Object.values(SEA_ZONES).flatMap((z) => z.coastalRegions));
    return {
      ...g,
      league: { foundedTurn: 1, members: [PLAYER_ID], boycotts: [] },
      regions: g.regions.map((r) =>
        KONTOR_IDS.some((id) => KONTORE[id].regionId === r.id) || seaPorts.has(r.id)
          ? { ...r, ownerId: PLAYER_ID }
          : r,
      ),
      routes: [
        { id: 0, ownerId: PLAYER_ID, good: "iron", fromRegionId: 8, toKontorId: "london", lane: [8, 0], lastIncome: 40 },
      ],
    };
  }

  it("needs the network *held*, not merely reached", () => {
    let s = mastered();
    expect(hansaControl(s, PLAYER_ID).total).toBeGreaterThanOrEqual(HANSA_VICTORY);
    for (let turn = 1; turn < HANSA_HOLD_TURNS; turn++) {
      s = tickHansaHold(s);
      expect(hansaWinner(s)).toBe(null); // still counting
    }
    s = tickHansaHold(s);
    expect(hansaWinner(s)).toBe(PLAYER_ID);
    expect(checkVictory(s)).toEqual({ outcome: "victory", kind: "Hansa control" });
  });

  it("resets the clock the moment control slips — a lost Kontor undoes the run", () => {
    let s = mastered();
    for (let turn = 0; turn < HANSA_HOLD_TURNS - 1; turn++) s = tickHansaHold(s);
    expect(s.nations[PLAYER_ID]!.hansaHold).toBe(HANSA_HOLD_TURNS - 1);
    // Novgorod is stormed: the network is broken and the count starts over.
    const broken: GameState = {
      ...s,
      regions: s.regions.map((r) =>
        KONTOR_IDS.some((id) => KONTORE[id].regionId === r.id) ? { ...r, ownerId: RIVAL } : r,
      ),
      routes: [],
    };
    const after = tickHansaHold(broken);
    expect(after.nations[PLAYER_ID]!.hansaHold).toBe(0);
    expect(hansaWinner(after)).toBe(null);
  });

  it("leads the victory races, and shows the hold clock once it is running", () => {
    const races = victoryRaces(tickHansaHold(mastered()));
    expect(races[0]!.kind).toBe("hansa");
    expect(races[0]!.you.value).toContain(`held 1/${HANSA_HOLD_TURNS}`);
    expect(races.map((r) => r.kind)).toEqual(["hansa", "domination", "prestige"]);
  });

  it("beats a conqueror who crosses the land threshold on the same turn", () => {
    let s = mastered();
    for (let turn = 0; turn < HANSA_HOLD_TURNS; turn++) s = tickHansaHold(s);
    // A rival simultaneously owns everything else on the board.
    const alsoConquered: GameState = {
      ...s,
      regions: s.regions.map((r) => (r.ownerId === PLAYER_ID ? r : { ...r, ownerId: RIVAL })),
    };
    expect(checkVictory(alsoConquered)).toEqual({ outcome: "victory", kind: "Hansa control" });
  });
});
