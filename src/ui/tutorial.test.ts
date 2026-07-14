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
