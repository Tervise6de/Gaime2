import { describe, it, expect } from "vitest";
import { generateRuler, rulerTitle } from "@/data/rulers";
import { createRng } from "@/systems/rng";

describe("rulers (E1)", () => {
  it("generates deterministically from the seed", () => {
    expect(generateRuler(createRng(7))).toEqual(generateRuler(createRng(7)));
  });

  it("rulerTitle reads as 'Name the Epithet'", () => {
    expect(rulerTitle({ name: "Visvaldis", epithet: "the Cruel" })).toBe("Visvaldis the Cruel");
  });

  it("archetype flavours the epithet pool (warlords can earn martial epithets)", () => {
    const warlordEpithets = new Set<string>();
    for (let s = 0; s < 60; s++) warlordEpithets.add(generateRuler(createRng(s * 131 + 1), "warlord").epithet);
    // At least one distinctly martial epithet should appear across the sample.
    expect([...warlordEpithets].some((e) => /Cruel|Conqueror|Iron|Wrathful|Bloody|Dread/.test(e))).toBe(true);
  });
});
