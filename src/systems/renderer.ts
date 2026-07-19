/**
 * Renderer system — the island-world territory view.
 *
 * Draws the region graph as an organic landmass floating in ocean: region
 * cells clipped to the coastline, terrain fills + political ink, borders and
 * war fronts on shared edges, and the shared marker set (population, name,
 * status row, capital crest, army badges). Read-only over state — the
 * renderer never mutates the sim — and deterministic: every shape derives
 * from the map seed (systems/island.ts), never Math.random or the clock.
 *
 * Performance discipline: everything expensive is cached and rebuilt only when
 * its inputs change —
 *  - Voronoi cells + island silhouette: recomputed when the map changes.
 *  - Projected geometry (pixel polygons, Path2Ds, land path): map ⊕ canvas
 *    size ⊕ settled camera.
 *  - Ocean / terrain / political layers: pre-rendered offscreens, blitted per
 *    frame; the political layer refreshes when ownership, wars or the palette
 *    change.
 * Steady-state per-frame work is three drawImage blits plus selection and
 * markers; mid-gesture camera frames reuse the cached layers via a delta
 * transform until input settles.
 */

import { TERRAIN, type TerrainId } from "@/data/terrain";
import { BUILDINGS, BUILD_RATE } from "@/data/buildings";
import { GLYPH_ART, RESOURCE_ART, TERRAIN_ART, TERRAIN_MOTIF, crestSvg } from "@/data/art";
import { cbSafe } from "@/data/palette";
import {
  DEPTH,
  ISLAND_FRAME,
  OCEAN,
  POLITICAL,
  TERRAIN_TEXTURE_ALPHA,
  TERRAIN_TEXTURE_DENSITY,
  type IslandArchetype,
} from "@/data/mapstyle";
import { armySize, BARBARIAN_ID, PLAYER_ID, type TradeRoute } from "@/systems/state";
import {
  UNREST_PENALTY_START,
  UNREST_REVOLT,
  type Army,
  type GameState,
  type Region,
} from "@/systems/state";
import { atWar } from "@/systems/diplomacy";
import { regionCapacity } from "@/systems/population";
import { popCompact, popDisplay, soldiersCompact, soldiersDisplay } from "@/systems/format";
import { computeVoronoiCells, pointInPolygon, type Point, type VoronoiCell } from "@/systems/voronoi";
import { scriptedMap } from "@/data/maps/types";
import {
  hashFloat,
  islandArchetype,
  islandShape,
  organicCells,
  polygonCells,
  pointInIsland,
  ISLAND_BOUNDS,
  type IslandShape,
  type OrganicCell,
} from "@/systems/island";

/** A border between two nations at war — the map's front line. */
export const WAR_EDGE_COLOR = "rgba(232, 119, 107, 0.6)";
/** Seam between two regions inside the landmass (kept faint; owners add ink). */
const CELL_EDGE_COLOR = "rgba(13, 15, 20, 0.38)";
/** Marker layout radius: the footprint each region's marker stack occupies. */
const NODE_RADIUS = 26;
/** Fill opacity for map-lens heat (strong enough to read over terrain). */
const LENS_ALPHA = 0.82;
const SELECT_COLOR = "#f4d27a";
const HIGHLIGHT_COLOR = "#63c7d6";
const NEUTRAL_OWNER = "rgba(0,0,0,0.35)";

const RESOURCE_ICON: Record<string, string> = { iron: "⚒", horses: "🐎" };
/** Light ink used when rasterising registry icons for the dark map. */
const MAP_ICON_COLOR = "#e8e2cf";
const CAPITAL_ICON_COLOR = "#f4d27a";

export interface Renderer {
  start(): void;
  stop(): void;
  setState(state: GameState): void;
  setSelected(regionId: number | null): void;
  /** Regions to highlight as move/attack targets. */
  setHighlights(regionIds: number[]): void;
  /**
   * Map-lens overlay: a per-region-id array of fill colours that recolours the
   * board by a metric (population, income, unrest), or null for the political
   * default. Baked into the political layer, so it reads at any zoom.
   */
  setLens(colors: (string | null)[] | null): void;
  /**
   * Trade overlay: the routes whose lanes to draw as merchant lines on the map
   * (the trade lens passes the live routes; other views pass null). Cheap — a
   * few polylines per frame — so it just follows the live camera.
   */
  setTradeLanes(routes: TradeRoute[] | null): void;
  /** Remap owner colours to the colour-blind-safe palette (or back). */
  setColourblind(on: boolean): void;
  /** Suppress cosmetic motion (capture ripples) when true. */
  setReduceMotion(on: boolean): void;
  /** Flash a capture ripple at a region that just changed hands. */
  pulseCapture(regionId: number): void;
  onRegionClick(handler: (regionId: number | null) => void): void;
  /**
   * Hovering a map marker (population chip, crest, status icons, army badge)
   * reports a plain-language tip at viewport coordinates; null = hover ended.
   */
  onMarkerHover(handler: (tip: { text: string; x: number; y: number } | null) => void): void;
  /** Zoom about the viewport centre (e.g. 1.25 in, 0.8 out). */
  zoomBy(factor: number): void;
  /** Reset the camera to the fitted full-map view. */
  resetView(): void;
  /**
   * Attach (or detach with null) a HUD-owned minimap canvas. While attached the
   * renderer paints it each frame with the baked map composite and a rectangle
   * for the current camera view; clicking it recentres the camera there.
   */
  setMinimap(target: HTMLCanvasElement | null): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to acquire 2D rendering context");
  const context = ctx;

  let running = false;
  let frame = 0;
  let state: GameState | null = null;
  let selected: number | null = null;
  let highlights = new Set<number>();
  let colourblind = false;
  let reduceMotion = false;
  let clickHandler: (regionId: number | null) => void = () => {};

  // Marker hover: each frame the marker pass registers small hit circles with
  // a plain-language tip; pointer moves (with no button down) look them up.
  interface MarkerHit {
    x: number;
    y: number;
    r: number;
    text: string;
  }
  let markerHits: MarkerHit[] = [];
  let hoverHandler: (tip: { text: string; x: number; y: number } | null) => void = () => {};
  let lastHoverText: string | null = null;

  function reportHover(hit: MarkerHit | null, clientX: number, clientY: number): void {
    // Style writes invalidate layout — only touch the cursor when it changes
    // (this runs on every pointermove).
    const cursor = hit ? "help" : "grab";
    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
    if (hit) {
      hoverHandler({ text: hit.text, x: clientX, y: clientY });
      lastHoverText = hit.text;
    } else if (lastHoverText !== null) {
      hoverHandler(null);
      lastHoverText = null;
    }
  }

  // Transient capture ripples: a battle-flash → owner-colour ring at a region that
  // changed hands. Purely cosmetic; aged by a frame tick so no wall-clock is used.
  const RIPPLE_FRAMES = 42;
  let tick = 0;
  let ripples: { regionId: number; color: string; born: number }[] = [];

  // Island archetype: pure function of the map (region count + seed), refreshed
  // on every setState so the projection frame is always in step with the state.
  let archetype: IslandArchetype = "medium";
  // Extra inset (fraction of canvas) around the [0,1] play area, so a context
  // map's outer-world land shows as a framing border. 0 for non-context maps.
  let outerMargin = 0;

  // --- Camera: pan/zoom over the fitted base projection ----------------------
  // screen = base * s + t. At s = 1 the map fits exactly (t clamps to 0), so
  // the full-map view stays the default; zooming unlocks panning. The static
  // layers are baked ONCE in camera-independent base space (supersampled) and
  // drawn through the camera transform every frame — pan/zoom never rebuilds
  // them, so gestures stay hitch-free; only the light projection (hit paths,
  // marker anchors) follows the live camera.
  const CAM_MIN = 0.8; // zoom out past fit — the whole island with extra sea room
  const CAM_MAX = 4.5; // zoom deep into the Baltic — the sea-trade heart of the map
  /** How far (fraction of the viewport) the map may pan beyond its fitted
      bounds — so dragging always answers, even at fit zoom. */
  const PAN_SLACK = 0.22;
  interface Camera {
    s: number;
    tx: number;
    ty: number;
  }
  const cam: Camera = { s: 1, tx: 0, ty: 0 };
  /** Identity camera — layers bake in base space through this override. */
  const BASE_CAM: Camera = { s: 1, tx: 0, ty: 0 };
  let camOverride: Camera | null = null; // set while baking base-space geometry/layers

  function camKey(): string {
    return `${cam.s.toFixed(3)}|${cam.tx.toFixed(1)}|${cam.ty.toFixed(1)}`;
  }

  // Zoom crossfade for labels on the dense province map: region/city names fade
  // IN across this zoom window while the realm nameplates fade OUT over the same
  // range, so a zoomed-out view reads by realm and a zoomed-in view by province,
  // and the two never pile up. 0 at (and below) fit zoom, 1 once zoomed past HI.
  const LABEL_FADE_LO = 1.22, LABEL_FADE_HI = 1.6;
  function regionLabelAlpha(): number {
    return Math.max(0, Math.min(1, (cam.s - LABEL_FADE_LO) / (LABEL_FADE_HI - LABEL_FADE_LO)));
  }

  function clampCam(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    cam.s = Math.min(CAM_MAX, Math.max(CAM_MIN, cam.s));
    // Natural bounds keep the map covering the viewport (zoomed in) or fully
    // inside it (zoomed out); the slack allows a bounded overscroll beyond
    // both, so panning never feels dead. ⛶ / double-click re-centres.
    const clampAxis = (t: number, view: number): number => {
      const lo = Math.min(0, view - view * cam.s) - view * PAN_SLACK;
      const hi = Math.max(0, view - view * cam.s) + view * PAN_SLACK;
      return Math.min(hi, Math.max(lo, t));
    };
    cam.tx = clampAxis(cam.tx, w);
    cam.ty = clampAxis(cam.ty, h);
  }

  // While the camera is actively moving we drop the per-region label/marker text
  // (74 measured+stroked strings a frame) and keep only the cheap baked map +
  // armies, so pan/zoom stays smooth; the labels snap back a few frames after the
  // gesture settles. Set on every camera mutation, counted down in render().
  let interactFrames = 0;
  const NUDGE_INTERACT = (): void => {
    interactFrames = 6;
  };

  /** Zoom to `next` about the screen point (mx, my), keeping it fixed. */
  function setZoom(next: number, mx: number, my: number): void {
    const s0 = cam.s;
    const s1 = Math.min(CAM_MAX, Math.max(CAM_MIN, next));
    if (s1 === s0) return;
    cam.tx = mx - ((mx - cam.tx) * s1) / s0;
    cam.ty = my - ((my - cam.ty) * s1) / s0;
    cam.s = s1;
    clampCam();
    NUDGE_INTERACT();
    needsPaint = true;
  }

  function panBy(dx: number, dy: number): void {
    cam.tx += dx;
    cam.ty += dy;
    clampCam();
    NUDGE_INTERACT();
    needsPaint = true;
  }

  /** Back to the fitted, centred full-map view. */
  function fitView(): void {
    cam.s = 1;
    cam.tx = 0;
    cam.ty = 0;
    needsPaint = true;
  }

