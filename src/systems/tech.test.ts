import { describe, it, expect } from "vitest";
import {
  techMultipliers,
  techUnrestReduction,
  isBuildingUnlockedFor,
  isUnitUnlockedFor,
  researchFrontier,
  canResearch,
  advanceResearch,
  selectTech,
} from "@/systems/tech";
import { TECHS } from "@/data/techs";

describe("techMultipliers", () => {
  it("is 1.0 with no techs", () => {
    expect(techMultipliers([])).toEqual({ food: 1, materials: 1, gold: 1, knowledge: 1 });
  });

  it("stacks yield bonuses", () => {
    const m = techMultipliers(["agriculture", "currency"]);
    expect(m.food).toBeCloseTo(1.2, 5);
    expect(m.gold).toBeCloseTo(1.15, 5);
  });
});

describe("techUnrestReduction", () => {
  it("sums unrest tools", () => {
    expect(techUnrestReduction(["masonry", "civil_service"])).toBe(10);
    expect(techUnrestReduction([])).toBe(0);
  });
});

describe("unlocks", () => {
  it("gates advanced units behind tech", () => {
    expect(isUnitUnlockedFor([], "militia")).toBe(true);
    expect(isUnitUnlockedFor([], "ranged")).toBe(false);
    expect(isUnitUnlockedFor(["bronze_working"], "ranged")).toBe(true);
  });

  it("gates advanced buildings behind tech", () => {
    expect(isBuildingUnlockedFor([], "market")).toBe(true);
    expect(isBuildingUnlockedFor([], "wonder")).toBe(false);
    expect(isBuildingUnlockedFor(["architecture"], "wonder")).toBe(true);
  });
});

describe("researchFrontier", () => {
  it("starts with the tier-0 techs", () => {
    const f = researchFrontier([]);
    expect(f).toContain("agriculture");
    expect(f).not.toContain("engineering"); // needs prerequisites
  });

  it("opens prerequisites as they complete", () => {
    expect(canResearch([], "irrigation")).toBe(false);
    expect(canResearch(["agriculture"], "irrigation")).toBe(true);
  });
});

describe("advanceResearch", () => {
  it("banks knowledge when nothing is selected", () => {
    const step = advanceResearch({ current: null, progress: 0, done: [] }, 5);
    expect(step.completed).toBeNull();
    expect(step.research.progress).toBe(5);
  });

  it("completes a tech when the cost is met", () => {
    const cost = TECHS.writing.cost;
    const step = advanceResearch({ current: "writing", progress: cost - 1, done: [] }, 5);
    expect(step.completed).toBe("writing");
    expect(step.research.done).toContain("writing");
    expect(step.research.current).toBeNull();
  });

  it("accumulates progress otherwise", () => {
    const step = advanceResearch({ current: "writing", progress: 0, done: [] }, 4);
    expect(step.completed).toBeNull();
    expect(step.research.progress).toBe(4);
  });
});

describe("selectTech", () => {
  it("only selects a tech on the frontier", () => {
    const r = selectTech({ current: null, progress: 0, done: [] }, "engineering");
    expect(r.current).toBeNull(); // prerequisites unmet
    const ok = selectTech({ current: null, progress: 0, done: [] }, "writing");
    expect(ok.current).toBe("writing");
  });
});
