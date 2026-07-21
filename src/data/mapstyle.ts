/**
 * Map-presentation style — the centralised knobs for the Hansa map look.
 *
 * Everything the territory view's framing, coastline, ocean and political ink
 * can be tuned with lives in this table, mirroring the data-driven content
 * philosophy: re-balancing the map's *look* is editing numbers here, not
 * renderer code. Serialisable constants only — no DOM, no logic.
 */

/**
 * Interior region borders: subtle shared-edge distortion so province lines
 * stop reading as ruler-drawn bisectors. Kept small — the absolute cap
 * (normalised units) stays well under half the minimum site spacing, so every
 * site remains inside its own distorted cell and hit-testing stays sane.
 */
export const EDGE_ROUGHNESS = 0.18;
export const EDGE_DETAIL = 2;
export const EDGE_MAX_DISP = 0.012;

/**
 * Deterministic terrain texture: how many stamps (trees, ridges, bumps, grass,
 * wave ticks) to scatter per unit of normalised map area. Baked into the
 * cached terrain layer, so density costs nothing per frame. 0 disables.
 */
export const TERRAIN_TEXTURE_DENSITY = {
  plains: 110,
  forest: 380,
  hills: 190,
  mountains: 150,
  coast: 60,
} as const;

/** Ink alpha for the texture stamps (kept faint — texture, not noise). */
export const TERRAIN_TEXTURE_ALPHA = 0.75;

/**
 * Political ink — terrain reads first, ownership second. Realm interiors get
 * only a light wash; the realm identity is carried by an inner colour band
 * along the *outer* national border plus a crisp two-tone edge, so same-owner
 * cells visually merge while different-owner borders stay unmistakable.
 */
export const POLITICAL = {
  /** Owner wash over the terrain fill — a translucent tint over the pale
      parchment land (like a hand-tinted realm on an old map); the crisp bands
      and edges below carry the identity, so this stays light and the terrain
      still reads beneath it. */
  washAlpha: 0.28,
  barbarianWashAlpha: 0.15,
  /** Unclaimed land: darkened and hatched so "no one's" is as legible as
      "someone's" (shape-coded, so it survives any palette). */
  neutralWash: "rgba(12, 16, 23, 0.32)",
  neutralHatch: "rgba(215, 225, 240, 0.07)",
  neutralHatchSpacing: 13,
  /** Inner border band (clipped to the realm): width px + alpha. Barbarian
      camps get no band/edge at all — wash + centrelines only — so the only
      warm rim on the map is the player's gold. */
  bandWidth: 16,
  bandAlpha: 0.5,
  /** Crisp owner-coloured edge on the realm side of a border. */
  edgeWidth: 3,
  edgeAlpha: 1,
  /**
   * The player's realm gets the loudest treatment — "mine" must read at a
   * glance: a stronger wash, a wider double band (soft outer + bright inner)
   * and a full-strength edge.
   */
  playerWashAlpha: 0.36,
  playerBandWidth: 24,
  playerBandAlpha: 0.55,
  playerInnerBandWidth: 9,
  playerInnerBandAlpha: 0.6,
  playerEdgeWidth: 3.5,
  playerEdgeAlpha: 1,
  /** Realm nameplates floating over each nation's lands. */
  nameplateHalo: "rgba(9, 11, 16, 0.7)",
  nameplateAlpha: 0.92,
  /** Dark centreline drawn over every national border for definition. */
  core: "rgba(10, 12, 16, 0.75)",
  coreWidth: 1.3,
  /** War fronts: soft glow + loud core along contested borders. */
  warGlow: "rgba(232, 119, 107, 0.3)",
  warGlowWidth: 9,
  warCoreWidth: 3,
} as const;

/**
 * Depth & relief: bathymetric contour rings stepping out from the coast, a
 * soft interior-light/coast-shade wash over the landmass, and a hashed paper
 * grain — all baked into the cached layers, all deterministic.
 */
export const DEPTH = {
  /** Contour ring offsets (px) and the alpha of the nearest ring. */
  contours: [22, 46, 76],
  contourAlpha: 0.09,
  /** Relief wash: interior highlight / coastal shade strengths. */
  reliefLight: "rgba(255, 243, 210, 0.09)",
  reliefShade: "rgba(6, 9, 14, 0.2)",
  /** Paper-grain speckles scattered over the land (count at 1600×900). */
  grainCount: 1500,
  grainAlpha: 0.07,
} as const;

/** Ocean & coastline palette (the terrain palette stays in data/terrain.ts).
    Tuned for a parchment / vintage-cartography look: soft slate-blue seas, a
    pale coastal glow, and warm-brown pen-line coasts. */
export const OCEAN = {
  /** Radial vignette centre/edge — a soft, calm slate-blue all the way to the
      corners (pale like an old sea chart, never dark navy). */
  inner: "#aecfe1",
  outer: "#9cc0d8",
  /** Tiny wave flecks scattered across the open water (count at 1600×900) —
      a faint muted-blue stipple, a touch darker than the sea so it reads. */
  fleck: "rgba(120, 152, 180, 0.16)",
  fleckCount: 260,
  /** Sea life: deterministic whale/fish/serpent silhouettes in open water,
      inked in a muted slate so they read over the pale water. */
  seaLifeCount: 7,
  seaLifeInk: "rgba(84, 116, 142, 0.5)",
  seaLifeFill: "rgba(150, 180, 202, 0.26)",
  /** Land underlay colour (parchment, so any hairline gap reads warm not dark)
      and its soft drop shadow (a gentle blue-grey, not a heavy black halo). */
  landBase: "#e3d7bb",
  shadow: "rgba(60, 84, 104, 0.28)",
  /** Shallow-water glow hugging the coastline (narrow bright + wide faint) —
      a pale near-white blue, like shoaling water on a hand-tinted chart. */
  shallow: "rgba(219, 238, 246, 0.5)",
  shallowWide: "rgba(219, 238, 246, 0.28)",
  /** Coastline ink: a thin warm-brown pen line + a faint cream inner highlight. */
  coastLine: "rgba(122, 106, 72, 0.95)",
  coastHighlight: "rgba(236, 228, 200, 0.12)",
  /** Offshore wave dashes and islet rock colours. */
  wave: "rgba(122, 158, 188, 0.2)",
  islet: "#d8cba9",
  isletEdge: "rgba(122, 106, 72, 0.45)",
  /** Dashed sea lane marking a cross-water adjacency (archipelago) — muted slate. */
  lane: "rgba(110, 142, 172, 0.55)",
  /** Outer-world context land (distant, non-interactive): a faded parchment
      fill, a soft brown coastline, and faint sepia labels — framing the play
      area so it reads as a real region of a larger world. */
  contextLand: "rgba(212, 197, 165, 0.62)",
  contextCoast: "rgba(120, 104, 74, 0.42)",
  contextLabel: "rgba(101, 88, 64, 0.45)",
  /** Named open-water area labels (the Baltic, the North Sea, the gulfs) — a
      faded steel-blue, wide-tracked serif, so the sea reads as regions. */
  seaLabel: "rgba(74, 108, 138, 0.42)",
} as const;