  // Voronoi cells (+ their organic-border variants) and the island silhouette
  // (normalised space), cached until the map geometry changes.
  let cells: VoronoiCell[] = [];
  let organic: OrganicCell[] = [];
  let shape: IslandShape | null = null;
  let cellSig = "";

  // Projected-geometry cache: pixel polygons, Path2Ds, the land path, islets and
  // sea lanes depend only on the map and the canvas size, never on per-frame
  // state — rebuilt only when either changes, not 60×/s.
  interface Projection {
    px: Point[][];
    paths: Path2D[];
    /** Per cell, per original edge: the projected organic border polyline. */
    edgesPx: Point[][][];
    sites: Point[];
    /** Furthest vertex distance per cell — radius for the terrain gradient. */
    reach: number[];
    land: Path2D;
    blobsPx: Point[][];
    /** One Path2D per landmass blob (land is their union). */
    blobPaths: Path2D[];
    isletsPx: Point[][];
    /** Cross-water adjacency lanes (both endpoints at region sites). */
    lanes: [Point, Point][];
  }
  let projection: Projection | null = null;
  let projSig = "";
  // Base-space twin (identity camera): the static layers bake against this, so
  // camera moves never invalidate them.
  let baseProjection: Projection | null = null;
  let baseProjSig = "";

  // Pre-rendered static layers (device-pixel offscreens, blitted per frame).
  let oceanLayer: HTMLCanvasElement | null = null;
  let oceanSig = "";
  let terrainLayer: HTMLCanvasElement | null = null;
  let terrainSig = "";
  // Political ink layer — rebuilt only when ownership, wars or palette change.
  let politicalLayer: HTMLCanvasElement | null = null;
  let politicalSig = "";
  // Active map lens: per-region-id fill colours (or null = political default).
  // Baked into the political layer; its signature triggers the rebake.
  let lensColors: (string | null)[] | null = null;
  let lensSig = "";
  // Active trade overlay: routes whose lanes draw as merchant lines (trade lens
  // only). Not baked — drawn live each frame over the political layer.
  let tradeLanes: TradeRoute[] | null = null;
  // Composite of ocean+terrain+political: the per-frame cost is ONE blit, not
  // three. Recomposited (three offscreen blits, no re-drawing) when any part
  // rebuilds.
  let staticLayer: HTMLCanvasElement | null = null;
  let staticSig = "";

  // Dirty flag: the loop paints only when something can have changed — state,
  // selection, palette, camera input, ripples in flight, a resize. An idle map
  // costs nothing per frame (and stops forcing the browser to recomposite the
  // blurred HUD panels above the canvas every frame).
  let needsPaint = true;

  // Optional minimap (CK3-style): a HUD-owned canvas the renderer redraws each
  // frame with the baked map composite + a rectangle for the current view.
  let minimap: HTMLCanvasElement | null = null;
  // The composite's fitted sub-rect inside the minimap, so clicks map back to the map.
  let minimapFit: { ox: number; oy: number; fw: number; fh: number } | null = null;

  /** Live-camera projection: hit paths, marker anchors, dynamics. Cheap to
      rebuild (a few thousand point transforms), so it follows every camera
      move; the expensive pixels live in the base-space layers instead. */
  function ensureProjection(s: GameState): Projection {
    ensureCells(s);
    const sig = `${cellSig}|${canvas.clientWidth}x${canvas.clientHeight}|${camKey()}`;
    if (projection && sig === projSig) return projection;
    projSig = sig;
    projection = buildProjection(s);
    return projection;
  }

  /** Base-space projection (identity camera) — what the static layers bake against. */
  function ensureBaseProjection(s: GameState): Projection {
    ensureCells(s);
    const sig = `${cellSig}|${canvas.clientWidth}x${canvas.clientHeight}`;
    if (baseProjection && sig === baseProjSig) return baseProjection;
    baseProjSig = sig;
    camOverride = BASE_CAM;
    try {
      baseProjection = buildProjection(s);
    } finally {
      camOverride = null;
    }
    return baseProjection;
  }

  function buildProjection(s: GameState): Projection {
    const px = organic.map((c) => c.poly.map((v) => projectXY(v.x, v.y)));
    const edgesPx = organic.map((c) => c.edges.map((e) => e.map((v) => projectXY(v.x, v.y))));
    const addRing = (p: Path2D, ring: Point[]): void => {
      if (ring.length < 3) return;
      p.moveTo(ring[0]!.x, ring[0]!.y);
      for (let i = 1; i < ring.length; i++) p.lineTo(ring[i]!.x, ring[i]!.y);
      p.closePath();
    };
    const paths = organic.map((c, i) => {
      const p = new Path2D();
      // A multipart province (authored islands) fills and clips all its rings;
      // an ordinary cell is just its single projected polygon.
      if (c.rings) {
        for (const ring of c.rings) addRing(p, ring.map((v) => projectXY(v.x, v.y)));
      } else {
        addRing(p, px[i]!);
      }
      return p;
    });
    const sites = s.regions.map((r) => project(r));
    const reach = px.map((poly, i) => {
      const site = sites[i]!;
      let r = 0;
      for (const v of poly) r = Math.max(r, Math.hypot(v.x - site.x, v.y - site.y));
      return r || 1;
    });

    const blobsPx = (shape?.blobs ?? []).map((b) => b.map((v) => projectXY(v.x, v.y)));
    const blobPaths = blobsPx.map((blob) => polyPath(blob));
    const land = new Path2D();
    for (const p of blobPaths) land.addPath(p);
    const isletsPx = (shape?.islets ?? []).map((b) => b.map((v) => projectXY(v.x, v.y)));

    // Sea lanes: game-adjacent pairs whose midpoint lies in open water — the
    // visual reminder that armies may still cross (archipelago straits).
    const lanes: [Point, Point][] = [];
    if (shape) {
      for (const region of s.regions) {
        for (const nid of region.adjacency) {
          if (region.id >= nid) continue;
          const other = s.regions[nid];
          if (!other) continue;
          const mx = (region.x + other.x) / 2;
          const my = (region.y + other.y) / 2;
          if (!pointInIsland(shape, mx, my)) lanes.push([sites[region.id]!, sites[other.id]!]);
        }
      }
    }

    return { px, paths, edgesPx, sites, reach, land, blobsPx, blobPaths, isletsPx, lanes };
  }

  function ensureCells(s: GameState): void {
    // Signature must change whenever any site moves, else a regenerated map with
    // the same region count could reuse stale cells. A cheap coordinate rollup
    // over every region (there are only ~16–30) catches any change; iterating
    // per frame is negligible next to the cell computation it guards.
    let acc = s.regions.length + s.seed;
    for (const r of s.regions) acc = (acc * 31 + r.x * 8191 + r.y * 131071) % 1e12;
    const sig = String(acc);
    if (sig !== cellSig) {
      cellSig = sig;
      const sites = s.regions.map((r) => ({ x: r.x, y: r.y }));
      const smap = scriptedMap(s.mapId);
      // Province cells: a scripted map whose every region carries a real
      // boundary polygon draws those directly (adjacency recovered from shared
      // segments); otherwise fall back to the Voronoi of the sites — the path
      // that every existing map (baltic/europe/procedural) still takes.
      if (
        smap &&
        smap.regions.length &&
        smap.regions.every((r) => r.polygon && r.polygon.length)
      ) {
        const toRing = (r: [number, number][]): Point[] => r.map((v) => ({ x: v[0], y: v[1] }));
        organic = polygonCells(smap.regions.map((r) => r.polygon!.map(toRing)));
        cells = [];
      } else {
        cells = computeVoronoiCells(sites, ISLAND_BOUNDS);
        organic = organicCells(cells, s.seed);
      }
      // Scripted maps supply their own coastline (real geography); procedural
      // realms generate an organic island around the sites.
      if (smap) {
        archetype = "large"; // tight framing — the authored land fills [0,1]
        // A context map insets the play area a touch so the outer-world land
        // frames it; kept small so the playable land stays large on screen (the
        // faded continent bleeds past [0,1] anyway, so it still shows).
        outerMargin = smap.context ? 0.045 : 0;
        const toPoly = (poly: [number, number][]): Point[] => poly.map((v) => ({ x: v[0], y: v[1] }));
        shape = { blobs: smap.land.map(toPoly), islets: (smap.islets ?? []).map(toPoly) };
      } else {
        archetype = islandArchetype(s.regions.length, s.seed);
        outerMargin = 0;
        shape = islandShape(sites, s.seed, archetype);
      }
      projSig = ""; // both projections derive from the cells — force rebuilds
      baseProjSig = "";
    }
  }

  // --- Static layers ----------------------------------------------------------
  // Layers bake in base space (identity camera) at a supersampled resolution,
  // then draw through the camera transform each frame — so zooming to CAM_MAX
  // stays acceptably crisp without ever re-rendering a stamp. The pixel budget
  // caps memory on large/hi-DPI screens (soft-at-max-zoom beats jank).
  const MAX_LAYER_PIXELS = 9_000_000;

  function layerScaleNow(): number {
    const dpr = window.devicePixelRatio || 1;
    const area = Math.max(1, canvas.clientWidth * canvas.clientHeight);
    // Bake nearer the max zoom so zooming in stays crisp (the layers are scaled
    // up by the camera, so a higher bake = less softening at CAM_MAX).
    return Math.max(1, Math.min(Math.max(2.4, dpr), Math.sqrt(MAX_LAYER_PIXELS / area)));
  }

  /** (Re)build an offscreen layer canvas at the supersampled base resolution. */
  function makeLayer(prev: HTMLCanvasElement | null): { cv: HTMLCanvasElement; g: CanvasRenderingContext2D } {
    const scale = layerScaleNow();
    const lw = Math.max(1, Math.round(canvas.clientWidth * scale));
    const lh = Math.max(1, Math.round(canvas.clientHeight * scale));
    const cv = prev ?? document.createElement("canvas");
    if (cv.width !== lw || cv.height !== lh) {
      cv.width = lw;
      cv.height = lh;
    }
    const g = cv.getContext("2d");
    if (!g) throw new Error("Unable to acquire layer context");
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    return { cv, g };
  }

  /** Sig fragment shared by every layer: base geometry ⊕ layer resolution. */
  function layerBaseSig(): string {
    return `${baseProjSig}|x${layerScaleNow().toFixed(2)}`;
  }

