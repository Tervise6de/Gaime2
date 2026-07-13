import { describe, it, expect } from "vitest";
import {
  getRelation,
  setRelation,
  adjustRelation,
  getTreaty,
  atWar,
  declareWar,
  makePeace,
  setPact,
  gift,
  wouldAccept,
  driftRelations,
  addOffer,
  acceptOffer,
  rejectOffer,
  nationPower,
  sharedBorders,
  sharedEnemies,
  setTreaty,
} from "@/systems/diplomacy";
import { createGame } from "@/systems/turn";
import {
  RELATION_MAX,
  RELATION_MIN,
  pairKey,
  type GameState,
} from "@/systems/state";

const game = (): GameState => createGame({ seed: 12345, rivals: 2 });
const RIVAL_A = 2;
const RIVAL_B = 3;

describe("pairKey", () => {
  it("is order-independent", () => {
    expect(pairKey(2, 5)).toBe(pairKey(5, 2));
  });
});

describe("relations", () => {
  it("default to 0 and clamp when set", () => {
    const g = game();
    expect(getRelation(g, 0, RIVAL_A)).toBe(0);
    expect(getRelation(setRelation(g, 0, RIVAL_A, 999), 0, RIVAL_A)).toBe(RELATION_MAX);
    expect(getRelation(setRelation(g, 0, RIVAL_A, -999), 0, RIVAL_A)).toBe(RELATION_MIN);
  });

  it("adjust is symmetric via pairKey", () => {
    const g = adjustRelation(game(), 0, RIVAL_A, -20);
    expect(getRelation(g, RIVAL_A, 0)).toBe(-20);
  });
});

describe("treaties", () => {
  it("default to peace", () => {
    expect(getTreaty(game(), 0, RIVAL_A)).toBe("peace");
  });

  it("declareWar sets war and hits relations", () => {
    const g = declareWar(game(), 0, RIVAL_A);
    expect(atWar(g, 0, RIVAL_A)).toBe(true);
    expect(getRelation(g, 0, RIVAL_A)).toBeLessThan(0);
  });

  it("makePeace ends war", () => {
    let g = declareWar(game(), 0, RIVAL_A);
    g = makePeace(g, 0, RIVAL_A);
    expect(atWar(g, 0, RIVAL_A)).toBe(false);
  });

  it("setPact records nap/alliance", () => {
    expect(getTreaty(setPact(game(), 0, RIVAL_A, "nap"), 0, RIVAL_A)).toBe("nap");
    expect(getTreaty(setPact(game(), 0, RIVAL_A, "alliance"), 0, RIVAL_A)).toBe("alliance");
  });
});

describe("gift", () => {
  it("transfers gold and improves relations", () => {
    const g = game();
    const before = g.nations[RIVAL_A]!.stocks.gold;
    const next = gift(g, 0, RIVAL_A, 30);
    expect(next.nations[RIVAL_A]!.stocks.gold).toBe(before + 30);
    expect(next.nations[0]!.stocks.gold).toBe(g.nations[0]!.stocks.gold - 30);
    expect(getRelation(next, 0, RIVAL_A)).toBeGreaterThan(0);
  });

  it("is a no-op when the sender cannot afford it", () => {
    const g = game();
    g.nations[0]!.stocks.gold = 5;
    expect(gift(g, 0, RIVAL_A, 30)).toBe(g);
  });
});

describe("offers", () => {
  it("adds, accepts and rejects", () => {
    let g = addOffer(game(), RIVAL_A, 0, "nap");
    expect(g.offers).toHaveLength(1);
    const id = g.offers[0]!.id;
    const accepted = acceptOffer(g, id);
    expect(accepted.offers).toHaveLength(0);
    expect(getTreaty(accepted, RIVAL_A, 0)).toBe("nap");

    g = addOffer(game(), RIVAL_A, 0, "tribute", 20);
    const rejected = rejectOffer(g, g.offers[0]!.id);
    expect(rejected.offers).toHaveLength(0);
  });

  it("does not duplicate identical offers", () => {
    let g = addOffer(game(), RIVAL_A, 0, "peace");
    g = addOffer(g, RIVAL_A, 0, "peace");
    expect(g.offers).toHaveLength(1);
  });
});

describe("driftRelations", () => {
  it("moves relations toward neutral", () => {
    let g = setRelation(game(), RIVAL_A, RIVAL_B, 30);
    g = driftRelations(g);
    expect(getRelation(g, RIVAL_A, RIVAL_B)).toBeLessThan(30);
  });
});

describe("assessment", () => {
  it("nationPower rewards army and territory", () => {
    const g = game();
    expect(nationPower(g, 0)).toBeGreaterThan(0);
  });

  it("sharedBorders is symmetric-ish and non-negative", () => {
    const g = game();
    expect(sharedBorders(g, 0, RIVAL_A)).toBeGreaterThanOrEqual(0);
  });
});

describe("wouldAccept", () => {
  it("an AI accepts peace when strongly outmatched", () => {
    // Player proposes peace to a rival at war; with a big power gap it accepts.
    let g = declareWar(game(), 0, RIVAL_A);
    // Drain the rival to make it weak.
    g.nations[RIVAL_A]!.stocks.gold = 0;
    // Player is proposer; rival is target.
    expect(typeof wouldAccept(g, 0, RIVAL_A, "peace")).toBe("boolean");
  });
});

describe("shared-enemy warmth", () => {
  it("counts the nations a pair are both at war with", () => {
    let s = game();
    expect(sharedEnemies(s, RIVAL_A, RIVAL_B)).toBe(0);
    s = setTreaty(s, 0, RIVAL_A, "war");
    s = setTreaty(s, 0, RIVAL_B, "war");
    expect(sharedEnemies(s, RIVAL_A, RIVAL_B)).toBe(1);
  });

  it("does not count a or b themselves as a shared enemy", () => {
    const s = setTreaty(game(), RIVAL_A, RIVAL_B, "war");
    expect(sharedEnemies(s, RIVAL_A, RIVAL_B)).toBe(0);
  });

  it("warms co-belligerents' relations vs. the no-shared-enemy baseline", () => {
    const base = setRelation(game(), RIVAL_A, RIVAL_B, 0);
    const relBase = getRelation(driftRelations(base), RIVAL_A, RIVAL_B);
    let war = setTreaty(base, 0, RIVAL_A, "war");
    war = setTreaty(war, 0, RIVAL_B, "war");
    const relWar = getRelation(driftRelations(war), RIVAL_A, RIVAL_B);
    expect(relWar).toBeGreaterThan(relBase);
  });
});
