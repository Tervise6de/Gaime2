import { describe, it, expect } from "vitest";
import { createGame } from "@/systems/turn";
import { setTreaty } from "@/systems/diplomacy";
import { PLAYER_ID } from "@/systems/state";
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

describe("categorical lenses (faith, relations)", () => {
  it("offers a Relations lens with a diverging legend; Faith is categorical (no ramp)", () => {
    expect(LENSES.map((l) => l.id)).toContain("relations");
    expect(lensGradient("relations")).toMatch(/^linear-gradient\(90deg,/);
    expect(lensGradient("faith")).toBeNull();
  });

  it("colours every region as valid hex under faith and relations", () => {
    const g = createGame({ seed: 9 });
    for (const id of ["faith", "relations"] as LensId[]) {
      const colors = lensColorsFor(g, id);
      expect(colors).not.toBeNull();
      for (const r of g.regions) expect(colors![r.id]).toMatch(HEX);
    }
  });

  it("relations tints your land gold, enemies red, allies green", () => {
    let g = createGame({ seed: 7, rivals: 3 });
    const RIVAL_A = 2;
    const RIVAL_B = 3;
    g = setTreaty(g, PLAYER_ID, RIVAL_A, "war");
    g = setTreaty(g, PLAYER_ID, RIVAL_B, "alliance");
    const colors = lensColorsFor(g, "relations")!;
    const self = g.regions.find((r) => r.ownerId === PLAYER_ID);
    const enemy = g.regions.find((r) => r.ownerId === RIVAL_A);
    const ally = g.regions.find((r) => r.ownerId === RIVAL_B);
    if (self) expect(colors[self.id]).toBe("#e6c874");
    if (enemy) expect(colors[enemy.id]).toBe("#c85248");
    if (ally) expect(colors[ally.id]).toBe("#4fa267");
  });
});