  /**
   * Ocean underlay: vignette water, offshore wave rings, the landmass drop
   * shadow + base, shallow-water glow, islets and sea lanes. Static per
   * map ⊕ canvas size.
   */
  function ensureOcean(s: GameState, proj: Projection): HTMLCanvasElement {
    const sig = layerBaseSig();
    if (oceanLayer && oceanSig === sig) return oceanLayer;
    const { cv, g } = makeLayer(oceanLayer);
    oceanLayer = cv;
    oceanSig = sig;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    const grad = g.createRadialGradient(w / 2, h * 0.42, Math.min(w, h) * 0.1, w / 2, h / 2, Math.max(w, h) * 0.72);
    grad.addColorStop(0, OCEAN.inner);
    grad.addColorStop(1, OCEAN.outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    // Outer-world context: faded distant land framing the play area (drawn on
    // the water, under the active landmasses), so the map reads as a real
    // region of a larger world. Scripted maps only.
    drawContextLand(g, s);

    // Wave flecks across the open water — tiny ˘ strokes everywhere, so even
    // the far corners read as sea. The land layers paint over any beneath them.
    g.strokeStyle = OCEAN.fleck;
    g.lineWidth = 1.1;
    const flecks = Math.round((OCEAN.fleckCount * (w * h)) / (1600 * 900));
    for (let t = 0; t < flecks; t++) {
      const x = hashFloat(s.seed, 501, t, 1) * w;
      const y = hashFloat(s.seed, 501, t, 2) * h;
      const r = 3 + hashFloat(s.seed, 501, t, 3) * 5;
      g.beginPath();
      g.moveTo(x - r, y);
      g.quadraticCurveTo(x, y - r * 0.55, x + r, y);
      g.stroke();
    }

    // Bathymetric contours: faint solid depth rings stepping out from the
    // coast — the classic cartographic cue that the island sits in water.
    g.lineWidth = 1;
    for (const blob of proj.blobsPx) {
      DEPTH.contours.forEach((dist, idx) => {
        g.strokeStyle = `rgba(120, 162, 198, ${Math.max(0.02, DEPTH.contourAlpha - idx * 0.03)})`;
        tracePolyOn(g, offsetPoly(blob, dist));
        g.stroke();
      });
    }

    // Offshore wave dashes drifting just off the shoreline.
    g.setLineDash([3, 13]);
    g.lineWidth = 1.2;
    g.strokeStyle = OCEAN.wave;
    for (const blob of proj.blobsPx) {
      tracePolyOn(g, offsetPoly(blob, 11));
      g.stroke();
    }
    g.setLineDash([]);

    // Sea lanes under the land so their on-land ends tuck beneath the terrain.
    g.setLineDash([2, 7]);
    g.lineWidth = 1.6;
    g.strokeStyle = OCEAN.lane;
    for (const [a, b] of proj.lanes) {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const bow = Math.min(26, len * 0.16);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.quadraticCurveTo(mx + ((b.y - a.y) / len) * bow, my - ((b.x - a.x) / len) * bow, b.x, b.y);
      g.stroke();
    }
    g.setLineDash([]);

    // Landmass shadow + base: the island reads as a body sitting on the water.
    g.save();
    g.shadowColor = OCEAN.shadow;
    g.shadowBlur = 26;
    g.shadowOffsetY = 10;
    g.fillStyle = OCEAN.landBase;
    g.fill(proj.land);
    g.restore();

    // Shallow-water glow hugging the coast (outer half of centred strokes).
    // Stroked per blob, keeping each outline's ink off any sibling landmass.
    g.lineJoin = "round";
    proj.blobPaths.forEach((path, i) => {
      g.save();
      clipOutOtherBlobs(g, proj, i);
      g.strokeStyle = OCEAN.shallowWide;
      g.lineWidth = 26;
      g.stroke(path);
      g.strokeStyle = OCEAN.shallow;
      g.lineWidth = 12;
      g.stroke(path);
      g.restore();
    });

    // Islets: inert offshore rocks — texture for the margin waters.
    for (const rock of proj.isletsPx) {
      if (rock.length < 3) continue;
      tracePolyOn(g, rock);
      g.save();
      g.shadowColor = "rgba(0, 0, 0, 0.4)";
      g.shadowBlur = 8;
      g.shadowOffsetY = 3;
      g.fillStyle = OCEAN.islet;
      g.fill();
      g.restore();
      tracePolyOn(g, rock);
      g.lineWidth = 1;
      g.strokeStyle = OCEAN.isletEdge;
      g.stroke();
    }

    // Sea life: a few deterministic silhouettes (whale, fish school, serpent)
    // in open water, clear of the coast — the ocean reads as living sea.
    if (shape) {
      let placed = 0;
      for (let t = 0; t < 160 && placed < OCEAN.seaLifeCount; t++) {
        const nx = hashFloat(s.seed, 606, t, 1) * 1.3 - 0.15;
        const ny = hashFloat(s.seed, 606, t, 2) * 1.3 - 0.15;
        // The point and a ring around it must all be water (keeps a coast gap).
        const clear = [
          [0, 0],
          [0.055, 0],
          [-0.055, 0],
          [0, 0.055],
          [0, -0.055],
        ].every(([dx, dy]) => !pointInIsland(shape!, nx + dx!, ny + dy!));
        if (!clear) continue;
        const p = projectXY(nx, ny);
        if (p.x < 40 || p.x > w - 40 || p.y < 80 || p.y > h - 40) continue;
        drawSeaCreature(g, hashFloat(s.seed, 606, t, 3), p.x, p.y);
        placed++;
      }
    }
    return cv;
  }

  /** One small hand-drawn sea creature; `k` picks the species and its lean. */
  /**
   * Distant "outer world" land beyond the play area — faded, non-interactive,
   * unlabelled-terrain fill with a soft coastline and dim place labels, so the
   * playable region sits inside a larger, legible world. Baked into the ocean
   * layer under the active land. Scripted maps only.
   */
  function drawContextLand(g: CanvasRenderingContext2D, s: GameState): void {
    const smap = scriptedMap(s.mapId);
    const ctx = smap?.context;
    if (!ctx) return;
    for (const poly of ctx.land) {
      const px = poly.map((v) => projectXY(v[0], v[1]));
      if (px.length < 3) continue;
      g.beginPath();
      g.moveTo(px[0]!.x, px[0]!.y);
      for (let i = 1; i < px.length; i++) g.lineTo(px[i]!.x, px[i]!.y);
      g.closePath();
      g.fillStyle = OCEAN.contextLand;
      g.fill();
      g.strokeStyle = OCEAN.contextCoast;
      g.lineWidth = 1.4;
      g.lineJoin = "round";
      g.stroke();
    }
    // Distant place labels — dim, wide-tracked, so they read as "elsewhere".
    const plate = g as CanvasRenderingContext2D & { letterSpacing?: string };
    for (const lb of ctx.labels ?? []) {
      const p = projectXY(lb.x, lb.y);
      if ("letterSpacing" in plate) plate.letterSpacing = "3px";
      g.font = "700 15px system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = OCEAN.contextLabel;
      g.fillText(lb.text.toUpperCase(), p.x, p.y);
      if ("letterSpacing" in plate) plate.letterSpacing = "0px";
    }
  }

  function drawSeaCreature(g: CanvasRenderingContext2D, k: number, x: number, y: number): void {
    g.strokeStyle = OCEAN.seaLifeInk;
    g.fillStyle = OCEAN.seaLifeFill;
    g.lineWidth = 1.6;
    g.lineJoin = "round";
    g.lineCap = "round";
    const flip = k > 0.5 ? -1 : 1;
    if (k < 0.34) {
      // Whale: rounded back, tail fluke, a two-jet spout.
      g.beginPath();
      g.moveTo(x - 16 * flip, y + 3);
      g.quadraticCurveTo(x, y - 12, x + 14 * flip, y + 2);
      g.quadraticCurveTo(x, y + 6, x - 16 * flip, y + 3);
      g.closePath();
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(x + 14 * flip, y + 1);
      g.lineTo(x + 21 * flip, y - 5);
      g.moveTo(x + 14 * flip, y + 1);
      g.lineTo(x + 22 * flip, y + 4);
      g.stroke();
      g.beginPath();
      g.moveTo(x - 10 * flip, y - 8);
      g.lineTo(x - 12 * flip, y - 13);
      g.moveTo(x - 10 * flip, y - 8);
      g.lineTo(x - 7 * flip, y - 13);
      g.stroke();
    } else if (k < 0.67) {
      // Fish school: three little chevrons swimming in line.
      for (let i = 0; i < 3; i++) {
        const fx = x + (i - 1) * 13 * flip;
        const fy = y + (i % 2 === 0 ? 0 : 5);
        g.beginPath();
        g.moveTo(fx - 5 * flip, fy - 3);
        g.quadraticCurveTo(fx + 5 * flip, fy, fx - 5 * flip, fy + 3);
        g.stroke();
      }
    } else {
      // Sea serpent: two humps and a small head above the waterline.
      g.beginPath();
      g.arc(x - 10 * flip, y, 6, Math.PI, 0);
      g.stroke();
      g.beginPath();
      g.arc(x + 4 * flip, y, 6, Math.PI, 0);
      g.stroke();
      g.beginPath();
      g.arc(x + 15 * flip, y - 4, 2.4, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }

  /**
   * Terrain base: cell fills, motifs, seams, the coast terrain's dashed edge —
   * all clipped to the landmass — then the coastline ink. Terrain never changes
   * mid-game, so this rebuilds only with the map or canvas size; while motif
   * icons are still decoding it re-renders next frame until complete.
   */
  function ensureTerrain(s: GameState, proj: Projection): HTMLCanvasElement {
    const wantSig = layerBaseSig();
    if (terrainLayer && terrainSig === wantSig) return terrainLayer;
    const { cv, g } = makeLayer(terrainLayer);
    terrainLayer = cv;
    let complete = true;

    g.save();
    g.clip(proj.land);
    s.regions.forEach((region, i) => {
      const site = proj.sites[i]!;
      g.fillStyle = terrainFill(g, region.terrain, site.x, site.y, proj.reach[i]!);
      g.fill(proj.paths[i]!);
    });

    // Faint terrain motif stamped in each cell — terrain reads by shape too.
    s.regions.forEach((region, i) => {
      const motif = TERRAIN_MOTIF[region.terrain];
      if (!motif) return;
      const site = proj.sites[i]!;
      g.globalAlpha = 0.3;
      if (!drawIcon(g, `motif:${region.terrain}`, motif, "#0d0f14", site.x, site.y - 21, 17)) complete = false;
      g.globalAlpha = 1;
    });

    // Procedural terrain texture — deterministic scatter baked into the layer,
    // so trees/ridges/grass cost nothing per frame. Shape carries terrain
    // identity alongside hue (colour-blind safety).
    s.regions.forEach((region, i) => drawTerrainTexture(g, s.seed, region, i));

    // Paper grain: a hashed light/dark speckle so the land reads as material,
    // not flat vector fill. Still inside the land clip; baked once.
    {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const n = Math.round((DEPTH.grainCount * (w * h)) / (1600 * 900));
      for (let t = 0; t < n; t++) {
        const x = hashFloat(s.seed, 909, t, 1) * w;
        const y = hashFloat(s.seed, 909, t, 2) * h;
        const light = hashFloat(s.seed, 909, t, 3) < 0.5;
        g.fillStyle = light
          ? `rgba(255, 250, 235, ${DEPTH.grainAlpha})`
          : `rgba(10, 14, 18, ${DEPTH.grainAlpha})`;
        g.fillRect(x, y, 1.3, 1.3);
      }
    }

    // Soft relief: interior light, coastal shade — the landmass gains volume.
    for (let b = 0; b < proj.blobsPx.length; b++) {
      const blob = proj.blobsPx[b]!;
      if (blob.length < 3) continue;
      let cx = 0;
      let cy = 0;
      for (const v of blob) {
        cx += v.x;
        cy += v.y;
      }
      cx /= blob.length;
      cy /= blob.length;
      let r = 0;
      for (const v of blob) r = Math.max(r, Math.hypot(v.x - cx, v.y - cy));
      const relief = g.createRadialGradient(cx - r * 0.12, cy - r * 0.18, r * 0.1, cx, cy, r);
      relief.addColorStop(0, DEPTH.reliefLight);
      relief.addColorStop(0.62, "rgba(0, 0, 0, 0)");
      relief.addColorStop(1, DEPTH.reliefShade);
      g.fillStyle = relief;
      g.fill(proj.blobPaths[b]!);
    }

    // Interior seams: faint hairlines — political ink is layered on top later.
    g.lineWidth = 1;
    g.strokeStyle = CELL_EDGE_COLOR;
    for (const path of proj.paths) g.stroke(path);

    // Shoreline treatment: coast cells get a light dashed water-edge inside
    // their border, so the map's one "wet" terrain reads even under palette
    // remaps (shape/texture, not hue alone).
    g.strokeStyle = "rgba(126, 188, 226, 0.35)";
    g.lineWidth = 1.2;
    g.setLineDash([4, 5]);
    s.regions.forEach((region, i) => {
      if (region.terrain !== "coast") return;
      g.stroke(proj.paths[i]!);
    });
    g.setLineDash([]);
    g.restore();

    // Coastline ink: dark outline in the water, pale highlight just inside —
    // per blob, so touching archipelago blobs never ink across each other.
    g.lineJoin = "round";
    proj.blobPaths.forEach((path, i) => {
      g.save();
      clipOutOtherBlobs(g, proj, i);
      g.strokeStyle = OCEAN.coastLine;
      g.lineWidth = 2.1; // thin warm-brown pen line (was 2.6, near-black)
      g.stroke(path);
      g.clip(path);
      g.strokeStyle = OCEAN.coastHighlight;
      g.lineWidth = 2.2;
      g.stroke(path);
      g.restore();
    });

    terrainSig = complete ? wantSig : ""; // retry until every motif has decoded
    return cv;
  }

  /**
   * The dynamic inputs the political layer depends on: region ownership, the
   * set of wars, and the palette mode. Cheap to roll up per frame (~30 regions,
   * ≤21 nation pairs); a change rebuilds the layer, otherwise it blits as-is.
   */
  function politicalSignature(s: GameState): string {
    let acc = 7;
    for (const r of s.regions) acc = (acc * 33 + (r.ownerId === null ? 998 : r.ownerId + 1)) % 1e12;
    let wars = "";
    for (let i = 0; i < s.nations.length; i++) {
      for (let j = i + 1; j < s.nations.length; j++) {
        const a = s.nations[i]!;
        const b = s.nations[j]!;
        if (!a.isBarbarian && !b.isBarbarian && atWar(s, a.id, b.id)) wars += `${a.id}:${b.id},`;
      }
    }
    return `${layerBaseSig()}|${acc}|${wars}|${colourblind ? 1 : 0}|L${lensSig}`;
  }

  /**
   * Political ink: terrain reads first, ownership second.
   *  1. A light owner wash over each realm's cells (unowned stays bare).
   *  2. Per nation, clipped to its own cells: a wide translucent band along its
   *     *outer* border and coastline (the realm rim), then a crisp owner-
   *     coloured edge — both sides of a border paint their own half, giving a
   *     two-tone frontier. Interior same-owner seams get no ink at all.
   *  3. A thin dark centreline over every national border for definition.
   *  4. War fronts: a soft glow + loud core along contested shared edges.
   */
  function ensurePolitical(s: GameState, proj: Projection): HTMLCanvasElement {
    const sig = politicalSignature(s);
    if (politicalLayer && politicalSig === sig) return politicalLayer;
    const { cv, g } = makeLayer(politicalLayer);
    politicalLayer = cv;
    politicalSig = sig;

    /** Organic border polylines around one nation (edges facing another owner). */
    const borderPolylines = (nid: number): Point[][] => {
      const lines: Point[][] = [];
      s.regions.forEach((region, i) => {
        if (region.ownerId !== nid) return;
        const cell = organic[i]!;
        for (let k = 0; k < cell.neighbor.length; k++) {
          const j = cell.neighbor[k]!;
          if (j < 0) continue; // outer bounds — the coastline stroke covers it
          if ((s.regions[j]?.ownerId ?? null) === nid) continue;
          lines.push(proj.edgesPx[i]![k]!);
        }
      });
      return lines;
    };

    const strokePolylines = (lines: Point[][]): void => {
      g.beginPath();
      for (const pl of lines) {
        if (pl.length < 2) continue;
        g.moveTo(pl[0]!.x, pl[0]!.y);
        for (let i = 1; i < pl.length; i++) g.lineTo(pl[i]!.x, pl[i]!.y);
      }
      g.stroke();
    };

    g.save();
    g.clip(proj.land);
    g.lineJoin = "round";
    g.lineCap = "round";

    // Map lens active: recolour every region by its metric heat, then thin dark
    // separators between all regions (owner-agnostic — each is its own cell).
    // The owner washes/rims/war-fronts are skipped so the heat reads cleanly.
    if (lensColors) {
      s.regions.forEach((region, i) => {
        const c = lensColors![region.id] ?? POLITICAL.neutralWash;
        g.globalAlpha = LENS_ALPHA;
        g.fillStyle = c;
        g.fill(proj.paths[i]!);
      });
      g.globalAlpha = 1;
      const seps: Point[][] = [];
      for (let i = 0; i < s.regions.length; i++) {
        const cell = organic[i]!;
        for (let k = 0; k < cell.neighbor.length; k++) {
          const j = cell.neighbor[k]!;
          if (j < 0 || j < i) continue; // each shared edge once
          seps.push(proj.edgesPx[i]![k]!);
        }
      }
      g.strokeStyle = POLITICAL.core;
      g.lineWidth = POLITICAL.coreWidth;
      strokePolylines(seps);
      g.restore();
      return cv;
    }

    const playerId = s.nations.find((n) => n.isPlayer)?.id ?? -1;

    // 0) Unclaimed land recedes: a dark wash plus a faint diagonal hatch —
    //    "empty" is a positive signal, not just the absence of colour.
    const unclaimed = s.regions.filter((r) => r.ownerId === null);
    if (unclaimed.length > 0) {
      const path = new Path2D();
      for (const r of unclaimed) path.addPath(proj.paths[r.id]!);
      g.fillStyle = POLITICAL.neutralWash;
      g.fill(path);
      g.save();
      g.clip(path);
      g.strokeStyle = POLITICAL.neutralHatch;
      g.lineWidth = 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      g.beginPath();
      for (let x = -h; x < w; x += POLITICAL.neutralHatchSpacing) {
        g.moveTo(x, 0);
        g.lineTo(x + h, h);
      }
      g.stroke();
      g.restore();
    }

    // 1) Owner wash — the player's realm noticeably stronger than rivals'.
    s.regions.forEach((region, i) => {
      if (region.ownerId === null) return; // handled above
      const barb = region.ownerId === BARBARIAN_ID;
      const mine = region.ownerId === playerId;
      g.globalAlpha = barb
        ? POLITICAL.barbarianWashAlpha
        : mine
          ? POLITICAL.playerWashAlpha
          : POLITICAL.washAlpha;
      g.fillStyle = ownerColor(region.ownerId);
      g.fill(proj.paths[i]!);
    });
    g.globalAlpha = 1;

    // 2) Realm rims, one nation at a time, confined to that nation's cells.
    //    Every *nation* carries a loud rim; the player's is louder still — a
    //    wide soft band plus a bright inner band. Barbarian camps get no rim
    //    at all (their warm brown read too close to the player's gold): the
    //    faint wash + dark centrelines are enough for "hostile wilderness".
    for (const nation of s.nations) {
      if (nation.isBarbarian) continue;
      const owned = s.regions.filter((r) => r.ownerId === nation.id);
      if (owned.length === 0) continue;
      const nationPath = new Path2D();
      for (const r of owned) nationPath.addPath(proj.paths[r.id]!);
      const lines = borderPolylines(nation.id);
      const color = ownerColor(nation.id);
      const mine = nation.id === playerId;

      const strokeRim = (width: number, alpha: number): void => {
        g.globalAlpha = alpha;
        g.lineWidth = width;
        strokePolylines(lines);
        proj.blobPaths.forEach((path, bi) => {
          g.save();
          clipOutOtherBlobs(g, proj, bi);
          g.stroke(path);
          g.restore();
        });
      };

      g.save();
      g.clip(nationPath);
      g.strokeStyle = color;
      // Wide inner band along borders and along the realm's own coastline.
      strokeRim(
        mine ? POLITICAL.playerBandWidth : POLITICAL.bandWidth,
        mine ? POLITICAL.playerBandAlpha : POLITICAL.bandAlpha,
      );
      if (mine) strokeRim(POLITICAL.playerInnerBandWidth, POLITICAL.playerInnerBandAlpha);
      // Crisp owner-coloured edge (this half of the two-tone frontier).
      g.globalAlpha = mine ? POLITICAL.playerEdgeAlpha : POLITICAL.edgeAlpha;
      g.lineWidth = mine ? POLITICAL.playerEdgeWidth : POLITICAL.edgeWidth;
      strokePolylines(lines);
      g.globalAlpha = 1;
      g.restore();
    }

    // 3) Dark centreline over every border between two different owners.
    const centrelines: Point[][] = [];
    // 4) …and the loud treatment where the two owners are at war.
    const fronts: Point[][] = [];
    s.regions.forEach((region, i) => {
      const cell = organic[i]!;
      const oa = region.ownerId;
      for (let k = 0; k < cell.neighbor.length; k++) {
        const j = cell.neighbor[k]!;
        if (j < 0 || j < i) continue; // each shared edge once
        const ob = s.regions[j]?.ownerId ?? null;
        if (ob === oa) continue;
        centrelines.push(proj.edgesPx[i]![k]!);
        const isFront =
          oa !== null && ob !== null &&
          oa !== BARBARIAN_ID && ob !== BARBARIAN_ID &&
          atWar(s, oa, ob);
        if (isFront) fronts.push(proj.edgesPx[i]![k]!);
      }
    });
    g.strokeStyle = POLITICAL.core;
    g.lineWidth = POLITICAL.coreWidth;
    strokePolylines(centrelines);
    if (fronts.length > 0) {
      g.strokeStyle = POLITICAL.warGlow;
      g.lineWidth = POLITICAL.warGlowWidth;
      strokePolylines(fronts);
      g.strokeStyle = WAR_EDGE_COLOR;
      g.lineWidth = POLITICAL.warCoreWidth;
      strokePolylines(fronts);
    }

    g.restore();

    // Realm nameplates are NOT baked here: they draw per frame (crisp at any
    // zoom) with collision avoidance against region labels — see drawNameplates.
    return cv;
  }

  /**
   * Realm nameplates: each living nation's name floats over its lands — the
   * fastest answer to "who is where". Anchored to the owned region nearest the
   * realm's centroid (stays on the realm even when territory is disjoint), then
   * nudged to the first vertical slot that overlaps no region label, no marker
   * cluster and no already-placed plate — big names stop stamping over the
   * map's small text. Clamped on-canvas; the player's plate reads "YOU".
   */
  function drawNameplates(s: GameState, proj: Projection): void {
    // On the dense province map the realm names fade OUT as the region/city names
    // fade in (the zoom crossfade), so a zoomed-in view reads by province. Sparse
    // maps keep their realm names at every zoom.
    const realmFade = s.regions.length > 30 ? 1 - regionLabelAlpha() : 1;
    if (realmFade <= 0.02) return;
    interface Rect {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    }
    // Only dodge OTHER realm plates — the per-region markers/names are hidden at
    // this (zoomed-out) view, so avoiding them just shoved each realm's name off
    // its own land. Bigger realms place first and claim their centre; the packed
    // small realms (the German coast) shuffle a little to clear the big names.
    const placed: Rect[] = [];
    const overlaps = (a: Rect): boolean =>
      placed.some((b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0);
    const clampX = (vx: number, half: number): number =>
      Math.min(canvas.clientWidth - half - 10, Math.max(half + 10, vx));

    const plate = context as CanvasRenderingContext2D & { letterSpacing?: string };
    const nations = s.nations
      .filter((n) => !n.isBarbarian && n.alive && s.regions.some((r) => r.ownerId === n.id))
      .map((n) => ({ n, held: s.regions.filter((r) => r.ownerId === n.id) }))
      .sort((a, b) => b.held.length - a.held.length);

    for (const { n: nation, held } of nations) {
      // Realm centre = mean of its region points, nudged toward the nearest owned
      // region so a coastal/disjoint realm's name still lands on its land.
      let cx = 0, cy = 0;
      for (const r of held) { const p = proj.sites[r.id]!; cx += p.x; cy += p.y; }
      cx /= held.length; cy /= held.length;
      let ax = cx, ay = cy, best = Infinity;
      for (const r of held) {
        const p = proj.sites[r.id]!;
        const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
        if (d < best) { best = d; ax = (cx + p.x) / 2; ay = (cy + p.y) / 2; }
      }
      const label = (nation.isPlayer ? "You" : nation.name).toUpperCase();
      const size = Math.min(21, 12.5 + held.length * 1.2);
      if ("letterSpacing" in plate) plate.letterSpacing = "2px";
      context.font = `800 ${size}px system-ui, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      const half = context.measureText(label).width / 2;
      // Sit on the realm centre; only shuffle a little to clear another plate.
      const step = size + 5;
      let x = clampX(ax, half);
      let y = Math.max(58, ay);
      let placedRect: Rect | null = null;
      for (const [dx, dy] of [[0, 0], [0, -step], [0, step], [-half, 0], [half, 0], [0, -2 * step], [0, 2 * step]]) {
        const rx = clampX(ax + dx, half);
        const ry = Math.max(58, ay + dy);
        const rect: Rect = { x0: rx - half - 6, y0: ry - size / 2 - 3, x1: rx + half + 6, y1: ry + size / 2 + 3 };
        if (!overlaps(rect)) { x = rx; y = ry; placedRect = rect; break; }
      }
      if (!placedRect) placedRect = { x0: x - half - 6, y0: y - size / 2 - 3, x1: x + half + 6, y1: y + size / 2 + 3 };
      placed.push(placedRect); // later plates must dodge this one too
      context.globalAlpha = realmFade;
      context.lineWidth = 4;
      context.lineJoin = "round";
      context.strokeStyle = POLITICAL.nameplateHalo;
      context.strokeText(label, x, y);
      context.globalAlpha = POLITICAL.nameplateAlpha * realmFade;
      context.fillStyle = ownerColor(nation.id);
      context.fillText(label, x, y);
      context.globalAlpha = 1;
      if ("letterSpacing" in plate) plate.letterSpacing = "0px";
    }
  }

  /**
   * Scatter this cell's terrain stamps: candidate points are hashed in
   * normalised space (resolution-independent and reproducible per seed),
   * rejected outside the cell or near the site's marker cluster, then drawn
   * as tiny vector shapes. Runs only when the terrain layer rebuilds.
   */
  function drawTerrainTexture(g: CanvasRenderingContext2D, seed: number, region: Region, i: number): void {
    const cell = organic[i];
    if (!cell || cell.poly.length < 3) return;
    const density = TERRAIN_TEXTURE_DENSITY[region.terrain];
    if (!density) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let area2 = 0;
    for (let k = 0; k < cell.poly.length; k++) {
      const a = cell.poly[k]!;
      const b = cell.poly[(k + 1) % cell.poly.length]!;
      area2 += a.x * b.y - b.x * a.y;
      minX = Math.min(minX, a.x);
      minY = Math.min(minY, a.y);
      maxX = Math.max(maxX, a.x);
      maxY = Math.max(maxY, a.y);
    }
    const count = Math.min(26, Math.round(Math.abs(area2 / 2) * density));
    const base = (seed ^ Math.imul(region.id + 1, 7919)) >>> 0;
    g.globalAlpha = TERRAIN_TEXTURE_ALPHA;
    let placed = 0;
    for (let t = 0; t < count * 6 && placed < count; t++) {
      const x = minX + hashFloat(base, t, 3, 1) * (maxX - minX);
      const y = minY + hashFloat(base, t, 3, 2) * (maxY - minY);
      if (!pointInPolygon(cell.poly, x, y)) continue;
      if (Math.hypot(x - region.x, y - region.y) < 0.048) continue; // marker zone stays clear
      const p = projectXY(x, y);
      stampTerrain(g, region.terrain, p.x, p.y, hashFloat(base, t, 3, 3));
      placed++;
    }
    g.globalAlpha = 1;
  }

  /** One tiny hand-drawn stamp per terrain; `k` in [0,1) varies size/lean. */
  function stampTerrain(g: CanvasRenderingContext2D, t: TerrainId, x: number, y: number, k: number): void {
    switch (t) {
      case "forest": {
        const s = 5 + k * 3.5;
        g.fillStyle = "rgba(12, 36, 20, 0.55)";
        g.beginPath();
        g.moveTo(x, y - s);
        g.lineTo(x - s * 0.62, y + s * 0.55);
        g.lineTo(x + s * 0.62, y + s * 0.55);
        g.closePath();
        g.fill();
        break;
      }
      case "mountains": {
        const s = 5 + k * 4;
        g.strokeStyle = "rgba(22, 24, 32, 0.55)";
        g.lineWidth = 1.7;
        g.lineJoin = "round";
        g.beginPath();
        g.moveTo(x - s, y + s * 0.6);
        g.lineTo(x - s * 0.15, y - s * 0.7);
        g.lineTo(x + s * 0.55, y + s * 0.25);
        g.stroke();
        // Snow tick on the peak.
        g.strokeStyle = "rgba(235, 240, 248, 0.4)";
        g.lineWidth = 1.3;
        g.beginPath();
        g.moveTo(x - s * 0.38, y - s * 0.28);
        g.lineTo(x - s * 0.15, y - s * 0.7);
        g.lineTo(x + s * 0.08, y - s * 0.32);
        g.stroke();
        break;
      }
      case "hills": {
        const s = 4 + k * 3;
        g.strokeStyle = "rgba(66, 50, 22, 0.45)";
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(x, y, s, Math.PI, Math.PI * 2);
        g.stroke();
        break;
      }
      case "plains": {
        const s = 2.6 + k * 2;
        g.strokeStyle = "rgba(58, 84, 30, 0.5)";
        g.lineWidth = 1.1;
        g.beginPath();
        g.moveTo(x - s * 0.6, y + s * 0.5);
        g.lineTo(x - s * 0.2, y - s * 0.6);
        g.moveTo(x + s * 0.25, y + s * 0.5);
        g.lineTo(x + s * 0.55, y - s * 0.4);
        g.stroke();
        break;
      }
      case "coast": {
        const s = 3.2 + k * 2.4;
        g.strokeStyle = "rgba(222, 238, 248, 0.3)";
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(x - s, y);
        g.quadraticCurveTo(x - s * 0.5, y - s * 0.55, x, y);
        g.quadraticCurveTo(x + s * 0.5, y + s * 0.55, x + s, y);
        g.stroke();
        break;
      }
    }
  }

  /** Offset a pixel-space polygon outward by `dist` along vertex normals. */
  function offsetPoly(poly: Point[], dist: number): Point[] {
    if (poly.length < 3) return poly;
    let cx = 0;
    let cy = 0;
    for (const p of poly) {
      cx += p.x;
      cy += p.y;
    }
    cx /= poly.length;
    cy /= poly.length;
    return poly.map((p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / len) * dist, y: p.y + (dy / len) * dist };
    });
  }

  // --- Registry icon cache ---------------------------------------------------
  // SVG source → tinted data: URI Image → per-size offscreen raster, so the
  // render loop never re-decodes an asset (same discipline as the Voronoi cache).
  // While an image is still decoding, drawIcon reports false and the caller
  // paints its legacy emoji/colour fallback — the map renders with zero assets.
  interface IconEntry {
    img: HTMLImageElement;
    ready: boolean;
    scaled: Map<number, HTMLCanvasElement>;
  }
  const iconCache = new Map<string, IconEntry>();

  function iconEntry(key: string, svg: string, color: string): IconEntry {
    let entry = iconCache.get(key);
    if (!entry) {
      const img = new Image();
      const e: IconEntry = { img, ready: false, scaled: new Map() };
      img.onload = () => {
        e.ready = true;
      };
      img.src = "data:image/svg+xml," + encodeURIComponent(svg.replaceAll("currentColor", color));
      iconCache.set(key, e);
      entry = e;
    }
    return entry;
  }

  /** Draw a registry icon centred at (x, y); false = not ready/absent → use fallback. */
  function drawIcon(
    g: CanvasRenderingContext2D,
    name: string,
    svg: string | null,
    color: string,
    x: number,
    y: number,
    size: number,
  ): boolean {
    if (!svg) return false;
    const entry = iconEntry(`${name}|${color}`, svg, color);
    if (!entry.ready) return false;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.max(1, Math.round(size * dpr));
    let raster = entry.scaled.get(px);
    if (!raster) {
      raster = document.createElement("canvas");
      raster.width = px;
      raster.height = px;
      raster.getContext("2d")?.drawImage(entry.img, 0, 0, px, px);
      entry.scaled.set(px, raster);
    }
    g.drawImage(raster, x - size / 2, y - size / 2, size, size);
    return true;
  }

  /** A soft dark chip behind a map icon so it reads over any terrain fill. */
  function iconChip(x: number, y: number, r: number): void {
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fillStyle = "rgba(13, 15, 20, 0.55)";
    context.fill();
  }

  /** Terrain fill: flat colour until the registry provides a hi/lo shade pair. */
  function terrainFill(
    g: CanvasRenderingContext2D,
    t: TerrainId,
    cx: number,
    cy: number,
    r: number,
  ): string | CanvasGradient {
    const shade = TERRAIN_ART[t];
    const base = TERRAIN[t].color;
    if (!shade) return base;
    const grad = g.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.15, cx, cy, r * 1.05);
    grad.addColorStop(0, shade.hi);
    grad.addColorStop(0.55, base);
    grad.addColorStop(1, shade.lo);
    return grad;
  }

  function ownerColor(ownerId: number | null): string {
    if (ownerId === null || !state) return NEUTRAL_OWNER;
    const base = state.nations.find((n) => n.id === ownerId)?.color ?? NEUTRAL_OWNER;
    return cbSafe(base, colourblind);
  }

  /**
   * Ocean margins around the land rect, from the archetype's framing. The
   * bottom HUD (research pill, actions, log) is heavier than the top bar, so
   * the frame biases the landmass slightly upward.
   */
  function frameMargins(): { x: number; top: number; bottom: number } {
    const f = ISLAND_FRAME[archetype];
    // A context map frames itself with real outer-world land (which bleeds past
    // the play area), so it needs only a thin inset — NOT the procedural island's
    // big sea border. Using just `outerMargin` lets the playable land fill the
    // canvas (the fix for the map reading small/cramped). A plain island keeps
    // the archetype's generous framing.
    const baseX = outerMargin > 0 ? outerMargin : f.marginX;
    const baseY = outerMargin > 0 ? outerMargin : f.marginY;
    const mx = baseX * canvas.clientWidth;
    const my = baseY * canvas.clientHeight;
    return { x: mx + 8, top: my * 0.78 + 6, bottom: my * 1.22 + 30 };
  }

  function projectXY(x: number, y: number): Point {
    const { clientWidth, clientHeight } = canvas;
    const m = frameMargins();
    const c = camOverride ?? cam;
    const bx = m.x + x * (clientWidth - m.x * 2);
    const by = m.top + y * (clientHeight - m.top - m.bottom);
    return { x: bx * c.s + c.tx, y: by * c.s + c.ty };
  }


  function project(region: Region): Point {
    return projectXY(region.x, region.y);
  }

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = canvas;
    canvas.width = Math.max(1, Math.floor(clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(clientHeight * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    clampCam(); // a shrunken viewport must not leave the pan out of bounds
    needsPaint = true; // setting canvas.width cleared the bitmap
  }

  function render(): void {
    if (!running) return;
    if (interactFrames > 0) interactFrames -= 1;
    // Busy = a live pan/pinch or the brief settle window after a zoom. While busy
    // the label pass is dropped for a smooth camera; we keep repainting until it
    // settles, so the final frame lands with the labels back.
    const busy = pointers.size > 0 || interactFrames > 0;
    // Idle skip: nothing animating and no repaint requested — keep the last
    // frame on screen and do no work at all.
    if (!needsPaint && ripples.length === 0 && !busy) {
      tick += 1;
      frame = window.requestAnimationFrame(render);
      return;
    }
    needsPaint = false;
    // Base water fill: overscroll slack and zoomed-out views expose canvas
    // beyond the static composite — it must always read as sea, never as void.
    context.fillStyle = OCEAN.outer;
    context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    if (state) {
      const proj = ensureProjection(state);
      paintVoronoi(state, proj, busy);
      drawTradeLanes(proj);
      drawArmies(state);
      drawRipples(state);
      if (minimap) drawMinimap(state);
    }
    if (busy) needsPaint = true; // keep draining the settle counter → labelled final frame
    tick += 1;
    frame = window.requestAnimationFrame(render);
  }

  /**
   * Redraw the minimap: the baked map composite fitted into the small HUD canvas,
   * plus a rectangle marking the slice the camera currently shows. Reuses the
   * same cached composite the main view blits, so it's ~one extra drawImage per
   * painted frame and always reflects the active lens.
   */
  function drawMinimap(s: GameState): void {
    const mm = minimap;
    if (!mm) return;
    const mctx = mm.getContext("2d");
    if (!mctx) return;
    const st = ensureStatic(s);
    const dpr = window.devicePixelRatio || 1;
    const cw = mm.clientWidth || 168;
    const ch = mm.clientHeight || 116;
    const bw = Math.max(1, Math.round(cw * dpr));
    const bh = Math.max(1, Math.round(ch * dpr));
    if (mm.width !== bw || mm.height !== bh) {
      mm.width = bw;
      mm.height = bh;
    }
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.clearRect(0, 0, cw, ch);
    mctx.fillStyle = OCEAN.outer;
    mctx.fillRect(0, 0, cw, ch);
    // Contain-fit the composite (its aspect matches the main canvas), letterboxed.
    const aw = Math.max(1, canvas.clientWidth);
    const ah = Math.max(1, canvas.clientHeight);
    const scale = Math.min(cw / aw, ch / ah);
    const fw = aw * scale;
    const fh = ah * scale;
    const ox = (cw - fw) / 2;
    const oy = (ch - fh) / 2;
    mctx.drawImage(st, 0, 0, st.width, st.height, ox, oy, fw, fh);
    minimapFit = { ox, oy, fw, fh };
    // Current-view rectangle: the base-normalised slice the camera shows (clamped
    // to the fitted map so it never spills into the letterbox).
    const vw = Math.min(fw, fw / cam.s);
    const vh = Math.min(fh, fh / cam.s);
    // Candidate top-left ≥ (ox,oy) by construction; clamp the right/bottom edge in.
    const vx = Math.min(ox + Math.max(0, -cam.tx / (aw * cam.s)) * fw, ox + fw - vw);
    const vy = Math.min(oy + Math.max(0, -cam.ty / (ah * cam.s)) * fh, oy + fh - vh);
    mctx.strokeStyle = "rgba(255, 242, 207, 0.92)";
    mctx.lineWidth = 1.5;
    mctx.strokeRect(vx, vy, vw, vh);
  }

  /**
   * Recenter the camera so (nx,ny) in normalised map space sits at the viewport
   * centre — the player clicked that spot on the minimap. Clamped to bounds, so
   * clicking at fit-zoom (pan locked) is a harmless no-op.
   */
  function centerOnNorm(nx: number, ny: number): void {
    const aw = canvas.clientWidth;
    const ah = canvas.clientHeight;
    cam.tx = aw * (0.5 - nx * cam.s);
    cam.ty = ah * (0.5 - ny * cam.s);
    clampCam();
    needsPaint = true;
  }

  function onMinimapPointerDown(ev: PointerEvent): void {
    const mm = minimap;
    if (!mm || !minimapFit) return;
    const rect = mm.getBoundingClientRect();
    const nx = (ev.clientX - rect.left - minimapFit.ox) / minimapFit.fw;
    const ny = (ev.clientY - rect.top - minimapFit.oy) / minimapFit.fh;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return; // clicked the letterbox
    centerOnNorm(nx, ny);
    ev.preventDefault();
  }

  /** Draw and age the capture ripples: a quick flash, then an expanding fading ring. */
  function drawRipples(s: GameState): void {
    if (ripples.length === 0) return;
    for (const r of ripples) {
      const region = s.regions[r.regionId];
      if (!region) continue;
      const p = project(region);
      const age = tick - r.born;
      const t = age / RIPPLE_FRAMES; // 0..1 progress
      // Opening flash (first ~25%): a bright disc that fades fast.
      if (t < 0.25) {
        context.save();
        context.globalAlpha = 0.5 * (1 - t / 0.25);
        context.fillStyle = "#fff2cf";
        context.beginPath();
        context.arc(p.x, p.y, NODE_RADIUS * 0.9, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
      // Expanding owner-colour ring across the whole lifetime.
      context.save();
      context.globalAlpha = Math.max(0, 1 - t);
      context.strokeStyle = r.color;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(p.x, p.y, NODE_RADIUS + t * 46, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
    context.lineWidth = 2;
    ripples = ripples.filter((r) => tick - r.born < RIPPLE_FRAMES);
  }

  /** Capitals still held by their nation — the crown/double-ring vanishes on capture. */
  function capitalSet(s: GameState): Set<number> {
    const capitals = new Set<number>();
    for (const n of s.nations) {
      if (n.isBarbarian || n.capitalRegionId === undefined) continue;
      const cap = s.regions[n.capitalRegionId];
      if (cap && cap.ownerId === n.id) capitals.add(n.capitalRegionId);
    }
    return capitals;
  }

  /**
   * Ocean+terrain+political folded into one canvas so a frame is one draw.
   * Everything bakes in base space (identity camera, supersampled) — the
   * camera transform at draw time handles pan/zoom without any rebuild.
   */
  function ensureStatic(s: GameState): HTMLCanvasElement {
    const proj = ensureBaseProjection(s);
    camOverride = BASE_CAM; // texture/grain/sea-life sampling projects in base space
    let ocean: HTMLCanvasElement;
    let terrain: HTMLCanvasElement;
    let political: HTMLCanvasElement;
    try {
      ocean = ensureOcean(s, proj);
      terrain = ensureTerrain(s, proj);
      political = ensurePolitical(s, proj);
    } finally {
      camOverride = null;
    }
    const sig = `${oceanSig}||${terrainSig}||${politicalSig}`;
    if (staticLayer && sig === staticSig) return staticLayer;
    staticSig = sig;
    if (!staticLayer) staticLayer = document.createElement("canvas");
    if (staticLayer.width !== ocean.width || staticLayer.height !== ocean.height) {
      staticLayer.width = ocean.width;
      staticLayer.height = ocean.height;
    }
    const g = staticLayer.getContext("2d")!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, staticLayer.width, staticLayer.height);
    g.drawImage(ocean, 0, 0);
    g.drawImage(terrain, 0, 0);
    g.drawImage(political, 0, 0);
    return staticLayer;
  }

  /**
   * The island territory view: draw the cached static composite through the
   * live camera, then the per-frame dynamics — selection, highlights, markers,
   * realm nameplates — crisp at the current zoom.
   */
  function paintVoronoi(s: GameState, proj: Projection, busy = false): void {
    markerHits = []; // the marker passes below re-register this frame's tips
    const st = ensureStatic(s);
    context.drawImage(
      st,
      0,
      0,
      st.width,
      st.height,
      cam.tx,
      cam.ty,
      canvas.clientWidth * cam.s,
      canvas.clientHeight * cam.s,
    );
    const capitals = capitalSet(s);

    context.save();
    context.clip(proj.land);

    // Target highlights, then the selection outline on top.
    for (const region of s.regions) {
      if (!highlights.has(region.id)) continue;
      context.strokeStyle = HIGHLIGHT_COLOR;
      context.lineWidth = 3;
      context.setLineDash([6, 4]);
      context.stroke(proj.paths[region.id]!);
      context.setLineDash([]);
    }
    if (selected !== null && proj.paths[selected]) {
      // Soft gold glow beneath the crisp selection line.
      context.strokeStyle = "rgba(244, 210, 122, 0.28)";
      context.lineWidth = 10;
      context.lineJoin = "round";
      context.stroke(proj.paths[selected]!);
      context.strokeStyle = SELECT_COLOR;
      context.lineWidth = 3;
      context.stroke(proj.paths[selected]!);
    }
    context.restore();

    // Markers + nameplates carry the frame's text — the expensive pass — so skip
    // them entirely while the camera is moving (the baked map + armies still show).
    if (!busy) {
      // Markers at each region's site (guaranteed inside its own cell).
      for (const region of s.regions) {
        drawMarkers(region, proj.sites[region.id]!, capitals);
      }
      // Realm nameplates last: placed to dodge the labels just drawn.
      drawNameplates(s, proj);
    } else {
      markerHits = []; // no hover targets while the labels are hidden
    }
  }

  /**
   * Shared region markers (both layouts), stacked as one tidy column so
   * neighbouring regions stop colliding: (crest +) population chip at the
   * site, the name beneath, then a compact status row — resource, fort,
   * construction, unrest — centred under the name. The army badge keeps its
   * own bottom-right corner (it belongs to an army, not the region).
   */
  function drawMarkers(region: Region, p: Point, capitals: Set<number>): void {
    // The population chip, name and status ride the same zoom reveal on the dense
    // province map, so a zoomed-out view stays clean (realm colours + names +
    // capital crests + armies) and the detail appears as you zoom in.
    const denseMap = (state?.regions.length ?? 0) > 30;
    const detailA = !denseMap || region.id === selected ? 1 : regionLabelAlpha();
    const showChip = detailA > 0.02;

    // Population count in a soft dark chip (same family as the icon chips), so
    // it reads identically over any terrain fill or political tint. Shown as
    // people ("4.3k"), not sim units — the world reads as populated.
    let popW = 0;
    if (showChip) {
      const popText = popCompact(region.population);
      context.font = "600 12px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      popW = Math.max(19, context.measureText(popText).width + 11);
      context.globalAlpha = detailA;
      context.beginPath();
      if (typeof context.roundRect === "function") {
        context.roundRect(p.x - popW / 2, p.y - 9.5, popW, 19, 9.5);
      } else {
        context.arc(p.x, p.y, 9.5, 0, Math.PI * 2); // ancient-canvas fallback: a disc
      }
      context.fillStyle = "rgba(13, 15, 20, 0.6)";
      context.fill();
      context.fillStyle = "#f2f5fa";
      context.fillText(popText, p.x, p.y + 0.5);
      context.globalAlpha = 1;
      markerHits.push({
        x: p.x,
        y: p.y,
        r: Math.max(11, popW / 2),
        text: `Population ${popDisplay(region.population)} of ${popDisplay(regionCapacity(region))} — grows with food surplus, works the land.`,
      });
    }

    // Capital crest — always shown so the seats read at any zoom. Docks left of
    // the population chip when it's up, else sits on the site itself.
    if (capitals.has(region.id)) {
      const cx = showChip ? p.x - popW / 2 - 13 : p.x;
      const cy = p.y;
      const owner = region.ownerId;
      const ownerNation = state?.nations.find((n) => n.id === owner);
      markerHits.push({
        x: cx,
        y: cy,
        r: 11.5,
        text: `Capital of ${ownerNation?.isPlayer ? "your realm" : (ownerNation?.name ?? "a realm")} — its seat of power.`,
      });
      const crestArt = owner === null ? null : crestSvg(owner, ownerColor(owner));
      iconChip(cx, cy, 10.5);
      context.beginPath();
      context.arc(cx, cy, 10.5, 0, Math.PI * 2);
      context.lineWidth = 1;
      context.strokeStyle = "rgba(244, 210, 122, 0.55)"; // faint gold ring
      context.stroke();
      if (
        !(crestArt && drawIcon(context, `crest:${owner}`, crestArt, ownerColor(owner), cx, cy, 17)) &&
        !drawIcon(context, "glyph:crown", GLYPH_ART.crown, CAPITAL_ICON_COLOR, cx, cy, 14)
      ) {
        context.font = "13px system-ui, sans-serif";
        context.fillText("👑", cx, cy);
      }
    }

    // Region/city name fades in with the same zoom reveal as the chip above
    // (drawNameplates fades the realm names out over the same window), so a
    // zoomed-out view reads by realm and a zoomed-in view by province.
    const nameAlpha = detailA;
    const showDetail = showChip;

    // Region name below, with a dark halo so it reads on bright terrain too.
    // A touch of tracking gives the labels a cartographic voice where the
    // browser supports canvas letterSpacing (harmless no-op elsewhere).
    if (showDetail) {
      context.globalAlpha = nameAlpha;
      const label = context as CanvasRenderingContext2D & { letterSpacing?: string };
      if ("letterSpacing" in label) label.letterSpacing = "0.4px";
      context.font = "600 11px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "top";
      context.lineWidth = 3;
      context.lineJoin = "round";
      context.strokeStyle = "rgba(10, 12, 16, 0.7)";
      context.strokeText(region.name, p.x, p.y + NODE_RADIUS + 4);
      context.fillStyle = "#e6eaf3";
      context.fillText(region.name, p.x, p.y + NODE_RADIUS + 4);
      if ("letterSpacing" in label) label.letterSpacing = "0px";
      context.globalAlpha = 1;
    }

    // Status row: one slot per active signal, centred under the name. Each
    // slot draws its icon and registers its hover tip. A revolt always shows
    // (a warning must never hide); the calmer signals follow the name's zoom
    // reveal so they do not clutter the fit-zoom province map.
    const slots: { tip: string; draw(x: number, y: number): void; always?: boolean }[] = [];
    if (region.resource) {
      const tip =
        region.resource === "iron"
          ? "Iron deposit — a strategic resource; advanced units (Ranged, Siege) need iron."
          : "Horses — a strategic resource; Cavalry needs horses.";
      slots.push({
        tip,
        draw: (x, y) => {
          iconChip(x, y, 8.5);
          const art = RESOURCE_ART[region.resource!];
          if (!drawIcon(context, `res:${region.resource}`, art, MAP_ICON_COLOR, x, y, 12)) {
            context.font = "11px system-ui, sans-serif";
            context.fillStyle = MAP_ICON_COLOR;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(RESOURCE_ICON[region.resource!] ?? "?", x, y);
          }
        },
      });
    }
    if (region.fortification > 0) {
      slots.push({
        tip: `Fortification level ${region.fortification} — defenders here are much harder to dislodge; siege units strip it.`,
        draw: (x, y) => {
          iconChip(x, y, 8.5);
          context.font = "600 9.5px system-ui, sans-serif";
          context.textAlign = "center";
          context.textBaseline = "middle";
          if (drawIcon(context, "glyph:shield", GLYPH_ART.shield, MAP_ICON_COLOR, x - 3.5, y, 10)) {
            context.fillStyle = MAP_ICON_COLOR;
            context.fillText(String(region.fortification), x + 4.5, y);
          } else {
            context.fillStyle = MAP_ICON_COLOR; // the digit must not inherit stale ink
            context.fillText(`🛡${region.fortification}`, x, y);
          }
        },
      });
    }
    if (region.construction) {
      const def = BUILDINGS[region.construction.building];
      const buildEta = Math.max(1, Math.ceil((def.cost - region.construction.progress) / BUILD_RATE));
      slots.push({
        tip: `Under construction: ${def.name} (${Math.floor(region.construction.progress)}/${def.cost} materials, ~${buildEta} turn${buildEta === 1 ? "" : "s"} left). Building advances each End turn.`,
        draw: (x, y) => {
          iconChip(x, y, 8.5);
          if (!drawIcon(context, "glyph:hammer", GLYPH_ART.hammer, MAP_ICON_COLOR, x, y, 11)) {
            context.font = "11px system-ui, sans-serif";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText("🔨", x, y);
          }
        },
      });
    }
    const dot = unrestDot(region.unrest);
    if (dot) {
      slots.push({
        always: region.unrest >= UNREST_REVOLT, // a revolt warning must never hide
        tip:
          region.unrest >= UNREST_REVOLT
            ? `Unrest ${Math.round(region.unrest)} — REVOLT: the region produces nothing and may secede. Garrison it or cut taxes.`
            : `Unrest ${Math.round(region.unrest)} — restless: production suffers. Ease taxes, garrison, or build calming structures.`,
        draw: (x, y) => {
          context.beginPath();
          context.arc(x, y, 4.5, 0, Math.PI * 2);
          context.fillStyle = dot;
          context.fill();
          context.lineWidth = 1;
          context.strokeStyle = "rgba(13, 15, 20, 0.6)";
          context.stroke();
        },
      });
    }
    // At fit zoom on the dense map, keep only the must-show signals (revolts);
    // the rest ride the same zoom reveal as the name.
    const shownSlots = showDetail ? slots : slots.filter((sl) => sl.always);
    if (shownSlots.length > 0) {
      const gap = 19;
      const rowY = p.y + NODE_RADIUS + 25;
      const x0 = p.x - ((shownSlots.length - 1) * gap) / 2;
      shownSlots.forEach((slot, i) => {
        const x = x0 + i * gap;
        slot.draw(x, rowY);
        markerHits.push({ x, y: rowY, r: 9.5, text: slot.tip });
      });
    }
  }

  /**
   * Merchant lines for the trade lens: each route's lane drawn as a polyline
   * through its regions' sites to the Kontor, amber for a live route and dashed
   * red for a severed one, the player's a touch bolder. A soft underlay makes the
   * lines read over any terrain. Drawn live (routes change with war and capture).
   */
  function drawTradeLanes(proj: Projection): void {
    const routes = tradeLanes;
    if (!routes || routes.length === 0) return;
    context.save();
    context.lineJoin = "round";
    context.lineCap = "round";
    for (const route of routes) {
      const pts = route.lane.map((id) => proj.sites[id]).filter(Boolean) as { x: number; y: number }[];
      if (pts.length < 2) continue;
      const mine = route.ownerId === PLAYER_ID;
      const disrupted = !!route.disrupted;
      const trace = (): void => {
        context.beginPath();
        context.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) context.lineTo(pts[i]!.x, pts[i]!.y);
      };
      // Soft underlay.
      trace();
      context.strokeStyle = disrupted ? "rgba(200, 70, 60, 0.28)" : "rgba(232, 145, 58, 0.30)";
      context.lineWidth = mine ? 7 : 5;
      context.stroke();
      // Crisp line (severed routes dashed).
      trace();
      context.setLineDash(disrupted ? [5, 5] : []);
      context.strokeStyle = disrupted ? "#c8463c" : mine ? "#f4c04a" : "#e8913a";
      context.lineWidth = mine ? 2.4 : 1.6;
      context.stroke();
      context.setLineDash([]);
      // A dot at the Kontor end (goods flow *to* the market).
      const end = pts[pts.length - 1]!;
      context.beginPath();
      context.arc(end.x, end.y, mine ? 4.5 : 3.5, 0, Math.PI * 2);
      context.fillStyle = disrupted ? "#c8463c" : "#f0b35a";
      context.fill();
    }
    context.restore();
  }

  function drawArmies(s: GameState): void {
    for (const army of s.armies) {
      const size = armySize(army.units);
      if (size <= 0) continue;
      const region = s.regions[army.regionId];
      if (!region) continue;
      const ownerNation = s.nations.find((n) => n.id === army.ownerId);
      const mine = !!ownerNation?.isPlayer;
      const p = project(region);
      const bx = p.x + NODE_RADIUS - 4;
      const by = p.y + NODE_RADIUS - 4;
      // YOUR armies must be findable at a glance: bigger badge, gold outer
      // ring, a tiny banner pennant on top. Rivals keep the plain badge.
      // Sized as a pill so soldier counts ("3k", "12k") always fit.
      const r = mine ? 12 : 10;
      const label = soldiersCompact(size);
      context.font = `700 ${mine ? 12 : 11}px system-ui, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      const halfW = Math.max(r, context.measureText(label).width / 2 + 6);

      const pill = (grow: number): void => {
        context.beginPath();
        if (typeof context.roundRect === "function") {
          context.roundRect(bx - halfW - grow, by - r - grow, (halfW + grow) * 2, (r + grow) * 2, r + grow);
        } else {
          context.arc(bx, by, r + grow, 0, Math.PI * 2);
        }
      };
      pill(0);
      context.fillStyle = ownerColor(army.ownerId);
      context.fill();
      // Light ring lifts the badge off the map (a dark ring sank into tints).
      context.lineWidth = 1.5;
      context.strokeStyle = "rgba(238, 242, 248, 0.85)";
      pill(0);
      context.stroke();
      if (mine) {
        context.lineWidth = 2.5;
        context.strokeStyle = "#f4d27a";
        pill(2.5);
        context.stroke();
        // Banner pennant: a small gold flag poking above the badge.
        context.beginPath();
        context.moveTo(bx - 1, by - r - 12);
        context.lineTo(bx - 1, by - r - 2);
        context.lineWidth = 1.6;
        context.strokeStyle = "#f4d27a";
        context.stroke();
        context.beginPath();
        context.moveTo(bx - 1, by - r - 12);
        context.lineTo(bx + 8, by - r - 9.5);
        context.lineTo(bx - 1, by - r - 7);
        context.closePath();
        context.fillStyle = "#f4d27a";
        context.fill();
      }

      context.fillStyle = "#0d0f14";
      context.fillText(label, bx, by);

      const who = ownerNation?.isPlayer ? "Your" : ownerNation?.isBarbarian ? "Tribal" : `${ownerNation?.name ?? "Rival"}'s`;
      const hint = mine
        ? " Click the region, then Move / Attack to send it somewhere."
        : "";
      markerHits.push({
        x: bx,
        y: by,
        r: halfW + 3,
        text: `${who} army — ${soldiersDisplay(size)} soldiers stationed in ${region.name}.${hint}`,
      });
    }
  }

  function tracePolyOn(g: CanvasRenderingContext2D, poly: Point[]): void {
    if (poly.length === 0) return;
    g.beginPath();
    g.moveTo(poly[0]!.x, poly[0]!.y);
    for (let i = 1; i < poly.length; i++) g.lineTo(poly[i]!.x, poly[i]!.y);
    g.closePath();
  }

  /** A closed Path2D from a pixel polygon. */
  function polyPath(poly: Point[]): Path2D {
    const p = new Path2D();
    if (poly.length >= 3) {
      p.moveTo(poly[0]!.x, poly[0]!.y);
      for (let i = 1; i < poly.length; i++) p.lineTo(poly[i]!.x, poly[i]!.y);
      p.closePath();
    }
    return p;
  }

  /**
   * Clip to everywhere EXCEPT the other landmass blobs. Archipelago blobs may
   * touch or overlap; stroking one blob's outline inside this clip keeps its
   * coastline ink strictly off its neighbours' land — no lines across terrain.
   */
  function clipOutOtherBlobs(g: CanvasRenderingContext2D, proj: Projection, except: number): void {
    if (proj.blobPaths.length <= 1) return;
    const mask = new Path2D();
    mask.rect(0, 0, canvas.clientWidth, canvas.clientHeight);
    proj.blobsPx.forEach((blob, i) => {
      if (i === except || blob.length < 3) return;
      mask.moveTo(blob[0]!.x, blob[0]!.y);
      for (let k = 1; k < blob.length; k++) mask.lineTo(blob[k]!.x, blob[k]!.y);
      mask.closePath();
    });
    g.clip(mask, "evenodd");
  }

  function unrestDot(unrest: number): string | null {
    if (unrest >= UNREST_REVOLT) return "#e8776b";
    if (unrest >= UNREST_PENALTY_START) return "#e0b74a";
    return null;
  }

  function hitTest(px: number, py: number): number | null {
    if (!state) return null;
    ensureCells(state);
    // Hit-test against the *organic* polygons — exactly what is drawn — testing
    // EVERY ring of a multipart province, so a small offshore part (Hiiumaa,
    // Öland, the Danish isles) selects its realm just like the mainland does.
    // A click that lands in no cell (open sea) returns null and deselects.
    for (let i = 0; i < organic.length; i++) {
      const cell = organic[i]!;
      const rings = cell.rings ?? [cell.poly];
      for (const ring of rings) {
        if (ring.length < 3) continue;
        const poly = ring.map((v) => projectXY(v.x, v.y));
        if (pointInPolygon(poly, px, py)) return state.regions[i]?.id ?? i;
      }
    }
    return null;
  }

  // --- Pointer input: tap to select, drag to pan, pinch/wheel to zoom --------
  // A press only counts as a click if the pointer never strayed past the slop
  // radius; anything further is a pan. Two active pointers form a pinch.
  const pointers = new Map<number, Point>();
  let pressMoved = false;
  let wasPinch = false;
  let pinchDist = 0;
  let pinchMid: Point = { x: 0, y: 0 };

  function localXY(ev: PointerEvent | WheelEvent | MouseEvent): Point {
    const rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  function onPointerDown(ev: PointerEvent): void {
    reportHover(null, 0, 0); // a press ends any hover tip
    canvas.style.cursor = "grabbing";
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch {
      /* synthetic/expired pointer (e.g. automation) — dragging still works */
    }
    pointers.set(ev.pointerId, localXY(ev));
    if (pointers.size === 1) {
      pressMoved = false;
      wasPinch = false;
    } else if (pointers.size === 2) {
      wasPinch = true;
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(b!.x - a!.x, b!.y - a!.y) || 1;
      pinchMid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
    }
  }

  function onPointerMove(ev: PointerEvent): void {
    // No button down → pure hover: look up the marker tips under the cursor.
    if (pointers.size === 0) {
      const p = localXY(ev);
      let hit: MarkerHit | null = null;
      for (const h of markerHits) {
        const dx = p.x - h.x;
        const dy = p.y - h.y;
        if (dx * dx + dy * dy <= (h.r + 2) * (h.r + 2)) {
          hit = h;
          break;
        }
      }
      reportHover(hit, ev.clientX, ev.clientY);
      return;
    }
    const prev = pointers.get(ev.pointerId);
    if (!prev) return;
    const now = localXY(ev);
    pointers.set(ev.pointerId, now);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(b!.x - a!.x, b!.y - a!.y) || 1;
      const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      setZoom((cam.s * dist) / pinchDist, mid.x, mid.y);
      panBy(mid.x - pinchMid.x, mid.y - pinchMid.y);
      pinchDist = dist;
      pinchMid = mid;
      pressMoved = true;
      return;
    }
    if (pointers.size === 1) {
      const dx = now.x - prev.x;
      const dy = now.y - prev.y;
      if (pressMoved || Math.abs(dx) + Math.abs(dy) > 3) {
        pressMoved = true;
        panBy(dx, dy);
      }
    }
  }

  function onPointerUp(ev: PointerEvent): void {
    const wasLast = pointers.size === 1;
    const pos = pointers.get(ev.pointerId) ?? localXY(ev);
    pointers.delete(ev.pointerId);
    // A clean tap (no pan, no pinch) selects; everything else was navigation.
    if (wasLast && !pressMoved && !wasPinch) clickHandler(hitTest(pos.x, pos.y));
    if (pointers.size === 0) {
      wasPinch = false;
      canvas.style.cursor = "grab";
    }
  }

  function onPointerLeave(): void {
    reportHover(null, 0, 0);
  }

  function onWheel(ev: WheelEvent): void {
    ev.preventDefault();
    const p = localXY(ev);
    setZoom(cam.s * Math.exp(-ev.deltaY * 0.0016), p.x, p.y);
  }

  function onDblClick(ev: MouseEvent): void {
    // Double-click toggles: away from fit → re-centre at fit; at fit → 2×.
    const p = localXY(ev);
    if (Math.abs(cam.s - 1) > 0.05 || Math.abs(cam.tx) > 4 || Math.abs(cam.ty) > 4) {
      fitView();
    } else {
      setZoom(2, p.x, p.y);
    }
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      resize();
      window.addEventListener("resize", resize);
      canvas.style.cursor = "grab";
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
      canvas.addEventListener("pointerleave", onPointerLeave);
      canvas.addEventListener("wheel", onWheel, { passive: false });
      canvas.addEventListener("dblclick", onDblClick);
      frame = window.requestAnimationFrame(render);
    },
    stop(): void {
      running = false;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDblClick);
    },
    setState(next: GameState): void {
      state = next;
      archetype = islandArchetype(next.regions.length, next.seed);
      needsPaint = true;
    },
    setSelected(regionId: number | null): void {
      selected = regionId;
      needsPaint = true;
    },
    setHighlights(regionIds: number[]): void {
      highlights = new Set(regionIds);
      needsPaint = true;
    },
    setLens(colors: (string | null)[] | null): void {
      const sig = colors ? colors.map((c) => c ?? "-").join(",") : "";
      if (sig === lensSig) return; // unchanged — skip the rebake
      lensColors = colors;
      lensSig = sig;
      needsPaint = true;
    },
    setTradeLanes(routes: TradeRoute[] | null): void {
      tradeLanes = routes && routes.length ? routes : null;
    },
    setColourblind(on: boolean): void {
      colourblind = on;
      needsPaint = true;
    },
    setReduceMotion(on: boolean): void {
      reduceMotion = on;
      if (on) ripples = []; // drop any in-flight motion
      needsPaint = true;
    },
    pulseCapture(regionId: number): void {
      if (reduceMotion) return;
      ripples.push({ regionId, color: ownerColor(state?.regions[regionId]?.ownerId ?? null), born: tick });
      needsPaint = true;
    },
    onRegionClick(handler: (regionId: number | null) => void): void {
      clickHandler = handler;
    },
    onMarkerHover(handler: (tip: { text: string; x: number; y: number } | null) => void): void {
      hoverHandler = handler;
    },
    zoomBy(factor: number): void {
      setZoom(cam.s * factor, canvas.clientWidth / 2, canvas.clientHeight / 2);
    },
    resetView(): void {
      fitView();
    },
    setMinimap(target: HTMLCanvasElement | null): void {
      if (minimap === target) return;
      if (minimap) minimap.removeEventListener("pointerdown", onMinimapPointerDown);
      minimap = target;
      if (minimap) {
        minimap.style.cursor = "pointer";
        minimap.addEventListener("pointerdown", onMinimapPointerDown);
      } else {
        minimapFit = null;
      }
      needsPaint = true;
    },
  };
}

/** Exposed for potential reuse/testing of the army badge count. */
export function stackLabel(army: Army): string {
  return soldiersCompact(armySize(army.units));
}
