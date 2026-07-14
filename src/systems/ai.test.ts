import { describe, it, expect } from "vitest";
import {
  runNationTurn,
  planRecruitment,
  regionIsThreatened,
  isBadlyOutmatched,
  retreatStep,
  defendStep,
  focusTarget,
  musterRegion,
  chooseBuilding,
  runawayLeader,
  coalitionPowerAgainst,
  preferredTechBranch,
  bestTarget,
} from "@/systems/ai";
import type { TraitId } from "@/data/traits";
import type { Personality } from "@/systems/state";
import type { BuildingId } from "@/data/buildings";
import { atWar } from "@/systems/diplomacy";
import { emptyResearch } from "@/systems/state";
import { createGame, resolveTurn } from "@/systems/turn";
import { createRng } from "@/systems/rng";
import {
  PLAYER_ID,
  BARBARIAN_ID,
  armySize,
  emptyUnits,
  pairKey,
  type Army,
  type GameState,
  type Nation,
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

describe("trait-aware AI openings", () => {
  const empty = (buildings: BuildingId[] = [], terrain: Region["terrain"] = "plains") =>
    ({ unrest: 0, buildings, terrain });

  it("opens on the trait's synergy building (unlocked from start)", () => {
    expect(chooseBuilding(empty(), [], 0, false, "fertile")).toBe("farm");
    expect(chooseBuilding(empty(), [], 0, false, "industrious")).toBe("workshop");
    expect(chooseBuilding(empty(), [], 0, false, "mercantile")).toBe("market");
    expect(chooseBuilding(empty(), [], 0, false, "scholarly")).toBe("library");
  });

  it("a Martial realm rushes a fortress once it is unlocked", () => {
    expect(chooseBuilding(empty(), ["engineering"], 0, false, "martial")).toBe("fortress");
    // Locked fortress → falls back to its next preference (workshop).
    expect(chooseBuilding(empty(), [], 0, false, "martial")).toBe("workshop");
  });

  it("falls back to the generalist order with no trait", () => {
    expect(chooseBuilding(empty(), [], 0, false)).toBe("market");
  });

  it("still prioritises a temple when unrest is high, whatever the trait", () => {
    expect(chooseBuilding({ unrest: 40, buildings: [], terrain: "plains" }, [], 0, false, "scholarly")).toBe("temple");
  });

  it("skips a building it already has and moves to the next preference", () => {
    expect(chooseBuilding(empty(["farm"]), [], 0, false, "fertile")).not.toBe("farm");
  });

  it("builds the Guildhall only once Economics is researched", () => {
    // With market+bank built but no Economics, the Guildhall (next in order) is
    // still LOCKED — the AI skips it to Workshop. With the tech it's chosen.
    expect(chooseBuilding(empty(["market", "bank"]), [], 0, false)).toBe("workshop");
    expect(chooseBuilding(empty(["market", "bank"]), ["economics"], 0, false)).toBe("guildhall");
  });

  it("builds the Forum only once Philosophy is researched", () => {
    // Market+workshop built; bank/guildhall/university locked. Without
    // Philosophy the Forum (next in order) is skipped to Farm; with it, chosen.
    expect(chooseBuilding(empty(["market", "workshop"]), [], 0, false)).toBe("farm");
    expect(chooseBuilding(empty(["market", "workshop"]), ["philosophy"], 0, false)).toBe("forum");
  });

  it("a Scholarly realm reaches for the Forum after its knowledge buildings", () => {
    expect(
      chooseBuilding(empty(["library", "university"]), ["mathematics", "philosophy"], 0, false, "scholarly"),
    ).toBe("forum");
  });

  it("builds the Mine only on mountains AND with Masonry (gates compose)", () => {
    const built: BuildingId[] = ["market", "workshop"];
    // Mountains + Masonry → Mine (next in order after workshop).
    expect(chooseBuilding(empty(built, "mountains"), ["masonry"], 0, false)).toBe("mine");
    // Mountains without the tech → skipped (locked).
    expect(chooseBuilding(empty(built, "mountains"), [], 0, false)).not.toBe("mine");
    // The tech without the terrain → skipped (doesn't fit).
    expect(chooseBuilding(empty(built, "plains"), ["masonry"], 0, false)).not.toBe("mine");
  });

  it("builds the Harbor on coast regions only", () => {
    // Coast, market built → Harbor is next in the generalist order.
    expect(chooseBuilding(empty(["market"], "coast"), [], 0, false)).toBe("harbor");
    // Same position on plains → the Harbor never fits; skips to Workshop
    // (bank/guildhall still locked).
    expect(chooseBuilding(empty(["market"]), [], 0, false)).toBe("workshop");
  });
});

describe("trait-aware tech selection", () => {
  const MERCHANT: Personality = {
    archetype: "merchant",
    aggression: 0.2,
    expansion: 0.5,
    economy: 0.9,
    trustworthiness: 0.85,
  };
  const WARLORD: Personality = {
    archetype: "warlord",
    aggression: 0.9,
    expansion: 0.8,
    economy: 0.3,
    trustworthiness: 0.2,
  };

  function techNation(over: Partial<Nation> = {}): Nation {
    return {
      id: RIVAL,
      name: "N",
      color: "#fff",
      isPlayer: false,
      isBarbarian: false,
      alive: true,
      stocks: { gold: 0, food: 0, materials: 0, knowledge: 0 },
      taxRate: 0.15,
      research: emptyResearch(),
      wonders: 0,
      famine: false,
      bankrupt: false,
      ...over,
    };
  }

  /** A single rival owning one region, so runNationTurn will pick a tech. */
  function techState(nation: Nation): GameState {
    return {
      turn: 50,
      difficulty: "normal",
      treaties: {},
      offers: [],
      armies: [],
      nations: [nation],
      regions: [region({ id: 0, ownerId: RIVAL, adjacency: [] })],
    } as unknown as GameState;
  }

  /** The tech a nation begins researching on its next turn (from an empty tree). */
  const chosenTech = (nation: Nation) =>
    runNationTurn(techState(nation), RIVAL, createRng(1)).nations.find((n) => n.id === RIVAL)!
      .research.current;

  it("a Scholarly nation rushes a civics tech over an economy one (trait beats personality)", () => {
    // Merchant personality alone would take an economy tech; the trait flips it.
    const tech = chosenTech(techNation({ trait: "scholarly", personality: MERCHANT }));
    expect(tech).toBe("writing"); // cheapest civics frontier tech
  });

  it("a Martial nation rushes a military tech even with an economic personality", () => {
    const tech = chosenTech(techNation({ trait: "martial", personality: MERCHANT }));
    expect(tech).toBe("bronze_working"); // cheapest military frontier tech
  });

  it("falls back to the personality branch when the nation has no trait", () => {
    const warlordTech = chosenTech(techNation({ personality: WARLORD }));
    expect(warlordTech).toBe("bronze_working"); // aggression>0.6 → military
    const merchantTech = chosenTech(techNation({ personality: MERCHANT }));
    expect(merchantTech).toBe("agriculture"); // economy>0.6 → cheapest economy tech
  });

  it("is deterministic — same nation yields the same pick", () => {
    const nation = techNation({ trait: "scholarly", personality: MERCHANT });
    expect(chosenTech(nation)).toBe(chosenTech(nation));
  });

  describe("preferredTechBranch", () => {
    const withTrait = (trait: TraitId) =>
      preferredTechBranch(techNation({ trait, personality: MERCHANT }));

    it("maps each trait to its branch", () => {
      expect(withTrait("scholarly")).toBe("civics");
      expect(withTrait("martial")).toBe("military");
      expect(withTrait("mercantile")).toBe("economy");
      expect(withTrait("industrious")).toBe("economy");
      expect(withTrait("fertile")).toBe("economy");
    });

    it("falls back to the personality branch when trait is undefined", () => {
      expect(preferredTechBranch(techNation({ personality: WARLORD }))).toBe("military");
      expect(preferredTechBranch(techNation({ personality: MERCHANT }))).toBe("economy");
      // No aggression/economy edge → civics.
      expect(
        preferredTechBranch(
          techNation({
            personality: {
              archetype: "builder",
              aggression: 0.2,
              expansion: 0.3,
              economy: 0.5,
              trustworthiness: 0.6,
            },
          }),
        ),
      ).toBe("civics");
    });

    it("falls back to civics when there is no trait and no personality", () => {
      expect(preferredTechBranch(techNation())).toBe("civics");
    });
  });
});

describe("home defence (retreat / garrison)", () => {
  const ENEMY = 3;

  /** Build a defence scenario. `regions`/`armies` describe the local situation. */
  function defenceState(regions: Region[], armies: Army[], atWar = true): GameState {
    return {
      turn: 50,
      difficulty: "normal",
      treaties: atWar ? { "2-3": "war" } : {},
      armies,
      nations: [],
      regions,
    } as unknown as GameState;
  }

  it("flags a region with a bordering enemy rival army as threatened", () => {
    const s = defenceState(
      [region({ id: 0, ownerId: RIVAL, adjacency: [1] }), region({ id: 1, ownerId: ENEMY, adjacency: [0] })],
      [army({ id: 5, ownerId: ENEMY, regionId: 1, units: units({ infantry: 4 }) })],
    );
    expect(regionIsThreatened(s, 0, RIVAL)).toBe(true);
  });

  it("does not treat a bordering barbarian garrison as a mobile threat", () => {
    const s = defenceState(
      [region({ id: 0, ownerId: RIVAL, adjacency: [1] }), region({ id: 1, ownerId: BARBARIAN_ID, adjacency: [0] })],
      [army({ id: 5, ownerId: BARBARIAN_ID, regionId: 1, units: units({ militia: 3 }) })],
    );
    expect(regionIsThreatened(s, 0, RIVAL)).toBe(false);
  });

  it("judges a tiny army beside a large enemy stack as badly outmatched", () => {
    const mine = army({ id: 1, ownerId: RIVAL, regionId: 0, units: units({ militia: 1 }) });
    const s = defenceState(
      [region({ id: 0, ownerId: RIVAL, adjacency: [1] }), region({ id: 1, ownerId: ENEMY, adjacency: [0] })],
      [mine, army({ id: 5, ownerId: ENEMY, regionId: 1, units: units({ infantry: 10 }) })],
    );
    expect(isBadlyOutmatched(s, mine, RIVAL)).toBe(true);
  });

  it("does not flag a strong garrison as outmatched by a small raid", () => {
    const mine = army({ id: 1, ownerId: RIVAL, regionId: 0, units: units({ infantry: 6, militia: 2 }) });
    const s = defenceState(
      [region({ id: 0, ownerId: RIVAL, adjacency: [1] }), region({ id: 1, ownerId: ENEMY, adjacency: [0] })],
      [mine, army({ id: 5, ownerId: ENEMY, regionId: 1, units: units({ militia: 1 }) })],
    );
    expect(isBadlyOutmatched(s, mine, RIVAL)).toBe(false);
  });

  it("retreats toward the safest adjacent owned region", () => {
    const mine = army({ id: 1, ownerId: RIVAL, regionId: 0, units: units({ militia: 1 }) });
    const s = defenceState(
      [
        region({ id: 0, ownerId: RIVAL, adjacency: [1, 2] }),
        region({ id: 1, ownerId: ENEMY, adjacency: [0] }),
        region({ id: 2, ownerId: RIVAL, adjacency: [0] }), // safe refuge
      ],
      [mine, army({ id: 5, ownerId: ENEMY, regionId: 1, units: units({ infantry: 10 }) })],
    );
    expect(retreatStep(s, mine, RIVAL)).toBe(2);
  });

  it("returns null when no owned neighbour is any safer", () => {
    const mine = army({ id: 1, ownerId: RIVAL, regionId: 0, units: units({ militia: 1 }) });
    const s = defenceState(
      [region({ id: 0, ownerId: RIVAL, adjacency: [1] }), region({ id: 1, ownerId: ENEMY, adjacency: [0] })],
      [mine, army({ id: 5, ownerId: ENEMY, regionId: 1, units: units({ infantry: 10 }) })],
    );
    expect(retreatStep(s, mine, RIVAL)).toBe(null);
  });

  it("marches toward the nearest threatened owned region to reinforce it", () => {
    const mine = army({ id: 1, ownerId: RIVAL, regionId: 2, units: units({ infantry: 4 }) });
    const s = defenceState(
      [
        region({ id: 0, ownerId: RIVAL, adjacency: [1, 2] }), // threatened front
        region({ id: 1, ownerId: ENEMY, adjacency: [0] }),
        region({ id: 2, ownerId: RIVAL, adjacency: [0] }), // our reserve army sits here
      ],
      [mine, army({ id: 5, ownerId: ENEMY, regionId: 1, units: units({ infantry: 4 }) })],
    );
    expect(defendStep(s, mine, RIVAL)).toBe(0);
  });

  it("holds (null) when the army already stands on the threatened region", () => {
    const mine = army({ id: 1, ownerId: RIVAL, regionId: 0, units: units({ infantry: 4 }) });
    const s = defenceState(
      [region({ id: 0, ownerId: RIVAL, adjacency: [1] }), region({ id: 1, ownerId: ENEMY, adjacency: [0] })],
      [mine, army({ id: 5, ownerId: ENEMY, regionId: 1, units: units({ infantry: 4 }) })],
    );
    expect(defendStep(s, mine, RIVAL)).toBe(null);
  });
});

describe("concentration of force", () => {
  const ENEMY = 3;
  function warState(regions: Region[], armies: Army[]): GameState {
    return {
      turn: 50,
      difficulty: "normal",
      treaties: { "2-3": "war" },
      armies,
      nations: [],
      regions,
    } as unknown as GameState;
  }

  it("focusTarget flags a strong bordering enemy region no single army can crack", () => {
    const s = warState(
      [
        region({ id: 0, ownerId: RIVAL, adjacency: [1] }),
        region({ id: 1, ownerId: ENEMY, adjacency: [0], population: 6, fortification: 2 }),
      ],
      [
        army({ id: 1, ownerId: RIVAL, regionId: 0, units: units({ militia: 1 }) }),
        army({ id: 5, ownerId: ENEMY, regionId: 1, units: units({ infantry: 10 }) }),
      ],
    );
    expect(focusTarget(s, RIVAL)).toBe(1);
  });

  it("focusTarget ignores a target a single army already beats (normal attack takes it)", () => {
    const s = warState(
      [
        region({ id: 0, ownerId: RIVAL, adjacency: [1] }),
        region({ id: 1, ownerId: ENEMY, adjacency: [0], population: 2 }),
      ],
      [
        army({ id: 1, ownerId: RIVAL, regionId: 0, units: units({ infantry: 8 }) }),
        army({ id: 5, ownerId: ENEMY, regionId: 1, units: units({ militia: 1 }) }),
      ],
    );
    expect(focusTarget(s, RIVAL)).toBe(null);
  });

  it("musterRegion gathers on the owned neighbour holding the most friendly force", () => {
    const s = warState(
      [
        region({ id: 0, ownerId: RIVAL, adjacency: [1] }),
        region({ id: 1, ownerId: ENEMY, adjacency: [0, 2], population: 6, fortification: 2 }),
        region({ id: 2, ownerId: RIVAL, adjacency: [1] }),
      ],
      [
        army({ id: 1, ownerId: RIVAL, regionId: 0, units: units({ militia: 1 }) }),
        army({ id: 2, ownerId: RIVAL, regionId: 2, units: units({ infantry: 5 }) }),
        army({ id: 5, ownerId: ENEMY, regionId: 1, units: units({ infantry: 10 }) }),
      ],
    );
    expect(musterRegion(s, RIVAL, 1)).toBe(2); // region 2 holds the bigger stack — the anvil
  });

  it("two split armies mass and merge, then take a region neither beat alone", () => {
    // Two rival stacks in owned regions 0 and 2 (connected through own land),
    // both eventually adjacent to a strong enemy region 1. Driven over turns the
    // rival should concentrate and capture it, where each army alone cannot.
    const build = (): GameState =>
      ({
        turn: 50,
        difficulty: "normal",
        treaties: { "2-3": "war" },
        rngState: 123,
        nextArmyId: 10,
        offers: [],
        relations: {},
        log: [],
        nations: [
          { id: RIVAL, name: "R", color: "#000", isPlayer: false, isBarbarian: false, alive: true, stocks: { gold: 0, food: 0, materials: 0, knowledge: 0 }, taxRate: 0.2, research: emptyResearch(), wonders: 0, famine: false, bankrupt: false, personality: { archetype: "warlord", aggression: 0.9, expansion: 0.8, economy: 0.3, trustworthiness: 0.2 } },
          { id: ENEMY, name: "E", color: "#fff", isPlayer: false, isBarbarian: false, alive: true, stocks: { gold: 0, food: 0, materials: 0, knowledge: 0 }, taxRate: 0.2, research: emptyResearch(), wonders: 0, famine: false, bankrupt: false },
        ],
        regions: [
          region({ id: 0, ownerId: RIVAL, adjacency: [1, 2] }),
          region({ id: 1, ownerId: ENEMY, adjacency: [0, 2], population: 3, fortification: 0 }),
          region({ id: 2, ownerId: RIVAL, adjacency: [0, 1] }),
        ],
        armies: [
          // Each 5-inf stack (atk 25) loses to the 5-inf defender (def 30) alone,
          // but the merged 10-inf stack (atk 50) wins — so only massing takes it.
          army({ id: 1, ownerId: RIVAL, regionId: 0, units: units({ infantry: 5 }), movesLeft: 1 }),
          army({ id: 2, ownerId: RIVAL, regionId: 2, units: units({ infantry: 5 }), movesLeft: 1 }),
          army({ id: 5, ownerId: ENEMY, regionId: 1, units: units({ infantry: 5 }), movesLeft: 0 }),
        ],
      }) as unknown as GameState;

    let s = build();
    const rng = createRng(99);
    let captured = false;
    for (let t = 0; t < 14 && !captured; t++) {
      s = runNationTurn(s, RIVAL, rng);
      s = { ...s, armies: s.armies.map((a) => ({ ...a, movesLeft: 1 })) }; // refresh moves each turn
      captured = s.regions[1]!.ownerId === RIVAL;
    }
    expect(captured).toBe(true);
  });
});

describe("bestTarget prizes valuable regions", () => {
  function targetState(regions: Region[], armies: Army[]): GameState {
    return { turn: 50, difficulty: "normal", treaties: {}, armies, nations: [], regions } as unknown as GameState;
  }

  it("prefers the higher-population target among equal, undefended options", () => {
    const attacker = army({ id: 1, ownerId: RIVAL, regionId: 0, units: units({ infantry: 6 }) });
    const s = targetState(
      [
        region({ id: 0, ownerId: RIVAL, adjacency: [1, 2] }),
        region({ id: 1, ownerId: BARBARIAN_ID, population: 2, adjacency: [0] }),
        region({ id: 2, ownerId: BARBARIAN_ID, population: 8, adjacency: [0] }), // richer prize
      ],
      [attacker],
    );
    expect(bestTarget(s, attacker, RIVAL)).toBe(2);
  });

  it("prefers a resource region over an equal-population one", () => {
    const attacker = army({ id: 1, ownerId: RIVAL, regionId: 0, units: units({ infantry: 6 }) });
    const s = targetState(
      [
        region({ id: 0, ownerId: RIVAL, adjacency: [1, 2] }),
        region({ id: 1, ownerId: BARBARIAN_ID, population: 4, resource: null, adjacency: [0] }),
        region({ id: 2, ownerId: BARBARIAN_ID, population: 4, resource: "iron", adjacency: [0] }),
      ],
      [attacker],
    );
    expect(bestTarget(s, attacker, RIVAL)).toBe(2);
  });

  it("still refuses a target it cannot beat", () => {
    const attacker = army({ id: 1, ownerId: RIVAL, regionId: 0, units: units({ militia: 1 }) });
    const s = targetState(
      [
        region({ id: 0, ownerId: RIVAL, adjacency: [1] }),
        region({ id: 1, ownerId: BARBARIAN_ID, population: 8, fortification: 3, adjacency: [0] }),
      ],
      [attacker, army({ id: 5, ownerId: BARBARIAN_ID, regionId: 1, units: units({ infantry: 12 }) })],
    );
    expect(bestTarget(s, attacker, RIVAL)).toBe(null);
  });
});

describe("bestTarget capital strikes (archetype-weighted)", () => {
  const ENEMY = 3;
  const WARLORD: Personality = { archetype: "warlord", aggression: 0.9, expansion: 0.8, economy: 0.3, trustworthiness: 0.2 };
  const MERCHANT: Personality = { archetype: "merchant", aggression: 0.2, expansion: 0.5, economy: 0.9, trustworthiness: 0.85 };

  /** RIVAL (with `personality`) at war with ENEMY, whose capital is region 1. */
  function warState(regions: Region[], armies: Army[], personality: Personality): GameState {
    return {
      turn: 50,
      difficulty: "normal",
      treaties: { [pairKey(RIVAL, ENEMY)]: "war" },
      armies,
      nations: [
        { id: RIVAL, alive: true, personality },
        { id: ENEMY, alive: true, capitalRegionId: 1 },
      ] as unknown as Nation[],
      regions,
    } as unknown as GameState;
  }

  it("prefers the enemy capital over an equal ordinary region", () => {
    const attacker = army({ id: 1, ownerId: RIVAL, regionId: 0, units: units({ infantry: 6 }) });
    const s = warState(
      [
        region({ id: 0, ownerId: RIVAL, adjacency: [1, 2] }),
        region({ id: 1, ownerId: ENEMY, population: 4, adjacency: [0] }), // the capital
        region({ id: 2, ownerId: ENEMY, population: 4, adjacency: [0] }),
      ],
      [attacker],
      WARLORD,
    );
    expect(bestTarget(s, attacker, RIVAL)).toBe(1);
  });

  it("a warlord strikes the capital rather than a resource region", () => {
    const attacker = army({ id: 1, ownerId: RIVAL, regionId: 0, units: units({ infantry: 6 }) });
    const s = warState(
      [
        region({ id: 0, ownerId: RIVAL, adjacency: [1, 2] }),
        region({ id: 1, ownerId: ENEMY, population: 4, adjacency: [0] }), // the capital
        region({ id: 2, ownerId: ENEMY, population: 4, resource: "iron", adjacency: [0] }),
      ],
      [attacker],
      WARLORD,
    );
    expect(bestTarget(s, attacker, RIVAL)).toBe(1);
  });

  it("a merchant grabs the resource region rather than the capital", () => {
    const attacker = army({ id: 1, ownerId: RIVAL, regionId: 0, units: units({ infantry: 6 }) });
    const s = warState(
      [
        region({ id: 0, ownerId: RIVAL, adjacency: [1, 2] }),
        region({ id: 1, ownerId: ENEMY, population: 4, adjacency: [0] }), // the capital
        region({ id: 2, ownerId: ENEMY, population: 4, resource: "iron", adjacency: [0] }),
      ],
      [attacker],
      MERCHANT,
    );
    expect(bestTarget(s, attacker, RIVAL)).toBe(2);
  });
});

describe("gang up on a runaway leader", () => {
  const LEADER = 2, JOINER = 3, ALLY = 0;

  function mkNation(id: number, over: Partial<Nation> = {}): Nation {
    return {
      id,
      name: `N${id}`,
      color: "#fff",
      isPlayer: id === 0,
      isBarbarian: id === BARBARIAN_ID,
      alive: true,
      stocks: { gold: 0, food: 0, materials: 0, knowledge: 0 },
      taxRate: 0.15,
      research: emptyResearch(),
      wonders: 0,
      famine: false,
      bankrupt: false,
      ...over,
    };
  }

  /** Leader out-powers everyone and holds 40% of the map; ALLY already at war. */
  function runawayState(): GameState {
    const regions: Region[] = [
      region({ id: 0, ownerId: LEADER, adjacency: [1, 2, 3] }),
      region({ id: 1, ownerId: LEADER, adjacency: [0] }),
      region({ id: 2, ownerId: JOINER, adjacency: [0] }), // borders leader
      region({ id: 3, ownerId: ALLY, adjacency: [0, 4] }), // borders leader
      region({ id: 4, ownerId: ALLY, adjacency: [3] }),
    ];
    const armies: Army[] = [
      army({ id: 1, ownerId: LEADER, regionId: 0, units: units({ infantry: 9 }) }),
      army({ id: 2, ownerId: JOINER, regionId: 2, units: units({ militia: 2, infantry: 1 }) }),
      army({ id: 3, ownerId: ALLY, regionId: 3, units: units({ infantry: 5 }) }),
    ];
    return {
      turn: 40,
      difficulty: "normal",
      relations: { "2-3": -20 },
      treaties: { "0-2": "war" }, // ALLY already fights the LEADER
      offers: [],
      nextOfferId: 0,
      regions,
      armies,
      nextArmyId: 4,
      nations: [
        mkNation(ALLY, { personality: { archetype: "warlord", aggression: 0.9, expansion: 0.8, economy: 0.3, trustworthiness: 0.2 } }),
        mkNation(BARBARIAN_ID),
        mkNation(LEADER, { personality: { archetype: "warlord", aggression: 0.9, expansion: 0.8, economy: 0.3, trustworthiness: 0.2 } }),
        mkNation(JOINER, { personality: { archetype: "opportunist", aggression: 0.5, expansion: 0.5, economy: 0.5, trustworthiness: 0.3 } }),
      ],
      outcome: "playing",
      log: [],
    } as unknown as GameState;
  }

  it("identifies the runaway leader", () => {
    expect(runawayLeader(runawayState())).toBe(LEADER);
  });

  it("finds no runaway when power is balanced", () => {
    const g = createGame({ seed: 1, rivals: 2 });
    expect(runawayLeader(g)).toBe(null);
  });

  it("sums the coalition already at war plus the prospective joiner", () => {
    const s = runawayState();
    const solo = coalitionPowerAgainst({ ...s, treaties: {} }, LEADER, JOINER);
    const withAlly = coalitionPowerAgainst(s, LEADER, JOINER); // ALLY at war adds in
    expect(withAlly).toBeGreaterThan(solo);
  });

  it("a coalition member declares war on the runaway leader", () => {
    const s = runawayState();
    expect(atWar(s, JOINER, LEADER)).toBe(false);
    const after = runNationTurn(s, JOINER, createRng(1));
    expect(atWar(after, JOINER, LEADER)).toBe(true);
  });

  it("does not pile on during the player's early grace period", () => {
    const s = { ...runawayState(), turn: 3 } as GameState;
    // Make the leader the player so the early-grace guard applies.
    const withPlayerLeader = {
      ...s,
      nations: s.nations.map((n) =>
        n.id === LEADER ? { ...n, isPlayer: true } : n.id === ALLY ? { ...n, isPlayer: false } : n,
      ),
    } as GameState;
    const after = runNationTurn(withPlayerLeader, JOINER, createRng(1));
    expect(atWar(after, JOINER, LEADER)).toBe(false);
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
    // Across a spread of seeds (personalities and traits are drawn per seed),
    // war should erupt in at least one game — not every draw is a pair of
    // pacifists. Scanning a dozen seeds keeps this robust to RNG-stream shifts
    // (empirically ~40% of seeds see war within 80 turns).
    let anyWar = false;
    for (let seed = 1; seed <= 12 && !anyWar; seed++) {
      let s = createGame({ seed, rivals: 2 });
      for (let i = 0; i < 80 && !anyWar; i++) {
        s = resolveTurn(s);
        if (Object.values(s.treaties).includes("war")) anyWar = true;
      }
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

describe("tribute demands", () => {
  const P = 0, R = 2;
  const nat = (id: number, over: Partial<Nation> = {}): Nation => ({
    id, name: `N${id}`, color: "#fff", isPlayer: id === P, isBarbarian: id === BARBARIAN_ID, alive: true,
    stocks: { gold: id === R ? 200 : 20, food: 20, materials: 10, knowledge: 0 },
    taxRate: 0.1, research: emptyResearch(), wonders: 0, famine: false, bankrupt: false, ...over,
  });

  /** A strong rival (3 regions, big army) bordering a weak player, at the given relation. */
  function tributeState(rel: number): GameState {
    return {
      turn: 50, difficulty: "normal",
      relations: { "0-2": rel }, treaties: {}, offers: [], nextOfferId: 0,
      regions: [
        region({ id: 0, ownerId: P, adjacency: [1] }),
        region({ id: 1, ownerId: R, adjacency: [0, 2] }),
        region({ id: 2, ownerId: R, adjacency: [1, 3] }),
        region({ id: 3, ownerId: R, adjacency: [2] }),
      ],
      armies: [
        army({ id: 1, ownerId: P, regionId: 0, units: units({ militia: 1 }) }),
        army({ id: 2, ownerId: R, regionId: 1, units: units({ infantry: 8 }) }),
      ],
      nextArmyId: 3,
      nations: [
        nat(P),
        nat(BARBARIAN_ID, { isBarbarian: true }),
        nat(R, { personality: { archetype: "opportunist", aggression: 0.5, expansion: 0.6, economy: 0.6, trustworthiness: 0.4 } }),
      ],
      outcome: "playing", log: [],
    } as unknown as GameState;
  }

  it("a strong, bordering, unfriendly rival demands tribute of the player", () => {
    const after = runNationTurn(tributeState(-15), R, createRng(1));
    const offer = after.offers.find((o) => o.type === "tribute" && o.from === R && o.to === P);
    expect(offer).toBeDefined();
    expect(offer!.gold).toBeGreaterThan(0);
    expect(after.log.some((l) => l.includes("tribute"))).toBe(true);
  });

  it("does not demand tribute while relations are friendly", () => {
    const after = runNationTurn(tributeState(20), R, createRng(1));
    expect(after.offers.some((o) => o.type === "tribute")).toBe(false);
  });

  it("does not stack a second demand while one already stands", () => {
    const first = runNationTurn(tributeState(-15), R, createRng(1));
    expect(first.offers.filter((o) => o.type === "tribute")).toHaveLength(1);
    const second = runNationTurn(first, R, createRng(2));
    expect(second.offers.filter((o) => o.type === "tribute")).toHaveLength(1); // dedup holds
  });
});
