import { describe, it, expect } from "vitest";
import { SCENARIOS } from "@/data/scenarios";
import { TRAIT_IDS } from "@/data/traits";

describe("SCENARIOS", () => {
  it("is a non-empty list of well-formed, uniquely-identified scenarios", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(4);
    const ids = new Set<string>();
    for (const s of SCENARIOS) {
      expect(s.id).toMatch(/^[a-z_]+$/);
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(10);
      expect(s.rivals).toBeGreaterThanOrEqual(1);
      expect(s.rivals).toBeLessThanOrEqual(5);
      expect([16, 22, 30]).toContain(s.regionCount);
      expect(["easy", "normal", "hard"]).toContain(s.difficulty);
      if (s.playerTrait !== undefined) expect(TRAIT_IDS).toContain(s.playerTrait);
    }
  });

  it("does not collide with the reserved 'custom' id", () => {
    expect(SCENARIOS.some((s) => s.id === "custom")).toBe(false);
  });
});
