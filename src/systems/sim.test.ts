import { describe, it, expect } from "vitest";
import { createRng } from "@/systems/rng";
import { generateMap, placeNations } from "@/systems/mapgen";
import { createInitialState } from "@/systems/state";
import { endTurn } from "@/systems/turn";
import { defenseStrength, effectiveAttack, resolveAttack } from "@/systems/combat";
import { runNationAi } from "@/systems/ai";
import { emptyUnits } from "@/systems/data";
import type { Army, GameState, Nation, Region } from "@/systems/types";

describe("seeded RNG", () => {
  it("is deterministic for a given seed and cursor", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("can resume from a persisted cursor", () => {
    const a = createRng(7);
    a.next();
    a.next();
    const cursor = a.state();
    const resumed = createRng(7, cursor);
    expect(resumed.next()).toEqual(createRng(7, cursor).next());
  });
});

describe("map generation", () => {
  it("produces the requested region count and a connected graph", () => {
    const rng = createRng(123);
    const regions = generateMap(rng, { regionCount: 22 });
    expect(regions).toHaveLength(22);
    // Every region has at least one neighbour and the graph is one component.
    expect(regions.every((r) => r.adj.length > 0)).toBe(true);
    const seen = new Set<number>([0]);
    const stack = [0];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const n of regions[cur].adj) if (!seen.has(n)) { seen.add(n); stack.push(n); }
    }
    expect(seen.size).toBe(22);
  });

  it("is reproducible from the same seed", () => {
    const one = generateMap(createRng(999), { regionCount: 18 });
    const two = generateMap(createRng(999), { regionCount: 18 });
    expect(JSON.stringify(one)).toEqual(JSON.stringify(two));
  });

  it("places nations on distinct regions", () => {
    const rng = createRng(5);
    const regions = generateMap(rng, { regionCount: 20 });
    placeNations(rng, regions, [0, 1, 2]);
    const homes = regions.filter((r) => r.owner >= 0).map((r) => r.owner).sort();
    expect(homes).toEqual([0, 1, 2]);
  });
});

describe("full-game determinism", () => {
  it("same seed + same (no) player orders → identical game", () => {
    const run = (): string => {
      let s = createInitialState({ seed: 2024, regionCount: 18, aiCount: 3, maxTurns: 40 });
      for (let i = 0; i < 40 && s.phase === "playing"; i++) s = endTurn(s);
      return JSON.stringify(s);
    };
    expect(run()).toEqual(run());
  });

  it("records a prestige snapshot every turn", () => {
    let s = createInitialState({ seed: 3, maxTurns: 30 });
    const startLen = s.scoreHistory.length;
    for (let i = 0; i < 10; i++) s = endTurn(s);
    expect(s.scoreHistory.length).toBe(startLen + 10);
    expect(s.scoreHistory.every((snap) => snap.scores.length === s.nations.length)).toBe(true);
  });

  it("reaches an end state within the turn limit", () => {
    let s = createInitialState({ seed: 11, maxTurns: 50 });
    for (let i = 0; i < 60 && s.phase === "playing"; i++) s = endTurn(s);
    expect(s.phase).toBe("ended");
    expect(s.winner).not.toBeNull();
    expect(["domination", "elimination", "prestige"]).toContain(s.victoryType);
  });
});

// --- Crafted scenario helpers for the concentration-of-force property --------

function region(id: number, owner: number, adj: number[], over: Partial<Region> = {}): Region {
  return { id, name: `R${id}`, x: 0.1 * id, y: 0.5, terrain: "plains", owner, population: 6, fort: 0, adj, ...over };
}

function nation(id: number, isPlayer: boolean): Nation {
  return {
    id,
    name: `N${id}`,
    color: "#888",
    isPlayer,
    personality: { archetype: "opportunist", aggression: 0.6, expansion: 0.7, economy: 0.5 },
    treasury: 0,
    taxRate: 0.2,
    alive: true,
  };
}

function army(id: number, owner: number, location: number, infantry: number): Army {
  return { id, owner, location, units: { ...emptyUnits(), infantry }, moved: false };
}

/**
 * A → B ← D layout with a fortified enemy C beside the staging region B.
 * Neither AI army (at A and D) can crack C alone; both together at B can.
 */
function concentrationScenario(): GameState {
  const regions: Region[] = [
    region(0, 1, [1]), // A: AI home
    region(1, 1, [0, 2, 3]), // B: AI staging, borders C
    region(2, 0, [1], { fort: 2, population: 6 }), // C: fortified enemy target
    region(3, 1, [1]), // D: AI region with second army
  ];
  return {
    seed: 1,
    rngState: 1,
    turn: 1,
    maxTurns: 60,
    regions,
    nations: [nation(0, true), nation(1, false)],
    armies: [army(10, 1, 0, 5), army(11, 1, 3, 5)],
    nextArmyId: 20,
    scoreHistory: [],
    log: [],
    phase: "playing",
    winner: null,
    victoryType: null,
  };
}

describe("concentration of force", () => {
  it("a fortified defender beats a single stack but not the merged stack", () => {
    const s = concentrationScenario();
    const single = s.armies[0].units;
    const merged = { ...emptyUnits(), infantry: 10 };
    const def = defenseStrength(s, 2);
    expect(effectiveAttack(s, single, 2)).toBeLessThan(def);
    expect(effectiveAttack(s, merged, 2)).toBeGreaterThan(def);
  });

  it("the AI masses both armies onto the staging region instead of attacking alone", () => {
    const s = concentrationScenario();
    const rng = createRng(1);
    runNationAi(s, rng, 1);
    const atStaging = s.armies.filter((a) => a.owner === 1 && a.location === 1);
    // Both armies concentrated into a single merged stack on B (region 1).
    expect(atStaging).toHaveLength(1);
    expect(atStaging[0].units.infantry).toBe(10);
    expect(s.armies.filter((a) => a.owner === 1 && a.location === 0)).toHaveLength(0);
    expect(s.armies.filter((a) => a.owner === 1 && a.location === 3)).toHaveLength(0);
    // The enemy fort was NOT taken this turn (concentration happens first).
    expect(s.regions[2].owner).toBe(0);
  });

  it("the merged stack captures the fort it could not take alone (next turn)", () => {
    const s = concentrationScenario();
    // Turn 1: mass on B.
    runNationAi(s, createRng(1), 1);
    // Turn 2: the merged stack strikes.
    runNationAi(s, createRng(2), 1);
    expect(s.regions[2].owner).toBe(1);
  });
});

describe("combat resolution", () => {
  it("merged force wins deterministically when it dominates the defence", () => {
    for (let seed = 0; seed < 12; seed++) {
      const s = concentrationScenario();
      const attacker = army(99, 1, 1, 14); // overwhelming stack on staging
      s.armies.push(attacker);
      const outcome = resolveAttack(s, createRng(seed), attacker, 2);
      expect(outcome.attackerWins).toBe(true);
      expect(s.regions[2].owner).toBe(1);
    }
  });
});
