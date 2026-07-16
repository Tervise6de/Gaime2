/**
 * Renderer system.
 *
 * Draws the region graph onto the 2D canvas. Two interchangeable layouts over
 * the *identical* adjacency graph and markers:
 *
 *  - **node** (default fallback): each region a terrain-coloured node ringed by
 *    its owner's colour, adjacency drawn as edges.
 *  - **voronoi**: the island-world territory view — an organic landmass
 *    silhouette floating in ocean, region cells clipped to the coastline,
 *    terrain fills + owner tints, borders and war fronts on shared edges.
 *
 * Both share every marker (population, resources, unrest, capital, construction,
 * army badges) and both are read-only over state — the renderer never mutates
 * the sim. Rendering is deterministic: all shapes derive from the map seed
 * (systems/island.ts), never from Math.random or the clock.
 *
 * Performance discipline: everything expensive is cached and rebuilt only when
 * its inputs change —
 *  - Voronoi cells + island silhouette: recomputed when the map changes.
 *  - Projected geometry (pixel polygons, Path2Ds, land path): map ⊕ canvas size.
 *  - Ocean underlay + terrain base: pre-rendered offscreen once per map ⊕ size
 *    (terrain never changes mid-game), then blitted each frame.
 * Steady-state per-frame work is two drawImage blits plus the dynamic political
 * tint, selection and markers.
 */

import { TERRAIN, type TerrainId } from "@/data/terrain";
import { GLYPH_ART, RESOURCE_ART, TERRAIN_ART, TERRAIN_MOTIF, WORLD_BG, crestSvg } from "@/data/art";
import { cbSafe } from "@/data/palette";
import { ISLAND_FRAME, OCEAN, POLITICAL, type IslandArchetype } from "@/data/mapstyle";
import { armySize, BARBARIAN_ID } from "@/systems/state";
import {
  UNREST_PENALTY_START,
  UNREST_REVOLT,
  type Army,
  type GameState,
  type Region,
} from "@/systems/state";
import { atWar } from "@/systems/diplomacy";
import { computeVoronoiCells, pointInPolygon, type Point, type VoronoiCell } from "@/systems/voronoi";
import { islandArchetype, islandShape, pointInIsland, ISLAND_BOUNDS, type IslandShape } from "@/systems/island";

const BACKGROUND = "#11151c";
/** Adjacency edge (a normal border). Exported so the map legend matches exactly. */
export const EDGE_COLOR = "rgba(230, 233, 239, 0.14)";
/** A border between two nations at war — the map's front line. */
export const WAR_EDGE_COLOR = "rgba(232, 119, 107, 0.6)";
/** Seam between two regions inside the landmass (kept faint; owners add ink). */
const CELL_EDGE_COLOR = "rgba(13, 15, 20, 0.38)";
const NODE_RADIUS = 26;
const SELECT_COLOR = "#f4d27a";
const HIGHLIGHT_COLOR = "#63c7d6";
const NEUTRAL_OWNER = "rgba(0,0,0,0.35)";

const RESOURCE_ICON: Record<string, string> = { iron: "⚒", horses: "🐎" };
/** Light ink used when rasterising registry icons for the dark map. */
const MAP_ICON_COLOR = "#e8e2cf";
const CAPITAL_ICON_COLOR = "#f4d27a";

export type MapLayout = "node" | "voronoi";

export interface Renderer {
  start(): void;
  stop(): void;
  setState(state: GameState): void;
  setSelected(regionId: number | null): void;
  /** Regions to highlight as move/attack targets. */
  setHighlights(regionIds: number[]): void;
  /** Switch between the node+edge fallback and the Voronoi polygon view. */
  setLayout(layout: MapLayout): void;
  getLayout(): MapLayout;
  /** Remap owner colours to the colour-blind-safe palette (or back). */
  setColourblind(on: boolean): void;
  /** Suppress cosmetic motion (capture ripples) when true. */
  setReduceMotion(on: boolean): void;
  /** Flash a capture ripple at a region that just changed hands. */
  pulseCapture(regionId: number): void;
  onRegionClick(handler: (regionId: number | null) => void): void;
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
  let layout: MapLayout = "node";
  let colourblind = false;
  let reduceMotion = false;
  let clickHandler: (regionId: number | null) => void = () => {};

