/**
 * Art registry — the single lookup for every visual asset (docs/art-plan.md).
 *
 * Every id the game renders (resources, UI glyphs, units, buildings, nation
 * crests, terrain fills) maps here to an inline SVG source string — or `null`,
 * in which case the caller falls back to the original placeholder (emoji /
 * flat colour). The game must always render fine with an all-null registry;
 * dropping art in is editing this table, mirroring the data-driven content
 * philosophy (docs/design.md).
 *
 * Conventions (the committed flat-vector style):
 *  - 24×24 viewBox, stroke-first, `currentColor`, 1.8px stroke, round joins.
 *  - No hue-only distinctions: shape carries meaning (colour-blind safety).
 *  - Plain strings only — this module stays DOM-free and node-testable.
 *  - Canvas consumers substitute `currentColor` for a concrete colour before
 *    rasterising (see the renderer's image cache).
 */

import type { TerrainId } from "@/data/terrain";
import type { UnitType } from "@/data/units";
import type { BuildingId } from "@/data/buildings";

/** Resource ids carrying art: the four stockpiles + the two strategic resources. */
export type ResourceArtId = "gold" | "food" | "materials" | "knowledge" | "iron" | "horses";

/** UI glyph vocabulary — one designed set replacing the emoji grab-bag. */
export type GlyphId =
  | "legend" // ❔ toolbar
  | "help" // 💡
  | "tutorial" // 🎓
  | "standings" // 📊
  | "map" // 🗺
  | "records" // 🏅 toolbar
  | "options" // ⚙
  | "victory" // 🏆
  | "star" // ⭐ / ★ (wonders)
  | "hourglass" // ⏳ (turn deadline)
  | "crown" // 👑 (capitals)
  | "hammer" // 🔨 (construction)
  | "shield" // 🛡 (defence / fortification)
  | "attack" // ⚔ (attack / war)
  | "warning" // ⚠
  | "lock" // 🔒 / 🔐
  | "flag" // ⚑ (garrison)
  | "region" // ⬢ (region count)
  | "book" // 📖 (knowledge / techs)
  | "medal" // 🏅 (achievement badge)
  | "sound" // 🔊
  | "music"; // 🎵

/** Wrap icon path markup in the shared 24×24 stroke-first SVG shell. */
function ico(inner: string, opts: { fill?: boolean; sw?: number } = {}): string {
  const sw = opts.sw ?? 1.8;
  const paint = opts.fill
    ? `fill="currentColor" stroke="none"`
    : `fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${paint} aria-hidden="true">${inner}</svg>`;
}

// ---------------------------------------------------------------------------
// Registries. `null` = no asset yet → caller uses its legacy fallback.
// ---------------------------------------------------------------------------

export const RESOURCE_ART: Record<ResourceArtId, string | null> = {
  gold: null,
  food: null,
  materials: null,
  knowledge: null,
  iron: null,
  horses: null,
};

export const GLYPH_ART: Record<GlyphId, string | null> = {
  legend: null,
  help: null,
  tutorial: null,
  standings: null,
  map: null,
  records: null,
  options: null,
  victory: null,
  star: null,
  hourglass: null,
  crown: null,
  hammer: null,
  shield: null,
  attack: null,
  warning: null,
  lock: null,
  flag: null,
  region: null,
  book: null,
  medal: null,
  sound: null,
  music: null,
};

export const UNIT_ART: Record<UnitType, string | null> = {
  militia: null,
  infantry: null,
  ranged: null,
  cavalry: null,
  siege: null,
};

export const BUILDING_ART: Record<BuildingId, string | null> = {
  farm: null,
  workshop: null,
  market: null,
  harbor: null,
  mine: null,
  library: null,
  temple: null,
  aqueduct: null,
  university: null,
  bank: null,
  guildhall: null,
  forum: null,
  fortress: null,
  wonder: null,
};

// ---------------------------------------------------------------------------
// Nation crests. Keyed by nation id (fixed roster: 0 player, 1 barbarians,
// 2..6 the RIVAL_NAMES order in systems/turn.ts). Templates carry the
// `__C__` token where the nation's display colour goes — pass the *resolved*
// colour (after `cbSafe`) so crests follow the colour-blind palette exactly
// like map ownership does. Sigils are white-on-colour so shape distinguishes
// factions even under palette remaps.
// ---------------------------------------------------------------------------

export const CREST_ART: Record<number, string | null> = {
  0: null, // Your Realm — crown
  1: null, // Free Peoples (barbarians) — crossed axes
  2: null, // Valdheim — mountain peaks
  3: null, // Suzerain of Kael — crescent moon
  4: null, // Sundered League — broken ring
  5: null, // Emberhold — flame
  6: null, // Korrath Hegemony — tower
};

/** Resolve a nation's crest SVG in its display colour, or null (fallback: colour swatch). */
export function crestSvg(nationId: number, color: string): string | null {
  const tpl = CREST_ART[nationId];
  return tpl ? tpl.replaceAll("__C__", color) : null;
}

// ---------------------------------------------------------------------------
// Terrain treatment. `null` = the flat `TERRAIN[id].color` fill. When set,
// the renderer shades node discs / Voronoi cells from `hi` (lit, top-left)
// through the terrain base colour to `lo` (shadow). Pure colour data — the
// gradient itself is drawn by the renderer.
// ---------------------------------------------------------------------------

export interface TerrainShade {
  hi: string;
  lo: string;
}

export const TERRAIN_ART: Record<TerrainId, TerrainShade | null> = {
  plains: null,
  forest: null,
  hills: null,
  mountains: null,
  coast: null,
};

/** World background vignette (`null` = flat renderer BACKGROUND). */
export const WORLD_BG: { inner: string; outer: string } | null = null;

// `ico` is exported for the phases that fill these tables in (and for tests);
// keeping the builder beside the data keeps every icon on the shared grid.
export { ico };
