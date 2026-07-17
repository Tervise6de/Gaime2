import { describe, expect, it } from "vitest";
import { BASE_YEAR, ERAS, eraForTurn, yearForTurn } from "@/data/eras";

describe("world ages", () => {
  it("maps turn 1 to the base year and counts one year per turn", () => {
    expect(yearForTurn(1)).toBe(BASE_YEAR);
    expect(yearForTurn(2)).toBe(BASE_YEAR + 1);
    expect(yearForTurn(150)).toBe(BASE_YEAR + 149);
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

  it("resolves the correct era at boundaries", () => {
    expect(eraForTurn(1).name).toBe("Age of Founding");
    expect(eraForTurn(25).name).toBe("Age of Founding");
    expect(eraForTurn(26).name).toBe("Age of Banners");
    expect(eraForTurn(60).name).toBe("Age of Banners");
    expect(eraForTurn(61).name).toBe("Age of Crowns");
    expect(eraForTurn(100).name).toBe("Age of Crowns");
    expect(eraForTurn(101).name).toBe("Age of Conquest");
    expect(eraForTurn(135).name).toBe("Age of Conquest");
    expect(eraForTurn(136).name).toBe("Age of Legacy");
    expect(eraForTurn(9999).name).toBe("Age of Legacy");
  });

  it("clamps turns below the first era", () => {
    expect(eraForTurn(0).name).toBe("Age of Founding");
  });
});
