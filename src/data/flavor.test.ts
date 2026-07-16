import { describe, expect, it } from "vitest";

import { fill, pickVariant, flavor, WAR_DECLARED } from "@/data/flavor";

describe("fill", () => {
  it("substitutes named placeholders and leaves unknown ones verbatim", () => {
    expect(fill("{a} vs {b}", { a: "Ostmark", b: "Rurik" })).toBe("Ostmark vs Rurik");
    expect(fill("{a} and {c}", { a: "Ostmark" })).toBe("Ostmark and {c}");
  });
});

describe("pickVariant", () => {
  it("is deterministic for the same keys", () => {
    const a = pickVariant(WAR_DECLARED, 5, 1, 2);
    const b = pickVariant(WAR_DECLARED, 5, 1, 2);
    expect(a).toBe(b);
    expect(WAR_DECLARED).toContain(a);
  });

  it("spreads across the table as keys change", () => {
    const seen = new Set<string>();
    for (let turn = 0; turn < 60; turn++) seen.add(pickVariant(WAR_DECLARED, turn, 1, 2));
    // A healthy variety of the table is exercised (not stuck on one line).
    expect(seen.size).toBeGreaterThan(1);
  });

  it("returns empty string for an empty table", () => {
    expect(pickVariant([], 1)).toBe("");
  });
});

describe("flavor", () => {
  it("picks and fills in one step, deterministically", () => {
    const line = flavor(WAR_DECLARED, { a: "Ostmark", b: "Rurik" }, 3, 0, 1);
    expect(line).toContain("Ostmark");
    expect(line).toContain("Rurik");
    expect(line).not.toContain("{"); // every placeholder resolved
    expect(flavor(WAR_DECLARED, { a: "Ostmark", b: "Rurik" }, 3, 0, 1)).toBe(line);
  });
});
