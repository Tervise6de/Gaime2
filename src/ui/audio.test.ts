import { describe, it, expect } from "vitest";
import { outcomeCue, ambientMotif } from "@/ui/audio";
import type { TurnSummary } from "@/systems/summary";

function summary(over: Partial<TurnSummary>): TurnSummary {
  return {
    goldDelta: 0,
    regionsGained: [],
    regionsLost: [],
    warsDeclared: [],
    peaceMade: [],
    eliminated: [],
    techsCompleted: [],
    famine: false,
    bankrupt: false,
    quiet: true,
    ...over,
  };
}

describe("outcomeCue", () => {
  it("is silent on a quiet turn", () => {
    expect(outcomeCue(summary({}))).toBeNull();
  });

  it("maps each event to its cue", () => {
    expect(outcomeCue(summary({ regionsLost: ["A"] }))).toBe("loss");
    expect(outcomeCue(summary({ bankrupt: true }))).toBe("alert");
    expect(outcomeCue(summary({ famine: true }))).toBe("alert");
    expect(outcomeCue(summary({ eliminated: ["Foe"] }))).toBe("eliminate");
    expect(outcomeCue(summary({ regionsGained: ["B"] }))).toBe("capture");
    expect(outcomeCue(summary({ warsDeclared: ["Foe"] }))).toBe("war");
    expect(outcomeCue(summary({ techsCompleted: ["writing"] as never }))).toBe("tech");
    expect(outcomeCue(summary({ peaceMade: ["Foe"] }))).toBe("peace");
  });

  it("prioritises bad/urgent news when several things happen at once", () => {
    // Losing ground outranks a captured region and a completed tech the same turn.
    const s = summary({ regionsLost: ["A"], regionsGained: ["B"], techsCompleted: ["writing"] as never });
    expect(outcomeCue(s)).toBe("loss");
    // Danger outranks good news but not an actual loss of territory.
    expect(outcomeCue(summary({ bankrupt: true, regionsGained: ["B"] }))).toBe("alert");
  });
});

describe("ambientMotif", () => {
  it("loops a non-empty fixed sequence of chords", () => {
    const first = ambientMotif(0);
    expect(Array.isArray(first)).toBe(true);
    expect(first.length).toBeGreaterThan(0);
    for (const f of first) expect(typeof f).toBe("number");
  });

  it("wraps deterministically (including negative indices)", () => {
    expect(ambientMotif(0)).toEqual(ambientMotif(6)); // sequence length is 6
    expect(ambientMotif(1)).toEqual(ambientMotif(7));
    expect(ambientMotif(-1)).toEqual(ambientMotif(5)); // no NaN / undefined on negatives
  });
});
