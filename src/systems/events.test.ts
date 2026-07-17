import { describe, it, expect } from "vitest";
import { fireEvent, resolveChoice } from "@/systems/events";
import { createGame } from "@/systems/turn";
import { createRng } from "@/systems/rng";
import { getRelation } from "@/systems/diplomacy";
import { PLAYER_ID, BARBARIAN_ID, RESEARCH_SURGE_TURNS, pairKey, type GameState } from "@/systems/state";

const relationBetween = (s: GameState, a: number, b: number): number => getRelation(s, a, b);

/** Fire seeds until a specific choice event pends for the player; throws if it never does. */
function pendingChoiceState(eventId: string): GameState {
  const g = createGame({ seed: 12345, rivals: 2 });
  for (let i = 1; i <= 600; i++) {
    const next = fireEvent(g, PLAYER_ID, createRng(i));
    if (next.pendingChoice?.eventId === eventId) return next;
  }
  throw new Error(`${eventId} never fired for the player across 600 seeds`);
}
const pendingMercenaryState = (): GameState => pendingChoiceState("mercenary_offer");

/** Fire seeds until a trait-gated choice pends for a player carrying `trait`. */
function pendingTraitChoice(
  eventId: string,
  trait: "martial" | "scholarly" | "mercantile" | "fertile" | "industrious",
): GameState {
  const base = createGame({ seed: 12345, rivals: 2 });
  const g = { ...base, nations: base.nations.map((n) => (n.id === PLAYER_ID ? { ...n, trait } : n)) };
  for (let i = 1; i <= 600; i++) {
    const next = fireEvent(g, PLAYER_ID, createRng(i));
    if (next.pendingChoice?.eventId === eventId) return next;
  }
  throw new Error(`${eventId} never fired for a ${trait} player across 600 seeds`);
}

const infantryOf = (s: GameState, id: number): number =>
  s.armies.filter((a) => a.ownerId === id).reduce((n, a) => n + a.units.infantry, 0);
const militiaOf = (s: GameState, id: number): number =>
  s.armies.filter((a) => a.ownerId === id).reduce((n, a) => n + a.units.militia, 0);

