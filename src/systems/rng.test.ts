import { describe, it, expect } from "vitest";
import { createRng, hashSeed } from "@/systems/rng";

describe("seeded RNG", () => {
  it("is deterministic: same seed → same sequence", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it("yields floats in [0, 1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int() stays within the inclusive range", () => {
    const rng = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(3, 8);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(8);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("pick() throws on an empty array", () => {
    const rng = createRng(1);
    expect(() => rng.pick([])).toThrow();
  });

  it("hashSeed is stable and unsigned", () => {
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
    expect(hashSeed("abc")).toBeGreaterThanOrEqual(0);
    expect(hashSeed("abc")).not.toBe(hashSeed("abd"));
  });
});
