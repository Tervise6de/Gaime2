import { describe, expect, it } from "vitest";
import { buildOptions, deriveAdvice, regionCanStartBuild } from "@/ui/advisor";
import { createGame, queueBuilding, chooseResearch } from "@/systems/turn";
import { researchFrontier } from "@/systems/tech";
import { PLAYER_ID } from "@/systems/state";
import { createRoute, routeOptions } from "@/systems/trade";

describe("end-turn advisor", () => {
  it("flags unchosen research, idle regions and restless armies on turn 1", () => {
    const g = createGame({ seed: 12345 });
    const advice = deriveAdvice(g);
    const kinds = advice.map((a) => a.kind);
    expect(kinds).toContain("research"); // nothing picked yet
    expect(kinds).toContain("build"); // fresh regions build nothing
    expect(kinds).toContain("army"); // the starting army has moves
  });

  it("clears the research flag once a tech is chosen", () => {
    let g = createGame({ seed: 12345 });
    g = chooseResearch(g, researchFrontier([])[0]!);
    expect(deriveAdvice(g).some((a) => a.kind === "research")).toBe(false);
  });

  it("drops a region from the build list once it starts a project", () => {
    let g = createGame({ seed: 12345 });
    const idleBefore = deriveAdvice(g).find((a) => a.kind === "build")!.regionIds;
    const target = idleBefore[0]!;
    const option = buildOptions(g, target)[0]!;
    g = queueBuilding(g, target, option);
    expect(regionCanStartBuild(g, target)).toBe(false);
    const after = deriveAdvice(g).find((a) => a.kind === "build");
    expect(after?.regionIds ?? []).not.toContain(target);
  });

  it("only counts the player's own regions and armies", () => {
    const g = createGame({ seed: 12345 });
    const advice = deriveAdvice(g);
    const buildIds = advice.find((a) => a.kind === "build")?.regionIds ?? [];
    for (const id of buildIds) expect(g.regions[id]!.ownerId).toBe(PLAYER_ID);
    const armyIds = advice.find((a) => a.kind === "army")?.regionIds ?? [];
    for (const rid of armyIds) {
      expect(g.armies.some((a) => a.ownerId === PLAYER_ID && a.regionId === rid)).toBe(true);
    }
  });
});

describe("the opening objective", () => {
  it("stands until the realm carries something to a Kontor", () => {
    const g = createGame({ seed: 9 });
    const chip = deriveAdvice(g).find((a) => a.kind === "trade");
    expect(chip).toBeDefined();
    expect(chip!.label).toMatch(/trade route/i);
    // It points at provinces that could open one this turn.
    expect(chip!.regionIds.length).toBeGreaterThan(0);
    for (const id of chip!.regionIds) {
      expect(routeOptions(g, id, PLAYER_ID).length).toBeGreaterThan(0);
    }
    // Once a route is running, the objective is met and the chip is gone.
    const first = chip!.regionIds[0]!;
    const opt = routeOptions(g, first, PLAYER_ID)[0]!;
    const trading = createRoute(g, PLAYER_ID, first, opt.good, opt.toKontorId);
    expect(deriveAdvice(trading).some((a) => a.kind === "trade")).toBe(false);
  });
});
