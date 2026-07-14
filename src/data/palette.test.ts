import { describe, it, expect } from "vitest";
import { cbSafe, CB_SAFE } from "@/data/palette";

describe("cbSafe", () => {
  it("returns the input unchanged when the option is off", () => {
    expect(cbSafe("#6cae7a", false)).toBe("#6cae7a");
    expect(cbSafe("#unknown", false)).toBe("#unknown");
  });

  it("remaps known nation colours when on", () => {
    expect(cbSafe("#6cae7a", true)).toBe("#009e73"); // green -> bluish green
    expect(cbSafe("#d0796e", true)).toBe("#d55e00"); // red-orange -> vermillion
    expect(cbSafe("#d8a24a", true)).toBe("#e69f00"); // player -> orange
  });

  it("is case-insensitive on the lookup key", () => {
    expect(cbSafe("#6CAE7A", true)).toBe("#009e73");
  });

  it("passes through unknown colours unchanged when on", () => {
    expect(cbSafe("#123456", true)).toBe("#123456");
  });

  it("maps every base colour to a distinct safe colour", () => {
    const safe = Object.values(CB_SAFE);
    expect(new Set(safe).size).toBe(safe.length); // no two nations collide
  });
});
