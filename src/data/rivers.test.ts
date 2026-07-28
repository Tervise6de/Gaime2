import { describe, it, expect } from "vitest";
import { RIVERS } from "@/data/rivers";
import { createGame } from "@/systems/turn";

describe("rivers", () => {
  const game = createGame({ seed: 1 });

  it("runs every course along real map adjacency, so no river crosses open water", () => {
    const breaks: string[] = [];
    for (const river of RIVERS) {
      for (let i = 0; i + 1 < river.course.length; i++) {
        const from = game.regions[river.course[i]!];
        const to = game.regions[river.course[i + 1]!];
        if (!from || !to) breaks.push(`${river.name}: unknown region in course`);
        else if (!from.adjacency.includes(to.id)) breaks.push(`${river.name}: ${from.name} → ${to.name}`);
      }
    }
    expect(breaks).toEqual([]);
  });

  it("ends every course at the sea (or, for the Volkhov, its lake)", () => {
    const inland = RIVERS.filter((river) => {
      const mouth = game.regions[river.course.at(-1)!];
      return mouth?.terrain !== "coast";
    }).map((river) => river.name);
    expect(inland).toEqual(["Volkhov"]); // the Volkhov ends in Lake Ladoga, as it should
  });

  it("keeps courses short enough to read as one river, and named", () => {
    for (const river of RIVERS) {
      expect(river.course.length).toBeGreaterThanOrEqual(2);
      expect(river.course.length).toBeLessThanOrEqual(6);
      expect(river.name.length).toBeGreaterThan(2);
      expect(river.flow).toBeGreaterThan(0);
      expect(river.flow).toBeLessThanOrEqual(1);
    }
  });
});
