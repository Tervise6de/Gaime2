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

import { queueResearch, dequeueResearch, clearQueue, recommendedTech } from "@/systems/tech";

describe("research queue + recommendation", () => {
  const r0 = { current: null as string | null, progress: 0, done: [] as string[], queue: [] as string[] };

  it("queues techs (dedup; skips done/current)", () => {
    let r = queueResearch({ ...r0 } as never, "agriculture");
    r = queueResearch(r, "agriculture"); // dedup
    r = queueResearch(r, "currency");
    expect(r.queue).toEqual(["agriculture", "currency"]);
    // skip a completed tech
    expect(queueResearch({ ...r0, done: ["writing"] } as never, "writing").queue ?? []).toEqual([]);
  });

  it("selectTech drops the picked tech from the queue", () => {
    const r = { current: null, progress: 0, done: [], queue: ["agriculture", "currency"] } as never;
    expect(selectTech(r, "agriculture", 0).queue).toEqual(["currency"]);
  });

  it("dequeues the next valid tech when idle, skipping invalid/age-locked", () => {
    // irrigation (era 1) is age-locked at era 0; currency (era 0) is next valid.
    const r = { current: null, progress: 0, done: [], queue: ["irrigation", "currency"] } as never;
    const d0 = dequeueResearch(r, 0);
    expect(d0.current).toBe("currency"); // irrigation skipped (wrong age at era 0... its prereq also missing)
  });

  it("does nothing while a tech is in progress", () => {
    const r = { current: "agriculture", progress: 5, done: [], queue: ["currency"] } as never;
    expect(dequeueResearch(r, 0)).toBe(r);
  });

  it("recommends the cheapest tech in the realm's branch", () => {
    // At era 0 with nothing done, military branch's cheapest frontier tech is bronze_working (22 < warcraft 26).
    expect(recommendedTech([], 0, "military")).toBe("bronze_working");
    expect(recommendedTech([], 0, "civics")).toBe("writing");
    expect(clearQueue({ ...r0, queue: ["currency"] } as never).queue).toEqual([]);
  });
});
