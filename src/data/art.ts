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

/** Resource ids carrying art: stockpiles, HUD metrics, and strategic resources. */
export type ResourceArtId = "gold" | "food" | "materials" | "knowledge" | "stability" | "iron" | "horses" | "salt" | "amber";

/** UI glyph vocabulary — one designed set replacing the emoji grab-bag. */
export type GlyphId =
  | "legend" // ❔ toolbar
  | "help" // 💡
  | "tutorial" // 🎓
  | "standings" // 📊
  | "map" // 🗺
  | "records" // 🏅 toolbar
  | "fullscreen" // browser fullscreen
  | "options" // ⚙
  | "victory" // 🏆
  | "star"
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
  // Explicit width/height (not just viewBox): some engines rasterise an
  // intrinsically-unsized SVG to a *blank* canvas, and drawImage would then
  // cache that blank as "ready" and suppress the emoji fallback.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ${paint} aria-hidden="true">${inner}</svg>`;
}

// ---------------------------------------------------------------------------
// Registries. `null` = no asset yet → caller uses its legacy fallback.
// ---------------------------------------------------------------------------

/** Open book — shared by the knowledge resource and the `book` glyph. */
const BOOK = ico(
  '<path d="M12 6.3C10.1 4.7 7.2 4.2 4.3 4.5v13.1c2.9-.3 5.8.2 7.7 1.8 1.9-1.6 4.8-2.1 7.7-1.8V4.5c-2.9-.3-5.8.2-7.7 1.8z"/><path d="M12 6.3v13.1"/>',
  { sw: 1.95 },
);

/** Rosette medal — shared by the Records toolbar glyph and achievement badges. */
const MEDAL = ico(
  '<circle cx="12" cy="8.8" r="5.3"/><path d="M9 13.4L7.2 21l4.8-2.3L16.8 21 15 13.4"/>',
);

