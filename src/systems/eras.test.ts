import { describe, expect, it } from "vitest";
import { BASE_YEAR, ERAS, YEARS_PER_TURN, eraForTurn, yearForTurn } from "@/data/eras";

describe("world ages", () => {
  it("maps turn 1 to the base year (900 AD)", () => {
    expect(BASE_YEAR).toBe(900);
    expect(yearForTurn(1)).toBe(900);
  });

  it("stretches ~2.8 years per turn so a standard game spans ~900→~1500 AD", () => {
    expect(YEARS_PER_TURN).toBe(2.8);
    // Each turn advances ~2.8 years (rounded), decoupling the span from the turn count.
    expect(yearForTurn(2)).toBe(BASE_YEAR + Math.round(1 * YEARS_PER_TURN)); // 903
    expect(yearForTurn(90)).toBe(1149);
    expect(yearForTurn(185)).toBe(1415);
    // A full standard campaign (220 turns) reaches the Hansa twilight.
    expect(yearForTurn(220)).toBe(1513); // 900 + Math.round(219 * 2.8)
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
    expect(eraForTurn(1).name).toBe("Trade Dawn");
    expect(eraForTurn(44).name).toBe("Trade Dawn");
    expect(eraForTurn(45).name).toBe("The Gotland Age");
    expect(eraForTurn(89).name).toBe("The Gotland Age");
    expect(eraForTurn(90).name).toBe("The League Rises");
    expect(eraForTurn(139).name).toBe("The League Rises");
    expect(eraForTurn(140).name).toBe("Peak of the Hansa");
    expect(eraForTurn(184).name).toBe("Peak of the Hansa");
    expect(eraForTurn(185).name).toBe("The Turning");
    expect(eraForTurn(9999).name).toBe("The Turning");
  });

  it("dates each era's dawn across the Hansa lifecycle", () => {
    expect(yearForTurn(ERAS[0]!.fromTurn)).toBe(900); // Trade Dawn
    expect(yearForTurn(ERAS[1]!.fromTurn)).toBe(1023); // The Gotland Age
    expect(yearForTurn(ERAS[2]!.fromTurn)).toBe(1149); // The League Rises (Lübeck's rise)
    expect(yearForTurn(ERAS[3]!.fromTurn)).toBe(1289); // Peak of the Hansa
    expect(yearForTurn(ERAS[4]!.fromTurn)).toBe(1415); // The Turning
  });

  it("clamps turns below the first era", () => {
    expect(eraForTurn(0).name).toBe("Trade Dawn");
  });
});
