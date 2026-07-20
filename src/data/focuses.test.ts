import { describe, it, expect } from "vitest";
import {
  FOCUSES,
  FOCUS_IDS,
  focusYieldMult,
  focusWareMult,
  focusPopCapacity,
  focusCalm,
  focusUnitCostMult,
} from "@/data/focuses";
import { BUILDINGS, buildingFocusOk, focusCapstone } from "@/data/buildings";
import { regionProduction, nationYieldMult } from "@/systems/economy";
import { regionCapacity } from "@/systems/population";
import { unrestTarget } from "@/systems/stability";
import { unitCost } from "@/systems/military";
import { isBuildingUnlockedFor } from "@/systems/tech";
import { createGame, setRegionFocus, canQueueBuilding } from "@/systems/turn";
import { PLAYER_ID, emptyResearch, emptyWares, type Nation, type Region } from "@/systems/state";
import type { FocusId } from "@/data/focuses";

function nation(over: Partial<Nation> = {}): Nation {
  return {
    id: 0, name: "N", color: "#fff", isPlayer: true, isBarbarian: false, alive: true,
    stocks: { gold: 100, food: 0, knowledge: 0 }, wares: emptyWares(), taxRate: 0,
    research: emptyResearch(), famine: false, bankrupt: false, ...over,
  };
}

function plains(focus?: FocusId): Region {
  return {
    id: 0, name: "R", terrain: "plains", ownerId: 0, population: 6, unrest: 0,
    fortification: 0, resource: null, buildings: [], focus, construction: null,
    adjacency: [], x: 0.5, y: 0.5,
  };
}

describe("focus roster", () => {
  it("offers balanced plus one lean per resource and a garrison", () => {
    expect(FOCUS_IDS).toEqual(["balanced", "farmland", "market", "workshop", "academy", "garrison"]);
    for (const id of FOCUS_IDS) {
      expect(FOCUSES[id].label.length).toBeGreaterThan(0);
      expect(FOCUSES[id].blurb.length).toBeGreaterThan(0);
    }
  });

  it("balanced has no effect; helpers return neutral for it and undefined", () => {
    for (const f of [undefined, "balanced"] as (FocusId | undefined)[]) {
      expect(focusYieldMult(f)).toEqual({ food: 1, gold: 1, knowledge: 1 });
      expect(focusWareMult(f)).toBe(1);
      expect(focusPopCapacity(f)).toBe(0);
      expect(focusCalm(f)).toBe(0);
      expect(focusUnitCostMult(f)).toBe(1);
    }
  });
});

describe("focus production effects", () => {
  const mult = nationYieldMult(nation());
  it("Farmland lifts food and raises the population cap", () => {
    expect(regionProduction(plains("farmland"), 0, mult).food).toBeGreaterThan(regionProduction(plains(), 0, mult).food);
    expect(regionCapacity(plains("farmland"))).toBeGreaterThan(regionCapacity(plains()));
  });
  it("Market lifts gold; Workshops lift ware output; Academy lifts knowledge", () => {
    expect(regionProduction(plains("market"), 0, mult).gold).toBeGreaterThan(regionProduction(plains(), 0, mult).gold);
    expect(focusWareMult("workshop")).toBeGreaterThan(focusWareMult("balanced"));
    // Plains produce no base knowledge, so verify the Academy multiplier itself.
    expect(focusYieldMult("academy").knowledge).toBeCloseTo(1.4, 5);
    expect(focusYieldMult("balanced").knowledge).toBe(1);
  });
  it("Garrison calms the province and discounts local musters", () => {
    expect(unrestTarget(plains("garrison"), 0.5, 3)).toBeLessThan(unrestTarget(plains(), 0.5, 3));
    const plain = unitCost(nation(), "infantry");
    const mustered = unitCost(nation(), "infantry", "garrison");
    expect(mustered.gold).toBeLessThan(plain.gold);
  });
});

describe("setRegionFocus", () => {
  it("assigns a focus to an owned region and clears with balanced", () => {
    const g = createGame({ seed: 4 });
    const cap = g.nations[PLAYER_ID]!.capitalRegionId!;
    const g2 = setRegionFocus(g, cap, "market");
    expect(g2.regions[cap]!.focus).toBe("market");
    const g3 = setRegionFocus(g2, cap, "balanced");
    expect(g3.regions[cap]!.focus).toBeUndefined();
  });

  it("refuses to focus a region you do not own", () => {
    const g = createGame({ seed: 4 });
    const enemy = g.regions.find((r) => r.ownerId !== PLAYER_ID && r.ownerId !== null);
    if (enemy) {
      const before = enemy.focus;
      const g2 = setRegionFocus(g, enemy.id, "market");
      expect(g2.regions[enemy.id]!.focus).toBe(before);
    }
  });

  it("persists deterministically (focus is durable game state)", () => {
    const g = setRegionFocus(createGame({ seed: 9 }), createGame({ seed: 9 }).nations[PLAYER_ID]!.capitalRegionId!, "academy");
    expect(g.regions.find((r) => r.focus === "academy")).toBeDefined();
  });
});

describe("focus-capstone buildings", () => {
  it("buildingFocusOk: unrestricted buildings build anywhere; capstones only on their focus", () => {
    expect(buildingFocusOk(undefined, "farm")).toBe(true); // no focus requirement
    expect(buildingFocusOk("garrison", "farm")).toBe(true);
    expect(buildingFocusOk("farmland", "manor")).toBe(true); // matching focus
    expect(buildingFocusOk("market", "manor")).toBe(false); // wrong focus
    expect(buildingFocusOk(undefined, "manor")).toBe(false); // unspecialised
  });

  it("focusCapstone maps each specialisation to its signature building (balanced has none)", () => {
    expect(focusCapstone("farmland")).toBe("manor");
    expect(focusCapstone("market")).toBe("charter_fair");
    expect(focusCapstone("workshop")).toBe("foundry");
    expect(focusCapstone("academy")).toBe("athenaeum");
    expect(focusCapstone("garrison")).toBe("citadel");
    expect(focusCapstone("balanced")).toBeUndefined();
  });

  it("every specialised focus has a capstone gated by that focus and a tech", () => {
    for (const f of FOCUS_IDS) {
      const cap = focusCapstone(f);
      if (f === "balanced") {
        expect(cap).toBeUndefined();
        continue;
      }
      expect(cap).toBeTruthy();
      expect(BUILDINGS[cap!].requiresFocus).toBe(f);
      expect(BUILDINGS[cap!].requiresTech).toBeTruthy();
    }
  });

  it("isBuildingUnlockedFor honours a capstone's own requiresTech", () => {
    expect(isBuildingUnlockedFor([], "manor")).toBe(false);
    expect(isBuildingUnlockedFor(["feudalism"], "manor")).toBe(true);
  });

  it("canQueueBuilding gates a capstone on BOTH the focus and the tech", () => {
    // Right focus + tech → allowed.
    expect(canQueueBuilding(plains("farmland"), "manor", ["feudalism"])).toBe(true);
    // Wrong focus, even with the tech → refused.
    expect(canQueueBuilding(plains("market"), "manor", ["feudalism"])).toBe(false);
    // Right focus, missing tech → refused.
    expect(canQueueBuilding(plains("farmland"), "manor", [])).toBe(false);
    // An ordinary building ignores focus entirely.
    expect(canQueueBuilding(plains("garrison"), "farm", [])).toBe(true);
  });
});
