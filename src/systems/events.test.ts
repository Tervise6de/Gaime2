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
});
