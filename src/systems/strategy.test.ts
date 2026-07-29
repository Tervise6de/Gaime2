import { describe, it, expect } from "vitest";
import {
  AI_STRATEGIES,
  MIN_DWELL,
  assignStrategies,
  reassessStrategies,
  strategyProfile,
  strategyViability,
  type AiStrategy,
} from "@/systems/strategy";
import { createGame, resolveTurn } from "@/systems/turn";
import { createRng } from "@/systems/rng";
import { KONTORE, KONTOR_IDS } from "@/data/kontore";
import { PLAYER_ID, emptyUnits, landNeighbours, type GameState, type Nation } from "@/systems/state";

const rivals = (g: GameState): Nation[] => g.nations.filter((n) => !n.isBarbarian && !n.isPlayer);

describe("opening plans", () => {
  it("gives every rival a plan, and never one to the player or the barbarians", () => {
    const g = createGame({ seed: 4 });
    for (const n of rivals(g)) {
      expect(AI_STRATEGIES).toContain(n.strategy);
      expect(n.strategySince).toBe(1);
    }
    expect(g.nations[PLAYER_ID]!.strategy).toBeUndefined();
    expect(g.nations.find((n) => n.isBarbarian)!.strategy).toBeUndefined();
  });

  it("is deterministic for a seed but differs between games", () => {
    const a = createGame({ seed: 21 }).nations.map((n) => n.strategy);
    const b = createGame({ seed: 21 }).nations.map((n) => n.strategy);
    expect(a).toEqual(b);
    // Across a spread of seeds the board of intentions is not the same twice.
    const boards = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => rivals(createGame({ seed })).map((n) => n.strategy).join(",")),
    );
    expect(boards.size).toBeGreaterThan(1);
  });

  it("leans on temperament without ever locking a realm out of a plan", () => {
    // Over many rolls a warlord reaches for the sword most often — but the
    // point of rolling is that this game is not last game, so every plan shows.
    const seen = new Set<AiStrategy>();
    let conquestRolls = 0;
    const trials = 200;
    for (let i = 0; i < trials; i++) {
      const rolled = assignStrategies(
        [{ id: 2, isPlayer: false, isBarbarian: false, personality: { archetype: "warlord" } } as unknown as Nation],
        createRng(1000 + i),
      );
      const plan = rolled[0]!.strategy!;
      seen.add(plan);
      if (plan === "conquest") conquestRolls++;
    }
    expect(seen.size).toBe(3); // all three remain possible
    expect(conquestRolls / trials).toBeGreaterThan(0.4); // ...but the sword leads
    expect(conquestRolls / trials).toBeLessThan(0.8);
  });
});

describe("reading the board", () => {
  it("rates commerce highest for a realm sitting on the Kontore", () => {
    const g = createGame({ seed: 6 });
    const RIVAL = rivals(g)[0]!.id;
    const networked: GameState = {
      ...g,
      league: { foundedTurn: 1, members: [RIVAL], boycotts: [] },
      regions: g.regions.map((r) =>
        KONTOR_IDS.some((id) => KONTORE[id].regionId === r.id) ? { ...r, ownerId: RIVAL } : r,
      ),
      routes: [
        { id: 0, ownerId: RIVAL, good: "furs", fromRegionId: KONTORE.novgorod.regionId, toKontorId: "london", lane: [0], lastIncome: 30 },
      ],
    };
    const scores = strategyViability(networked, RIVAL);
    expect(scores.commerce).toBeGreaterThan(scores.conquest);
  });

  it("rates conquest highest for a realm with a host and soft neighbours", () => {
    const g = createGame({ seed: 6 });
    // A realm with somewhere to march: soft neighbours are read over *land*
    // now, so the island realms are no use for this reading (see below).
    const RIVAL = rivals(g).find((n) => {
      const owned = g.regions.filter((r) => r.ownerId === n.id);
      return owned.some((r) => landNeighbours(g, r.id).some((nb) => g.regions[nb]?.ownerId !== n.id));
    })!.id;
    const home = g.regions.find((r) => r.ownerId === RIVAL)!;
    const armed: GameState = {
      ...g,
      armies: [
        { id: 900, ownerId: RIVAL, regionId: home.id, units: { ...emptyUnits(), infantry: 14 }, movesLeft: 1 },
      ],
    };
    const scores = strategyViability(armed, RIVAL);
    expect(scores.conquest).toBeGreaterThan(scores.commerce);
  });

  it("rates conquest low for an island realm, however big its host", () => {
    // England shares no land border with anyone (data/maps/hansa.ts
    // `seaCrossings`), so an army it raises has nowhere to walk. A realm in
    // that position should be reading the ledger, not the sword — which is
    // both the right play and what the Hansa's island member actually did.
    const g = createGame({ seed: 6 });
    const england = g.nations.find((n) => n.name === "England")!.id;
    const owned = g.regions.filter((r) => r.ownerId === england);
    expect(owned.every((r) => landNeighbours(g, r.id).every((nb) => g.regions[nb]?.ownerId === england))).toBe(true);
    const home = owned[0]!;
    const armed: GameState = {
      ...g,
      armies: [
        { id: 901, ownerId: england, regionId: home.id, units: { ...emptyUnits(), infantry: 14 }, movesLeft: 1 },
      ],
    };
    expect(strategyViability(armed, england).conquest).toBeLessThan(strategyViability(armed, england).commerce);
  });
});