describe("fireEvent", () => {
  it("is deterministic for a given rng seed", () => {
    const g = createGame({ seed: 12345, rivals: 2 });
    const a = fireEvent(g, PLAYER_ID, createRng(42));
    const b = fireEvent(g, PLAYER_ID, createRng(42));
    expect(a).toEqual(b);
  });

  it("does not mutate the input state", () => {
    const g = createGame({ seed: 7, rivals: 2 });
    const snapshot = JSON.stringify(g);
    fireEvent(g, PLAYER_ID, createRng(3));
    expect(JSON.stringify(g)).toBe(snapshot);
  });

  it("adds a log entry", () => {
    const g = createGame({ seed: 7, rivals: 2 });
    const next = fireEvent(g, PLAYER_ID, createRng(3));
    expect(next.log.length).toBeGreaterThanOrEqual(g.log.length);
  });

  it("keeps effects bounded — one event never wipes a nation out", () => {
    let s = createGame({ seed: 7, rivals: 2 });
    const before = s.regions.filter((r) => r.ownerId === PLAYER_ID).length;
    // Fire many events; ownership never changes from an event alone.
    for (let i = 0; i < 50; i++) s = fireEvent(s, PLAYER_ID, createRng(i + 1));
    const after = s.regions.filter((r) => r.ownerId === PLAYER_ID).length;
    expect(after).toBe(before);
  });

  it("a trait-flavoured event fires only for a nation with that trait", () => {
    const base = createGame({ seed: 12345, rivals: 2 });
    const withTrait = (t: "mercantile" | "fertile") => ({
      ...base,
      nations: base.nations.map((n) => (n.id === PLAYER_ID ? { ...n, trait: t } : n)),
    });
    const merchant = withTrait("mercantile");
    const farmer = withTrait("fertile");
    let merchantSaw = false;
    let farmerSaw = false;
    for (let i = 1; i <= 150; i++) {
      if (fireEvent(merchant, PLAYER_ID, createRng(i)).log.some((l) => l.includes("trade caravan"))) {
        merchantSaw = true;
      }
      if (fireEvent(farmer, PLAYER_ID, createRng(i)).log.some((l) => l.includes("trade caravan"))) {
        farmerSaw = true;
      }
    }
    expect(merchantSaw).toBe(true); // a Mercantile nation can receive it
    expect(farmerSaw).toBe(false); // a non-Mercantile nation never does
  });

  it("the mercantile trade-caravan windfall adds gold when it fires", () => {
    const base = createGame({ seed: 12345, rivals: 2 });
    const merchant = {
      ...base,
      nations: base.nations.map((n) => (n.id === PLAYER_ID ? { ...n, trait: "mercantile" as const } : n)),
    };
    const gold0 = merchant.nations[PLAYER_ID]!.stocks.gold;
    for (let i = 1; i <= 150; i++) {
      const next = fireEvent(merchant, PLAYER_ID, createRng(i));
      if (next.log.some((l) => l.includes("trade caravan"))) {
        expect(next.nations[PLAYER_ID]!.stocks.gold).toBeGreaterThan(gold0);
        return;
      }
    }
    throw new Error("trade caravan never fired across 150 seeds");
  });

  it("the market boom adds gold to any nation when it fires", () => {
    const g = createGame({ seed: 12345, rivals: 2 });
    const gold0 = g.nations[PLAYER_ID]!.stocks.gold;
    for (let i = 1; i <= 200; i++) {
      const next = fireEvent(g, PLAYER_ID, createRng(i));
      if (next.log.some((l) => l.includes("market boom"))) {
        expect(next.nations[PLAYER_ID]!.stocks.gold).toBeGreaterThan(gold0);
        return;
      }
    }
    throw new Error("market boom never fired across 200 seeds");
  });

  it("a festival eases unrest without ever pushing it below zero", () => {
    // Start every player region at low unrest so the −8 relief would underflow.
    const base = createGame({ seed: 12345, rivals: 2 });
    const g = {
      ...base,
      regions: base.regions.map((r) => (r.ownerId === PLAYER_ID ? { ...r, unrest: 3 } : r)),
    };
    for (let i = 1; i <= 200; i++) {
      const next = fireEvent(g, PLAYER_ID, createRng(i));
      if (next.log.some((l) => l.includes("festival"))) {
        const mine = next.regions.filter((r) => r.ownerId === PLAYER_ID);
        expect(mine.every((r) => r.unrest >= 0)).toBe(true);
        expect(mine.every((r) => r.unrest <= 3)).toBe(true); // relief, never a rise
        return;
      }
    }
    throw new Error("festival never fired across 200 seeds");
  });

  it("wandering scholars advance the current research when it fires", () => {
    const base = createGame({ seed: 12345, rivals: 2 });
    const g = {
      ...base,
      nations: base.nations.map((n) =>
        n.id === PLAYER_ID ? { ...n, research: { current: "writing" as const, progress: 0, done: [] } } : n,
      ),
    };
    for (let i = 1; i <= 200; i++) {
      const next = fireEvent(g, PLAYER_ID, createRng(i));
      if (next.log.some((l) => l.includes("scholars share"))) {
        expect(next.nations[PLAYER_ID]!.research.progress).toBeGreaterThan(0);
        return;
      }
    }
    throw new Error("wandering scholars never fired across 200 seeds");
  });
});

