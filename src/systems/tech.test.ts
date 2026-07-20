import { describe, it, expect } from "vitest";
import {
  techMultipliers,
  techWareMult,
  techTradeMult,
  techUnrestReduction,
  isBuildingUnlockedFor,
  isUnitUnlockedFor,
  researchFrontier,
  eraLockedTechs,
  canResearch,
  advanceResearch,
  selectTech,
  queueResearch,
  dequeueResearch,
  clearQueue,
  recommendedTech,
  committedPath,
  isPathRejected,
  nextNodeInPath,
  pathDoneCount,
} from "@/systems/tech";
import { TECHS, TECH_IDS, PATHS, PATH_IDS, CATEGORIES, CATEGORY_IDS, type TechId } from "@/data/techs";
import { BUILDINGS, BUILDING_IDS } from "@/data/buildings";
import { UNITS, UNIT_TYPES } from "@/data/units";

// A few concrete nodes used across the suite.
//  commerce/open_markets:      free_trade(0) → low_tariffs(1) → open_prosperity(2)
//  commerce/regulated_guilds:  council_oversight(0) → …
//  commerce/staple_monopoly:   exclusive_charters(0) → …

describe("effect aggregation", () => {
  it("yield multipliers stack (1.0 baseline)", () => {
    expect(techMultipliers([])).toEqual({ food: 1, gold: 1, knowledge: 1 });
    expect(techMultipliers(["free_trade"]).knowledge).toBeCloseTo(1.05, 5);
    expect(techMultipliers(["council_oversight"]).gold).toBeCloseTo(1.08, 5);
  });

  it("ware and trade multipliers stack from 1.0", () => {
    expect(techWareMult([])).toBe(1);
    expect(techWareMult(["bulk_mining"])).toBeCloseTo(1.1, 5);
    expect(techTradeMult([])).toBe(1);
    expect(techTradeMult(["free_trade"])).toBeCloseTo(1.08, 5);
  });

  it("unrest reduction sums (negative nodes raise it)", () => {
    expect(techUnrestReduction([])).toBe(0);
    expect(techUnrestReduction(["council_oversight", "monastic_orders"])).toBe(7); // 3 + 4
    expect(techUnrestReduction(["exclusive_charters"])).toBe(-2); // resentment
  });

  it("ignores unknown ids (an old save from before the overhaul)", () => {
    const stale = ["writing", "agriculture"] as unknown as TechId[];
    expect(techMultipliers(stale)).toEqual({ food: 1, gold: 1, knowledge: 1 });
    expect(techWareMult(stale)).toBe(1);
    expect(techTradeMult(stale)).toBe(1);
    expect(techUnrestReduction(stale)).toBe(0);
  });
});

describe("unlocks", () => {
  it("the militia/infantry/ranged/cavalry core is ungated", () => {
    for (const u of ["militia", "infantry", "ranged", "cavalry"] as const) {
      expect(isUnitUnlockedFor([], u)).toBe(true);
    }
  });

  it("gates the five premium units behind their doctrine node", () => {
    expect(isUnitUnlockedFor([], "knight")).toBe(false);
    expect(isUnitUnlockedFor(["knightly_orders"], "knight")).toBe(true);
    expect(isUnitUnlockedFor([], "pikeman")).toBe(false);
    expect(isUnitUnlockedFor(["town_watch"], "pikeman")).toBe(true);
    expect(isUnitUnlockedFor([], "handgunner")).toBe(false);
    expect(isUnitUnlockedFor(["gunpowder_shot"], "handgunner")).toBe(true);
  });

  it("everyday buildings and resource works are ungated", () => {
    for (const b of ["market", "granary", "barracks", "mine", "bloomery", "stable"] as const) {
      expect(isBuildingUnlockedFor([], b)).toBe(true);
    }
  });

  it("gates advanced buildings behind their doctrine node", () => {
    expect(isBuildingUnlockedFor([], "bank")).toBe(false);
    expect(isBuildingUnlockedFor(["low_tariffs"], "bank")).toBe(true);
    expect(isBuildingUnlockedFor([], "hanse_hall")).toBe(false);
    expect(isBuildingUnlockedFor(["lubeck_law"], "hanse_hall")).toBe(true);
  });
});