export const RESOURCE_ART: Record<ResourceArtId, string | null> = {
  // Coin stack — the treasury, not a single coin, so it reads at 14px.
  gold: ico(
    '<ellipse cx="12" cy="7.3" rx="6.9" ry="2.9"/><path d="M5.1 7.3v9.2c0 1.7 3.1 3 6.9 3s6.9-1.3 6.9-3V7.3"/><path d="M5.1 11.9c0 1.7 3.1 3 6.9 3s6.9-1.3 6.9-3"/>',
    { sw: 2 },
  ),
  // Wheat stalk: stem + two grain pairs + head.
  food: ico(
    '<path d="M12 21V6.5"/><path d="M12 10.8C9.9 10.8 8.1 9.3 8.1 6.7c2.1 0 3.9 1.5 3.9 4.1z"/><path d="M12 10.8c2.1 0 3.9-1.5 3.9-4.1-2.1 0-3.9 1.5-3.9 4.1z"/><path d="M12 15.4c-2.1 0-3.9-1.5-3.9-4.1 2.1 0 3.9 1.5 3.9 4.1z"/><path d="M12 15.4c2.1 0 3.9-1.5 3.9-4.1-2.1 0-3.9 1.5-3.9 4.1z"/><path d="M12 6.5c-.9-.9-.9-2.4 0-3.3.9.9.9 2.4 0 3.3z"/>',
    { sw: 2 },
  ),
  // Pickaxe: broad head arc + handle through the apex.
  materials: ico(
    '<path d="M6 6.8C9.7 3.6 15.6 3.7 19.2 7.4"/><path d="M6 6.8l1.7 1.9M19.2 7.4l-2 1.4"/><path d="M12.5 5.1L5.3 20.2"/>',
    { sw: 2 },
  ),
  knowledge: BOOK,
  stability: ico(
    '<path d="M12 5.4v12.3M8.4 17.7h7.2"/><path d="M5.8 8.1h12.4"/><path d="M6.1 8.1l-2.1 5a2.8 2.8 0 005.6 0zM17.9 8.1l-2.1 5a2.8 2.8 0 005.6 0z"/>',
    { sw: 2 },
  ),
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
  // Salt — a heaped mound of the "white gold".
  salt: ico(
    '<path d="M3.4 19.6c1.4-6.4 4.6-10 8.6-10s7.2 3.6 8.6 10z"/>',
    { fill: true },
  ),
  // Amber — a faceted teardrop gem.
  amber: ico(
    '<path d="M12 3.6l5 5.1-5 11.7-5-11.7z"/>',
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
  fullscreen: ico(
    '<path d="M8 4H4v4"/><path d="M4 4l5.5 5.5"/><path d="M16 4h4v4"/><path d="M20 4l-5.5 5.5"/><path d="M8 20H4v-4"/><path d="M4 20l5.5-5.5"/><path d="M16 20h4v-4"/><path d="M20 20l-5.5-5.5"/>',
  ),
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
  // Pitchfork — the farm levy.
  militia: ico(
    '<path d="M12 21.2v-7.9"/><path d="M8.2 4.2v4.6a3.8 3.8 0 007.6 0V4.2"/><path d="M12 4.2v9.1"/>',
  ),
  // Upright sword — the professional line.
  infantry: ico(
    '<path d="M12 3.2v10.6M8.6 8.4h6.8M12 13.8v4.4M10.4 20.4h3.2"/><path d="M12 3.2l-1.2 2h2.4z" fill="currentColor" stroke="none"/>',
  ),
  // Drawn bow with a nocked arrow.
  ranged: ico(
    '<path d="M8.2 3.9c5.3 3.2 5.3 13 0 16.2"/><path d="M8.2 3.9v16.2"/><path d="M8.2 12h10.7M18.9 12l-2.8-1.7M18.9 12l-2.8 1.7"/>',
  ),
  // Horse head + couched lance.
  cavalry:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M6.2 20.5c0-4.4 1.4-7.5 4-9.2L8.9 6.8l1.9 1.2.6-2 1.7 3c3.1 1.5 5.2 4.4 5.2 7.7v3.8h-3.5c0-2.1-1-3.3-3-3.8-1.3.9-2 2.1-2 3.8z" fill="currentColor"/>' +
    '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M15 9l5-5M20 4h-2.7M20 4v2.7"/></g>' +
    "</svg>",
  // Catapult: frame, wheels, throwing arm.
  siege: ico(
    '<circle cx="7.8" cy="17.6" r="2.1"/><circle cx="15.4" cy="17.6" r="2.1"/><path d="M4.6 15.4h14.2"/><path d="M7.4 14.6l9-9M16.4 5.6l3.5-.6-.8 3.4z"/>',
  ),
  // Long pike with a leaf blade — the anti-cavalry wall.
  pikeman: ico(
    '<path d="M12 21.2V4.4"/><path d="M12 3.2l-1.5 2.6h3z" fill="currentColor" stroke="none"/><path d="M9.4 9.6h5.2"/>',
  ),
  // Hand-cannon on a stock — early firearms.
  handgunner: ico(
    '<path d="M4.4 13l9.6-1.7.5 2.7-9.6 1.7z"/><path d="M14 11.1l4.6-.8.5 2.7-4.6.8z"/><path d="M6.3 15l1.8 3.4"/><path d="M18.6 10.3l1.4-.3"/>',
  ),
  // Crossed swords — the elite men-at-arms.
  swordsman: ico(
    '<path d="M5 18.6L16.5 6M19 18.6L7.5 6"/><path d="M15.2 5.4l2.6-.9-.6 2.7zM8.8 5.4L6.2 4.5l.6 2.7z" fill="currentColor" stroke="none"/><path d="M4 17.6l2.4 2.4M20 17.6l-2.4 2.4"/>',
  ),
  // A great helm — the mailed knight.
  knight: ico(
    '<path d="M7.5 8.5a4.5 4.5 0 019 0v8a1.6 1.6 0 01-1.6 1.6H9.1A1.6 1.6 0 017.5 16.5z"/><path d="M7.6 12.1h8.8"/><path d="M12 13.7v3.4"/>',
  ),
};

export const BUILDING_ART: Record<BuildingId, string | null> = {
  // Barn with a door.
  farm: ico(
    '<path d="M4.5 19.5v-8.5L12 5.3l7.5 5.7v8.5z"/><path d="M9.8 19.5v-5.3h4.4v5.3"/><path d="M3.4 19.5h17.2"/>',
  ),
  // Roofed shed with a hammer at work.
  workshop: ico(
    '<path d="M4 10.6L12 4.6l8 6"/><path d="M5.6 10.6v8.9M18.4 10.6v8.9M3.4 19.5h17.2"/><path d="M9.4 16.8l3.2-3.2M12 12l2.3 2.3 1.5-1.5L13.5 10.5z"/>',
  ),
  // Scalloped market awning over a stall.
  market: ico(
    '<path d="M4.1 4.5h15.8l1.3 3.3a2.65 2.65 0 01-5.3.2 2.65 2.65 0 01-5.3 0 2.65 2.65 0 01-5.3-.2z"/><path d="M5.6 10.8v8.7h12.8v-8.7"/><path d="M10 19.5v-4.8h4v4.8"/>',
  ),
  // Anchor.
  harbor: ico(
    '<circle cx="12" cy="5.2" r="1.9"/><path d="M12 7.1v12.4"/><path d="M12 19.5c-4.3 0-7.2-2.4-7.8-5.7l2.6 1.1M12 19.5c4.3 0 7.2-2.4 7.8-5.7l-2.6 1.1"/><path d="M8.9 10h6.2"/>',
  ),
  // Mine tunnel.
  mine: ico(
    '<path d="M4.2 19.5v-6.1a7.8 7.8 0 0115.6 0v6.1"/><path d="M9.3 19.5v-4a2.7 2.7 0 015.4 0v4"/><path d="M3 19.5h18"/>',
  ),
  // Bookshelf.
  library: ico(
    '<rect x="5" y="4" width="14" height="15.5" rx="1.2"/><path d="M5 9.7h14M5 14.6h14"/><path d="M8.4 4.6v4M11.4 5.4v3.2M15.6 10.4v3.6M9.2 15.3v3.5"/>',
  ),
  // Pediment on columns.
  temple: ico(
    '<path d="M3.9 8.6L12 3.9l8.1 4.7z"/><path d="M5.8 8.6v7.6M12 8.6v7.6M18.2 8.6v7.6"/><path d="M4.4 16.2h15.2M3.2 19.5h17.6"/>',
  ),
  // Arched water bridge.
  aqueduct: ico(
    '<path d="M3.4 5.4h17.2M4.6 5.4v2.4M19.4 5.4v2.4M3.4 7.8h17.2"/><path d="M5.2 19.5v-8.1a3.2 3.2 0 016.4 0v8.1M12.4 19.5v-8.1a3.2 3.2 0 016.4 0v8.1"/><path d="M3 19.5h18"/>',
  ),
  // Domed hall.
  university: ico(
    '<path d="M6.4 9.6a5.6 5.6 0 0111.2 0z"/><path d="M12 2.8v1.4M4.9 9.6h14.2"/><path d="M6.6 12.4v7.1M12 12.4v7.1M17.4 12.4v7.1M4.6 12.4h14.8M3.4 19.5h17.2"/>',
  ),
  // Vault chest.
  bank: ico(
    '<rect x="4.5" y="7" width="15" height="12.5" rx="1.6"/><path d="M4.5 11.2h15"/><circle cx="12" cy="15.2" r="1.8"/><path d="M12 13.4v-2.2"/>',
  ),
  // Hall flying the guild shield.
  guildhall: ico(
    '<path d="M4.9 19.5V9.2L12 4.6l7.1 4.6v10.3z"/><path d="M12 10.3l2.7 1v2c0 1.8-1.1 3.1-2.7 3.6-1.6-.5-2.7-1.8-2.7-3.6v-2z"/><path d="M3.4 19.5h17.2"/>',
  ),
  // Tiered amphitheatre.
  forum: ico(
    '<path d="M4 18.5a8 8 0 0116 0"/><path d="M6.7 18.5a5.3 5.3 0 0110.6 0M9.4 18.5a2.6 2.6 0 015.2 0"/><path d="M3 18.5h18"/>',
  ),
  // Crenellated keep.
  fortress: ico(
    '<path d="M6.4 19.5V8h2.1V6.1h2.2V8h2.6V6.1h2.2V8h2.1v11.5z"/><path d="M10.4 19.5v-3.7h3.2v3.7"/><path d="M4.6 19.5h14.8"/>',
  ),
  // Barn with a grain silo (reuses the farm read).
  granary: ico(
    '<path d="M4.5 19.5v-8.5L12 5.3l7.5 5.7v8.5z"/><path d="M9.8 19.5v-5.3h4.4v5.3"/><path d="M3.4 19.5h17.2"/>',
  ),
  // Crenellated keep — a martial muster.
  barracks: ico(
    '<path d="M6.4 19.5V8h2.1V6.1h2.2V8h2.6V6.1h2.2V8h2.1v11.5z"/><path d="M10.4 19.5v-3.7h3.2v3.7"/><path d="M4.6 19.5h14.8"/>',
  ),
  // Anchor + light (reuses the harbor read).
  lighthouse: ico(
    '<circle cx="12" cy="5.2" r="1.9"/><path d="M12 7.1v12.4"/><path d="M12 19.5c-4.3 0-7.2-2.4-7.8-5.7l2.6 1.1M12 19.5c4.3 0 7.2-2.4 7.8-5.7l-2.6 1.1"/><path d="M8.9 10h6.2"/>',
  ),
  // Pediment on columns (reuses the temple read).
  monastery: ico(
    '<path d="M3.9 8.6L12 3.9l8.1 4.7z"/><path d="M5.8 8.6v7.6M12 8.6v7.6M18.2 8.6v7.6"/><path d="M4.4 16.2h15.2M3.2 19.5h17.6"/>',
  ),
  // Watch keep.
  watchtower: ico(
    '<path d="M6.4 19.5V8h2.1V6.1h2.2V8h2.6V6.1h2.2V8h2.1v11.5z"/><path d="M10.4 19.5v-3.7h3.2v3.7"/><path d="M4.6 19.5h14.8"/>',
  ),
  // Tiered civic hall (reuses the forum read).
  courthouse: ico(
    '<path d="M4 18.5a8 8 0 0116 0"/><path d="M6.7 18.5a5.3 5.3 0 0110.6 0M9.4 18.5a2.6 2.6 0 015.2 0"/><path d="M3 18.5h18"/>',
  ),
  // Bookshelf (reuses the library read).
  printing_house: ico(
    '<rect x="5" y="4" width="14" height="15.5" rx="1.2"/><path d="M5 9.7h14M5 14.6h14"/><path d="M8.4 4.6v4M11.4 5.4v3.2M15.6 10.4v3.6M9.2 15.3v3.5"/>',
  ),
  // Pediment with a cross (temple read).
  cathedral: ico(
    '<path d="M3.9 8.6L12 3.9l8.1 4.7z"/><path d="M5.8 8.6v7.6M12 8.6v7.6M18.2 8.6v7.6"/><path d="M4.4 16.2h15.2M3.2 19.5h17.6"/><path d="M12 2v3M10.6 3.3h2.8"/>',
  ),
  // Stable — a barn for horse country (reuses the farm barn read).
  stable: ico(
    '<path d="M4.5 19.5v-8.5L12 5.3l7.5 5.7v8.5z"/><path d="M9.8 19.5v-5.3h4.4v5.3"/><path d="M3.4 19.5h17.2"/>',
  ),
  // Bloomery — a smelting-furnace arch (reuses the mine/furnace read).
  bloomery: ico(
    '<path d="M4.2 19.5v-6.1a7.8 7.8 0 0115.6 0v6.1"/><path d="M9.3 19.5v-4a2.7 2.7 0 015.4 0v4"/><path d="M3 19.5h18"/>',
  ),
  // Manor hall (reuses the guildhall read).
  manor: ico(
    '<path d="M4.9 19.5V9.2L12 4.6l7.1 4.6v10.3z"/><path d="M12 10.3l2.7 1v2c0 1.8-1.1 3.1-2.7 3.6-1.6-.5-2.7-1.8-2.7-3.6v-2z"/><path d="M3.4 19.5h17.2"/>',
  ),
  // Great market awning (reuses the market read).
  charter_fair: ico(
    '<path d="M4.1 4.5h15.8l1.3 3.3a2.65 2.65 0 01-5.3.2 2.65 2.65 0 01-5.3 0 2.65 2.65 0 01-5.3-.2z"/><path d="M5.6 10.8v8.7h12.8v-8.7"/><path d="M10 19.5v-4.8h4v4.8"/>',
  ),
  // Forge shed with a hammer (reuses the workshop read).
  foundry: ico(
    '<path d="M4 10.6L12 4.6l8 6"/><path d="M5.6 10.6v8.9M18.4 10.6v8.9M3.4 19.5h17.2"/><path d="M9.4 16.8l3.2-3.2M12 12l2.3 2.3 1.5-1.5L13.5 10.5z"/>',
  ),
  // Domed hall of learning (reuses the university read).
  athenaeum: ico(
    '<path d="M6.4 9.6a5.6 5.6 0 0111.2 0z"/><path d="M12 2.8v1.4M4.9 9.6h14.2"/><path d="M6.6 12.4v7.1M12 12.4v7.1M17.4 12.4v7.1M4.6 12.4h14.8M3.4 19.5h17.2"/>',
  ),
  // Great crenellated stronghold (reuses the fortress read).
  citadel: ico(
    '<path d="M6.4 19.5V8h2.1V6.1h2.2V8h2.6V6.1h2.2V8h2.1v11.5z"/><path d="M10.4 19.5v-3.7h3.2v3.7"/><path d="M4.6 19.5h14.8"/>',
  ),
  // Salt warehouse — a gabled Speicher store (reuses the granary barn read).
  salzspeicher: ico(
    '<path d="M4.5 19.5v-8.5L12 5.3l7.5 5.7v8.5z"/><path d="M9.8 19.5v-5.3h4.4v5.3"/><path d="M3.4 19.5h17.2"/>',
  ),
  // Export brewery — a roofed manufacturing shed (reuses the workshop read).
  brewery: ico(
    '<path d="M4 10.6L12 4.6l8 6"/><path d="M5.6 10.6v8.9M18.4 10.6v8.9M3.4 19.5h17.2"/><path d="M9.4 16.8l3.2-3.2M12 12l2.3 2.3 1.5-1.5L13.5 10.5z"/>',
  ),
  // Weaving loom — an upright frame strung with warp threads.
  weaving_works: ico(
    '<path d="M4.5 4.5h15v15h-15z"/><path d="M8 4.5v15M12 4.5v15M16 4.5v15"/><path d="M4.5 9.5h15M4.5 14.5h15"/>',
  ),
  // Stecknitz canal — an arched waterway (reuses the aqueduct read).
  canal: ico(
    '<path d="M3.4 5.4h17.2M4.6 5.4v2.4M19.4 5.4v2.4M3.4 7.8h17.2"/><path d="M5.2 19.5v-8.1a3.2 3.2 0 016.4 0v8.1M12.4 19.5v-8.1a3.2 3.2 0 016.4 0v8.1"/><path d="M3 19.5h18"/>',
  ),
  // Roland statue — a civic-freedom monument.
  roland: ico(
    '<path d="M10.8 14.3L12 4.6l1.2 9.7z"/><path d="M9.2 16.9h5.6M8 19.5h8"/><path d="M5.3 7.8c-.6 3.6.3 6.7 2.4 9.3M18.7 7.8c.6 3.6-.3 6.7-2.4 9.3"/><path d="M5.3 7.8l1.9.5M18.7 7.8l-1.9.5"/>',
  ),
  // Hanse Hall — a gabled Brick-Gothic merchant hall (facade + peaked roof + door).
  hanse_hall: ico(
    '<path d="M12 4.4L4.6 9v11h14.8V9z"/><path d="M4.6 9L12 4.4 19.4 9"/><path d="M9.7 20v-5.1h4.6V20"/><path d="M7.7 11.6h2.1M14.2 11.6h2.1"/>',
  ),
};

// ---------------------------------------------------------------------------
// Nation crests. Named entries cover the Hansa factions used by the map.
// Numeric entries are fallback slots for the player/free towns and legacy
// saves. Templates carry the
// `__C__` token where the nation's display colour goes — pass the *resolved*
// colour (after `cbSafe`) so crests follow the colour-blind palette exactly
// like map ownership does. Sigils are white-on-colour so shape distinguishes
// factions even under palette remaps.
// ---------------------------------------------------------------------------

/**
 * Shared shield template. The field is the nation colour (`__C__`); over it a
 * lit "chief" band and a shadow at the point give the enamelled, domed look of a
 * struck badge, and a dark rim + fine gilt inner line frame it (the rim keeps it
 * legible over the map at ~17px; the gilt ties it to the HUD's gold). The sigil
 * is drawn off-white on top so shape distinguishes factions under palette remaps.
 */
const CREST_SHIELD = "M12 2.6l8 2.8v6.1c0 4.9-3.2 8.6-8 9.9-4.8-1.3-8-5-8-9.9V5.4z";
function crest(sigil: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">' +
    `<path d="${CREST_SHIELD}" fill="__C__"/>` +
    // Lit band across the top plus a brighter strip at the very edge → a glossy,
    // graded sheen so the enamel clearly catches light.
    '<path d="M12 3.6L19 6v3.5C16.7 10.6 14.4 11.1 12 11.1S7.3 10.6 5 9.5V6z" fill="#ffffff" opacity="0.22"/>' +
    '<path d="M12 3.6L19 6v1.5C16.4 8.3 14.2 8.8 12 8.8S7.6 8.3 5 7.5V6z" fill="#ffffff" opacity="0.16"/>' +
    // Shadow gathering toward the point.
    '<path d="M5.4 12.6C7 16.2 9.4 18.6 12 19.8c2.6-1.2 5-3.6 6.6-7.2-1.6 2-4 3.6-6.6 4.4-2.6-.8-5-2.4-6.6-4.4z" fill="#000000" opacity="0.22"/>' +
    // Dark rim (map contrast) then a fine gilt inner line.
    `<path d="${CREST_SHIELD}" fill="none" stroke="rgba(8,10,14,0.62)" stroke-width="1.3" stroke-linejoin="round"/>` +
    `<path d="${CREST_SHIELD}" fill="none" stroke="rgba(248,229,176,0.62)" stroke-width="0.65" stroke-linejoin="round"/>` +
    `<g fill="none" stroke="#f7f4ea" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${sigil}</g>` +
    "</svg>"
  );
}

