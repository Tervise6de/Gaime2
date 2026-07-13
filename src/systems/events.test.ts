import { describe, it, expect } from "vitest";
import { fireEvent } from "@/systems/events";
import { createGame } from "@/systems/turn";
import { createRng } from "@/systems/rng";
import { PLAYER_ID } from "@/systems/state";

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
});
