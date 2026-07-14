/**
 * Colour-blind-safe nation palette (serialisable content).
 *
 * The default nation colours (`turn.ts`) read well for typical vision but confuse
 * common colour-vision deficiencies — the green/red-orange rivals in particular.
 * When the player enables the colour-blind option, owner colours are remapped to an
 * Okabe-Ito-derived set chosen for maximum separation under deuteranopia and
 * protanopia. `cbSafe` is a pure lookup, so the renderer and HUD share one mapping.
 */

/** base nation hex → colour-blind-safe replacement. Keys are the `turn.ts` colours. */
export const CB_SAFE: Record<string, string> = {
  "#d8a24a": "#e69f00", // player — orange
  "#9a5b53": "#999999", // barbarians — neutral grey
  "#5b8bd0": "#56b4e9", // rival 1 — sky blue
  "#b06ec0": "#cc79a7", // rival 2 — reddish purple
  "#6cae7a": "#009e73", // rival 3 — bluish green
  "#d0796e": "#d55e00", // rival 4 — vermillion
  "#4fb0a0": "#0072b2", // rival 5 — blue
};

/**
 * Resolve a nation's display colour. Returns the colour-blind-safe equivalent when
 * `on` and the base colour is a known nation colour; otherwise returns `hex`
 * unchanged. Case-insensitive on the lookup key.
 */
export function cbSafe(hex: string, on: boolean): string {
  if (!on) return hex;
  return CB_SAFE[hex.toLowerCase()] ?? hex;
}
