import { describe, expect, it } from "vitest";
import {
  BADGE_ART,
  BRANCH_ART,
  BUILDING_ART,
  CREST_ART,
  EVENT_VIGNETTE,
  GLYPH_ART,
  MOMENT_ART,
  RESOURCE_ART,
  TERRAIN_ART,
  TERRAIN_MOTIF,
  TITLE_ART,
  TREATY_ART,
  UNIT_ART,
  badgeArt,
  crestSvg,
  safeColor,
  eventVignette,
  ico,
} from "@/data/art";
import { TERRAIN_IDS } from "@/data/terrain";
import { UNITS } from "@/data/units";
import { BUILDINGS } from "@/data/buildings";
import { ACHIEVEMENTS } from "@/data/achievements";
import { CHOICE_EVENT_IDS } from "@/systems/events";

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
    for (const v of Object.values(BADGE_ART)) expectSvgOrNull(v);
    for (const v of Object.values(BRANCH_ART)) expectSvgOrNull(v);
    for (const v of Object.values(TREATY_ART)) expectSvgOrNull(v);
  });

  it("crest templates render self-contained SVG in a concrete colour", () => {
    for (const id of Object.keys(CREST_ART)) {
      const svg = crestSvg(Number(id), "#123456");
      if (svg === null) continue;
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).not.toMatch(/href=|<script/i);
    }
  });

  it("title art is self-contained (48-grid key art)", () => {
    if (TITLE_ART !== null) {
      expect(TITLE_ART.startsWith("<svg")).toBe(true);
      expect(TITLE_ART).not.toMatch(/href=|url\(|<script/i);
    }
  });

  it("gives every choice-bearing event a vignette (derived from events.ts)", () => {
    // Derive the id set from the source of truth so a new decision event that
    // forgets its vignette fails here instead of shipping an art-less modal.
    expect(CHOICE_EVENT_IDS.length).toBeGreaterThan(0);
    for (const id of CHOICE_EVENT_IDS) {
      expect(eventVignette(id), `event "${id}" has no vignette theme`).not.toBeNull();
    }
    expect(eventVignette("unknown_event")).toBeNull();
  });

  it("gives every achievement a badge (derived from achievements.ts)", () => {
    for (const a of ACHIEVEMENTS) {
      expect(badgeArt(a.id), `achievement "${a.id}" has no badge`).not.toBeNull();
    }
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

  it("crestSvg sanitises a hostile colour (no markup break-out — DOM-XSS guard)", () => {
    const hostile = '"><img src=x onerror=alert(1)>';
    for (let id = 0; id <= 6; id++) {
      const svg = crestSvg(id, hostile);
      if (svg === null) continue;
      expect(svg).not.toContain("<img");
      expect(svg).not.toContain("onerror");
    }
  });

  it("safeColor passes valid colours and rejects markup", () => {
    expect(safeColor("#d8a24a")).toBe("#d8a24a");
    expect(safeColor("#fff")).toBe("#fff");
    expect(safeColor("rgb(10, 20, 30)")).toBe("rgb(10, 20, 30)");
    expect(safeColor('"><script>alert(1)</script>')).toBe("#8a8f99");
    expect(safeColor("red; background:url(x)")).toBe("#8a8f99");
    expect(safeColor("javascript:alert(1)")).toBe("#8a8f99");
  });

  it("ico builder emits the shared 24×24 stroke shell", () => {
    expectSvgOrNull(ico('<circle cx="12" cy="12" r="8"/>'));
    expect(ico("", { fill: true })).toContain('fill="currentColor"');
  });
});