export const CREST_ART: Record<number, string | null> = {
  // Your Realm — crown (the brand mark).
  0: crest('<path d="M7.6 14.2v-4.4l2.4 1.8 2-3.4 2 3.4 2.4-1.8v4.4z" fill="#f7f4ea" stroke="none"/>'),
  // Free Peoples (barbarians) — crossed axes.
  1: crest(
    '<path d="M9 8.2l6.4 7M15 8.2l-6.4 7"/><path d="M9.8 7.4c-1.2.3-2 .8-2.6 1.7M14.2 7.4c1.2.3 2 .8 2.6 1.7"/>',
  ),
  2: null,
  3: null,
  4: null,
  5: null,
  6: null,
};

export const FACTION_CREST_ART: Record<string, string | null> = {
  "Lübeck": crest('<path d="M7.2 15.8V9.4L12 6l4.8 3.4v6.4"/><path d="M9 15.8v-3.1h6v3.1"/><path d="M8.4 9.4h7.2"/><path d="M12 6V4.4"/>'),
  // St George's cross — the recognisable English mark (was an eagle-like shape
  // near-identical to Poland's).
  England: crest('<path d="M10.6 5.4h2.8v3.8h3.8v2.8h-3.8v3.8h-2.8v-3.8H6.8v-2.8h3.8z" fill="#f7f4ea" stroke="none"/>'),
  Flanders: crest('<path d="M7.1 15.4l4.9-8.7 4.9 8.7"/><path d="M8.7 12.4h6.6"/><path d="M7.4 8.4c3.1 1.4 6.1 1.4 9.2 0"/>'),
  Saxony: crest('<path d="M7.1 15.6l9.8-9.8M7.1 5.8l9.8 9.8"/><path d="M9.1 7.8l-1.7-1.7M14.9 13.6l1.7 1.7"/>'),
  Cologne: crest('<path d="M8.1 16.1V9.3L12 6.2l3.9 3.1v6.8"/><path d="M10 16.1v-4h4v4"/><path d="M8.1 9.3h7.8"/><path d="M12 6.2V4.1M10.8 5.1h2.4"/>'),
  Denmark: crest('<path d="M7.6 14.2v-4.4l2.4 1.8 2-3.4 2 3.4 2.4-1.8v4.4z" fill="#f7f4ea" stroke="none"/><path d="M8 16.3h8"/>'),
  Norway: crest('<path d="M6.9 15.1l3-5.2 1.9 3.1 2.1-4.3 3.2 6.4z"/><path d="M7 16.6h10"/>'),
  // Tre Kronor — three crowns, 2 over 1 (was three dots + bars).
  Sweden: crest('<path d="M7.3 9.3v-2.3l.85.8.85-1.4.85 1.4.85-.8v2.3z" fill="#f7f4ea" stroke="none"/><path d="M13.3 9.3v-2.3l.85.8.85-1.4.85 1.4.85-.8v2.3z" fill="#f7f4ea" stroke="none"/><path d="M10.3 14.8v-2.3l.85.8.85-1.4.85 1.4.85-.8v2.3z" fill="#f7f4ea" stroke="none"/>'),
  Gotland: crest('<path d="M7.1 13.8c2.8 1.6 6.9 1.6 9.8 0"/><path d="M9 12.9l2.4-4.3 2.4 4.3"/><path d="M8.7 8.6h5.8"/>'),
  Finland: crest('<path d="M12 6v10.2"/><path d="M7.5 14.8h9"/><path d="M8.4 10.6h7.2"/><path d="M12 6l-1.8 2.2M12 6l1.8 2.2"/>'),
  Estonia: crest('<path d="M7.2 9.2h9.6M7.2 12h9.6M7.2 14.8h9.6"/><path d="M8.5 16.8h7"/>'),
  Livonia: crest('<path d="M12 6v10.6"/><path d="M8 9.6h8"/><path d="M9.7 14.7h4.6"/>'),
  // Double cross of the Jagiellons — the Lithuanian mark (was a bare diagonal).
  Lithuania: crest('<path d="M12 5.6v11.2M8.6 9.2h6.8M9.7 12.6h4.6"/>'),
  Novgorod: crest('<path d="M8 15.8V8.4h8v7.4"/><path d="M8 8.4l4-2.4 4 2.4"/><path d="M10 11.2h4M10 13.6h4"/>'),
  Prussia: crest('<path d="M12 5.8v10.4"/><path d="M7.2 10h9.6"/><path d="M9.1 7.4l2.9 2.6 2.9-2.6"/><path d="M9.1 14.6l2.9-2.6 2.9 2.6"/>'),
  // White Eagle — head, raised spread wings and a fanned tail (was near-
  // identical to England's old mark).
  Poland: crest('<circle cx="12" cy="6" r="1"/><path d="M12 7v6.6"/><path d="M12 8.6C9.7 7.6 7.2 6.6 5.2 6.6c.9 1 1.4 2.1 1.6 3.4M12 8.6c2.3-1 4.8-2 6.8-2-.9 1-1.4 2.1-1.6 3.4"/><path d="M9.8 13.6l2.2 3 2.2-3z"/>'),
  Curonia: crest('<path d="M7.5 14.6l4.5-8.3 4.5 8.3"/><path d="M9 12.8c2 .7 4 .7 6 0"/><path d="M7.4 16.3h9.2"/>'),
  Samogitia: crest('<path d="M8.1 15.9c.9-4.1 2.2-6.9 3.9-8.4 1.7 1.5 3 4.3 3.9 8.4"/><path d="M9.8 11.2h4.4"/><path d="M9.1 14h5.8"/>'),
};

