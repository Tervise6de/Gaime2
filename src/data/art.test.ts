import { describe, expect, it } from "vitest";
import {
  BUILDING_ART,
  CREST_ART,
  GLYPH_ART,
  RESOURCE_ART,
  TERRAIN_ART,
  UNIT_ART,
  crestSvg,
  ico,
} from "@/data/art";
import { TERRAIN_IDS } from "@/data/terrain";
import { UNITS } from "@/data/units";
import { BUILDINGS } from "@/data/buildings";

/** Every registry value is either null (fallback) or a self-contained inline SVG. */
function expectSvgOrNull(value: string | null): void {
  if (value === null) return;
  expect(value.startsWith("<svg")).toBe(true);
  expect(value.endsWith("</svg>")).toBe(true);
  expect(value).toContain('viewBox="0 0 24 24"');
  // Self-contained: no external references, no scripting.
  expect(value).not.toMatch(/href=|url\(|<script/i);
}

describe("art registry", () => {
  it("covers every unit and building id, and all terrain", () => {
    for (const id of Object.keys(UNITS)) expect(id in UNIT_ART).toBe(true);
    for (const id of Object.keys(BUILDINGS)) expect(id in BUILDING_ART).toBe(true);
    for (const id of TERRAIN_IDS) expect(id in TERRAIN_ART).toBe(true);
  });

  it("holds only well-formed inline SVG (or null fallback)", () => {
    for (const v of Object.values(RESOURCE_ART)) expectSvgOrNull(v);
    for (const v of Object.values(GLYPH_ART)) expectSvgOrNull(v);
    for (const v of Object.values(UNIT_ART)) expectSvgOrNull(v);
    for (const v of Object.values(BUILDING_ART)) expectSvgOrNull(v);
  });

  it("has a crest slot for the full fixed nation roster (ids 0..6)", () => {
    for (let id = 0; id <= 6; id++) expect(id in CREST_ART).toBe(true);
  });

  it("crestSvg substitutes the display colour and never leaks the token", () => {
    for (let id = 0; id <= 6; id++) {
      const svg = crestSvg(id, "#123456");
      if (svg === null) continue; // fallback swatch
      expect(svg).toContain("#123456");
      expect(svg).not.toContain("__C__");
    }
  });

  it("ico builder emits the shared 24×24 stroke shell", () => {
    expectSvgOrNull(ico('<circle cx="12" cy="12" r="8"/>'));
    expect(ico("", { fill: true })).toContain('fill="currentColor"');
  });
});