describe("choice events", () => {
  it("raises a pending decision for the player instead of auto-applying", () => {
    const g = createGame({ seed: 12345, rivals: 2 });
    const gold0 = g.nations[PLAYER_ID]!.stocks.gold;
    const s = pendingMercenaryState();
    expect(s.pendingChoice?.eventId).toBe("mercenary_offer");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["hire", "decline"]);
    // The prompt is raised but no effect has landed yet — gold is untouched.
    expect(s.nations[PLAYER_ID]!.stocks.gold).toBe(gold0);
  });

  it("hire pays 40 gold, adds 2 infantry, and clears the prompt", () => {
    const s = pendingMercenaryState();
    const gold0 = s.nations[PLAYER_ID]!.stocks.gold;
    const inf0 = infantryOf(s, PLAYER_ID);
    expect(gold0).toBeGreaterThanOrEqual(40); // starting treasury affords it
    const hired = resolveChoice(s, "hire");
    expect(hired.pendingChoice).toBeUndefined();
    expect(hired.nations[PLAYER_ID]!.stocks.gold).toBe(gold0 - 40);
    expect(infantryOf(hired, PLAYER_ID)).toBe(inf0 + 2);
  });

  it("decline clears the prompt at no cost", () => {
    const s = pendingMercenaryState();
    const gold0 = s.nations[PLAYER_ID]!.stocks.gold;
    const inf0 = infantryOf(s, PLAYER_ID);
    const declined = resolveChoice(s, "decline");
    expect(declined.pendingChoice).toBeUndefined();
    expect(declined.nations[PLAYER_ID]!.stocks.gold).toBe(gold0);
    expect(infantryOf(declined, PLAYER_ID)).toBe(inf0);
  });

  it("resolveChoice is a safe no-op when nothing pends", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    expect(resolveChoice(g, "hire")).toBe(g);
  });

  it("an AI auto-resolves a choice event — never leaves a decision pending", () => {
    const g = createGame({ seed: 12345, rivals: 2 });
    const rivalId = g.nations.find((n) => !n.isPlayer && !n.isBarbarian)!.id;
    for (let i = 1; i <= 300; i++) {
      expect(fireEvent(g, rivalId, createRng(i)).pendingChoice).toBeUndefined();
    }
  });

  it("funding an expedition trades 30 gold for materials and knowledge", () => {
    const s = pendingChoiceState("expedition");
    const g0 = s.nations[PLAYER_ID]!.stocks;
    expect(g0.gold).toBeGreaterThanOrEqual(30);
    const funded = resolveChoice(s, "fund");
    expect(funded.pendingChoice).toBeUndefined();
    expect(funded.nations[PLAYER_ID]!.stocks.gold).toBe(g0.gold - 30);
    expect(funded.nations[PLAYER_ID]!.stocks.materials).toBeGreaterThan(g0.materials);
    expect(funded.nations[PLAYER_ID]!.stocks.knowledge).toBeGreaterThan(g0.knowledge);
  });

  it("grain aid spends food to ease unrest across all owned regions", () => {
    const base = pendingChoiceState("grain_aid");
    // Raise player unrest so the −6 relief is observable and never underflows.
    const s = { ...base, regions: base.regions.map((r) => (r.ownerId === PLAYER_ID ? { ...r, unrest: 20 } : r)) };
    const food0 = s.nations[PLAYER_ID]!.stocks.food;
    const aided = resolveChoice(s, "aid");
    expect(aided.pendingChoice).toBeUndefined();
    expect(aided.nations[PLAYER_ID]!.stocks.food).toBe(food0 - 12);
    const mine = aided.regions.filter((r) => r.ownerId === PLAYER_ID);
    expect(mine.every((r) => r.unrest === 14)).toBe(true);
  });

  it("call-the-banners only fires for a Martial nation", () => {
    // A non-Martial player scanning the same seeds never sees it.
    const g = createGame({ seed: 12345, rivals: 2 });
    const fair = { ...g, nations: g.nations.map((n) => (n.id === PLAYER_ID ? { ...n, trait: "mercantile" as const } : n)) };
    let seen = false;
    for (let i = 1; i <= 600; i++) {
      if (fireEvent(fair, PLAYER_ID, createRng(i)).pendingChoice?.eventId === "call_the_banners") seen = true;
    }
    expect(seen).toBe(false);
    // A Martial player can receive it.
    expect(pendingTraitChoice("call_the_banners", "martial").pendingChoice?.eventId).toBe("call_the_banners");
  });

  it("mustering the banners adds 3 militia and raises unrest by 8", () => {
    const base = pendingTraitChoice("call_the_banners", "martial");
    const s = { ...base, regions: base.regions.map((r) => (r.ownerId === PLAYER_ID ? { ...r, unrest: 10 } : r)) };
    const militia0 = militiaOf(s, PLAYER_ID);
    const mustered = resolveChoice(s, "muster");
    expect(mustered.pendingChoice).toBeUndefined();
    expect(militiaOf(mustered, PLAYER_ID)).toBe(militia0 + 3);
    expect(mustered.regions.filter((r) => r.ownerId === PLAYER_ID).every((r) => r.unrest === 18)).toBe(true);
  });

  it("standing down leaves troops and unrest unchanged", () => {
    const s = pendingTraitChoice("call_the_banners", "martial");
    const militia0 = militiaOf(s, PLAYER_ID);
    const stood = resolveChoice(s, "stand_down");
    expect(stood.pendingChoice).toBeUndefined();
    expect(militiaOf(stood, PLAYER_ID)).toBe(militia0);
  });

  it("forbidden-lore fires only for a Scholarly nation", () => {
    const g = createGame({ seed: 12345, rivals: 2 });
    const other = { ...g, nations: g.nations.map((n) => (n.id === PLAYER_ID ? { ...n, trait: "martial" as const } : n)) };
    let seen = false;
    for (let i = 1; i <= 600; i++) {
      if (fireEvent(other, PLAYER_ID, createRng(i)).pendingChoice?.eventId === "forbidden_lore") seen = true;
    }
    expect(seen).toBe(false);
    expect(pendingTraitChoice("forbidden_lore", "scholarly").pendingChoice?.eventId).toBe("forbidden_lore");
  });

  it("studying the lore speeds current research but raises unrest by 6", () => {
    const base = pendingTraitChoice("forbidden_lore", "scholarly");
    const s = {
      ...base,
      nations: base.nations.map((n) =>
        n.id === PLAYER_ID ? { ...n, research: { current: "writing" as const, progress: 0, done: [] } } : n,
      ),
      regions: base.regions.map((r) => (r.ownerId === PLAYER_ID ? { ...r, unrest: 10 } : r)),
    };
    const studied = resolveChoice(s, "study");
    expect(studied.pendingChoice).toBeUndefined();
    expect(studied.nations[PLAYER_ID]!.research.progress).toBe(30);
    expect(studied.regions.filter((r) => r.ownerId === PLAYER_ID).every((r) => r.unrest === 16)).toBe(true);
  });

  it("burning the scrolls changes nothing but clears the prompt", () => {
    const s = pendingTraitChoice("forbidden_lore", "scholarly");
    const know0 = s.nations[PLAYER_ID]!.stocks.knowledge;
    const burned = resolveChoice(s, "burn");
    expect(burned.pendingChoice).toBeUndefined();
    expect(burned.nations[PLAYER_ID]!.stocks.knowledge).toBe(know0);
  });

  it("Scholarly grand academy: spends 30 materials for a research-surge modifier", () => {
    const base = pendingTraitChoice("grand_academy", "scholarly");
    const s = {
      ...base,
      nations: base.nations.map((n) =>
        n.id === PLAYER_ID ? { ...n, stocks: { ...n.stocks, materials: 40 } } : n,
      ),
    };
    const endowed = resolveChoice(s, "endow");
    expect(endowed.pendingChoice).toBeUndefined();
    expect(endowed.nations[PLAYER_ID]!.stocks.materials).toBe(10);
    const surge = endowed.nations[PLAYER_ID]!.modifiers?.find((m) => m.id === "research_surge");
    expect(surge?.turnsLeft).toBe(RESEARCH_SURGE_TURNS);
  });

  it("Grand academy with too few materials is a safe no-op beyond clearing the prompt", () => {
    const base = pendingTraitChoice("grand_academy", "scholarly");
    const s = {
      ...base,
      nations: base.nations.map((n) =>
        n.id === PLAYER_ID ? { ...n, stocks: { ...n.stocks, materials: 5 }, modifiers: undefined } : n,
      ),
    };
    const tried = resolveChoice(s, "endow");
    expect(tried.pendingChoice).toBeUndefined();
    expect(tried.nations[PLAYER_ID]!.stocks.materials).toBe(5);
    expect(tried.nations[PLAYER_ID]!.modifiers).toBeUndefined();
  });

  it("Mercantile monopoly charter: +40 gold at +6 unrest, trait-gated", () => {
    const base = pendingTraitChoice("monopoly_charter", "mercantile");
    const s = { ...base, regions: base.regions.map((r) => (r.ownerId === PLAYER_ID ? { ...r, unrest: 10 } : r)) };
    const gold0 = s.nations[PLAYER_ID]!.stocks.gold;
    const granted = resolveChoice(s, "grant");
    expect(granted.pendingChoice).toBeUndefined();
    expect(granted.nations[PLAYER_ID]!.stocks.gold).toBe(gold0 + 40);
    expect(granted.regions.filter((r) => r.ownerId === PLAYER_ID).every((r) => r.unrest === 16)).toBe(true);
  });

  it("Fertile settling season: spends 14 food to add population to ≤3 regions", () => {
    const s = pendingTraitChoice("settling_season", "fertile");
    const food0 = s.nations[PLAYER_ID]!.stocks.food;
    const pop0 = s.regions.filter((r) => r.ownerId === PLAYER_ID).reduce((a, r) => a + r.population, 0);
    const grown = resolveChoice(s, "settle");
    expect(grown.pendingChoice).toBeUndefined();
    expect(grown.nations[PLAYER_ID]!.stocks.food).toBe(food0 - 14);
    const pop1 = grown.regions.filter((r) => r.ownerId === PLAYER_ID).reduce((a, r) => a + r.population, 0);
    const owned = grown.regions.filter((r) => r.ownerId === PLAYER_ID).length;
    expect(pop1 - pop0).toBe(2 * Math.min(3, owned)); // +2 in up to three regions
  });

  it("Industrious public works: spends 24 materials to ease unrest by 8", () => {
    const base = pendingTraitChoice("public_works", "industrious");
    const s = {
      ...base,
      nations: base.nations.map((n) =>
        n.id === PLAYER_ID ? { ...n, stocks: { ...n.stocks, materials: 40 } } : n,
      ),
      regions: base.regions.map((r) => (r.ownerId === PLAYER_ID ? { ...r, unrest: 20 } : r)),
    };
    const mat0 = s.nations[PLAYER_ID]!.stocks.materials;
    const built = resolveChoice(s, "commission");
    expect(built.pendingChoice).toBeUndefined();
    expect(built.nations[PLAYER_ID]!.stocks.materials).toBe(mat0 - 24);
    expect(built.regions.filter((r) => r.ownerId === PLAYER_ID).every((r) => r.unrest === 12)).toBe(true);
  });

  it("golden jubilee: proclaiming pays 20 gold and grants a 5-turn prosperity modifier", () => {
    const s = pendingChoiceState("golden_jubilee");
    const gold0 = s.nations[PLAYER_ID]!.stocks.gold;
    expect(gold0).toBeGreaterThanOrEqual(20);
    const proclaimed = resolveChoice(s, "proclaim");
    expect(proclaimed.pendingChoice).toBeUndefined();
    expect(proclaimed.nations[PLAYER_ID]!.stocks.gold).toBe(gold0 - 20);
    expect(proclaimed.nations[PLAYER_ID]!.modifiers).toEqual([{ id: "prosperity", turnsLeft: 5 }]);
  });

  it("golden jubilee: passing leaves gold and modifiers untouched", () => {
    const s = pendingChoiceState("golden_jubilee");
    const gold0 = s.nations[PLAYER_ID]!.stocks.gold;
    const passed = resolveChoice(s, "pass");
    expect(passed.nations[PLAYER_ID]!.stocks.gold).toBe(gold0);
    expect(passed.nations[PLAYER_ID]!.modifiers ?? []).toEqual([]);
  });

  it("each trait choice fires only for its own trait", () => {
    // A single non-matching trait (opportunist has none of these) never sees them.
    const g = createGame({ seed: 12345, rivals: 2 });
    const plain = { ...g, nations: g.nations.map((n) => (n.id === PLAYER_ID ? { ...n, trait: undefined } : n)) };
    const gated = ["monopoly_charter", "settling_season", "public_works"];
    for (let i = 1; i <= 400; i++) {
      const id = fireEvent(plain, PLAYER_ID, createRng(i)).pendingChoice?.eventId;
      expect(gated).not.toContain(id);
    }
  });

  it("Reinforce walls: spends 20 materials for +1 fortification on a border region", () => {
    const base = pendingChoiceState("reinforce_walls");
    const s = {
      ...base,
      nations: base.nations.map((n) =>
        n.id === PLAYER_ID ? { ...n, stocks: { ...n.stocks, materials: 30 } } : n,
      ),
    };
    const fortBefore = s.regions.filter((r) => r.ownerId === PLAYER_ID).reduce((a, r) => a + r.fortification, 0);
    const funded = resolveChoice(s, "fund");
    expect(funded.pendingChoice).toBeUndefined();
    expect(funded.nations[PLAYER_ID]!.stocks.materials).toBe(10);
    const fortAfter = funded.regions.filter((r) => r.ownerId === PLAYER_ID).reduce((a, r) => a + r.fortification, 0);
    expect(fortAfter).toBe(fortBefore + 1);
    // The reinforced region is a genuine border region (borders land it doesn't own).
    const raised = funded.regions.find(
      (r, i) => r.ownerId === PLAYER_ID && r.fortification > s.regions[i]!.fortification,
    )!;
    expect(raised.adjacency.some((nb) => funded.regions[nb]!.ownerId !== PLAYER_ID)).toBe(true);
  });

  it("Reinforce walls with too few materials is a safe no-op beyond clearing the prompt", () => {
    const base = pendingChoiceState("reinforce_walls");
    const s = {
      ...base,
      nations: base.nations.map((n) =>
        n.id === PLAYER_ID ? { ...n, stocks: { ...n.stocks, materials: 5 } } : n,
      ),
    };
    const tried = resolveChoice(s, "fund");
    expect(tried.pendingChoice).toBeUndefined();
    expect(tried.nations[PLAYER_ID]!.stocks.materials).toBe(5);
    const fortBefore = s.regions.reduce((a, r) => a + r.fortification, 0);
    expect(tried.regions.reduce((a, r) => a + r.fortification, 0)).toBe(fortBefore);
  });

  // A player region (0) bordering a fortified barbarian region (1), with a
  // sap_the_walls decision pending.
  const sapState = (gold: number, targetFort = 2): GameState => {
    const reg = (over: Record<string, unknown>) =>
      ({
        id: 0, name: "R", terrain: "plains", ownerId: PLAYER_ID, population: 3, unrest: 0,
        fortification: 0, resource: null, buildings: [], construction: null, adjacency: [], x: 0.5, y: 0.5, ...over,
      });
    return {
      turn: 30, treaties: {}, offers: [], armies: [], log: [], nextArmyId: 5,
      pendingChoice: { eventId: "sap_the_walls", prompt: "", options: [] },
      nations: [
        { id: PLAYER_ID, isPlayer: true, isBarbarian: false, alive: true, stocks: { gold, food: 0, materials: 0, knowledge: 0 } },
        { id: BARBARIAN_ID, isPlayer: false, isBarbarian: true, alive: true, stocks: { gold: 0, food: 0, materials: 0, knowledge: 0 } },
      ],
      regions: [
        reg({ id: 0, ownerId: PLAYER_ID, adjacency: [1] }),
        reg({ id: 1, ownerId: BARBARIAN_ID, fortification: targetFort, adjacency: [0] }),
      ],
    } as unknown as GameState;
  };

  it("Sap the walls: spends 25 gold to weaken a bordering hostile fort by 1", () => {
    const after = resolveChoice(sapState(40, 2), "hire");
    expect(after.pendingChoice).toBeUndefined();
    expect(after.nations[PLAYER_ID]!.stocks.gold).toBe(15);
    expect(after.regions[1]!.fortification).toBe(1); // 2 → 1
    expect(after.log.some((l) => /undermine/.test(l))).toBe(true);
  });

  it("Sap the walls with too little gold is a safe no-op beyond clearing the prompt", () => {
    const after = resolveChoice(sapState(10, 2), "hire");
    expect(after.pendingChoice).toBeUndefined();
    expect(after.nations[PLAYER_ID]!.stocks.gold).toBe(10);
    expect(after.regions[1]!.fortification).toBe(2); // unchanged
  });

  it("sap_the_walls only fires when a fortified hostile fort borders you", () => {
    // No fortified hostile neighbour → the event is ineligible and never pends.
    const g = createGame({ seed: 12345, rivals: 2 });
    const noForts = { ...g, regions: g.regions.map((r) => ({ ...r, fortification: 0 })) };
    for (let i = 1; i <= 300; i++) {
      expect(fireEvent(noForts, PLAYER_ID, createRng(i)).pendingChoice?.eventId).not.toBe("sap_the_walls");
    }
  });

  it("envoy exchange: sending warms relations with the lowest-standing rival for 20 gold", () => {
    const base = pendingChoiceState("envoy_exchange");
    // Make one rival clearly the frostiest so the target is unambiguous.
    const rivals = base.nations.filter((n) => !n.isPlayer && !n.isBarbarian).map((n) => n.id);
    const targetId = rivals[0]!;
    const s: GameState = { ...base, relations: { ...base.relations, [pairKey(PLAYER_ID, targetId)]: -30 } };
    const rel0 = -30;
    const gold0 = s.nations[PLAYER_ID]!.stocks.gold;
    expect(gold0).toBeGreaterThanOrEqual(20);
    const sent = resolveChoice(s, "send");
    expect(sent.pendingChoice).toBeUndefined();
    expect(sent.nations[PLAYER_ID]!.stocks.gold).toBe(gold0 - 20);
    expect(relationBetween(sent, PLAYER_ID, targetId)).toBe(rel0 + 15);
  });

  it("envoy exchange: abstaining costs nothing and changes no relations", () => {
    const s = pendingChoiceState("envoy_exchange");
    const gold0 = s.nations[PLAYER_ID]!.stocks.gold;
    const rel0 = JSON.stringify(s.relations);
    const abstained = resolveChoice(s, "abstain");
    expect(abstained.pendingChoice).toBeUndefined();
    expect(abstained.nations[PLAYER_ID]!.stocks.gold).toBe(gold0);
    expect(JSON.stringify(abstained.relations)).toBe(rel0);
  });
});

