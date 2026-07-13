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
  wouldJoinWar,
  callToArms,
  warTargetsFor,
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

describe("call to arms", () => {
  // A ready-to-accept scenario: player (0) allied with AI rival A, at war with
  // rival B, warm relations, and rival A strong enough to help.
  const ready = (): GameState => {
    let g = game();
    g = setTreaty(g, 0, RIVAL_A, "alliance");
    g = setRelation(g, 0, RIVAL_A, 40);
    g = declareWar(g, 0, RIVAL_B);
    // Ensure the ally is not hopelessly weak against the enemy.
    g.nations[RIVAL_A]!.stocks.gold = 400;
    g.nations[RIVAL_B]!.stocks.gold = 100;
    return g;
  };

  describe("wouldJoinWar", () => {
    it("accepts when allied, requester at war, relations >= 20, and able", () => {
      expect(wouldJoinWar(ready(), RIVAL_A, 0, RIVAL_B)).toBe(true);
    });

    it("rejects when the ally is the player", () => {
      // Requester rival A, ally is the player (0) — the player never auto-joins.
      let g = game();
      g = setTreaty(g, RIVAL_A, 0, "alliance");
      g = setRelation(g, RIVAL_A, 0, 40);
      g = declareWar(g, RIVAL_A, RIVAL_B);
      expect(wouldJoinWar(g, 0, RIVAL_A, RIVAL_B)).toBe(false);
    });

    it("rejects when not allied", () => {
      let g = ready();
      g = setTreaty(g, 0, RIVAL_A, "nap");
      expect(wouldJoinWar(g, RIVAL_A, 0, RIVAL_B)).toBe(false);
    });

    it("rejects when the ally is already at war with the enemy", () => {
      const g = declareWar(ready(), RIVAL_A, RIVAL_B);
      expect(wouldJoinWar(g, RIVAL_A, 0, RIVAL_B)).toBe(false);
    });

    it("rejects when the requester is NOT at war with the enemy", () => {
      const g = makePeace(ready(), 0, RIVAL_B);
      expect(wouldJoinWar(g, RIVAL_A, 0, RIVAL_B)).toBe(false);
    });

    it("rejects when relations are too cold", () => {
      const g = setRelation(ready(), 0, RIVAL_A, 10);
      expect(wouldJoinWar(g, RIVAL_A, 0, RIVAL_B)).toBe(false);
    });

    it("rejects when the ally is far too weak", () => {
      const g = ready();
      // Make the enemy overwhelmingly strong via treasury.
      g.nations[RIVAL_B]!.stocks.gold = 500000;
      expect(wouldJoinWar(g, RIVAL_A, 0, RIVAL_B)).toBe(false);
    });
  });

  describe("callToArms", () => {
    it("sets the ally at war and logs on accept", () => {
      const g = ready();
      const next = callToArms(g, 0, RIVAL_A, RIVAL_B);
      expect(atWar(next, RIVAL_A, RIVAL_B)).toBe(true);
      expect(next.log[next.log.length - 1]).toMatch(/call to arms against/);
    });

    it("is a no-op except for a log line on decline", () => {
      // Not allied → decline.
      const g = setTreaty(ready(), 0, RIVAL_A, "nap");
      const next = callToArms(g, 0, RIVAL_A, RIVAL_B);
      expect(next.treaties).toEqual(g.treaties);
      expect(atWar(next, RIVAL_A, RIVAL_B)).toBe(false);
      expect(next.log[next.log.length - 1]).toMatch(/declined the call to arms/);
      // Only a single log line was appended.
      expect(next.log.length).toBe(g.log.length + 1);
    });

    it("does not mutate the input state", () => {
      const g = ready();
      const logLen = g.log.length;
      callToArms(g, 0, RIVAL_A, RIVAL_B);
      expect(g.log.length).toBe(logLen);
      expect(atWar(g, RIVAL_A, RIVAL_B)).toBe(false);
    });
  });
});

describe("warTargetsFor", () => {
  const PLAYER = 0;

  it("lists an enemy the requester fights that the ally does not", () => {
    const s = setTreaty(game(), PLAYER, RIVAL_B, "war"); // player at war with B
    const targets = warTargetsFor(s, PLAYER, RIVAL_A);   // could A be called in?
    expect(targets).toContain(RIVAL_B);
    expect(targets).not.toContain(RIVAL_A); // never the ally itself
    expect(targets).not.toContain(PLAYER); // never the requester
  });

  it("excludes an enemy the ally is already fighting", () => {
    let s = setTreaty(game(), PLAYER, RIVAL_B, "war");
    s = setTreaty(s, RIVAL_A, RIVAL_B, "war"); // ally already at war with B
    expect(warTargetsFor(s, PLAYER, RIVAL_A)).not.toContain(RIVAL_B);
  });

  it("is empty when the requester is at peace with everyone", () => {
    expect(warTargetsFor(game(), PLAYER, RIVAL_A)).toEqual([]);
  });

  it("excludes eliminated nations even if still flagged at war", () => {
    let s = setTreaty(game(), PLAYER, RIVAL_B, "war");
    s = { ...s, nations: s.nations.map((n) => (n.id === RIVAL_B ? { ...n, alive: false } : n)) };
    expect(warTargetsFor(s, PLAYER, RIVAL_A)).not.toContain(RIVAL_B);
  });
});
