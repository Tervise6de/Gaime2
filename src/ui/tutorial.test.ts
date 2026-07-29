import { describe, it, expect } from "vitest";
import { TUTORIAL_STEPS } from "@/ui/tutorial";

describe("tutorial steps", () => {
  it("is a non-empty, well-formed sequence", () => {
    expect(TUTORIAL_STEPS.length).toBeGreaterThanOrEqual(5);
    for (const step of TUTORIAL_STEPS) {
      expect(typeof step.title).toBe("string");
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(10);
      // target is null (centred) or a plausible CSS selector string.
      expect(step.target === null || typeof step.target === "string").toBe(true);
    }
  });

  it("opens with a centred welcome and every targeted step names a selector", () => {
    expect(TUTORIAL_STEPS[0]!.target).toBeNull();
    for (const step of TUTORIAL_STEPS.slice(1)) {
      if (step.target !== null) expect(step.target.startsWith(".") || step.target.startsWith("#")).toBe(true);
    }
  });
});

describe("the tour teaches the game's own subject", () => {
  it("explains trade routes and the Kontore before it explains war", () => {
    const text = TUTORIAL_STEPS.map((s) => `${s.title} ${s.body}`).join(" ").toLowerCase();
    // The pillar the game is built on must be named, not implied.
    for (const word of ["trade route", "kontor", "ware", "hansa control", "league"]) {
      expect(text).toContain(word);
    }
    // And the route step must come before the armies/diplomacy steps, so a new
    // player's first idea of "what do I do" is commerce, not conquest.
    const routeStep = TUTORIAL_STEPS.findIndex((s) => /open your first trade route/i.test(s.title));
    const diploStep = TUTORIAL_STEPS.findIndex((s) => /diplomacy/i.test(s.title));
    expect(routeStep).toBeGreaterThan(0);
    expect(routeStep).toBeLessThan(diploStep);
  });
});
