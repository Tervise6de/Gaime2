import { describe, expect, it } from "vitest";
import { createRng, hashSeed, rngFromState } from "@/core/rng";

describe("rng", () => {
  it("is deterministic for a given seed", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different streams for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("stays within [0, 1)", () => {
    const rng = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int() respects [min, max) bounds", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(3, 8);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(8);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("int() returns min when range is empty", () => {
    const rng = createRng(5);
    expect(rng.int(4, 4)).toBe(4);
    expect(rng.int(9, 2)).toBe(9);
  });

  it("pick() throws on an empty array", () => {
    const rng = createRng(5);
    expect(() => rng.pick([])).toThrow();
  });

  it("can be resumed exactly from a persisted state", () => {
    const rng = createRng(2024);
    // Advance a few steps.
    rng.next();
    rng.next();
    const snapshot = rng.state();
    const expected = Array.from({ length: 10 }, () => rng.next());

    const resumed = rngFromState(snapshot);
    const actual = Array.from({ length: 10 }, () => resumed.next());
    expect(actual).toEqual(expected);
  });

  it("hashSeed maps distinct small seeds to distinct states", () => {
    const states = new Set<number>();
    for (let i = 0; i < 100; i++) states.add(hashSeed(i));
    expect(states.size).toBe(100);
  });
});
