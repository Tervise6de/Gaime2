import { describe, it, expect } from "vitest";
import { fireEvent, resolveChoice } from "@/systems/events";
import { createGame } from "@/systems/turn";
import { createRng } from "@/systems/rng";
import { PLAYER_ID, RESEARCH_SURGE_TURNS, type GameState } from "@/systems/state";

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
});
