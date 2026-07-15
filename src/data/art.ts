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

/** Open book — shared by the knowledge resource and the `book` glyph. */
const BOOK = ico(
  '<path d="M12 6.3C10.1 4.7 7.2 4.2 4.3 4.5v13.1c2.9-.3 5.8.2 7.7 1.8 1.9-1.6 4.8-2.1 7.7-1.8V4.5c-2.9-.3-5.8.2-7.7 1.8z"/><path d="M12 6.3v13.1"/>',
);

/** Rosette medal — shared by the Records toolbar glyph and achievement badges. */
const MEDAL = ico(
  '<circle cx="12" cy="8.8" r="5.3"/><path d="M9 13.4L7.2 21l4.8-2.3L16.8 21 15 13.4"/>',
);

export const RESOURCE_ART: Record<ResourceArtId, string | null> = {
  // Coin stack — the treasury, not a single coin, so it reads at 14px.
  gold: ico(
    '<ellipse cx="12" cy="7.3" rx="6.9" ry="2.9"/><path d="M5.1 7.3v9.2c0 1.7 3.1 3 6.9 3s6.9-1.3 6.9-3V7.3"/><path d="M5.1 11.9c0 1.7 3.1 3 6.9 3s6.9-1.3 6.9-3"/>',
  ),
  // Wheat stalk: stem + two grain pairs + head.
  food: ico(
    '<path d="M12 21V6.5"/><path d="M12 10.8C9.9 10.8 8.1 9.3 8.1 6.7c2.1 0 3.9 1.5 3.9 4.1z"/><path d="M12 10.8c2.1 0 3.9-1.5 3.9-4.1-2.1 0-3.9 1.5-3.9 4.1z"/><path d="M12 15.4c-2.1 0-3.9-1.5-3.9-4.1 2.1 0 3.9 1.5 3.9 4.1z"/><path d="M12 15.4c2.1 0 3.9-1.5 3.9-4.1-2.1 0-3.9 1.5-3.9 4.1z"/><path d="M12 6.5c-.9-.9-.9-2.4 0-3.3.9.9.9 2.4 0 3.3z"/>',
  ),
  // Pickaxe: broad head arc + handle through the apex.
  materials: ico(
    '<path d="M6 6.8C9.7 3.6 15.6 3.7 19.2 7.4"/><path d="M6 6.8l1.7 1.9M19.2 7.4l-2 1.4"/><path d="M12.5 5.1L5.3 20.2"/>',
  ),
  knowledge: BOOK,
  // Anvil — filled silhouette; strokes vanish at marker size.
  iron: ico(
    '<path d="M3.3 6.2h12.9c2.3 0 4-.7 5.5-2-.3 3.6-2.7 5.9-6.5 6.2v3.4c2 .4 3.3 1.3 3.8 3.1H5.9c.5-1.8 1.8-2.7 3.8-3.1v-3.4C6.6 10.1 4.1 8.7 3.3 6.2z"/>',
    { fill: true },
  ),
  // Horse head — filled silhouette with ear + muzzle.
  horses: ico(
    '<path d="M6.4 20.5c0-4.9 1.6-8.3 4.4-10.2l-1.5-5 2.1 1.4.7-2.2 1.9 3.3c3.5 1.6 5.8 4.9 5.8 8.6v4.1h-3.9c0-2.3-1.1-3.7-3.3-4.2-1.5 1-2.3 2.4-2.3 4.2z"/>',
    { fill: true },
  ),
};