/**
 * A CSS colour safe to substitute into SVG/HTML markup. Nation colours can come
 * from an imported save, and the crest is injected via `innerHTML`, so an
 * unchecked value like `"><img onerror=…>` would be a DOM-XSS. Accept only hex
 * or rgb()/rgba() tokens; anything else falls back to a neutral grey.
 */
export function safeColor(color: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(color) || /^rgba?\([\d.,%\s/]+\)$/.test(color)
    ? color
    : "#8a8f99";
}

/** Resolve a faction crest SVG in its display colour, or null when none is registered. */
export function factionCrestSvg(factionName: string | null | undefined, color: string): string | null {
  const tpl = factionName ? FACTION_CREST_ART[factionName] : null;
  return tpl ? tpl.replaceAll("__C__", safeColor(color)) : null;
}

/** Resolve a nation's crest SVG in its display colour, or null (fallback: colour swatch). */
export function crestSvg(nationId: number, color: string, factionName?: string | null): string | null {
  const named = factionCrestSvg(factionName, color);
  if (named) return named;
  const tpl = CREST_ART[nationId];
  return tpl ? tpl.replaceAll("__C__", safeColor(color)) : null;
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

// Parchment / vintage-cartography shading: each pair stays within its terrain's
// aged-paper tint (lit centre → base → faintly deeper rim), so cells gain gentle
// volume without leaving the cream/tan/sage family. These dominate the fill, so
// they must move together with TERRAIN[id].color (data/terrain.ts).
export const TERRAIN_ART: Record<TerrainId, TerrainShade | null> = {
  plains: { hi: "#f1e6c4", lo: "#d0bd8f" },
  forest: { hi: "#bccaa0", lo: "#869a68" },
  hills: { hi: "#e2cda2", lo: "#b69a6b" },
  mountains: { hi: "#c8bfad", lo: "#948977" },
  coast: { hi: "#dee0be", lo: "#b4bd8f" },
};

/**
 * Terrain motifs — tiny emblems the Voronoi view stamps faintly inside each
 * cell so terrain reads by shape as well as colour (colour-blind safety at the
 * map level). `null` = no stamp. Node view skips them (discs carry the
 * population count).
 */
export const TERRAIN_MOTIF: Record<TerrainId, string | null> = {
  plains: ico(
    '<path d="M12 18.5V8.5"/><path d="M12 12.5c-2 0-3.6-1.4-3.6-3.6 2 0 3.6 1.4 3.6 3.6z"/><path d="M12 12.5c2 0 3.6-1.4 3.6-3.6-2 0-3.6 1.4-3.6 3.6z"/>',
    { sw: 2 },
  ),
  forest: ico(
    '<path d="M12 4.8l4.4 6.4h-2.4l3 5.3H7l3-5.3H7.6z"/><path d="M12 16.5v3"/>',
    { sw: 2 },
  ),
  hills: ico('<path d="M3.8 16.5a5.6 5.6 0 0111.2 0"/><path d="M11 16.5a4.6 4.6 0 019.2 0"/>', { sw: 2 }),
  mountains: ico('<path d="M4 17l4.6-8.2 3 5.1 2.4-4.4L20 17z"/>', { sw: 2 }),
  coast: ico(
    '<path d="M4 11.5c2.6-2 5.4-2 8 0s5.4 2 8 0M4 16c2.6-2 5.4-2 8 0s5.4 2 8 0"/>',
    { sw: 2 },
  ),
};

// ---------------------------------------------------------------------------
// Moment art — larger "key art" medallions (docs/art-style.md family rules
// apply; drawn on the same 24 grid, displayed at 56–140px). A medallion is a
// ring + motif so every moment reads as a struck seal/coin.
// ---------------------------------------------------------------------------

/** Ring medallion shell around a motif (stroke-first, currentColor). */
function medallion(inner: string): string {
  return ico(`<circle cx="12" cy="12" r="10.2"/>${inner}`, { sw: 1.2 });
}

/** End-of-game cards. Victory is laurelled gold; defeat a toppled crown. */
export const MOMENT_ART: Record<"victory" | "defeat", string | null> = {
  victory: medallion(
    '<path d="M8.9 6.8h6.2v3.4a3.1 3.1 0 01-6.2 0z"/><path d="M8.9 7.6H7a2.2 2.2 0 002.3 2.3M15.1 7.6H17a2.2 2.2 0 01-2.3 2.3"/><path d="M12 13.3v2M10 17.4h4M10.9 15.3h2.2"/>' +
      '<path d="M5.2 8.6c-.5 3 .2 5.6 2 7.8M18.8 8.6c.5 3-.2 5.6-2 7.8"/><path d="M5.2 8.6l1.5.4M18.8 8.6l-1.5.4"/>',
  ),
  defeat: medallion(
    '<path d="M7.4 14.9l.9-5.3 2.4 1.5 1.5-3 1.9 2.6 2.5-1.1-1.5 5.3z" transform="rotate(14 12 12)"/><path d="M8.1 17.3l7.6-1.4" transform="rotate(14 12 12)"/>',
  ),
};

/**
 * Reusable event vignettes, keyed by theme. `eventVignette` maps a concrete
 * event id (systems/events.ts) to its theme so new events inherit art by
 * category — adding an event means one line in the map, not new art.
 */
export const EVENT_VIGNETTE: Record<string, string | null> = {
  // Sheaf of wheat — harvests, grain, the land.
  harvest: medallion(
    '<path d="M12 18.5V8.3"/><path d="M12 11.9c-1.7 0-3.1-1.2-3.1-3.3 1.7 0 3.1 1.2 3.1 3.3z"/><path d="M12 11.9c1.7 0 3.1-1.2 3.1-3.3-1.7 0-3.1 1.2-3.1 3.3z"/><path d="M12 15.5c-1.7 0-3.1-1.2-3.1-3.3 1.7 0 3.1 1.2 3.1 3.3z"/><path d="M12 15.5c1.7 0 3.1-1.2 3.1-3.3-1.7 0-3.1 1.2-3.1 3.3z"/><path d="M12 8.3c-.7-.7-.7-1.9 0-2.6.7.7.7 1.9 0 2.6z"/><path d="M8.6 18.5h6.8"/>',
  ),
  // Skull — plague and pestilence.
  plague: medallion(
    '<path d="M12 5.6a4.9 4.9 0 014.9 4.9c0 1.7-.8 2.9-1.9 3.7v2h-6v-2c-1.1-.8-1.9-2-1.9-3.7A4.9 4.9 0 0112 5.6z"/><circle cx="10.1" cy="10.6" r="1"/><circle cx="13.9" cy="10.6" r="1"/><path d="M10.6 16.2v1.6M13.4 16.2v1.6"/>',
  ),
  // Bunting pennants — festivals and jubilees.
  festival: medallion(
    '<path d="M5.6 8.2c4.2 2.6 8.6 2.6 12.8 0"/><path d="M7.4 9.4l1 2.4 1.5-1.9M11 10.6l.9 2.3 1.4-2.1M15.2 9.9l1 2 1.3-2.3"/><path d="M5.6 8.2v-2M18.4 8.2v-2"/><circle cx="12" cy="16.6" r=".5" fill="currentColor" stroke="none"/><circle cx="9" cy="15.4" r=".5" fill="currentColor" stroke="none"/><circle cx="15" cy="15.4" r=".5" fill="currentColor" stroke="none"/>',
  ),
  // Crossed swords — raids, sieges, mercenaries.
  war: medallion(
    '<path d="M7 7l8.6 8.6M17 7L8.4 15.6"/><path d="M14.2 16.9l2.7-2.7M7.1 14.2l2.7 2.7"/><path d="M7.4 18l1.4-1.4M16.6 18l-1.4-1.4"/>',
  ),
  // Balance scales — trade, markets, coin.
  trade: medallion(
    '<path d="M12 5.8v11.4M9.4 17.2h5.2"/><path d="M6.6 8h10.8"/><path d="M6.6 8l-1.6 3.7a2.1 2.1 0 004.2 0zM17.4 8l-1.6 3.7a2.1 2.1 0 004.2 0z"/>',
  ),
  // Open book + quill — scholars, envoys, expeditions.
  scholars: medallion(
    '<path d="M12 8.4c-1.5-1.2-3.7-1.6-5.9-1.4v9.8c2.2-.2 4.4.2 5.9 1.4 1.5-1.2 3.7-1.6 5.9-1.4V7c-2.2-.2-4.4.2-5.9 1.4z"/><path d="M12 8.4v9.8"/><path d="M14.4 12.6l4.2-6.1 1 .7-4.2 6z"/>',
  ),
  // Mason's trowel + block — public works and civic construction.
  works: medallion(
    '<path d="M6.6 8.2l4.3 4.3-2.4 2.4-4.3-4.3a1.7 1.7 0 012.4-2.4z"/><path d="M10.4 12.9l3-3M12.4 15.4h7.2v3.2h-7.2z"/>',
  ),
};

/** Event id → vignette theme (see systems/events.ts for the roster). */
const EVENT_THEME: Record<string, keyof typeof EVENT_VIGNETTE> = {
  good_harvest: "harvest",
  drought: "harvest",
  grain_aid: "harvest",
  migration_wave: "harvest",
  plague: "plague",
  festival: "festival",
  golden_jubilee: "festival",
  traveling_fair: "festival",
  local_uprising: "war",
  mercenaries: "war",
  mercenary_offer: "war",
  border_raid: "war",
  reinforce_walls: "war",
  sap_the_walls: "war",
  market_boom: "trade",
  caravan_raided: "trade",
  ore_discovery: "trade",
  wandering_scholars: "scholars",
  expedition: "scholars",
  envoy_exchange: "scholars",
  royal_wedding: "festival",
  // Trait-decision events (events.ts trait-choice block).
  call_the_banners: "war",
  forbidden_lore: "scholars",
  grand_academy: "scholars",
  monopoly_charter: "trade",
  settling_season: "harvest",
  public_works: "works",
};

/** Vignette for a concrete event id, or null (caller renders no art). */
export function eventVignette(eventId: string): string | null {
  const theme = EVENT_THEME[eventId];
  return theme ? (EVENT_VIGNETTE[theme] ?? null) : null;
}

// ---------------------------------------------------------------------------
// Achievement badges — a shared soft-hexagon frame with one motif per
// achievement id (data/achievements.ts). Locked achievements keep the lock
// glyph; an unknown id falls back to the default medal.
// ---------------------------------------------------------------------------

/** Soft-hex badge frame around a motif. */
function badge(inner: string): string {
  return ico(
    `<path d="M12 2.6l7.6 4.4v10L12 21.4 4.4 17V7z"/>${inner}`,
    { sw: 1.4 },
  );
}

export const BADGE_ART: Record<string, string | null> = {
  first_crown: badge('<path d="M8.4 14.6v-4.4l2.3 1.7 1.3-2.6 1.3 2.6 2.3-1.7v4.4z" fill="currentColor" stroke="none"/>'),
  conqueror: badge('<path d="M8.6 8.6l6.8 6.8M15.4 8.6l-6.8 6.8"/><path d="M13.6 16l1.8-1.8M8.6 14.2l1.8 1.8"/>'),
  enlightened: badge('<path d="M12 8.6c-1-.8-2.5-1.1-4-1v7c1.5-.1 3 .2 4 1 1-.8 2.5-1.1 4-1v-7c-1.5-.1-3 .2-4 1z"/><path d="M12 8.6v7"/>'),
  polymath: badge('<path d="M12 6.8v2.4M12 14.8v2.4M8.4 12h-2.4M18 12h-2.4M9.2 9.2L7.8 7.8M16.2 16.2l-1.4-1.4M14.8 9.2l1.4-1.4M7.8 16.2l1.4-1.4"/><circle cx="12" cy="12" r="1.9"/>'),
  veteran: badge('<path d="M9.2 17V7.2"/><path d="M9.2 7.8c2.2-1 4.4 1 6.6 0v5c-2.2 1-4.4-1-6.6 0"/>'),
  warlord: badge('<path d="M12 6.4v7.2M9.8 9.9h4.4M12 13.6v2.8M11 17.6h2"/>'),
  blitz: badge('<path d="M13 6.5l-4.4 6h3l-1.4 5 4.6-6.2h-3z"/>'),
  the_long_game: badge('<path d="M9 7h6M9 17h6M9.8 7v1.7c0 1.5 1 2.4 2.2 3.3 1.2-.9 2.2-1.8 2.2-3.3V7M9.8 17v-1.7c0-1.5 1-2.4 2.2-3.3 1.2.9 2.2 1.8 2.2 3.3V17"/>'),
  iron_blood: badge('<path d="M7.2 8.6h6.4c1.2 0 2.1-.4 2.9-1.1-.2 1.9-1.5 3.1-3.4 3.3v1.9c1 .2 1.7.7 2 1.6H8.9c.3-.9 1-1.4 2-1.6v-1.9c-1.7-.2-3.1-1-3.7-2.2z" fill="currentColor" stroke="none"/>'),
};

/** Badge for an achievement id — unknown ids get the default medal. */
export function badgeArt(achievementId: string): string | null {
  return BADGE_ART[achievementId] ?? MEDAL;
}

// ---------------------------------------------------------------------------
// Small classification glyphs: tech branches and diplomacy treaties.
// ---------------------------------------------------------------------------

/** Tech-branch glyphs, shown beside the branch name in research UI. */
export const BRANCH_ART: Record<"economy" | "military" | "civics", string | null> = {
  economy: ico('<circle cx="12" cy="12" r="6.6"/><path d="M12 8.6v6.8M10 10.4c0-.9.9-1.4 2-1.4s2 .5 2 1.3c0 2-4 1.4-4 3.4 0 .8.9 1.3 2 1.3s2-.5 2-1.4"/>', { sw: 1.6 }),
  military: ico('<path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6"/><path d="M14.9 16.9l2-2M7.1 14.9l2 2"/>', { sw: 1.6 }),
  civics: ico('<path d="M5.4 9.4L12 5.6l6.6 3.8z"/><path d="M7 9.4v6.4M12 9.4v6.4M17 9.4v6.4M5.6 15.8h12.8M4.6 18.4h14.8"/>', { sw: 1.6 }),
};

/** Treaty-state glyphs for the diplomacy chips. */
export const TREATY_ART: Record<"war" | "peace" | "nap" | "alliance", string | null> = {
  war: ico('<path d="M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/><path d="M15.2 17.4l2.2-2.2M6.6 15.2l2.2 2.2"/>', { sw: 2 }),
  // Olive sprig.
  peace: ico('<path d="M12 19.5c0-5.5 1.6-9.5 4.8-12.5"/><path d="M12.8 13.2c-2.3.4-4.2-.4-5.3-2.3 2.3-.4 4.2.4 5.3 2.3zM14 9.4c-.4-2.3.4-4.2 2.3-5.3.4 2.3-.4 4.2-2.3 5.3z"/>', { sw: 2 }),
  // Paused shields: two shields side by side (standing apart, not clashing).
  nap: ico('<path d="M8.4 5.6l4 1.4v3.2c0 2.6-1.6 4.5-4 5.3-2.4-.8-4-2.7-4-5.3V7z"/><path d="M15.6 8.5l4 1.4v3.2c0 2.6-1.6 4.5-4 5.3-2.4-.8-4-2.7-4-5.3v-3.2z"/>', { sw: 2 }),
  // Interlocked rings.
  alliance: ico('<circle cx="9.4" cy="12" r="4.6"/><circle cx="14.6" cy="12" r="4.6"/>', { sw: 2 }),
};

/**
 * Title-screen key art: the player crest struck as a large medallion. The
 * wordmark itself is styled DOM text (the game's name is still a placeholder —
 * renaming must not require redrawing art).
 */
export const TITLE_ART: string | null =
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">' +
  '<circle cx="24" cy="24" r="22.6" fill="none" stroke="#e6c874" stroke-width="1.4"/>' +
  '<circle cx="24" cy="24" r="19.8" fill="none" stroke="rgba(230,200,116,0.35)" stroke-width="0.8"/>' +
  '<path d="M24 7.5l13.4 4.6v10.3c0 8.2-5.4 14.4-13.4 16.6-8-2.2-13.4-8.4-13.4-16.6V12.1z" fill="#d8a24a" stroke="#e6c874" stroke-width="1.4" stroke-linejoin="round"/>' +
  '<path d="M16.6 27.9v-7.6l4.1 3.1 3.3-5.8 3.3 5.8 4.1-3.1v7.6z" fill="#f7f4ea"/>' +
  '<rect x="16.6" y="30.4" width="14.8" height="2.4" rx="1.2" fill="#f7f4ea"/>' +
  "</svg>";

// `ico` is exported for the phases that fill these tables in (and for tests);
// keeping the builder beside the data keeps every icon on the shared grid.
export { ico };