  // Transient capture ripples: a battle-flash → owner-colour ring at a region that
  // changed hands. Purely cosmetic; aged by a frame tick so no wall-clock is used.
  const RIPPLE_FRAMES = 42;
  let tick = 0;
  let ripples: { regionId: number; color: string; born: number }[] = [];

  // Island archetype: pure function of the map (region count + seed), refreshed
  // on every setState so the projection frame is always in step with the state.
  let archetype: IslandArchetype = "medium";

  // Voronoi cells + island silhouette (normalised space), cached until the map
  // geometry changes.
  let cells: VoronoiCell[] = [];
  let shape: IslandShape | null = null;
  let cellSig = "";

  // Projected-geometry cache: pixel polygons, Path2Ds, the land path, islets and
  // sea lanes depend only on the map and the canvas size, never on per-frame
  // state — rebuilt only when either changes, not 60×/s.
  interface Projection {
    px: Point[][];
    paths: Path2D[];
    sites: Point[];
    /** Furthest vertex distance per cell — radius for the terrain gradient. */
    reach: number[];
    land: Path2D;
    blobsPx: Point[][];
    isletsPx: Point[][];
    /** Cross-water adjacency lanes (both endpoints at region sites). */
    lanes: [Point, Point][];
  }
  let projection: Projection | null = null;
  let projSig = "";

  // Pre-rendered static layers (device-pixel offscreens, blitted per frame).
  let oceanLayer: HTMLCanvasElement | null = null;
  let oceanSig = "";
  let terrainLayer: HTMLCanvasElement | null = null;
  let terrainSig = "";
  // Political ink layer — rebuilt only when ownership, wars or palette change.
  let politicalLayer: HTMLCanvasElement | null = null;
  let politicalSig = "";