describe("changing course", () => {
  /** Put every rival on a plan, adopted long enough ago to be reconsidered. */
  function settled(g: GameState, plan: AiStrategy, since = 1): GameState {
    return {
      ...g,
      turn: since + MIN_DWELL + 1,
      nations: g.nations.map((n) =>
        n.isBarbarian || n.isPlayer ? n : { ...n, strategy: plan, strategySince: since },
      ),
    };
  }

  it("turns a boxed-in merchant toward the sword when that is what the board offers", () => {
    const g = createGame({ seed: 6 });
    const RIVAL = rivals(g)[0]!.id;
    const home = g.regions.find((r) => r.ownerId === RIVAL)!;
    // A realm on the commerce plan, but with no network and a big army.
    const armed: GameState = {
      ...settled(g, "commerce"),
      armies: [
        { id: 900, ownerId: RIVAL, regionId: home.id, units: { ...emptyUnits(), infantry: 16 }, movesLeft: 1 },
      ],
    };
    const after = reassessStrategies(armed);
    const now = after.nations.find((n) => n.id === RIVAL)!;
    // It abandons the plan that is not paying, and adopts whichever the board
    // actually rates highest for it — which is the contract, not a fixed answer.
    const scores = strategyViability(armed, RIVAL);
    const best = AI_STRATEGIES.reduce((a, b) => (scores[b] > scores[a] ? b : a));
    expect(now.strategy).not.toBe("commerce");
    expect(now.strategy).toBe(best);
    expect(now.strategySince).toBe(armed.turn);
  });

  it("leaves a freshly adopted plan alone — a court that turns every turn is a weathervane", () => {
    const g = createGame({ seed: 6 });
    const RIVAL = rivals(g)[0]!.id;
    const home = g.regions.find((r) => r.ownerId === RIVAL)!;
    const justSwitched: GameState = {
      ...g,
      turn: 20,
      nations: g.nations.map((n) =>
        n.id === RIVAL ? { ...n, strategy: "commerce", strategySince: 19 } : n,
      ),
      armies: [
        { id: 900, ownerId: RIVAL, regionId: home.id, units: { ...emptyUnits(), infantry: 16 }, movesLeft: 1 },
      ],
    };
    expect(reassessStrategies(justSwitched).nations.find((n) => n.id === RIVAL)!.strategy).toBe("commerce");
  });

  it("does not touch the player or a dead realm", () => {
    const g = settled(createGame({ seed: 6 }), "prestige");
    const dead: GameState = {
      ...g,
      nations: g.nations.map((n) => (n.id === rivals(g)[0]!.id ? { ...n, alive: false } : n)),
    };
    const after = reassessStrategies(dead);
    expect(after.nations[PLAYER_ID]!.strategy).toBeUndefined();
    expect(after.nations.find((n) => n.id === rivals(g)[0]!.id)!.strategy).toBe("prestige");
  });

  it("rivals really do change course over a played-out game", () => {
    let g = createGame({ seed: 3 });
    const opening = new Map(g.nations.map((n) => [n.id, n.strategy]));
    for (let t = 0; t < 60 && g.outcome === "playing"; t++) g = resolveTurn(g);
    const changed = g.nations.filter(
      (n) => !n.isBarbarian && !n.isPlayer && n.alive && n.strategy !== opening.get(n.id),
    );
    expect(changed.length).toBeGreaterThan(0);
  }, 30_000);
});

describe("a plan is play, not a label", () => {
  it("turns the dials that decide army size, wars, Kontore, routes, navy and the League", () => {
    const conquest = strategyProfile({ strategy: "conquest" } as Nation);
    const commerce = strategyProfile({ strategy: "commerce" } as Nation);
    expect(conquest.army).toBeGreaterThan(commerce.army);
    expect(conquest.warAppetite).toBeGreaterThan(commerce.warAppetite);
    expect(commerce.kontorPrize).toBeGreaterThan(conquest.kontorPrize);
    expect(commerce.routes).toBeGreaterThan(conquest.routes);
    expect(commerce.navy).toBeGreaterThan(conquest.navy);
    expect(commerce.seeksLeague).toBe(true);
    expect(conquest.seeksLeague).toBe(false);
  });

  it("leaves the player and the barbarians on neutral dials", () => {
    const neutral = strategyProfile({ isPlayer: true } as Nation);
    expect(neutral).toEqual({ army: 1, warAppetite: 1, kontorPrize: 1, routes: 1, navy: 0, seeksLeague: false });
    expect(strategyProfile(undefined).army).toBe(1);
  });
});
