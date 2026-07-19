import { describe, it, expect } from "vitest";
import { scheduleEpochs, stepEpochs, turnForYear } from "@/systems/epochs";
import { EPOCH_EVENTS } from "@/data/epochEvents";
import { createRng } from "@/systems/rng";
import { createGame, resolveTurn } from "@/systems/turn";
import { type GameState } from "@/systems/state";

const rng = (seed: number) => createRng(seed >>> 0);
const totalPop = (s: GameState) => s.regions.reduce((sum, r) => sum + r.population, 0);
const def = (id: string) => EPOCH_EVENTS.find((e) => e.id === id)!;

describe("scheduleEpochs", () => {
  it("is deterministic for a given rng seed", () => {
    expect(scheduleEpochs(rng(123))).toEqual(scheduleEpochs(rng(123)));
  });

  it("fires each scheduled event within its anchor year ± window", () => {
    // Sweep many seeds so every event is scheduled at least once.
    for (let seed = 1; seed <= 40; seed++) {
      for (const s of scheduleEpochs(rng(seed))) {
        const d = def(s.id);
        const lo = turnForYear(d.year - d.windowYears);
        const hi = turnForYear(d.year + d.windowYears);
        expect(s.fireTurn).toBeGreaterThanOrEqual(lo);
        expect(s.fireTurn).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("never lands the same event on the same turn across games", () => {
    // The ± window must actually vary the timing — collect the plague's fire turn
    // across many seeds and assert it takes more than one value.
    const turns = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const hit = scheduleEpochs(rng(seed)).find((e) => e.id === "black_death");
      if (hit) turns.add(hit.fireTurn);
    }
    expect(turns.size).toBeGreaterThan(1);
  });

  it("returns a schedule ordered by fire turn", () => {
    const sched = scheduleEpochs(rng(7));
    const turns = sched.map((s) => s.fireTurn);
    expect(turns).toEqual([...turns].sort((a, b) => a - b));
  });
});

describe("stepEpochs", () => {
  it("does not fire events whose turn has not yet come", () => {
    const g = createGame({ seed: 5, mapId: "hansa" });
    const s: GameState = { ...g, epochs: [{ id: "black_death", fireTurn: 999 }] };
    const next = stepEpochs(s, rng(1));
    expect(next.epochs).toEqual(s.epochs);
    expect(totalPop(next)).toBe(totalPop(s));
  });

  it("plague culls the populous towns and removes itself from the schedule", () => {
    const g = createGame({ seed: 5, mapId: "hansa" });
    const s: GameState = { ...g, epochs: [{ id: "black_death", fireTurn: 1 }] };
    const before = totalPop(s);
    const next = stepEpochs(s, rng(1));
    expect(totalPop(next)).toBeLessThan(before); // people were lost
    expect(next.epochs).toEqual([]); // the event fired once and is gone
  });

  it("the herring monopoly pays every realm a gold windfall", () => {
    const g = createGame({ seed: 8, mapId: "hansa" });
    const s: GameState = { ...g, epochs: [{ id: "herring_monopoly", fireTurn: 1 }] };
    const goldBefore = s.nations[0]!.stocks.gold;
    const next = stepEpochs(s, rng(1));
    expect(next.nations[0]!.stocks.gold).toBeGreaterThan(goldBefore);
  });

  it("closing the Peterhof shuts the Novgorod Kontor", () => {
    const g = createGame({ seed: 8, mapId: "hansa" });
    expect(g.kontore!.find((k) => k.id === "novgorod")!.open).toBe(true);
    const s: GameState = { ...g, epochs: [{ id: "novgorod_closed", fireTurn: 1 }] };
    const next = stepEpochs(s, rng(1));
    expect(next.kontore!.find((k) => k.id === "novgorod")!.open).toBe(false);
  });

  it("is a no-op when there is no schedule (legacy saves)", () => {
    const g = createGame({ seed: 5, mapId: "hansa" });
    const s: GameState = { ...g, epochs: undefined };
    expect(stepEpochs(s, rng(1))).toEqual(s);
  });

  it("resolveTurn fires an epoch due on the coming turn (pipeline wiring)", () => {
    const g = createGame({ seed: 5, mapId: "hansa" });
    // resolveTurn advances turn 1 → 2, then fires anything due by turn 2.
    const s: GameState = { ...g, epochs: [{ id: "black_death", fireTurn: 2 }] };
    const next = resolveTurn(s);
    expect(next.turn).toBe(2);
    expect(next.epochs).toEqual([]); // the plague fired and left the schedule
    expect(next.log.some((l) => l.includes("Black Death"))).toBe(true);
  });
});
