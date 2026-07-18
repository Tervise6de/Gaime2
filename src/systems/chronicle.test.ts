import { describe, it, expect } from "vitest";
import { recordChronicle, chronicleName } from "@/systems/chronicle";
import { createGame } from "@/systems/turn";
import { declareWar } from "@/systems/diplomacy";
import { PLAYER_ID, type GameState } from "@/systems/state";

function game(): GameState {
  return createGame({ seed: 42 });
}

describe("chronicle (E2)", () => {
  it("records a beat stamped with the current turn, oldest first", () => {
    let s = game();
    s = { ...s, turn: 5 };
    s = recordChronicle(s, "revolt", "A province rose up.");
    s = recordChronicle(s, "war", "War was declared.");
    expect(s.chronicle).toHaveLength(2);
    expect(s.chronicle![0]).toMatchObject({ turn: 5, kind: "revolt" });
    expect(s.chronicle![1]!.kind).toBe("war");
  });

  it("chronicleName speaks as the ruler for rivals and 'your realm' for the player", () => {
    const s = game();
    expect(chronicleName(s, PLAYER_ID)).toBe("your realm");
    const rival = s.nations.find((n) => !n.isPlayer && !n.isBarbarian)!;
    // Rivals carry a ruler → "Ruler the Epithet of Realm".
    expect(chronicleName(s, rival.id)).toMatch(new RegExp(`of ${rival.name}$`));
    expect(chronicleName(s, null)).toBe("the wilds");
  });

  it("a war declaration writes a war beat into the chronicle", () => {
    const s = game();
    const rival = s.nations.find((n) => !n.isPlayer && !n.isBarbarian)!;
    const after = declareWar(s, PLAYER_ID, rival.id);
    expect((after.chronicle ?? []).some((e) => e.kind === "war" && /declared war on/.test(e.text))).toBe(true);
  });

  it("createGame gives every non-barbarian realm a named ruler (E1)", () => {
    const s = game();
    for (const n of s.nations) {
      if (n.isBarbarian) continue;
      expect(n.ruler).toBeDefined();
      expect(n.ruler!.name.length).toBeGreaterThan(0);
    }
  });
});
