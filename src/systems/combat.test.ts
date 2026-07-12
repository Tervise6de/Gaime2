import { describe, it, expect } from "vitest";
import { resolveCombat, sideStrength, siegePower } from "@/systems/combat";
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
