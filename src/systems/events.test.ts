import { describe, it, expect } from "vitest";
import { fireEvent, resolveChoice } from "@/systems/events";
import { createGame } from "@/systems/turn";
import { createRng } from "@/systems/rng";
import { PLAYER_ID, type GameState } from "@/systems/state";

/** Fire seeds until the player's mercenary decision pends; throws if it never does. */
function pendingMercenaryState(): GameState {
  const g = createGame({ seed: 12345, rivals: 2 });
  for (let i = 1; i <= 400; i++) {
    const next = fireEvent(g, PLAYER_ID, createRng(i));
    if (next.pendingChoice) return next;
  }
  throw new Error("mercenary_offer never fired for the player across 400 seeds");
}

const infantryOf = (s: GameState, id: number): number =>
  s.armies.filter((a) => a.ownerId === id).reduce((n, a) => n + a.units.infantry, 0);

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
});
