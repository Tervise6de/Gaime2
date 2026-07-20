import { describe, expect, it } from "vitest";
import { BASE_YEAR, ERAS, YEARS_PER_TURN, eraForTurn, yearForTurn } from "@/data/eras";

describe("world ages", () => {
  it("maps turn 1 to the base year (1228 AD)", () => {
    expect(BASE_YEAR).toBe(1228);
    expect(yearForTurn(1)).toBe(1228);
  });

  it("stretches ~1.47 years per turn so a standard game spans ~1228-1550 AD", () => {
    expect(YEARS_PER_TURN).toBe(1.47);
    // Each turn advances ~1.47 years (rounded), decoupling the span from the turn count.
    expect(yearForTurn(2)).toBe(BASE_YEAR + Math.round(1 * YEARS_PER_TURN)); // 1229
    expect(yearForTurn(90)).toBe(1359);
    expect(yearForTurn(185)).toBe(1498);
    // A full standard campaign (220 turns) reaches the Hansa twilight.
    expect(yearForTurn(220)).toBe(1550); // 1228 + Math.round(219 * 1.47)
  });

  it("clamps nonsense turns to the base year", () => {
    expect(yearForTurn(0)).toBe(BASE_YEAR);
    expect(yearForTurn(-5)).toBe(BASE_YEAR);
  });

  it("eras are ordered, contiguous and start at turn 1", () => {
    expect(ERAS[0]!.fromTurn).toBe(1);
    for (let i = 1; i < ERAS.length; i++) {
      expect(ERAS[i]!.fromTurn).toBeGreaterThan(ERAS[i - 1]!.fromTurn);
    }
  });

  it("keeps exactly five eras with indices 0..4 on unchanged turn boundaries (tech gating untouched)", () => {
    expect(ERAS.length).toBe(5);
    ERAS.forEach((e, i) => expect(e.index).toBe(i));
    expect(ERAS.map((e) => e.fromTurn)).toEqual([1, 45, 90, 140, 185]);
  });

  it("resolves the correct era at boundaries, renamed to the Hansa arc", () => {
    expect(eraForTurn(1).name).toBe("Gotland Network");
    expect(eraForTurn(44).name).toBe("Gotland Network");
    expect(eraForTurn(45).name).toBe("Lübeck Ascendant");
    expect(eraForTurn(89).name).toBe("Lübeck Ascendant");
    expect(eraForTurn(90).name).toBe("League Takes Shape");
    expect(eraForTurn(139).name).toBe("League Takes Shape");
    expect(eraForTurn(140).name).toBe("Peak of the Hansa");
    expect(eraForTurn(184).name).toBe("Peak of the Hansa");
    expect(eraForTurn(185).name).toBe("The Turning");
    expect(eraForTurn(9999).name).toBe("The Turning");
  });

  it("dates each era's dawn across the Hansa lifecycle", () => {
    expect(yearForTurn(ERAS[0]!.fromTurn)).toBe(1228);
    expect(yearForTurn(ERAS[1]!.fromTurn)).toBe(1293);
    expect(yearForTurn(ERAS[2]!.fromTurn)).toBe(1359);
    expect(yearForTurn(ERAS[3]!.fromTurn)).toBe(1432);
    expect(yearForTurn(ERAS[4]!.fromTurn)).toBe(1498);
  });

  it("clamps turns below the first era", () => {
    expect(eraForTurn(0).name).toBe("Gotland Network");
  });
});