describe("doctrine commitment", () => {
  it("no path is committed with an empty done-list", () => {
    expect(committedPath([], "commerce")).toBeNull();
  });

  it("taking any node commits its path and rejects the siblings", () => {
    const done: TechId[] = ["free_trade"];
    expect(committedPath(done, "commerce")).toBe("open_markets");
    expect(isPathRejected(done, "open_markets")).toBe(false);
    expect(isPathRejected(done, "regulated_guilds")).toBe(true);
    expect(isPathRejected(done, "staple_monopoly")).toBe(true);
    // a different category is unaffected
    expect(isPathRejected(done, "merchant_marine")).toBe(false);
  });

  it("nextNodeInPath walks the tiers in order", () => {
    expect(nextNodeInPath([], "open_markets")).toBe("free_trade");
    expect(nextNodeInPath(["free_trade"], "open_markets")).toBe("low_tariffs");
    expect(nextNodeInPath(["free_trade", "low_tariffs"], "open_markets")).toBe("open_prosperity");
    expect(nextNodeInPath(["free_trade", "low_tariffs", "open_prosperity"], "open_markets")).toBeNull();
    expect(pathDoneCount(["free_trade", "low_tariffs"], "open_markets")).toBe(2);
  });
});

describe("researchFrontier", () => {
  it("offers every path's opener while a category is uncommitted", () => {
    const f = researchFrontier([]);
    expect(f).toContain("free_trade");
    expect(f).toContain("council_oversight");
    expect(f).toContain("exclusive_charters");
    expect(f).toContain("monastic_orders");
    expect(f).not.toContain("low_tariffs"); // a tier-1 node
  });

  it("narrows to the committed path's next node and hides siblings", () => {
    const f = researchFrontier(["free_trade"]);
    expect(f).toContain("low_tariffs");
    expect(f).not.toContain("council_oversight"); // sibling now rejected
    expect(f).not.toContain("exclusive_charters");
  });

  it("respects the age gate on deeper tiers", () => {
    // Every opener is Age-of-Founding (era 0); low_tariffs (tier 1) is era 2.
    expect(researchFrontier([], 0)).toContain("free_trade");
    expect(researchFrontier(["free_trade"], 0)).not.toContain("low_tariffs");
    expect(researchFrontier(["free_trade"], 2)).toContain("low_tariffs");
  });

  it("eraLockedTechs lists the committed next node when its age hasn't dawned", () => {
    // free_trade done → next is low_tariffs (era 2), age-locked at era 0/1.
    expect(eraLockedTechs(["free_trade"], 0)).toContain("low_tariffs");
    expect(researchFrontier(["free_trade"], 0)).not.toContain("low_tariffs");
  });
});

describe("canResearch / selectTech", () => {
  it("blocks a node whose predecessor is unfinished", () => {
    expect(canResearch([], "low_tariffs")).toBe(false);
    expect(canResearch(["free_trade"], "low_tariffs", 2)).toBe(true);
  });

  it("blocks a rejected sibling and honours the age gate", () => {
    expect(canResearch(["free_trade"], "council_oversight")).toBe(false); // sibling rejected
    expect(canResearch(["free_trade"], "low_tariffs", 1)).toBe(false); // era 1 < needed era 2
  });

  it("selectTech only sets a researchable node", () => {
    expect(selectTech({ current: null, progress: 0, done: [] }, "low_tariffs").current).toBeNull();
    expect(selectTech({ current: null, progress: 0, done: [] }, "free_trade").current).toBe("free_trade");
    // committing to open_markets, a sibling opener cannot then be selected
    expect(selectTech({ current: null, progress: 0, done: ["free_trade"] }, "council_oversight").current).toBeNull();
  });
});

