import { describe, expect, it } from "vitest";
import { ARCHETYPES, personalityByArchetype } from "@/data/personalities";
import { publicIntelStrength, publicIntelUnits, publicNationPower } from "@/systems/intel";
import { createGame, resolveTurn } from "@/systems/turn";
import { PLAYER_ID, emptyUnits, type Army, type GameState } from "@/systems/state";

function army(over: Partial<Army>): Army {
  return {
    id: 1,
    ownerId: 2,
    regionId: 0,
    units: emptyUnits(),
    movesLeft: 1,
    ...over,
  };
}

function intelState(armies: Army[]): GameState {
  return {
    turn: 20,
    difficulty: "normal",
    treaties: {},
    relations: {},
    nations: [
      { id: PLAYER_ID, name: "Player", stocks: { gold: 100, food: 0, knowledge: 0 } },
      { id: 2, name: "Rival", stocks: { gold: 100, food: 0, knowledge: 0 } },
    ],
    regions: [{ id: 0, ownerId: 2 }, { id: 1, ownerId: PLAYER_ID }],
    armies,
  } as unknown as GameState;
}

describe("public military intelligence", () => {
  it("keeps own and inspected landed garrisons exact, but masks fleet strength at sea", () => {
    const own = army({ id: 1, ownerId: PLAYER_ID, units: { ...emptyUnits(), infantry: 7 } });
    const landed = army({ id: 2, ownerId: 2, units: { ...emptyUnits(), cavalry: 9 } });
    const fleet = army({ id: 3, ownerId: 2, seaZoneId: "north_sea", units: { ...emptyUnits(), war_cog: 8 } });
    const state = intelState([own, landed, fleet]);

    expect(publicIntelUnits(state, PLAYER_ID, own).infantry).toBe(7);
    expect(publicIntelUnits(state, PLAYER_ID, landed).cavalry).toBe(9);
    expect(publicIntelUnits(state, PLAYER_ID, fleet).war_cog).toBe(1);
    expect(publicIntelStrength(state, PLAYER_ID, fleet)).toBeLessThan(8 * (10 + 8));
  });

  it("does not let a hidden fleet inventory change public power", () => {
    const small = intelState([
      army({ id: 1, ownerId: 2, seaZoneId: "north_sea", units: { ...emptyUnits(), war_cog: 1 } }),
    ]);
    const large = intelState([
      army({ id: 1, ownerId: 2, seaZoneId: "north_sea", units: { ...emptyUnits(), war_cog: 12 } }),
    ]);
    expect(publicNationPower(small, PLAYER_ID, 2)).toBe(publicNationPower(large, PLAYER_ID, 2));
  });
});

describe("AI play-out fairness smoke", () => {
  for (const archetype of ARCHETYPES) {
    it(`${archetype.archetype} remains deterministic across a short full-board run`, () => {
      const run = (): GameState => {
        let state = createGame({ seed: 100 + archetype.archetype.length });
        state = {
          ...state,
          nations: state.nations.map((nation) =>
            nation.isPlayer ? nation : { ...nation, personality: personalityByArchetype(archetype.archetype) },
          ),
        };
        for (let turn = 0; turn < 24 && state.outcome === "playing"; turn++) {
          state = resolveTurn(state);
        }
        return state;
      };

      const first = run();
      const second = run();
      expect(second).toEqual(first);
      expect(first.regions.every((region) => region.ownerId !== undefined)).toBe(true);
      expect(first.armies.every((stack) => Number.isFinite(stack.movesLeft))).toBe(true);
      expect(first.nations.every((nation) => Object.values(nation.stocks).every(Number.isFinite))).toBe(true);
    });
  }
});
