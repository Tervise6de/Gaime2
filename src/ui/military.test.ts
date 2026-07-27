import { describe, expect, it } from "vitest";
import { SEA_ZONES } from "@/data/sea";
import { createGame } from "@/systems/turn";
import { emptyUnits, PLAYER_ID, type GameState } from "@/systems/state";
import type { BattleReport } from "@/systems/combat";
import {
  battleVerdict,
  eligiblePlayerAttackers,
  forceCompactLabel,
  forceLabel,
  unitDisplay,
} from "@/ui/military";

describe("military presentation semantics", () => {
  it("counts ships as hulls and land regiments as soldiers", () => {
    expect(forceLabel({ ...emptyUnits(), war_cog: 1 })).toBe("1 warship");
    expect(forceLabel({ ...emptyUnits(), infantry: 3 })).toBe("750 soldiers");
    expect(forceLabel({ ...emptyUnits(), infantry: 3, war_cog: 2 })).toBe(
      "750 soldiers · 2 warships",
    );
    expect(forceCompactLabel({ ...emptyUnits(), war_cog: 2 })).toBe("2⚓");
    expect(unitDisplay("war_cog", 2, true)).toBe("2");
    expect(unitDisplay("infantry", 2, true)).toBe("500");
  });

  it("uses the occupied sea zone, not an obsolete anchor, for attack eligibility", () => {
    const state = createGame({ seed: 31, playerFaction: "England" });
    const anchor = state.regions.find((region) => region.ownerId === PLAYER_ID && region.terrain === "coast")!;
    const zoneId = "north_sea" as const;
    const landing = SEA_ZONES[zoneId].coastalRegions.find((id) => id !== anchor.id)!;
    const falseAnchorTarget = anchor.adjacency.find(
      (id) => !SEA_ZONES[zoneId].coastalRegions.includes(id),
    );
    const atSea: GameState = {
      ...state,
      armies: [{
        id: 990,
        ownerId: PLAYER_ID,
        regionId: anchor.id,
        seaZoneId: zoneId,
        units: { ...emptyUnits(), war_cog: 1, infantry: 2 },
        movesLeft: 1,
      }],
    };

    expect(eligiblePlayerAttackers(atSea, landing).map((army) => army.id)).toEqual([990]);
    if (falseAnchorTarget !== undefined) {
      expect(eligiblePlayerAttackers(atSea, falseAnchorTarget)).toEqual([]);
    }
  });

  it("uses naval outcomes instead of claiming a region fell", () => {
    const report = {
      battleKind: "naval",
      outcome: "captured",
    } as BattleReport;
    expect(battleVerdict(report, true)).toBe("Victory — sea lane won");
    expect(battleVerdict(report, false)).toBe("Defeat — sea lane lost");
  });
});
