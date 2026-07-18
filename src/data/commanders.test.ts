import { describe, it, expect } from "vitest";
import {
  COMMANDER_TRAITS,
  COMMANDER_TRAIT_IDS,
  commanderAttack,
  commanderDefense,
  commanderTitle,
  generateCommander,
  type Commander,
} from "@/data/commanders";
import { createRng } from "@/systems/rng";

describe("commanders (data)", () => {
  it("generates deterministically from the seed", () => {
    const a = generateCommander(createRng(12345));
    const b = generateCommander(createRng(12345));
    expect(a).toEqual(b);
    // Fields are in range and well-formed.
    expect(a.martial).toBeGreaterThanOrEqual(2);
    expect(a.martial).toBeLessThanOrEqual(9);
    expect(a.loyalty).toBeGreaterThanOrEqual(0);
    expect(a.loyalty).toBeLessThanOrEqual(100);
    expect(COMMANDER_TRAIT_IDS).toContain(a.trait);
    expect(commanderTitle(a)).toMatch(/ the | /);
  });

  it("different seeds can yield different officers", () => {
    const names = new Set<string>();
    for (let s = 0; s < 20; s++) {
      const c = generateCommander(createRng(s * 7919 + 1));
      names.add(`${c.name}|${c.trait}|${c.martial}`);
    }
    expect(names.size).toBeGreaterThan(1);
  });

  it("martial and trait raise the combat multipliers above 1", () => {
    const bold: Commander = { name: "X", epithet: "the Bold", martial: 8, trait: "bold", loyalty: 60 };
    expect(commanderAttack(bold)).toBeGreaterThan(1);
    // Bold gives nothing on defence beyond martial; still ≥ 1.
    expect(commanderDefense(bold)).toBeGreaterThanOrEqual(1);
    // An unled army has no modifier.
    expect(commanderAttack(undefined)).toBe(1);
    expect(commanderDefense(undefined)).toBe(1);
  });

  it("reckless trades defence for attack", () => {
    const reckless: Commander = { name: "Y", epithet: "the Red", martial: 3, trait: "reckless", loyalty: 50 };
    expect(COMMANDER_TRAITS.reckless.attack).toBeGreaterThan(0);
    expect(commanderDefense(reckless)).toBeLessThan(commanderAttack(reckless));
  });
});
