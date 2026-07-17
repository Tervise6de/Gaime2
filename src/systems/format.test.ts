import { describe, expect, it } from "vitest";
import { popCompact, popDisplay } from "@/systems/format";

describe("population display scale", () => {
  it("renders sim units as thousands-separated people", () => {
    expect(popDisplay(4)).toBe("4,000");
    expect(popDisplay(4.3)).toBe("4,300");
    expect(popDisplay(0.25)).toBe("250");
    expect(popDisplay(12.345)).toBe("12,345");
    expect(popDisplay(0)).toBe("0");
  });

  it("compacts for the map chip", () => {
    expect(popCompact(0.3)).toBe("300");
    expect(popCompact(1.24)).toBe("1.2k");
    expect(popCompact(4.32)).toBe("4.3k");
    expect(popCompact(9.96)).toBe("10k"); // rounds up across the one-decimal band
    expect(popCompact(12.4)).toBe("12k");
  });
});