export const GLYPH_ART: Record<GlyphId, string | null> = {
  legend: ico(
    '<circle cx="12" cy="12" r="8.6"/><path d="M9.7 9.7a2.4 2.4 0 113.3 2.2c-.8.3-1 .9-1 1.6v.3"/><circle cx="12" cy="16.7" r=".5" fill="currentColor" stroke="none"/>',
  ),
  help: ico(
    '<path d="M12 3.4a5.6 5.6 0 013.1 10.3c-.7.5-1.1 1.1-1.1 1.8h-4c0-.7-.4-1.3-1.1-1.8A5.6 5.6 0 0112 3.4z"/><path d="M10 18.4h4M10.8 20.9h2.4"/>',
  ),
  tutorial: ico(
    '<path d="M2.8 9.2L12 4.8l9.2 4.4L12 13.6z"/><path d="M6.8 11.5v3.8c0 1.3 2.3 2.4 5.2 2.4s5.2-1.1 5.2-2.4v-3.8"/><path d="M21.2 9.2v4.7"/>',
  ),
  standings: ico('<path d="M6 19.5v-6.3M12 19.5V6.8M18 19.5v-9.4"/><path d="M3.8 19.5h16.4"/>'),
  map: ico(
    '<path d="M3.5 6.2l5.5-2 6 2 5.5-2v13.6l-5.5 2-6-2-5.5 2z"/><path d="M9 4.2v13.6M15 6.2v13.6"/>',
  ),
  records: MEDAL,
  options: ico(
    '<circle cx="12" cy="12" r="6.4"/><circle cx="12" cy="12" r="2.5"/><path d="M12 5.6V3.2M12 20.8v-2.4M18.4 12h2.4M3.2 12h2.4M16.5 7.5l1.7-1.7M5.8 18.2l1.7-1.7M16.5 16.5l1.7 1.7M5.8 5.8l1.7 1.7"/>',
    { sw: 2 },
  ),
  victory: ico(
    '<path d="M7.5 4h9v5.1a4.5 4.5 0 01-9 0z"/><path d="M7.5 5.2H4.5a3.2 3.2 0 003.4 3.4M16.5 5.2h3a3.2 3.2 0 01-3.4 3.4"/><path d="M12 13.6v3.1M9 20h6M10.2 16.7h3.6"/>',
  ),
  star: ico(
    '<path d="M12 3.8l2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.7-5 2.7 1-5.6-4.1-4 5.6-.8z"/>',
  ),
  hourglass: ico(
    '<path d="M6.8 3.5h10.4M6.8 20.5h10.4M8.2 3.5v2.7c0 2.3 1.6 3.7 3.8 5.8 2.2-2.1 3.8-3.5 3.8-5.8V3.5M8.2 20.5v-2.7c0-2.3 1.6-3.7 3.8-5.8 2.2 2.1 3.8 3.5 3.8 5.8v2.7"/>',
  ),
  crown: ico(
    '<path d="M4.2 16.9V9.4l3.9 2.8L12 6l3.9 6.2 3.9-2.8v7.5z"/><rect x="4.2" y="18.6" width="15.6" height="1.9" rx=".95"/>',
    { fill: true },
  ),
  hammer: ico(
    '<path d="M12.2 4.5l3-1.4 5.7 5.7-1.4 3z"/><path d="M13 8.4l-8.5 8.5 2.6 2.6 8.5-8.5"/>',
  ),
  shield: ico(
    '<path d="M12 3.2l6.8 2.4v5.2c0 4.4-2.8 7.6-6.8 9-4-1.4-6.8-4.6-6.8-9V5.6z"/>',
  ),
  attack: ico(
    '<path d="M4.6 4.6l11.2 11.2M19.4 4.6L8.2 15.8"/><path d="M13.9 17.6l3.7-3.7M6.4 13.9l3.7 3.7"/><path d="M5 19l2-2M19 19l-2-2"/>',
  ),
  warning: ico(
    '<path d="M12 4.2L21.2 19H2.8z"/><path d="M12 9.8v4.4"/><circle cx="12" cy="16.5" r=".5" fill="currentColor" stroke="none"/>',
  ),
  lock: ico(
    '<rect x="5.8" y="10.8" width="12.4" height="8.7" rx="1.8"/><path d="M8.6 10.8V7.9a3.4 3.4 0 016.8 0v2.9"/>',
  ),
  flag: ico(
    '<path d="M6 21V3.8"/><path d="M6 4.6c3.6-1.8 7.4 1.8 11 0v8.1c-3.6 1.8-7.4-1.8-11 0"/>',
  ),
  region: ico('<path d="M12 3.4l7.4 4.3v8.6L12 20.6l-7.4-4.3V7.7z"/>'),
  book: BOOK,
  medal: MEDAL,
  sound: ico(
    '<path d="M4.2 9.6v4.8h3.4l4.6 3.9V5.7L7.6 9.6z"/><path d="M15.2 9.2a4 4 0 010 5.6M17.8 6.8a7.6 7.6 0 010 10.4"/>',
  ),
  music: ico(
    '<path d="M9.2 17.6V6l9.6-1.8v11.6"/><circle cx="6.9" cy="17.6" r="2.3"/><circle cx="16.5" cy="15.8" r="2.3"/>',
  ),
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
