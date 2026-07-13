import { describe, it, expect } from "vitest";
import { runNationTurn, planRecruitment } from "@/systems/ai";
import { createGame, resolveTurn } from "@/systems/turn";
import { createRng } from "@/systems/rng";
import {
  PLAYER_ID,
  BARBARIAN_ID,
  armySize,
  emptyUnits,
  type Army,
  type GameState,
  type Region,
} from "@/systems/state";
import type { UnitType } from "@/data/units";

const RIVAL = 2;

// --- planRecruitment fixtures ------------------------------------------------

function region(over: Partial<Region> = {}): Region {
  return {
    id: 0,
    name: "R",
    terrain: "plains",
    ownerId: RIVAL,
    population: 4,
    unrest: 0,
    fortification: 0,
    resource: null,
    buildings: [],
    construction: null,
    adjacency: [],
    x: 0.5,
    y: 0.5,
    ...over,
  };
}

function units(over: Partial<Record<UnitType, number>>): Record<UnitType, number> {
  return { ...emptyUnits(), ...over };
}

function army(over: Partial<Army> = {}): Army {
  return { id: 1, ownerId: BARBARIAN_ID, regionId: 1, units: emptyUnits(), movesLeft: 1, ...over };
}

/** A rival (region 0) bordering one barbarian target (region 1). */
function scenario(target: Partial<Region>, enemyArmy?: Partial<Army>, myResource?: "horses" | "iron"): GameState {
  return {
    turn: 50,
    difficulty: "normal",
    treaties: {},
    armies: enemyArmy ? [army(enemyArmy)] : [],
    nations: [],
    regions: [
      region({ id: 0, ownerId: RIVAL, adjacency: [1], resource: myResource ?? null }),
      region({ id: 1, ownerId: BARBARIAN_ID, adjacency: [0], ...target }),
    ],
  } as unknown as GameState;
}

describe("runNationTurn", () => {
  it("is deterministic for the same state and rng seed", () => {
    const g = createGame({ seed: 12345, rivals: 2 });
    const a = runNationTurn(g, RIVAL, createRng(999));
    const b = runNationTurn(g, RIVAL, createRng(999));
    expect(a).toEqual(b);
  });

  it("does not mutate the input state", () => {
    const g = createGame({ seed: 7, rivals: 2 });
    const snapshot = JSON.stringify(g);
    runNationTurn(g, RIVAL, createRng(1));
    expect(JSON.stringify(g)).toBe(snapshot);
  });

  it("queues construction in the rival's own regions only", () => {
    const g = createGame({ seed: 7, rivals: 2 });
    const next = runNationTurn(g, RIVAL, createRng(1));
    const builtElsewhere = next.regions.some(
      (r, i) => r.ownerId !== RIVAL && r.construction !== null && g.regions[i]!.construction === null,
    );
    expect(builtElsewhere).toBe(false);
  });
});