describe("balancing setback events", () => {
  it("drought costs food and never drives it below zero", () => {
    const base = createGame({ seed: 12345, rivals: 2 });
    // Player food low so the −12 would underflow without the floor.
    const g = { ...base, nations: base.nations.map((n) => (n.id === PLAYER_ID ? { ...n, stocks: { ...n.stocks, food: 4 } } : n)) };
    for (let i = 1; i <= 300; i++) {
      const next = fireEvent(g, PLAYER_ID, createRng(i));
      if (next.log.some((l) => l.includes("dry year"))) {
        expect(next.nations[PLAYER_ID]!.stocks.food).toBe(0); // floored, not negative
        return;
      }
    }
    throw new Error("drought never fired across 300 seeds");
  });

  it("a raided caravan costs gold but never below zero", () => {
    const base = createGame({ seed: 12345, rivals: 2 });
    const g = { ...base, nations: base.nations.map((n) => (n.id === PLAYER_ID ? { ...n, stocks: { ...n.stocks, gold: 5 } } : n)) };
    for (let i = 1; i <= 300; i++) {
      const next = fireEvent(g, PLAYER_ID, createRng(i));
      if (next.log.some((l) => l.includes("Bandits waylay"))) {
        expect(next.nations[PLAYER_ID]!.stocks.gold).toBe(0);
        return;
      }
    }
    throw new Error("caravan_raided never fired across 300 seeds");
  });

  it("a border raid costs population but never below the minimum, and adds no owner change", () => {
    const g = createGame({ seed: 12345, rivals: 2 });
    const before = g.regions.filter((r) => r.ownerId === PLAYER_ID).length;
    for (let i = 1; i <= 400; i++) {
      const next = fireEvent(g, PLAYER_ID, createRng(i));
      if (next.log.some((l) => l.includes("Raiders strike"))) {
        expect(next.regions.every((r) => r.population >= 1)).toBe(true);
        expect(next.regions.filter((r) => r.ownerId === PLAYER_ID).length).toBe(before);
        return;
      }
    }
    throw new Error("border_raid never fired across 400 seeds");
  });
});

