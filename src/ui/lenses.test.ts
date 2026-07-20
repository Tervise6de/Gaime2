import { describe, it, expect } from "vitest";
import { createGame } from "@/systems/turn";
import { setTreaty } from "@/systems/diplomacy";
import { PLAYER_ID, BARBARIAN_ID, emptyUnits } from "@/systems/state";
import { LENSES, lensColorsFor, lensGradient, type LensId } from "@/ui/lenses";

const HEX = /^#[0-9a-f]{6}$/i;

describe("map lenses", () => {
  it("offers a political default plus population, income and unrest heat lenses", () => {
    const ids = LENSES.map((l) => l.id);
    expect(ids[0]).toBe("none"); // political is first / default
    expect(new Set(ids).size).toBe(ids.length); // unique
    for (const want of ["population", "gold", "wares", "food", "unrest"] as LensId[]) {
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
    for (const id of ["population", "gold", "wares", "food", "unrest"] as LensId[]) {
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

describe("categorical lenses (relations)", () => {
  it("offers a Relations lens with a diverging legend", () => {
    expect(LENSES.map((l) => l.id)).toContain("relations");
    expect(lensGradient("relations")).toMatch(/^linear-gradient\(90deg,/);
  });

  it("colours every region as valid hex under relations", () => {
    const g = createGame({ seed: 9 });
    for (const id of ["relations"] as LensId[]) {
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

describe("military lens", () => {
  it("is offered, categorical (no ramp legend), and valid hex everywhere", () => {
    expect(LENSES.map((l) => l.id)).toContain("military");
    expect(lensGradient("military")).toBeNull();
    const g = createGame({ seed: 7, rivals: 2 });
    const colors = lensColorsFor(g, "military")!;
    for (const r of g.regions) expect(colors[r.id]).toMatch(HEX);
  });

  it("tints the player's garrisoned capital as friendly (not quiet or exposed)", () => {
    const g = createGame({ seed: 7, rivals: 2 });
    const colors = lensColorsFor(g, "military")!;
    const held = g.regions.find((r) => g.armies.some((a) => a.regionId === r.id && a.ownerId === PLAYER_ID));
    if (held) {
      expect(colors[held.id]).not.toBe("#33383f"); // not quiet
      expect(colors[held.id]).not.toBe("#d99a4f"); // not exposed
    }
  });

  it("marks an undefended province flanked by a hostile army as exposed amber", () => {
    let g = createGame({ seed: 7, rivals: 2 });
    const pr = g.regions.find(
      (r) => r.ownerId === PLAYER_ID && r.adjacency.length > 0 && !g.armies.some((a) => a.regionId === r.id),
    );
    if (!pr) return; // no undefended player region this seed — skip
    const nb = pr.adjacency[0]!;
    g = {
      ...g,
      armies: [...g.armies, { id: 99999, ownerId: BARBARIAN_ID, regionId: nb, units: { ...emptyUnits(), militia: 3 }, movesLeft: 0 }],
    };
    expect(lensColorsFor(g, "military")![pr.id]).toBe("#d99a4f");
  });
});