describe("planRecruitment (composition-aware)", () => {
  it("leads with siege against a fortified target", () => {
    const plan = planRecruitment(scenario({ fortification: 4 }), RIVAL);
    expect(plan[0]).toBe("siege");
  });

  it("stops wanting siege once it already has enough for the target fort", () => {
    const s = scenario({ fortification: 2 }, undefined);
    // Give the rival two siege units (ceil(2/2) = 1 needed, so 2 is plenty).
    (s.armies as Army[]).push(
      army({ id: 9, ownerId: RIVAL, regionId: 0, units: units({ siege: 2 }) }),
    );
    expect(planRecruitment(s, RIVAL)).not.toContain("siege");
  });

  it("counters an enemy stack of cavalry with militia", () => {
    const plan = planRecruitment(
      scenario({ fortification: 0 }, { units: units({ cavalry: 4 }) }),
      RIVAL,
    );
    expect(plan[0]).toBe("militia");
  });

  it("counters an enemy stack of ranged with cavalry", () => {
    const plan = planRecruitment(
      scenario({ fortification: 0 }, { units: units({ ranged: 5 }) }),
      RIVAL,
    );
    expect(plan[0]).toBe("cavalry");
  });

  it("counters an enemy stack of infantry with ranged", () => {
    const plan = planRecruitment(
      scenario({ fortification: 0 }, { units: units({ infantry: 5 }) }),
      RIVAL,
    );
    expect(plan[0]).toBe("ranged");
  });

  it("puts siege first and the counter unit second against a fortified, defended target", () => {
    const plan = planRecruitment(
      scenario({ fortification: 3 }, { units: units({ ranged: 4 }) }),
      RIVAL,
    );
    expect(plan[0]).toBe("siege");
    expect(plan[1]).toBe("cavalry");
  });

  it("falls back to a generalist plan with no enemy intel, favouring cavalry when horses are available", () => {
    const withHorses = planRecruitment(scenario({ fortification: 0 }, undefined, "horses"), RIVAL);
    expect(withHorses[0]).toBe("cavalry");
    const without = planRecruitment(scenario({ fortification: 0 }, undefined), RIVAL);
    expect(without[0]).toBe("infantry");
  });

  it("returns a de-duplicated preference covering the buildable units", () => {
    const plan = planRecruitment(
      scenario({ fortification: 2 }, { units: units({ cavalry: 3 }) }),
      RIVAL,
    );
    expect(new Set(plan).size).toBe(plan.length);
  });
});

describe("rival behaviour over a game", () => {
  it("rivals expand into barbarian land", () => {
    let s = createGame({ seed: 12345, rivals: 2 });
    const rivalRegions = (g: typeof s) =>
      g.regions.filter((r) => r.ownerId === RIVAL).length;
    const start = rivalRegions(s);
    for (let i = 0; i < 30; i++) s = resolveTurn(s);
    expect(rivalRegions(s)).toBeGreaterThan(start);
  });

  it("wars break out among nations over time", () => {
    // Across several seeds (personalities are drawn per seed), war should erupt
    // in at least one game — not every draw is a pair of pacifists.
    let anyWar = false;
    for (const seed of [2024, 7, 42, 100, 555]) {
      let s = createGame({ seed, rivals: 2 });
      for (let i = 0; i < 60 && !anyWar; i++) {
        s = resolveTurn(s);
        if (Object.values(s.treaties).includes("war")) anyWar = true;
      }
      if (anyWar) break;
    }
    expect(anyWar).toBe(true);
  });

  it("respects the player's early-game grace period", () => {
    let s = createGame({ seed: 2024, rivals: 2 });
    for (let i = 0; i < 8; i++) s = resolveTurn(s);
    // No rival should have taken a player region this early.
    const playerRegions = s.regions.filter((r) => r.ownerId === PLAYER_ID).length;
    expect(playerRegions).toBeGreaterThan(0);
  });

  it("keeps the whole game deterministic with AI in the loop", () => {
    const run = () => {
      let s = createGame({ seed: 555, rivals: 2 });
      for (let i = 0; i < 25; i++) s = resolveTurn(s);
      return s.regions.map((r) => r.ownerId).join(",");
    };
    expect(run()).toBe(run());
  });

  it("a rival can field an army", () => {
    let s = createGame({ seed: 12345, rivals: 2 });
    for (let i = 0; i < 10; i++) s = resolveTurn(s);
    const rivalArmy = s.armies
      .filter((a) => a.ownerId === RIVAL)
      .reduce((sum, a) => sum + armySize(a.units), 0);
    expect(rivalArmy).toBeGreaterThan(0);
  });

  it("barbarians never take economic or AI turns", () => {
    let s = createGame({ seed: 1, rivals: 2 });
    const barbGold0 = s.nations[BARBARIAN_ID]!.stocks.gold;
    for (let i = 0; i < 5; i++) s = resolveTurn(s);
    expect(s.nations[BARBARIAN_ID]!.stocks.gold).toBe(barbGold0);
  });
});
