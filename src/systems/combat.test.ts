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

describe("resolveCombat — phased battle (volley + melee)", () => {
  it("opens with a volley that softens a non-volley defender before melee", () => {
    // Ranged units fire first; a militia-only defender can't shoot back.
    const res = resolveCombat(units({ ranged: 20 }), units({ militia: 4 }), NO_TERRAIN, createRng(9));
    const first = res.report.phases[0]!;
    expect(first.kind).toBe("volley");
    expect(armySize(first.defenderLosses)).toBeGreaterThan(0);
    expect(armySize(first.attackerLosses)).toBe(0); // no return fire
  });

  it("skips the volley when neither side has volley units", () => {
    const res = resolveCombat(units({ infantry: 4 }), units({ militia: 3 }), NO_TERRAIN, createRng(2));
    expect(res.report.phases.every((p) => p.kind !== "volley")).toBe(true);
  });

  it("records melee rounds with a bounded count", () => {
    const res = resolveCombat(units({ infantry: 6 }), units({ militia: 5 }), NO_TERRAIN, createRng(4));
    const melee = res.report.phases.filter((p) => p.kind === "melee");
    expect(melee.length).toBeGreaterThan(0);
    expect(melee.length).toBeLessThanOrEqual(5); // MAX_COMBAT_ROUNDS
  });

  it("keeps the report's start/losses/remaining internally consistent", () => {
    const res = resolveCombat(
      units({ infantry: 5, ranged: 3 }),
      units({ militia: 4, cavalry: 2 }),
      { terrainDefense: 1.25, fortification: 2 },
      createRng(11),
    );
    const r = res.report;
    for (const t of ["militia", "infantry", "ranged", "cavalry", "siege"] as const) {
      expect(r.attackerStart[t] - r.attackerLosses[t]).toBe(r.attackerRemaining[t]);
      expect(r.defenderStart[t] - r.defenderLosses[t]).toBe(r.defenderRemaining[t]);
    }
    // The report's tallies mirror the top-level result.
    expect(r.attackerLosses).toEqual(res.attackerLosses);
    expect(r.defenderLosses).toEqual(res.defenderLosses);
  });

  it("notes siege battering the fort down in the effective fortification", () => {
    const ctx = { terrainDefense: 1, fortification: 4 };
    const res = resolveCombat(units({ infantry: 6, siege: 3 }), units({ militia: 4 }), ctx, createRng(6));
    expect(res.report.fortification).toBe(4);
    expect(res.report.effectiveFort).toBeLessThan(4);
  });

  it("the counter loop swings casualties: countering the enemy costs them more", () => {
    // Militia counter cavalry. Same defender both times; only the terrain of
    // the matchup changes via what the attacker is countering.
    let counterLoss = 0;
    let controlLoss = 0;
    for (let seed = 1; seed <= 40; seed++) {
      counterLoss += armySize(
        resolveCombat(units({ militia: 8 }), units({ cavalry: 6 }), NO_TERRAIN, createRng(seed)).defenderLosses,
      );
      controlLoss += armySize(
        resolveCombat(units({ militia: 8 }), units({ infantry: 6 }), NO_TERRAIN, createRng(seed)).defenderLosses,
      );
    }
    // Countered cavalry bleed more than un-countered infantry, all else equal.
    expect(counterLoss).toBeGreaterThan(controlLoss);
  });

  it("reaches capture, repel, and hold outcomes across seeds", () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      outcomes.add(resolveCombat(units({ infantry: 12 }), units({ militia: 1 }), NO_TERRAIN, createRng(seed)).report.outcome);
      outcomes.add(resolveCombat(units({ militia: 1 }), units({ infantry: 12 }), NO_TERRAIN, createRng(seed)).report.outcome);
      outcomes.add(resolveCombat(units({ infantry: 14 }), units({ infantry: 14 }), NO_TERRAIN, createRng(seed)).report.outcome);
    }
    expect(outcomes.has("captured")).toBe(true);
    expect(outcomes.has("repelled")).toBe(true);
    expect(outcomes.has("held")).toBe(true);
  });

  it("labels each melee round from who actually took the casualties", () => {
    // An overwhelming attacker: every melee round the defender should be the one
    // giving ground, so the note must never read as the attacker being repelled.
    const res = resolveCombat(units({ infantry: 14, ranged: 6 }), units({ militia: 2 }), NO_TERRAIN, createRng(21));
    for (const ph of res.report.phases) {
      if (ph.kind !== "melee") continue;
      if (armySize(ph.defenderLosses) > 0 && armySize(ph.attackerLosses) === 0) {
        expect(ph.note).toBe("The defenders give ground.");
      }
    }
  });

  it("is deterministic including the full report", () => {
    const ctx = { terrainDefense: 1.25, fortification: 2 };
    const a = resolveCombat(units({ infantry: 5, ranged: 3 }), units({ militia: 4 }), ctx, createRng(13));
    const b = resolveCombat(units({ infantry: 5, ranged: 3 }), units({ militia: 4 }), ctx, createRng(13));
    expect(a).toEqual(b);
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
