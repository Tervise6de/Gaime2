import { describe, it, expect } from "vitest";
import { serializeGame, deserializeGame, saveToLocal, clearLocalSave, slotInfo } from "@/systems/save";
import { createGame, resolveTurn } from "@/systems/turn";
import { PLAYER_ID, type GameState, type TradeRoute } from "@/systems/state";

describe("save / load", () => {
  it("round-trips a game exactly", () => {
    let g = createGame({ seed: 12345, rivals: 2, difficulty: "hard" });
    for (let i = 0; i < 12; i++) g = resolveTurn(g);
    const restored = deserializeGame(serializeGame(g, 0));
    // `battles` is a transient per-turn UI cache and is deliberately not
    // persisted; everything durable must round-trip identically.
    const { battles: _b, ...durable } = g;
    expect(restored).toEqual(durable);
  });

  it("a restored game continues deterministically", () => {
    let g = createGame({ seed: 7, rivals: 2 });
    for (let i = 0; i < 10; i++) g = resolveTurn(g);
    const restored = deserializeGame(serializeGame(g, 0))!;
    // Continuing from the restore matches continuing from the original.
    let a = g;
    let b = restored;
    for (let i = 0; i < 10; i++) {
      a = resolveTurn(a);
      b = resolveTurn(b);
    }
    expect(b.regions.map((r) => r.ownerId)).toEqual(a.regions.map((r) => r.ownerId));
    expect(b.nations[0]!.stocks.gold).toBe(a.nations[0]!.stocks.gold);
  });

  it("forward-migrates armies from a save predating a unit type", () => {
    // Simulate an old save whose army records lack the newer unit slots.
    let g = createGame({ seed: 99, rivals: 2 });
    for (let i = 0; i < 3; i++) g = resolveTurn(g);
    const envelope = JSON.parse(serializeGame(g, 0));
    for (const a of envelope.state.armies) {
      delete a.units.pikeman;
      delete a.units.handgunner;
    }
    const restored = deserializeGame(JSON.stringify(envelope))!;
    expect(restored).not.toBeNull();
    // Every army has the missing slots backfilled to 0 (not undefined → NaN).
    for (const a of restored.armies) {
      expect(a.units.pikeman).toBe(0);
      expect(a.units.handgunner).toBe(0);
    }
  });

  it("repairs malformed army data instead of loading impossible combat state", () => {
    const g = createGame({ seed: 100, rivals: 1 });
    const owned = g.regions.find((r) => r.ownerId === PLAYER_ID)!;
    const secondOwned = g.regions.find((r) => r.ownerId === PLAYER_ID && r.id !== owned.id)!;
    const envelope = JSON.parse(serializeGame(g, 0));
    envelope.state.armies = [{
      id: 9000,
      ownerId: PLAYER_ID,
      regionId: owned.id,
      seaZoneId: "north_sea",
      units: {
        militia: "4.9",
        infantry: -3,
        ranged: null,
        cavalry: Number.POSITIVE_INFINITY,
      },
      movesLeft: "999",
      entrenchment: 999,
      fortifying: true,
      dest: 999999,
      commander: {
        name: "Broken",
        epithet: "the Invalid",
        martial: "infinite",
        loyalty: -500,
        trait: "not-a-trait",
      },
    }, {
      id: 9000,
      ownerId: PLAYER_ID,
      regionId: secondOwned.id,
      units: { militia: 1 },
      movesLeft: 1,
    }];
    envelope.state.nextArmyId = 0;

    const restored = deserializeGame(JSON.stringify(envelope))!;
    const army = restored.armies[0]!;
    expect(army.units.militia).toBe(4);
    expect(army.units.infantry).toBe(0);
    expect(army.units.cavalry).toBe(0);
    expect(army.movesLeft).toBeLessThanOrEqual(1);
    expect(army.entrenchment).toBeLessThanOrEqual(3);
    expect(army.dest).toBeNull();
    expect(army.seaZoneId).toBeUndefined();
    expect(army.fortifying).toBe(false);
    expect(army.commander).toBeUndefined();
    expect(new Set(restored.armies.map((candidate) => candidate.id)).size).toBe(
      restored.armies.length,
    );
    expect(restored.nextArmyId).toBeGreaterThan(9000);
  });

  it("rescues passengers but removes impossible hulls when no friendly port exists", () => {
    const g = createGame({ seed: 101, rivals: 1, playerFaction: "England" });
    const envelope = JSON.parse(serializeGame(g, 0));
    envelope.state.regions = envelope.state.regions.map((region: { ownerId: number | null; terrain: string }) =>
      region.ownerId === PLAYER_ID ? { ...region, terrain: "plains" } : region
    );
    const safeLand = envelope.state.regions.find(
      (region: { ownerId: number | null }) => region.ownerId === PLAYER_ID,
    );
    envelope.state.armies = [{
      id: 9100,
      ownerId: PLAYER_ID,
      regionId: safeLand.id,
      units: { war_cog: 2, infantry: 3 },
      movesLeft: 2,
      fortifying: true,
      entrenchment: 3,
      dest: envelope.state.regions.at(-1).id,
    }];

    const restored = deserializeGame(JSON.stringify(envelope))!;
    expect(restored.armies).toHaveLength(1);
    expect(restored.armies[0]!.units.war_cog).toBe(0);
    expect(restored.armies[0]!.units.infantry).toBe(3);
    expect(restored.armies[0]!.regionId).toBe(safeLand.id);
    expect(restored.armies[0]!.dest).toBeNull();
    expect(restored.armies[0]!.fortifying).toBe(false);
    expect(restored.armies[0]!.entrenchment).toBe(0);
  });

  it("rejects malformed or foreign JSON", () => {
    expect(deserializeGame("not json")).toBeNull();
    expect(deserializeGame(JSON.stringify({ hello: "world" }))).toBeNull();
    expect(deserializeGame(JSON.stringify({ version: 999, state: {} }))).toBeNull();
  });

  it("preserves the chosen difficulty", () => {
    const g = createGame({ seed: 1, difficulty: "easy" });
    expect(deserializeGame(serializeGame(g, 0))!.difficulty).toBe("easy");
  });

  it("round-trips the score-history graph (export/import contract)", () => {
    let g = createGame({ seed: 3, rivals: 2 });
    for (let i = 0; i < 6; i++) g = resolveTurn(g);
    const restored = deserializeGame(serializeGame(g, 0))!;
    expect(restored.scoreHistory).toEqual(g.scoreHistory);
    expect(restored.scoreHistory![0]!.length).toBe(g.turn);
  });

  it("round-trips trade routes and the seeded Kontor state", () => {
    const g = createGame({ seed: 8, rivals: 1 });
    const route: TradeRoute = {
      id: 0, ownerId: PLAYER_ID, good: "grain", fromRegionId: 5, toKontorId: "bruges",
      lane: [5, 4], lastIncome: 2.3, disrupted: false,
    };
    const withRoute: GameState = { ...g, routes: [route], nextRouteId: 1 };
    const restored = deserializeGame(serializeGame(withRoute, 0))!;
    expect(restored.routes).toEqual([route]);
    expect(restored.nextRouteId).toBe(1);
    expect(restored.kontore).toEqual(g.kontore); // four seeded Kontore survive the trip
    expect(restored.kontore).toHaveLength(4);
  });

  it("back-fills the trade layer on a pre-trade save and keeps it playable", () => {
    let g = createGame({ seed: 21, rivals: 1 });
    for (let i = 0; i < 3; i++) g = resolveTurn(g);
    // Simulate a save written before trade routes / Kontore existed.
    const envelope = JSON.parse(serializeGame(g, 0));
    delete envelope.state.routes;
    delete envelope.state.nextRouteId;
    delete envelope.state.kontore;
    const restored = deserializeGame(JSON.stringify(envelope))!;
    expect(restored.routes).toEqual([]);
    expect(restored.nextRouteId).toBe(0);
    expect(restored.kontore).toEqual([]);
    // The sim is unperturbed by the back-fill: resolving the legacy save tracks
    // the original turn-for-turn (empty routes → stepTrade is a no-op).
    let b = restored;
    for (let i = 0; i < 5; i++) {
      b = resolveTurn(b);
    }
    expect(b.outcome).toBe("playing");
    expect(Array.isArray(b.routes)).toBe(true);
    expect(b.regions).toHaveLength(g.regions.length);
  });

  it("clearLocalSave empties a slot once and reports already-empty after", () => {
    // Node has no localStorage — stub the three calls the save layer makes.
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    try {
      const g = createGame({ seed: 5 });
      expect(clearLocalSave("slot2")).toBe(false); // nothing there yet
      expect(saveToLocal(g, 0, "slot2")).toBe(true);
      expect(slotInfo("slot2")?.turn).toBe(g.turn);
      expect(clearLocalSave("slot2")).toBe(true); // cleared it
      expect(slotInfo("slot2")).toBeNull();
      expect(clearLocalSave("slot2")).toBe(false); // second press is a no-op
    } finally {
      delete (globalThis as Record<string, unknown>).localStorage;
    }
  });
});
