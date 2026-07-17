import { describe, it, expect } from "vitest";
import { createGame } from "@/systems/turn";
import { LENSES, lensColorsFor, lensGradient, type LensId } from "@/ui/lenses";

const HEX = /^#[0-9a-f]{6}$/i;

describe("map lenses", () => {
  it("offers a political default plus population, income and unrest heat lenses", () => {
    const ids = LENSES.map((l) => l.id);
    expect(ids[0]).toBe("none"); // political is first / default
    expect(new Set(ids).size).toBe(ids.length); // unique
    for (const want of ["population", "gold", "materials", "food", "unrest"] as LensId[]) {
      expect(ids).toContain(want);
    }
  });

  it("returns null for the political lens (renderer clears the overlay)", () => {
    const g = createGame({ seed: 1 });
    expect(lensColorsFor(g, "none")).toBeNull();
    expect(lensGradient("none")).toBeNull();
  });

  it("colours every region for a heat lens, as valid hex", () => {
    const g = createGame({ seed: 7 });
    for (const id of ["population", "gold", "materials", "food", "unrest"] as LensId[]) {
      const colors = lensColorsFor(g, id);
      expect(colors).not.toBeNull();
      for (const r of g.regions) {
        expect(colors![r.id]).toMatch(HEX);
      }
    }
  });

  it("is deterministic for a given state", () => {
    const g = createGame({ seed: 12345 });
    expect(lensColorsFor(g, "population")).toEqual(lensColorsFor(g, "population"));
    expect(lensColorsFor(g, "gold")).toEqual(lensColorsFor(g, "gold"));
  });

  it("spans the ramp: the most and least populous regions differ in colour", () => {
    const g = createGame({ seed: 3 });
    const colors = lensColorsFor(g, "population")!;
    // With varied populations the heat must not collapse to a single colour.
    const distinct = new Set(g.regions.map((r) => colors[r.id]));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("exposes a CSS gradient for each heat lens's scale legend", () => {
    expect(lensGradient("population")).toMatch(/^linear-gradient\(90deg,/);
    expect(lensGradient("unrest")).toMatch(/^linear-gradient\(90deg,/);
  });
});