describe("faith events", () => {
  it("the wandering preacher wins a nearby province to your faith", () => {
    let s = pendingChoiceState("wandering_preacher");
    s = { ...s, nations: s.nations.map((n) => (n.id === PLAYER_ID ? { ...n, stocks: { ...n.stocks, gold: 100 } } : n)) };
    const before = s.regions.filter((r) => r.faith === PLAYER_ID).length;
    const after = resolveChoice(s, "send");
    expect(after.regions.filter((r) => r.faith === PLAYER_ID).length).toBe(before + 1);
    expect(after.pendingChoice).toBeUndefined();
  });

  it("declining the preacher converts no one", () => {
    const s = pendingChoiceState("wandering_preacher");
    const before = s.regions.filter((r) => r.faith === PLAYER_ID).length;
    const after = resolveChoice(s, "stay");
    expect(after.regions.filter((r) => r.faith === PLAYER_ID).length).toBe(before);
  });

  it("a saint's relic firms your faith in a province you rule but had not converted", () => {
    const base = createGame({ seed: 12345, rivals: 2 });
    const pr = base.regions.find((r) => r.ownerId === PLAYER_ID)!;
    // Occupied-but-unconverted: the player rules it, but its people hold rival 2's faith.
    const s = { ...base, regions: base.regions.map((r) => (r.id === pr.id ? { ...r, faith: 2 } : r)) };
    for (let i = 1; i <= 800; i++) {
      const next = fireEvent(s, PLAYER_ID, createRng(i));
      if (next.log.some((l) => l.includes("saint's relic"))) {
        expect(next.regions[pr.id]!.faith).toBe(PLAYER_ID); // won back to your faith
        return;
      }
    }
    throw new Error("saints_relic never fired across 800 seeds");
  });

  it("heresy takes a faithful border province from your faith", () => {
    const base = createGame({ seed: 12345, rivals: 2 });
    const r0 = base.regions.find((r) => r.ownerId === PLAYER_ID && r.adjacency.length > 0)!;
    // Seed a heretic neighbour (rival 2's faith) so a heresy seam exists.
    const s = {
      ...base,
      regions: base.regions.map((r) =>
        r.id === r0.id ? { ...r, faith: PLAYER_ID } : r.id === r0.adjacency[0] ? { ...r, faith: 2 } : r,
      ),
    };
    const before = s.regions.filter((r) => r.faith === PLAYER_ID).length;
    for (let i = 1; i <= 1000; i++) {
      const next = fireEvent(s, PLAYER_ID, createRng(i));
      if (next.log.some((l) => l.includes("Heresy spreads"))) {
        // One province that held your faith has slipped away.
        expect(next.regions.filter((r) => r.faith === PLAYER_ID).length).toBe(before - 1);
        return;
      }
    }
    throw new Error("heresy never fired across 1000 seeds");
  });
});
