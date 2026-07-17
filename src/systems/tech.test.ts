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

import { eraLockedTechs } from "@/systems/tech";
import type { TechId } from "@/data/techs";

describe("era-gated research", () => {
  const done: TechId[] = ["agriculture"];

  it("only offers age-appropriate techs on the frontier", () => {
    // Agriculture done → Irrigation's prereq is met, but it belongs to a later age.
    expect(researchFrontier(done, 0)).not.toContain("irrigation"); // Age of Founding
    expect(researchFrontier(done, 1)).toContain("irrigation"); // Age of Banners
  });

  it("lists prereq-met-but-age-locked techs separately", () => {
    const locked = eraLockedTechs(done, 0);
    expect(locked).toContain("irrigation");
    expect(locked).not.toContain("agriculture"); // already done
  });

  it("canResearch and selectTech respect the age gate", () => {
    expect(canResearch(done, "irrigation", 0)).toBe(false);
    expect(canResearch(done, "irrigation", 1)).toBe(true);
    // selectTech refuses an out-of-age pick, keeps a valid one.
    const r = { current: null, progress: 0, done };
    expect(selectTech(r, "irrigation", 0).current).toBeNull();
    expect(selectTech(r, "irrigation", 1).current).toBe("irrigation");
  });

  it("omitting the era ignores the gate (prereqs only)", () => {
    expect(researchFrontier(done).includes("irrigation")).toBe(true);
  });

  it("every tech's prerequisites belong to an equal or earlier age", () => {
    for (const id of Object.keys(TECHS) as (keyof typeof TECHS)[]) {
      for (const req of TECHS[id].requires) {
        expect(TECHS[req].era).toBeLessThanOrEqual(TECHS[id].era);
      }
    }
  });
});
