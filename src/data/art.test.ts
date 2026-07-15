import { describe, expect, it } from "vitest";
import {
  BUILDING_ART,
  CREST_ART,
  EVENT_VIGNETTE,
  GLYPH_ART,
  MOMENT_ART,
  RESOURCE_ART,
  TERRAIN_ART,
  TERRAIN_MOTIF,
  TITLE_ART,
  UNIT_ART,
  crestSvg,
  eventVignette,
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
    for (const v of Object.values(TERRAIN_MOTIF)) expectSvgOrNull(v);
    for (const v of Object.values(MOMENT_ART)) expectSvgOrNull(v);
    for (const v of Object.values(EVENT_VIGNETTE)) expectSvgOrNull(v);
  });

  it("title art is self-contained (48-grid key art)", () => {
    if (TITLE_ART !== null) {
      expect(TITLE_ART.startsWith("<svg")).toBe(true);
      expect(TITLE_ART).not.toMatch(/href=|url\(|<script/i);
    }
  });

  it("maps every choice-bearing event id to a vignette", () => {
    // The decision modal is the vignette's home; these events raise it today.
    for (const id of ["golden_jubilee", "mercenary_offer", "expedition", "envoy_exchange", "grain_aid", "reinforce_walls", "sap_the_walls"]) {
      expect(eventVignette(id), id).not.toBeNull();
    }
    expect(eventVignette("unknown_event")).toBeNull();
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