  function ensureProjection(s: GameState): Projection {
    ensureCells(s);
    const sig = `${cellSig}|${canvas.clientWidth}x${canvas.clientHeight}`;
    if (projection && sig === projSig) return projection;
    projSig = sig;
    const px = cells.map((c) => c.poly.map((v) => projectXY(v.x, v.y)));
    const paths = px.map((poly) => {
      const p = new Path2D();
      if (poly.length >= 3) {
        p.moveTo(poly[0]!.x, poly[0]!.y);
        for (let i = 1; i < poly.length; i++) p.lineTo(poly[i]!.x, poly[i]!.y);
        p.closePath();
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
    const land = new Path2D();
    for (const blob of blobsPx) {
      if (blob.length < 3) continue;
      land.moveTo(blob[0]!.x, blob[0]!.y);
      for (let i = 1; i < blob.length; i++) land.lineTo(blob[i]!.x, blob[i]!.y);
      land.closePath();
    }
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

    projection = { px, paths, sites, reach, land, blobsPx, isletsPx, lanes };
    oceanSig = ""; // dependent layers must rebuild against the new geometry
    terrainSig = "";
    return projection;
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
      cells = computeVoronoiCells(sites, ISLAND_BOUNDS);
      archetype = islandArchetype(s.regions.length, s.seed);
      shape = islandShape(sites, s.seed, archetype);
      projSig = ""; // projection derives from the cells — force a rebuild
    }
  }

  // --- Static layers ----------------------------------------------------------

  /** (Re)build an offscreen layer canvas matching the main canvas resolution. */
  function makeLayer(prev: HTMLCanvasElement | null): { cv: HTMLCanvasElement; g: CanvasRenderingContext2D } {
    const cv = prev ?? document.createElement("canvas");
    if (cv.width !== canvas.width || cv.height !== canvas.height) {
      cv.width = canvas.width;
      cv.height = canvas.height;
    }
    const g = cv.getContext("2d");
    if (!g) throw new Error("Unable to acquire layer context");
    const dpr = window.devicePixelRatio || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    return { cv, g };
  }

  /**
   * Ocean underlay: vignette water, offshore wave rings, the landmass drop
   * shadow + base, shallow-water glow, islets and sea lanes. Static per
   * map ⊕ canvas size.
   */
  function ensureOcean(proj: Projection): HTMLCanvasElement {
    if (oceanLayer && oceanSig === projSig) return oceanLayer;
    const { cv, g } = makeLayer(oceanLayer);
    oceanLayer = cv;
    oceanSig = projSig;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    const grad = g.createRadialGradient(w / 2, h * 0.42, Math.min(w, h) * 0.1, w / 2, h / 2, Math.max(w, h) * 0.72);
    grad.addColorStop(0, OCEAN.inner);
    grad.addColorStop(1, OCEAN.outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    // Offshore wave rings: dashed outlines drifting outward from the coast.
    g.setLineDash([3, 13]);
    g.lineWidth = 1.2;
    g.strokeStyle = OCEAN.wave;
    for (const blob of proj.blobsPx) {
      for (const dist of [12, 26]) {
        const ring = offsetPoly(blob, dist);
        tracePolyOn(g, ring);
        g.stroke();
      }
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
    g.lineJoin = "round";
    g.strokeStyle = OCEAN.shallowWide;
    g.lineWidth = 26;
    g.stroke(proj.land);
    g.strokeStyle = OCEAN.shallow;
    g.lineWidth = 12;
    g.stroke(proj.land);

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
    return cv;
  }

  /**
   * Terrain base: cell fills, motifs, seams, the coast terrain's dashed edge —
   * all clipped to the landmass — then the coastline ink. Terrain never changes
   * mid-game, so this rebuilds only with the map or canvas size; while motif
   * icons are still decoding it re-renders next frame until complete.
   */
  function ensureTerrain(s: GameState, proj: Projection): HTMLCanvasElement {
    if (terrainLayer && terrainSig === projSig) return terrainLayer;
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

    // Coastline ink: dark outline in the water, pale highlight just inside.
    g.lineJoin = "round";
    g.strokeStyle = OCEAN.coastLine;
    g.lineWidth = 2.6;
    g.stroke(proj.land);
    g.save();
    g.clip(proj.land);
    g.strokeStyle = OCEAN.coastHighlight;
    g.lineWidth = 2.2;
    g.stroke(proj.land);
    g.restore();

    terrainSig = complete ? projSig : ""; // retry until every motif has decoded
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
    return `${projSig}|${acc}|${wars}|${colourblind ? 1 : 0}`;
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

    /** Shared border polylines around one nation (edges facing another owner). */
    const borderSegments = (nid: number): [Point, Point][] => {
      const segs: [Point, Point][] = [];
      s.regions.forEach((region, i) => {
        if (region.ownerId !== nid) return;
        const cell = cells[i]!;
        const poly = proj.px[i]!;
        if (poly.length < 3) return;
        for (let k = 0; k < cell.neighbor.length; k++) {
          const j = cell.neighbor[k]!;
          if (j < 0) continue; // outer bounds — the coastline stroke covers it
          if ((s.regions[j]?.ownerId ?? null) === nid) continue;
          segs.push([poly[k]!, poly[(k + 1) % poly.length]!]);
        }
      });
      return segs;
    };

    const strokeSegments = (segs: [Point, Point][]): void => {
      g.beginPath();
      for (const [a, b] of segs) {
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
      }
      g.stroke();
    };

    g.save();
    g.clip(proj.land);
    g.lineJoin = "round";
    g.lineCap = "round";

    // 1) Owner wash — subtle, so the terrain stays the first read.
    s.regions.forEach((region, i) => {
      if (region.ownerId === null) return; // wilderness: bare terrain
      const barb = region.ownerId === BARBARIAN_ID;
      g.globalAlpha = barb ? POLITICAL.barbarianWashAlpha : POLITICAL.washAlpha;
      g.fillStyle = ownerColor(region.ownerId);
      g.fill(proj.paths[i]!);
    });
    g.globalAlpha = 1;

    // 2) Realm rims, one nation at a time, confined to that nation's cells.
    for (const nation of s.nations) {
      const owned = s.regions.filter((r) => r.ownerId === nation.id);
      if (owned.length === 0) continue;
      const nationPath = new Path2D();
      for (const r of owned) nationPath.addPath(proj.paths[r.id]!);
      const segs = borderSegments(nation.id);
      const color = ownerColor(nation.id);
      const barb = nation.isBarbarian;

      g.save();
      g.clip(nationPath);
      g.strokeStyle = color;
      // Wide inner band along borders and along the realm's own coastline.
      g.globalAlpha = barb ? POLITICAL.barbarianBandAlpha : POLITICAL.bandAlpha;
      g.lineWidth = POLITICAL.bandWidth;
      strokeSegments(segs);
      g.stroke(proj.land);
      // Crisp owner-coloured edge (this half of the two-tone frontier).
      g.globalAlpha = barb ? POLITICAL.barbarianEdgeAlpha : POLITICAL.edgeAlpha;
      g.lineWidth = POLITICAL.edgeWidth;
      strokeSegments(segs);
      g.globalAlpha = 1;
      g.restore();
    }

    // 3) Dark centreline over every border between two different owners.
    g.strokeStyle = POLITICAL.core;
    g.lineWidth = POLITICAL.coreWidth;
    s.regions.forEach((region, i) => {
      const cell = cells[i]!;
      const poly = proj.px[i]!;
      if (poly.length < 3) return;
      for (let k = 0; k < cell.neighbor.length; k++) {
        const j = cell.neighbor[k]!;
        if (j < 0 || j < i) continue; // each shared edge once
        const other = s.regions[j]?.ownerId ?? null;
        if (other === region.ownerId) continue;
        g.beginPath();
        g.moveTo(poly[k]!.x, poly[k]!.y);
        const b = poly[(k + 1) % poly.length]!;
        g.lineTo(b.x, b.y);
        g.stroke();
      }
    });

    // 4) War fronts: shared edges between two warring, non-barbarian owners.
    const fronts: [Point, Point][] = [];
    s.regions.forEach((region, i) => {
      const cell = cells[i]!;
      const poly = proj.px[i]!;
      if (poly.length < 3) return;
      const oa = region.ownerId;
      for (let k = 0; k < cell.neighbor.length; k++) {
        const j = cell.neighbor[k]!;
        if (j < 0 || j < i) continue;
        const ob = s.regions[j]?.ownerId ?? null;
        const isFront =
          oa !== null && ob !== null && oa !== ob &&
          oa !== BARBARIAN_ID && ob !== BARBARIAN_ID &&
          atWar(s, oa, ob);
        if (isFront) fronts.push([poly[k]!, poly[(k + 1) % poly.length]!]);
      }
    });
    if (fronts.length > 0) {
      g.strokeStyle = POLITICAL.warGlow;
      g.lineWidth = POLITICAL.warGlowWidth;
      strokeSegments(fronts);
      g.strokeStyle = WAR_EDGE_COLOR;
      g.lineWidth = POLITICAL.warCoreWidth;
      strokeSegments(fronts);
    }

    g.restore();
    return cv;
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

  // Background vignette gradient, cached by canvas size (rebuilt only on resize).
  let bgGradient: CanvasGradient | null = null;
  let bgSize = "";

  /** Node-view background: flat until the registry provides a vignette pair. */
  function paintBackground(w: number, h: number): void {
    if (!WORLD_BG) {
      context.fillStyle = BACKGROUND;
      context.fillRect(0, 0, w, h);
      return;
    }
    const sizeKey = `${w}x${h}`;
    if (!bgGradient || sizeKey !== bgSize) {
      bgSize = sizeKey;
      bgGradient = context.createRadialGradient(w / 2, h * 0.42, Math.min(w, h) * 0.1, w / 2, h / 2, Math.max(w, h) * 0.72);
      bgGradient.addColorStop(0, WORLD_BG.inner);
      bgGradient.addColorStop(1, WORLD_BG.outer);
    }
    context.fillStyle = bgGradient;
    context.fillRect(0, 0, w, h);
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
    const my = canvas.clientHeight * f.marginY;
    return { x: canvas.clientWidth * f.marginX + 8, top: my * 0.78 + 6, bottom: my * 1.22 + 30 };
  }

  function projectXY(x: number, y: number): Point {
    const { clientWidth, clientHeight } = canvas;
    const m = frameMargins();
    return { x: m.x + x * (clientWidth - m.x * 2), y: m.top + y * (clientHeight - m.top - m.bottom) };
  }

  /** Inverse of projectXY — pixel position back to normalised map space. */
  function unprojectXY(px: number, py: number): Point {
    const { clientWidth, clientHeight } = canvas;
    const m = frameMargins();
    return {
      x: (px - m.x) / Math.max(1, clientWidth - m.x * 2),
      y: (py - m.top) / Math.max(1, clientHeight - m.top - m.bottom),
    };
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
  }

  function render(): void {
    if (!running) return;
    const { clientWidth, clientHeight } = canvas;
    if (state && layout === "voronoi") {
      drawVoronoi(state);
    } else {
      paintBackground(clientWidth, clientHeight);
      if (state) {
        drawEdges(state);
        drawNodes(state);
      }
    }
    if (state) {
      drawArmies(state);
      drawRipples(state);
    }
    tick += 1;
    frame = window.requestAnimationFrame(render);
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

  function drawEdges(s: GameState): void {
    for (const region of s.regions) {
      const a = project(region);
      for (const neighbourId of region.adjacency) {
        if (region.id >= neighbourId) continue;
        const neighbour = s.regions[neighbourId];
        if (!neighbour) continue;
        const b = project(neighbour);
        const oa = region.ownerId;
        const ob = neighbour.ownerId;
        const isFront =
          oa !== null && ob !== null && oa !== ob &&
          oa !== BARBARIAN_ID && ob !== BARBARIAN_ID &&
          atWar(s, oa, ob);
        context.strokeStyle = isFront ? WAR_EDGE_COLOR : EDGE_COLOR;
        context.lineWidth = isFront ? 3 : 2;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
    }
    context.lineWidth = 2;
  }

  function drawNodes(s: GameState): void {
    const capitals = capitalSet(s);

    for (const region of s.regions) {
      const p = project(region);
      const terrain = TERRAIN[region.terrain];
      const isSelected = region.id === selected;
      const isTarget = highlights.has(region.id);

      // Move/attack target glow.
      if (isTarget) {
        context.beginPath();
        context.arc(p.x, p.y, NODE_RADIUS + 6, 0, Math.PI * 2);
        context.strokeStyle = HIGHLIGHT_COLOR;
        context.lineWidth = 3;
        context.setLineDash([5, 4]);
        context.stroke();
        context.setLineDash([]);
      }

      context.beginPath();
      context.arc(p.x, p.y, NODE_RADIUS, 0, Math.PI * 2);
      context.fillStyle = terrainFill(context, terrain.id, p.x, p.y, NODE_RADIUS);
      context.fill();
      context.lineWidth = isSelected ? 4 : 3;
      context.strokeStyle = isSelected ? SELECT_COLOR : ownerColor(region.ownerId);
      context.stroke();

      // Capital: a second concentric ring in the owner's colour.
      if (capitals.has(region.id)) {
        context.beginPath();
        context.arc(p.x, p.y, NODE_RADIUS + 4.5, 0, Math.PI * 2);
        context.lineWidth = 2;
        context.strokeStyle = ownerColor(region.ownerId);
        context.stroke();
      }

      drawMarkers(region, p, capitals);
    }
  }

  /**
   * The island territory view: blit the cached ocean, terrain and political
   * layers, then the per-frame dynamics — selection, highlights, markers.
   */
  function drawVoronoi(s: GameState): void {
    const proj = ensureProjection(s);
    context.drawImage(ensureOcean(proj), 0, 0, canvas.clientWidth, canvas.clientHeight);
    context.drawImage(ensureTerrain(s, proj), 0, 0, canvas.clientWidth, canvas.clientHeight);
    context.drawImage(ensurePolitical(s, proj), 0, 0, canvas.clientWidth, canvas.clientHeight);
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
      context.strokeStyle = SELECT_COLOR;
      context.lineWidth = 3.5;
      context.stroke(proj.paths[selected]!);
    }
    context.restore();

    // Markers at each region's site (guaranteed inside its own cell).
    for (const region of s.regions) {
      drawMarkers(region, proj.sites[region.id]!, capitals);
    }
  }

  /** Shared region markers (used by both layouts): pop, resource, capital, unrest, name. */
  function drawMarkers(region: Region, p: Point, capitals: Set<number>): void {
    // Population count with a legibility halo so it reads over any fill/tint.
    context.font = "600 13px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 3;
    context.strokeStyle = "rgba(244, 246, 250, 0.85)";
    context.strokeText(String(Math.round(region.population)), p.x, p.y);
    context.fillStyle = "#0d0f14";
    context.fillText(String(Math.round(region.population)), p.x, p.y);

    // Strategic resource marker (top-left).
    if (region.resource) {
      const rx = p.x - NODE_RADIUS + 4;
      const ry = p.y - NODE_RADIUS + 2;
      const art = RESOURCE_ART[region.resource];
      if (art) iconChip(rx, ry, 9);
      if (!drawIcon(context, `res:${region.resource}`, art, MAP_ICON_COLOR, rx, ry, 13)) {
        context.font = "13px system-ui, sans-serif";
        context.fillStyle = MAP_ICON_COLOR; // else the monochrome ⚒ inherits the pop-count ink
        context.fillText(RESOURCE_ICON[region.resource] ?? "?", rx, ry);
      }
    }

    // Capital marker (bottom-left corner): the owner's crest, else the crown.
    if (capitals.has(region.id)) {
      const cx = p.x - NODE_RADIUS + 5;
      const cy = p.y + NODE_RADIUS - 7;
      const owner = region.ownerId;
      const crestArt = owner === null ? null : crestSvg(owner, ownerColor(owner));
      if (crestArt || GLYPH_ART.crown) iconChip(cx, cy, 9.5);
      if (
        !(crestArt && drawIcon(context, `crest:${owner}`, crestArt, ownerColor(owner), cx, cy, 15)) &&
        !drawIcon(context, "glyph:crown", GLYPH_ART.crown, CAPITAL_ICON_COLOR, cx, cy, 13)
      ) {
        context.font = "13px system-ui, sans-serif";
        context.fillText("👑", cx, cy);
      }
    }

    // Unrest marker (top-right dot) and construction (hammer, top).
    const dot = unrestDot(region.unrest);
    if (dot) {
      context.beginPath();
      context.arc(p.x + NODE_RADIUS - 5, p.y - NODE_RADIUS + 5, 5, 0, Math.PI * 2);
      context.fillStyle = dot;
      context.fill();
    }
    if (region.construction) {
      const hy = p.y - NODE_RADIUS - 8;
      if (GLYPH_ART.hammer) iconChip(p.x, hy, 8);
      if (!drawIcon(context, "glyph:hammer", GLYPH_ART.hammer, MAP_ICON_COLOR, p.x, hy, 12)) {
        context.font = "12px system-ui, sans-serif";
        context.fillText("🔨", p.x, hy);
      }
    }

    // Fortification marker (bottom-centre) — a defended region is harder to take.
    // Bottom-centre is free: the crown sits bottom-left, the army badge bottom-right.
    if (region.fortification > 0) {
      const fy = p.y + NODE_RADIUS - 7;
      if (drawIcon(context, "glyph:shield", GLYPH_ART.shield, MAP_ICON_COLOR, p.x - 4, fy, 11)) {
        context.font = "600 10px system-ui, sans-serif";
        context.fillStyle = MAP_ICON_COLOR;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(String(region.fortification), p.x + 5, fy);
      } else {
        context.font = "600 10px system-ui, sans-serif";
        context.fillStyle = MAP_ICON_COLOR; // the fort digit must not inherit a stale marker colour
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(`🛡${region.fortification}`, p.x, fy);
      }
    }

    // Region name below.
    context.fillStyle = "#c9cedb";
    context.font = "500 11px system-ui, sans-serif";
    context.textBaseline = "top";
    context.fillText(region.name, p.x, p.y + NODE_RADIUS + 4);
  }

  function drawArmies(s: GameState): void {
    for (const army of s.armies) {
      const size = armySize(army.units);
      if (size <= 0) continue;
      const region = s.regions[army.regionId];
      if (!region) continue;
      const p = project(region);
      const bx = p.x + NODE_RADIUS - 4;
      const by = p.y + NODE_RADIUS - 4;

      context.beginPath();
      context.arc(bx, by, 10, 0, Math.PI * 2);
      context.fillStyle = ownerColor(army.ownerId);
      context.fill();
      context.lineWidth = 1.5;
      context.strokeStyle = "rgba(0,0,0,0.5)";
      context.stroke();

      context.fillStyle = "#0d0f14";
      context.font = "600 11px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(size), bx, by);
    }
  }

  function tracePolyOn(g: CanvasRenderingContext2D, poly: Point[]): void {
    if (poly.length === 0) return;
    g.beginPath();
    g.moveTo(poly[0]!.x, poly[0]!.y);
    for (let i = 1; i < poly.length; i++) g.lineTo(poly[i]!.x, poly[i]!.y);
    g.closePath();
  }

  function unrestDot(unrest: number): string | null {
    if (unrest >= UNREST_REVOLT) return "#e8776b";
    if (unrest >= UNREST_PENALTY_START) return "#e0b74a";
    return null;
  }

  function hitTest(px: number, py: number): number | null {
    if (!state) return null;
    if (layout === "voronoi") {
      ensureCells(state);
      // Ocean clicks select nothing — the sea deselects.
      const n = unprojectXY(px, py);
      if (!shape || !pointInIsland(shape, n.x, n.y)) return null;
      for (let i = 0; i < cells.length; i++) {
        const poly = cells[i]!.poly.map((v) => projectXY(v.x, v.y));
        if (pointInPolygon(poly, px, py)) return state.regions[i]?.id ?? i;
      }
      return null;
    }
    for (const region of state.regions) {
      const p = project(region);
      const dx = px - p.x;
      const dy = py - p.y;
      if (dx * dx + dy * dy <= NODE_RADIUS * NODE_RADIUS) return region.id;
    }
    return null;
  }

  function handleClick(ev: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    clickHandler(hitTest(ev.clientX - rect.left, ev.clientY - rect.top));
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      resize();
      window.addEventListener("resize", resize);
      canvas.addEventListener("click", handleClick);
      frame = window.requestAnimationFrame(render);
    },
    stop(): void {
      running = false;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("click", handleClick);
    },
    setState(next: GameState): void {
      state = next;
      archetype = islandArchetype(next.regions.length, next.seed);
    },
    setSelected(regionId: number | null): void {
      selected = regionId;
    },
    setHighlights(regionIds: number[]): void {
      highlights = new Set(regionIds);
    },
    setLayout(next: MapLayout): void {
      layout = next;
    },
    getLayout(): MapLayout {
      return layout;
    },
    setColourblind(on: boolean): void {
      colourblind = on;
    },
    setReduceMotion(on: boolean): void {
      reduceMotion = on;
      if (on) ripples = []; // drop any in-flight motion
    },
    pulseCapture(regionId: number): void {
      if (reduceMotion) return;
      ripples.push({ regionId, color: ownerColor(state?.regions[regionId]?.ownerId ?? null), born: tick });
    },
    onRegionClick(handler: (regionId: number | null) => void): void {
      clickHandler = handler;
    },
  };
}

/** Exposed for potential reuse/testing of the army badge count. */
export function stackLabel(army: Army): string {
  return String(armySize(army.units));
}
