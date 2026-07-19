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
  playerDemandTribute,
  peaceReparations,
  recordOpinion,
  decayOpinions,
  opinionReasons,
  foreignRelations,
  casusBelli,
  CASUS_BELLI,
  wouldBreakTreaty,
  TREATY_BREAK,
  keptPeaceTurns,
  keptPeaceGoodwill,
  PEACE_GOODWILL_MAX,
  PEACE_GOODWILL_PERIOD,
  PEACE_GOODWILL_PER_STEP,
} from "@/systems/diplomacy";
import { createGame } from "@/systems/turn";
import {
  RELATION_MAX,
  RELATION_MIN,
  PLAYER_ID,
  emptyUnits,
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

describe("playerDemandTribute", () => {
  /** The player fields an overwhelming host; RIVAL_A is meek and can pay. */
  function lopsided(): GameState {
    let g = game();
    const capital = g.regions.find((r) => r.ownerId === 0)!.id;
    g = { ...g, armies: [...g.armies, { id: 999, ownerId: 0, regionId: capital, units: { ...emptyUnits(), infantry: 30 }, movesLeft: 0 }] };
    return {
      ...g,
      nations: g.nations.map((n) =>
        n.id === RIVAL_A
          ? {
              ...n,
              personality: { archetype: "merchant", aggression: 0.2, expansion: 0.5, economy: 0.9, trustworthiness: 0.85 },
              stocks: { ...n.stocks, gold: 100 },
            }
          : n,
      ),
    };
  }

  it("a much weaker, non-proud rival yields tribute — and resents it", () => {
    const g = lopsided();
    const rivalGold0 = g.nations[RIVAL_A]!.stocks.gold;
    const playerGold0 = g.nations[0]!.stocks.gold;
    const rel0 = getRelation(g, 0, RIVAL_A);
    const next = playerDemandTribute(g, RIVAL_A);
    expect(next.nations[RIVAL_A]!.stocks.gold).toBe(rivalGold0 - 30);
    expect(next.nations[0]!.stocks.gold).toBe(playerGold0 + 30);
    expect(getRelation(next, 0, RIVAL_A)).toBeLessThan(rel0); // cowed, not thanked
  });

  it("a rival that is not far weaker scorns the demand: no transfer, relations dip", () => {
    const g = game(); // roughly balanced power → wouldAccept(tribute) is false
    const rivalGold0 = g.nations[RIVAL_A]!.stocks.gold;
    const rel0 = getRelation(g, 0, RIVAL_A);
    const next = playerDemandTribute(g, RIVAL_A);
    expect(next.nations[RIVAL_A]!.stocks.gold).toBe(rivalGold0);
    expect(getRelation(next, 0, RIVAL_A)).toBeLessThan(rel0);
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

describe("peace reparations", () => {
  // Strip a rival of land and army (regions → barbarian, armies removed) but leave
  // it a treasury, so it reads as far weaker than the player.
  const weaken = (g: GameState, rivalId: number, gold: number): GameState => ({
    ...g,
    nations: g.nations.map((n) => (n.id === rivalId ? { ...n, stocks: { ...n.stocks, gold } } : n)),
    regions: g.regions.map((r) => (r.ownerId === rivalId ? { ...r, ownerId: 1 } : r)),
    armies: g.armies.filter((a) => a.ownerId !== rivalId),
  });

  it("only the clearly-weaker party offers reparations, bounded by treasury", () => {
    const weak = weaken(game(), RIVAL_A, 100);
    expect(peaceReparations(weak, RIVAL_A, PLAYER_ID)).toBe(25); // min(40, floor(100*0.25))
    // A full-strength rival on even footing offers nothing.
    expect(peaceReparations(game(), RIVAL_A, PLAYER_ID)).toBe(0);
    // Too small a treasury isn't worth offering.
    expect(peaceReparations(weaken(game(), RIVAL_A, 30), RIVAL_A, PLAYER_ID)).toBe(0);
  });

  it("accepting a peace offer with reparations transfers the gold and ends the war", () => {
    let g = declareWar(weaken(game(), RIVAL_A, 100), RIVAL_A, PLAYER_ID);
    g = addOffer(g, RIVAL_A, PLAYER_ID, "peace", 25);
    const rival0 = g.nations.find((n) => n.id === RIVAL_A)!.stocks.gold;
    const player0 = g.nations[PLAYER_ID]!.stocks.gold;
    const accepted = acceptOffer(g, g.offers[0]!.id);
    expect(atWar(accepted, RIVAL_A, PLAYER_ID)).toBe(false);
    expect(accepted.nations.find((n) => n.id === RIVAL_A)!.stocks.gold).toBe(rival0 - 25);
    expect(accepted.nations[PLAYER_ID]!.stocks.gold).toBe(player0 + 25);
  });

  it("caps the reparations transfer at what the payer still holds", () => {
    let g = weaken(game(), RIVAL_A, 10); // promises more than it now has
    g = addOffer(g, RIVAL_A, PLAYER_ID, "peace", 25);
    const player0 = g.nations[PLAYER_ID]!.stocks.gold;
    const accepted = acceptOffer(g, g.offers[0]!.id);
    expect(accepted.nations.find((n) => n.id === RIVAL_A)!.stocks.gold).toBe(0);
    expect(accepted.nations[PLAYER_ID]!.stocks.gold).toBe(player0 + 10);
  });

  it("a plain peace offer (no reparations) moves no gold", () => {
    let g = declareWar(game(), RIVAL_A, PLAYER_ID);
    g = addOffer(g, RIVAL_A, PLAYER_ID, "peace");
    const player0 = g.nations[PLAYER_ID]!.stocks.gold;
    const accepted = acceptOffer(g, g.offers[0]!.id);
    expect(atWar(accepted, RIVAL_A, PLAYER_ID)).toBe(false);
    expect(accepted.nations[PLAYER_ID]!.stocks.gold).toBe(player0);
  });
});

describe("driftRelations", () => {
  it("moves relations toward neutral", () => {
    let g = setRelation(game(), RIVAL_A, RIVAL_B, 30);
    g = driftRelations(g);
    expect(getRelation(g, RIVAL_A, RIVAL_B)).toBeLessThan(30);
  });
});

describe("kept-the-peace goodwill", () => {
  it("counts unbroken peace since the founding when unrecorded", () => {
    // No peaceSince entry → peace has held since turn 1.
    expect(keptPeaceTurns({ ...game(), turn: 1 }, RIVAL_A, RIVAL_B)).toBe(0);
    expect(keptPeaceTurns({ ...game(), turn: 25 }, RIVAL_A, RIVAL_B)).toBe(24);
  });

  it("scales +5 per 10 turns of peace and caps at +25", () => {
    expect(keptPeaceGoodwill({ ...game(), turn: 6 }, RIVAL_A, RIVAL_B)).toBe(0); // 5 turns → below a full period
    expect(keptPeaceGoodwill({ ...game(), turn: 11 }, RIVAL_A, RIVAL_B)).toBe(PEACE_GOODWILL_PER_STEP); // 10 turns
    expect(keptPeaceGoodwill({ ...game(), turn: 31 }, RIVAL_A, RIVAL_B)).toBe(15); // 30 turns
    expect(keptPeaceGoodwill({ ...game(), turn: 300 }, RIVAL_A, RIVAL_B)).toBe(PEACE_GOODWILL_MAX); // capped
  });

  it("war stops the peace clock; making peace restarts it", () => {
    const base = { ...game(), turn: 80 };
    expect(keptPeaceGoodwill(base, RIVAL_A, RIVAL_B)).toBe(PEACE_GOODWILL_MAX); // long peace since founding
    const war = declareWar(base, RIVAL_A, RIVAL_B);
    expect(keptPeaceGoodwill(war, RIVAL_A, RIVAL_B)).toBe(0); // swords drawn → no goodwill
    const peace = makePeace(war, RIVAL_A, RIVAL_B); // a fresh clock starts at turn 80
    expect(keptPeaceTurns(peace, RIVAL_A, RIVAL_B)).toBe(0);
    const later = { ...peace, turn: 80 + PEACE_GOODWILL_PERIOD }; // +10 turns of the new peace
    expect(keptPeaceGoodwill(later, RIVAL_A, RIVAL_B)).toBe(PEACE_GOODWILL_PER_STEP);
  });

  it("driftRelations warms an amicable peace toward the goodwill floor over the long run", () => {
    // Goodwill only warms an already-amicable (rel ≥ 0) peace — it never rescues a
    // souring one, so start from a mildly positive standing.
    const warm0 = setRelation(game(), RIVAL_A, RIVAL_B, 4);
    const warm = {
      ...warm0,
      regions: warm0.regions.map((r) => (r.ownerId === RIVAL_A || r.ownerId === RIVAL_B ? { ...r, ownerId: PLAYER_ID } : r)),
    };
    // Early game: no goodwill accrued, so only the usual drift/border pressures act.
    const early = getRelation(driftRelations({ ...warm, turn: 3 }), RIVAL_A, RIVAL_B);
    // After a long peace the floor sits well above the start, so relations are lifted.
    const long = getRelation(driftRelations({ ...warm, turn: 120 }), RIVAL_A, RIVAL_B);
    expect(long).toBeGreaterThan(early);
  });

  it("does NOT rescue a souring relationship — border rivals can still reach war", () => {
    // A deeply negative standing is left to border friction; goodwill stays out of it.
    const sour = setRelation(game(), RIVAL_A, RIVAL_B, -30);
    const after = getRelation(driftRelations({ ...sour, turn: 200 }), RIVAL_A, RIVAL_B);
    expect(after).toBeLessThan(0); // still hostile despite a long nominal "peace"
  });

  it("never drags relations already above the floor upward (it is a floor, not a magnet)", () => {
    const warm = setRelation({ ...game(), turn: 300 }, RIVAL_A, RIVAL_B, 60); // above the +25 cap
    // Drift-to-neutral still applies; goodwill does not hold a high relation up.
    expect(getRelation(driftRelations(warm), RIVAL_A, RIVAL_B)).toBeLessThan(60);
  });

  it("surfaces the goodwill as a positive standing pull in the breakdown", () => {
    const g = { ...game(), turn: 40 };
    const reasons = opinionReasons(g, PLAYER_ID, RIVAL_A);
    expect(reasons.some((r) => r.kind === "standing" && /kept the peace/i.test(r.label) && r.delta > 0)).toBe(true);
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

    it("joins a reeling enemy at odds it would refuse against a stable one", () => {
      const base = ready();
      // Treasuries dominate power (÷40): ally ≈ 1000, enemy ≈ 3000 → ratio ≈ 0.33,
      // which sits below the stable 0.4 floor but above the reeling 0.25 floor.
      base.nations[RIVAL_A]!.stocks.gold = 40000;
      base.nations[RIVAL_B]!.stocks.gold = 120000;
      // Stable enemy → the ally judges itself too weak and declines.
      expect(wouldJoinWar(base, RIVAL_A, 0, RIVAL_B)).toBe(false);
      // Same powers, but the enemy is now reeling (famine) → the eased floor lets
      // the ally pile on.
      const reeling: GameState = {
        ...base,
        nations: base.nations.map((n) =>
          n.id === RIVAL_B ? { ...n, famine: true } : n,
        ),
      };
      expect(wouldJoinWar(reeling, RIVAL_A, 0, RIVAL_B)).toBe(true);
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

describe("opinion log — the 'why' behind relations", () => {
  it("logs a dated dealing and moves the scalar the same as adjustRelation", () => {
    const g = game();
    const before = getRelation(g, PLAYER_ID, RIVAL_A);
    const g2 = recordOpinion(g, PLAYER_ID, RIVAL_A, +8, "trade");
    expect(getRelation(g2, PLAYER_ID, RIVAL_A)).toBe(before + 8); // same as adjustRelation
    const entry = g2.opinions![pairKey(PLAYER_ID, RIVAL_A)]!.find((e) => e.reason === "trade")!;
    expect(entry.delta).toBe(8);
    expect(entry.turn).toBe(g2.turn);
  });

  it("merges repeat dealings of the same reason into one entry", () => {
    let g = game();
    g = recordOpinion(g, PLAYER_ID, RIVAL_A, +5, "gift");
    g = recordOpinion(g, PLAYER_ID, RIVAL_A, +5, "gift");
    const gifts = g.opinions![pairKey(PLAYER_ID, RIVAL_A)]!.filter((e) => e.reason === "gift");
    expect(gifts.length).toBe(1);
    expect(gifts[0]!.delta).toBe(10);
  });

  it("decays the log toward zero and prunes spent entries", () => {
    let g = recordOpinion(game(), PLAYER_ID, RIVAL_A, +3, "gift");
    for (let i = 0; i < 3; i++) g = decayOpinions(g);
    const log = g.opinions?.[pairKey(PLAYER_ID, RIVAL_A)] ?? [];
    expect(log.find((e) => e.reason === "gift")).toBeUndefined(); // +3 → 0 in 3 turns, pruned
  });

  it("surfaces the war grudge as a dated event in the breakdown", () => {
    const g = declareWar(game(), PLAYER_ID, RIVAL_A);
    const reasons = opinionReasons(g, PLAYER_ID, RIVAL_A);
    expect(reasons.some((r) => r.kind === "event" && r.delta < 0)).toBe(true);
  });

  it("includes standing forces (an alliance pull) in the breakdown", () => {
    const g = setPact(game(), PLAYER_ID, RIVAL_A, "alliance");
    const reasons = opinionReasons(g, PLAYER_ID, RIVAL_A);
    expect(reasons.some((r) => r.kind === "standing" && /alliance/i.test(r.label))).toBe(true);
  });

  it("clears the war grudge when peace is made", () => {
    let g = declareWar(game(), PLAYER_ID, RIVAL_A);
    expect(g.opinions![pairKey(PLAYER_ID, RIVAL_A)]!.some((e) => e.reason === "war")).toBe(true);
    g = makePeace(g, PLAYER_ID, RIVAL_A);
    expect(g.opinions![pairKey(PLAYER_ID, RIVAL_A)]!.some((e) => e.reason === "war")).toBe(false);
  });

  it("reports each realm's wars and alliances (rival-to-rival view)", () => {
    let g = declareWar(game(), RIVAL_A, RIVAL_B);
    let fr = foreignRelations(g, RIVAL_A);
    expect(fr.wars).toContain(RIVAL_B);
    g = setPact(g, PLAYER_ID, RIVAL_A, "alliance");
    expect(foreignRelations(g, RIVAL_A).allies).toContain(PLAYER_ID);
  });
});

describe("casus belli — how justified a war is", () => {
  it("answering an ally already at war is a just cause (ally_call)", () => {
    let g = setPact(game(), PLAYER_ID, RIVAL_A, "alliance");
    g = setTreaty(g, RIVAL_A, RIVAL_B, "war");
    expect(casusBelli(g, PLAYER_ID, RIVAL_B)).toBe("ally_call");
  });

  it("reclaiming land the target took from you is a just cause (reclaim)", () => {
    const base = game();
    const g = {
      ...base,
      regions: base.regions.map((r, i) =>
        i === 0 ? { ...r, ownerId: RIVAL_A, priorOwnerId: PLAYER_ID } : r,
      ),
    };
    expect(casusBelli(g, PLAYER_ID, RIVAL_A)).toBe("reclaim");
  });

  it("orders the pretexts: justified draw no censure, naked aggression the most", () => {
    expect(CASUS_BELLI.ally_call.justified).toBe(true);
    expect(CASUS_BELLI.reclaim.justified).toBe(true);
    expect(CASUS_BELLI.none.justified).toBe(false);
    expect(CASUS_BELLI.none.thirdPartyPenalty).toBeGreaterThan(CASUS_BELLI.border.thirdPartyPenalty);
    expect(CASUS_BELLI.ally_call.thirdPartyPenalty).toBe(0);
  });

  it("an unjustified war sours the declarer's standing with third parties", () => {
    const before = getRelation(game(), PLAYER_ID, RIVAL_B);
    const g = declareWar(game(), PLAYER_ID, RIVAL_A, "none"); // naked aggression
    expect(getRelation(g, PLAYER_ID, RIVAL_B)).toBeLessThan(before);
  });

  it("a justified war draws no third-party censure", () => {
    const before = getRelation(game(), PLAYER_ID, RIVAL_B);
    const g = declareWar(game(), PLAYER_ID, RIVAL_A, "reclaim");
    expect(getRelation(g, PLAYER_ID, RIVAL_B)).toBe(before); // unchanged
  });
});

describe("treaty-breaking with a reputation cost (C4)", () => {
  // Give `id` a large host so power ratios are lopsided and deterministic.
  const arm = (g: GameState, id: number, n: number): GameState => ({
    ...g,
    armies: [
      ...g.armies,
      { id: 900 + id, ownerId: id, regionId: g.regions.find((r) => r.ownerId === id)!.id, units: { ...emptyUnits(), infantry: n }, movesLeft: 0 },
    ],
  });
  // Set an AI nation's trustworthiness (keeping it a scheming opportunist).
  const setTrust = (g: GameState, id: number, trustworthiness: number): GameState => ({
    ...g,
    nations: g.nations.map((n) =>
      n.id === id
        ? { ...n, personality: { archetype: "opportunist", aggression: 0.6, expansion: 0.6, economy: 0.5, trustworthiness } }
        : n,
    ),
  });
  // Strip a nation to a rump (regions to barbarian, armies gone) so it reads as
  // far weaker — a huge, deterministic power edge for whoever eyes it.
  const rump = (g: GameState, id: number): GameState => ({
    ...g,
    regions: g.regions.map((r) => (r.ownerId === id ? { ...r, ownerId: 1 } : r)),
    armies: g.armies.filter((a) => a.ownerId !== id),
  });

  it("orders the price of a broken word: an alliance costs more than a NAP", () => {
    expect(TREATY_BREAK.alliance.bilateral).toBeGreaterThan(TREATY_BREAK.nap.bilateral);
    expect(TREATY_BREAK.alliance.thirdParty).toBeGreaterThan(TREATY_BREAK.nap.thirdParty);
  });

  describe("wouldBreakTreaty (the AI's willingness to betray)", () => {
    it("is always free to strike where no pact stands", () => {
      const g = arm(setTrust(game(), RIVAL_A, 0.1), RIVAL_A, 40);
      expect(wouldBreakTreaty(g, RIVAL_A, RIVAL_B)).toBe(true);
    });

    it("a low-trust realm breaks a NAP for an overwhelming strike", () => {
      let g = arm(rump(setTrust(game(), RIVAL_A, 0.15), RIVAL_B), RIVAL_A, 20);
      g = setPact(g, RIVAL_A, RIVAL_B, "nap");
      expect(wouldBreakTreaty(g, RIVAL_A, RIVAL_B)).toBe(true);
    });

    it("a trustworthy realm keeps its NAP even with the edge to break it", () => {
      let g = arm(rump(setTrust(game(), RIVAL_A, 0.8), RIVAL_B), RIVAL_A, 20);
      g = setPact(g, RIVAL_A, RIVAL_B, "nap");
      expect(wouldBreakTreaty(g, RIVAL_A, RIVAL_B)).toBe(false);
    });

    it("won't break a NAP without a real power edge", () => {
      // Arm the *target*, so the schemer is the weaker party — treachery not worth it.
      let g = arm(setTrust(game(), RIVAL_A, 0.1), RIVAL_B, 40);
      g = setPact(g, RIVAL_A, RIVAL_B, "nap");
      expect(wouldBreakTreaty(g, RIVAL_A, RIVAL_B)).toBe(false);
    });

    it("an alliance is more sacred than a NAP: the same low trust breaks one, not the other", () => {
      const trust = 0.25; // below the NAP ceiling (0.3), above the alliance ceiling (0.18)
      const edge = (g: GameState) => arm(rump(setTrust(g, RIVAL_A, trust), RIVAL_B), RIVAL_A, 20);
      const napped = setPact(edge(game()), RIVAL_A, RIVAL_B, "nap");
      const allied = setPact(edge(game()), RIVAL_A, RIVAL_B, "alliance");
      expect(wouldBreakTreaty(napped, RIVAL_A, RIVAL_B)).toBe(true);
      expect(wouldBreakTreaty(allied, RIVAL_A, RIVAL_B)).toBe(false);
    });

    it("never auto-betrays on the player's behalf", () => {
      let g = arm(rump(game(), RIVAL_A), PLAYER_ID, 20);
      g = setPact(g, PLAYER_ID, RIVAL_A, "nap");
      expect(wouldBreakTreaty(g, PLAYER_ID, RIVAL_A)).toBe(false);
    });
  });

  it("breaking a NAP wounds the betrayed and stains standing with every court", () => {
    const beforeThird = getRelation(game(), PLAYER_ID, RIVAL_B);
    const napped = setPact(game(), PLAYER_ID, RIVAL_A, "nap");
    const relBefore = getRelation(napped, PLAYER_ID, RIVAL_A);
    const g = declareWar(napped, PLAYER_ID, RIVAL_A);
    const pair = g.opinions?.[pairKey(PLAYER_ID, RIVAL_A)] ?? [];
    expect(pair.some((e) => e.reason === "betrayal")).toBe(true);
    // Steeper than an ordinary war: the betrayed party's relations fall further.
    expect(getRelation(g, PLAYER_ID, RIVAL_A)).toBeLessThan(relBefore - 45);
    // Third-party reputation cost: a bystander's opinion sours too.
    expect(getRelation(g, PLAYER_ID, RIVAL_B)).toBeLessThan(beforeThird);
    expect((g.opinions?.[pairKey(PLAYER_ID, RIVAL_B)] ?? []).some((e) => e.reason === "broken_word")).toBe(true);
  });

  it("breaking an alliance stains standing harder than breaking a NAP", () => {
    const napThird = getRelation(declareWar(setPact(game(), PLAYER_ID, RIVAL_A, "nap"), PLAYER_ID, RIVAL_A), PLAYER_ID, RIVAL_B);
    const allyThird = getRelation(declareWar(setPact(game(), PLAYER_ID, RIVAL_A, "alliance"), PLAYER_ID, RIVAL_A), PLAYER_ID, RIVAL_B);
    expect(allyThird).toBeLessThan(napThird);
  });

  it("records a betrayal as a chronicle beat", () => {
    const g = declareWar(setPact(game(), RIVAL_A, RIVAL_B, "alliance"), RIVAL_A, RIVAL_B);
    expect((g.chronicle ?? []).some((e) => e.kind === "betrayal")).toBe(true);
  });

  it("honouring an ally's call is a duty, not treachery — even breaking a NAP with the foe", () => {
    // RIVAL_A holds a NAP with RIVAL_B but answers a call against it (ally_call).
    const napped = setPact(game(), RIVAL_A, RIVAL_B, "nap");
    const g = declareWar(napped, RIVAL_A, RIVAL_B, "ally_call");
    const pair = g.opinions?.[pairKey(RIVAL_A, RIVAL_B)] ?? [];
    expect(pair.some((e) => e.reason === "betrayal")).toBe(false);
    expect(pair.some((e) => e.reason === "war")).toBe(true);
  });
});