describe("advanceResearch", () => {
  it("banks knowledge when nothing is selected", () => {
    const step = advanceResearch({ current: null, progress: 0, done: [] }, 5);
    expect(step.completed).toBeNull();
    expect(step.research.progress).toBe(5);
  });

  it("completes a node when the cost is met and adds it to done", () => {
    const cost = TECHS.free_trade.cost;
    const step = advanceResearch({ current: "free_trade", progress: cost - 1, done: [] }, 5);
    expect(step.completed).toBe("free_trade");
    expect(step.research.done).toContain("free_trade");
    expect(step.research.current).toBeNull();
  });

  it("rolls surplus knowledge over as banked progress on completion", () => {
    const cost = TECHS.free_trade.cost;
    const step = advanceResearch({ current: "free_trade", progress: cost, done: [] }, 30);
    expect(step.completed).toBe("free_trade");
    expect(step.research.progress).toBe(30); // the 30 past cost is kept, not discarded
  });
});

describe("queue + recommendation", () => {
  it("queues nodes (dedup; skips done/current)", () => {
    let r = queueResearch({ current: null, progress: 0, done: [], queue: [] }, "free_trade");
    r = queueResearch(r, "free_trade"); // dedup
    r = queueResearch(r, "cog_fleets");
    expect(r.queue).toEqual(["free_trade", "cog_fleets"]);
    expect(clearQueue(r).queue).toEqual([]);
  });

  it("dequeues the next valid node, skipping age-locked ones", () => {
    // low_tariffs (era 2) is age-locked at era 1; free_trade (era 0) is valid.
    const r = { current: null, progress: 0, done: [] as TechId[], queue: ["low_tariffs", "free_trade"] as TechId[] };
    expect(dequeueResearch(r, 1).current).toBe("free_trade");
  });

  it("recommends the cheapest available node in the realm's category", () => {
    // At era 0 the cheapest commerce opener is free_trade (28).
    expect(recommendedTech([], 0, "commerce")).toBe("free_trade");
    // The cheapest scholarship opener is monastic_orders (26) over town_schools (28).
    expect(recommendedTech([], 0, "scholarship")).toBe("monastic_orders");
  });
});

// --- Data integrity: the catalog and the building/unit gates must agree -------
describe("catalog integrity", () => {
  it("every node's path/tier/category is internally consistent", () => {
    for (const id of TECH_IDS) {
      const d = TECHS[id];
      const path = PATHS[d.path];
      expect(path, `path ${d.path} for node ${id}`).toBeDefined();
      expect(path.category).toBe(d.category);
      expect(path.nodes[d.tier]).toBe(id); // tier === index in the path
      expect(CATEGORIES[d.category].paths).toContain(d.path);
    }
  });

  it("each path's tiers are non-decreasing in era", () => {
    for (const pid of PATH_IDS) {
      const nodes = PATHS[pid].nodes;
      for (let i = 1; i < nodes.length; i++) {
        expect(TECHS[nodes[i]!].era).toBeGreaterThanOrEqual(TECHS[nodes[i - 1]!].era);
      }
    }
  });

  it("every category lists real paths and every path a real category", () => {
    for (const cid of CATEGORY_IDS) {
      for (const pid of CATEGORIES[cid].paths) {
        expect(PATHS[pid]).toBeDefined();
        expect(PATHS[pid].category).toBe(cid);
      }
    }
  });

  it("building tech-gates and node unlockBuilding agree both ways", () => {
    for (const b of BUILDING_IDS) {
      const req = BUILDINGS[b].requiresTech;
      if (req) {
        expect(TECHS[req], `building ${b} requiresTech ${req}`).toBeDefined();
        expect(TECHS[req].unlockBuilding).toBe(b);
      }
    }
    for (const id of TECH_IDS) {
      const ub = TECHS[id].unlockBuilding;
      if (ub) expect(BUILDINGS[ub].requiresTech).toBe(id);
    }
  });

  it("unit tech-gates and node unlockUnit agree both ways", () => {
    for (const u of UNIT_TYPES) {
      const req = UNITS[u].requiresTech;
      if (req) {
        expect(TECHS[req], `unit ${u} requiresTech ${req}`).toBeDefined();
        expect(TECHS[req].unlockUnit).toBe(u);
      }
    }
    for (const id of TECH_IDS) {
      const uu = TECHS[id].unlockUnit;
      if (uu) expect(UNITS[uu].requiresTech).toBe(id);
    }
  });
});
