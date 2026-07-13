import { describe, it, expect } from "vitest";
import {
  resolveCombat,
  sideStrength,
  siegePower,
  combatStrengths,
  winChance,
  previewCombat,
} from "@/systems/combat";
import { createRng } from "@/systems/rng";
import { emptyUnits, armySize } from "@/systems/state";
import type { UnitCounts } from "@/systems/combat";

function units(partial: Partial<UnitCounts>): UnitCounts {
  return { ...emptyUnits(), ...partial };
}

const NO_TERRAIN = { terrainDefense: 1, fortification: 0 };

describe("sideStrength", () => {
  it("applies a counter bonus against the countered type", () => {
    // Militia counters cavalry.
    const vsCavalry = sideStrength(units({ militia: 4 }), units({ cavalry: 4 }), "attack");
    const vsInfantry = sideStrength(units({ militia: 4 }), units({ infantry: 4 }), "attack");
    expect(vsCavalry).toBeGreaterThan(vsInfantry);
  });
});

describe("siegePower", () => {
  it("counts only siege units", () => {
    expect(siegePower(units({ siege: 2 }))).toBeGreaterThan(0);
    expect(siegePower(units({ infantry: 5 }))).toBe(0);
  });
});

describe("resolveCombat", () => {
  it("captures an undefended region with no losses", () => {
    const res = resolveCombat(units({ infantry: 2 }), emptyUnits(), NO_TERRAIN, createRng(1));
    expect(res.captured).toBe(true);
    expect(armySize(res.attackerLosses)).toBe(0);
  });

  it("an overwhelming attacker wins and captures", () => {
    const res = resolveCombat(
      units({ infantry: 10, ranged: 6 }),
      units({ militia: 1 }),
      NO_TERRAIN,
      createRng(5),
    );
    expect(res.attackerWins).toBe(true);
    expect(res.captured).toBe(true);
  });

  it("a hopeless attacker is repelled", () => {
    const res = resolveCombat(
      units({ militia: 1 }),
      units({ infantry: 10, ranged: 6 }),
      NO_TERRAIN,
      createRng(5),
    );
    expect(res.attackerWins).toBe(false);
    expect(res.captured).toBe(false);
  });

  it("is deterministic for a given rng seed", () => {
    const a = resolveCombat(units({ infantry: 3 }), units({ militia: 2 }), NO_TERRAIN, createRng(7));
    const b = resolveCombat(units({ infantry: 3 }), units({ militia: 2 }), NO_TERRAIN, createRng(7));
    expect(a).toEqual(b);
  });

  it("fortification helps the defender; siege strips it", () => {
    const attacker = units({ infantry: 5 });
    const defender = units({ militia: 3 });
    const fortified = { terrainDefense: 1, fortification: 3 };

    // Same attacker vs a fortified defender loses more without siege support...
    const noSiege = resolveCombat(attacker, defender, fortified, createRng(3));
    const withSiege = resolveCombat(
      units({ infantry: 5, siege: 3 }),
      defender,
      fortified,
      createRng(3),
    );
    expect(armySize(withSiege.defenderLosses)).toBeGreaterThanOrEqual(
      armySize(noSiege.defenderLosses),
    );
  });
});

describe("combatStrengths & winChance (odds preview)", () => {
  it("matches resolveCombat's win outcome across the probability range", () => {
    // Deterministic sanity: a dominant attacker's winChance is ~1; a hopeless one ~0.
    const strong = previewCombat(units({ infantry: 12 }), units({ militia: 1 }), NO_TERRAIN);
    const weak = previewCombat(units({ militia: 1 }), units({ infantry: 12 }), NO_TERRAIN);
    expect(strong.winChance).toBeGreaterThan(0.9);
    expect(weak.winChance).toBeLessThan(0.1);
  });

  it("returns a probability in [0,1]", () => {
    for (const a of [0, 1, 5, 20]) {
      for (const d of [0, 1, 5, 20]) {
        const p = winChance(a, d);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is 50% when attack equals defence", () => {
    expect(winChance(10, 10)).toBeCloseTo(0.5, 5);
  });

  it("rises monotonically with attacker strength", () => {
    expect(winChance(5, 10)).toBeLessThan(winChance(10, 10));
    expect(winChance(10, 10)).toBeLessThan(winChance(15, 10));
  });

  it("counts fortification and terrain into the defence", () => {
    const bare = combatStrengths(units({ infantry: 5 }), units({ militia: 3 }), NO_TERRAIN);
    const forted = combatStrengths(units({ infantry: 5 }), units({ militia: 3 }), {
      terrainDefense: 1.5,
      fortification: 3,
    });
    expect(forted.defense).toBeGreaterThan(bare.defense);
  });

  it("siege in the attacker reduces the effective fortification bonus", () => {
    const ctx = { terrainDefense: 1, fortification: 4 };
    const noSiege = combatStrengths(units({ infantry: 5 }), units({ militia: 3 }), ctx);
    const withSiege = combatStrengths(units({ infantry: 5, siege: 2 }), units({ militia: 3 }), ctx);
    expect(withSiege.defense).toBeLessThan(noSiege.defense);
  });

  it("treats an undefended target as a certain capture", () => {
    const p = previewCombat(units({ militia: 1 }), emptyUnits(), { terrainDefense: 2, fortification: 5 });
    expect(p.undefended).toBe(true);
    expect(p.winChance).toBe(1);
    expect(p.defense).toBe(0);
  });
});
