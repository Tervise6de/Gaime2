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
import {
  hashFloat,
  islandArchetype,
  islandShape,
  organicCells,
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
  /** Remap owner colours to the colour-blind-safe palette (or back). */
  setColourblind(on: boolean): void;
  /** Suppress cosmetic motion (capture ripples) when true. */
  setReduceMotion(on: boolean): void;
  /** Flash a capture ripple at a region that just changed hands. */
  pulseCapture(regionId: number): void;
  onRegionClick(handler: (regionId: number | null) => void): void;
  /** Zoom about the viewport centre (e.g. 1.25 in, 0.8 out). */
  zoomBy(factor: number): void;
  /** Reset the camera to the fitted full-map view. */
  resetView(): void;
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

  // Transient capture ripples: a battle-flash → owner-colour ring at a region that
  // changed hands. Purely cosmetic; aged by a frame tick so no wall-clock is used.
  const RIPPLE_FRAMES = 42;
  let tick = 0;
  let ripples: { regionId: number; color: string; born: number }[] = [];

  // Island archetype: pure function of the map (region count + seed), refreshed
  // on every setState so the projection frame is always in step with the state.
  let archetype: IslandArchetype = "medium";

  // --- Camera: pan/zoom over the fitted base projection ----------------------
  // screen = base * s + t. At s = 1 the map fits exactly (t clamps to 0), so
  // the full-map view stays the default; zooming unlocks panning. While a
  // gesture is in flight the cached layers are blitted through a delta
  // transform (cheap, slightly soft); once input settles for a few frames the
  // projection + layers rebuild at the live camera and everything is crisp.
  const CAM_MIN = 1;
  const CAM_MAX = 2.75;
  const CAM_SETTLE_FRAMES = 10;
  interface Camera {
    s: number;
    tx: number;
    ty: number;
  }
  const cam: Camera = { s: 1, tx: 0, ty: 0 };
  let camBuiltKey = ""; // camera baked into the current projection/layers
  let staleCam: Camera | null = null; // snapshot matching the built projection
  let camChangedTick = -999; // tick of the last camera input
  let camOverride: Camera | null = null; // used while blitting a stale frame

  function camKey(): string {
    return `${cam.s.toFixed(3)}|${cam.tx.toFixed(1)}|${cam.ty.toFixed(1)}`;
  }

  function clampCam(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    cam.s = Math.min(CAM_MAX, Math.max(CAM_MIN, cam.s));
    cam.tx = Math.min(0, Math.max(w - w * cam.s, cam.tx));
    cam.ty = Math.min(0, Math.max(h - h * cam.s, cam.ty));
  }

  /** Zoom to `next` about the screen point (mx, my), keeping it fixed. */
  function setZoom(next: number, mx: number, my: number): void {
    const s0 = cam.s;
    const s1 = Math.min(CAM_MAX, Math.max(CAM_MIN, next));
    if (s1 === s0) return;
    cam.tx = mx - ((mx - cam.tx) * s1) / s0;
    cam.ty = my - ((my - cam.ty) * s1) / s0;
    cam.s = s1;
    clampCam();
    camChangedTick = tick;
  }

  function panBy(dx: number, dy: number): void {
    if (cam.s <= CAM_MIN) return; // the fitted view has nowhere to pan
    cam.tx += dx;
    cam.ty += dy;
    clampCam();
    camChangedTick = tick;
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
    const sig = `${cellSig}|${canvas.clientWidth}x${canvas.clientHeight}|${camKey()}`;
    if (projection && sig === projSig) return projection;
    projSig = sig;
    camBuiltKey = camKey();
    staleCam = { ...cam };
    const px = organic.map((c) => c.poly.map((v) => projectXY(v.x, v.y)));
    const edgesPx = organic.map((c) => c.edges.map((e) => e.map((v) => projectXY(v.x, v.y))));
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

    projection = { px, paths, edgesPx, sites, reach, land, blobsPx, blobPaths, isletsPx, lanes };
    oceanSig = ""; // dependent layers must rebuild against the new geometry
    terrainSig = "";
    politicalSig = "";
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
      organic = organicCells(cells, s.seed);
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
  function ensureOcean(s: GameState, proj: Projection): HTMLCanvasElement {
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
      g.lineWidth = 2.6;
      g.stroke(path);
      g.clip(path);
      g.strokeStyle = OCEAN.coastHighlight;
      g.lineWidth = 2.2;
      g.stroke(path);
      g.restore();
    });

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

    const playerId = s.nations.find((n) => n.isPlayer)?.id ?? -1;

    // 1) Owner wash — the player's realm noticeably stronger than rivals'.
    s.regions.forEach((region, i) => {
      if (region.ownerId === null) return; // wilderness: bare terrain
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
    return cv;
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
    const my = canvas.clientHeight * f.marginY;
    return { x: canvas.clientWidth * f.marginX + 8, top: my * 0.78 + 6, bottom: my * 1.22 + 30 };
  }

  function projectXY(x: number, y: number): Point {
    const { clientWidth, clientHeight } = canvas;
    const m = frameMargins();
    const c = camOverride ?? cam;
    const bx = m.x + x * (clientWidth - m.x * 2);
    const by = m.top + y * (clientHeight - m.top - m.bottom);
    return { x: bx * c.s + c.tx, y: by * c.s + c.ty };
  }

  /** Inverse of projectXY — pixel position back to normalised map space. */
  function unprojectXY(px: number, py: number): Point {
    const { clientWidth, clientHeight } = canvas;
    const m = frameMargins();
    const c = camOverride ?? cam;
    const bx = (px - c.tx) / c.s;
    const by = (py - c.ty) / c.s;
    return {
      x: (bx - m.x) / Math.max(1, clientWidth - m.x * 2),
      y: (by - m.top) / Math.max(1, clientHeight - m.top - m.bottom),
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
    clampCam(); // a shrunken viewport must not leave the pan out of bounds
  }

  function render(): void {
    if (!running) return;
    if (state) {
      const gestureLive = projection && staleCam && camKey() !== camBuiltKey && tick - camChangedTick < CAM_SETTLE_FRAMES;
      if (gestureLive) {
        // Mid-gesture: blit the cached frame through the delta transform —
        // slightly soft, but instant. The crisp rebuild lands once input rests.
        const k = cam.s / staleCam!.s;
        const dx = cam.tx - staleCam!.tx * k;
        const dy = cam.ty - staleCam!.ty * k;
        const dpr = window.devicePixelRatio || 1;
        context.save();
        context.setTransform(dpr * k, 0, 0, dpr * k, dpr * dx, dpr * dy);
        camOverride = staleCam;
        paintVoronoi(state, projection!);
        drawArmies(state);
        drawRipples(state);
        camOverride = null;
        context.restore();
      } else {
        paintVoronoi(state, ensureProjection(state));
        drawArmies(state);
        drawRipples(state);
      }
    } else {
      context.fillStyle = OCEAN.outer;
      context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
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

  /**
   * The island territory view: blit the cached ocean, terrain and political
   * layers, then the per-frame dynamics — selection, highlights, markers.
   * Takes the projection to paint from (live or, mid-gesture, the stale one).
   */
  function paintVoronoi(s: GameState, proj: Projection): void {
    context.drawImage(ensureOcean(s, proj), 0, 0, canvas.clientWidth, canvas.clientHeight);
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

    // Markers at each region's site (guaranteed inside its own cell).
    for (const region of s.regions) {
      drawMarkers(region, proj.sites[region.id]!, capitals);
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
    // Population count in a soft dark chip (same family as the icon chips), so
    // it reads identically over any terrain fill or political tint.
    const popText = String(Math.round(region.population));
    context.font = "600 12px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    const popW = Math.max(19, context.measureText(popText).width + 11);
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

    // Capital crest docked left of the population chip — the seat reads first.
    if (capitals.has(region.id)) {
      const cx = p.x - popW / 2 - 13;
      const cy = p.y;
      const owner = region.ownerId;
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

    // Region name below, with a dark halo so it reads on bright terrain too.
    // A touch of tracking gives the labels a cartographic voice where the
    // browser supports canvas letterSpacing (harmless no-op elsewhere).
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

    // Status row: one slot per active signal, centred under the name.
    const slots: ((x: number, y: number) => void)[] = [];
    if (region.resource) {
      slots.push((x, y) => {
        iconChip(x, y, 8.5);
        const art = RESOURCE_ART[region.resource!];
        if (!drawIcon(context, `res:${region.resource}`, art, MAP_ICON_COLOR, x, y, 12)) {
          context.font = "11px system-ui, sans-serif";
          context.fillStyle = MAP_ICON_COLOR;
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(RESOURCE_ICON[region.resource!] ?? "?", x, y);
        }
      });
    }
    if (region.fortification > 0) {
      slots.push((x, y) => {
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
      });
    }
    if (region.construction) {
      slots.push((x, y) => {
        iconChip(x, y, 8.5);
        if (!drawIcon(context, "glyph:hammer", GLYPH_ART.hammer, MAP_ICON_COLOR, x, y, 11)) {
          context.font = "11px system-ui, sans-serif";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText("🔨", x, y);
        }
      });
    }
    const dot = unrestDot(region.unrest);
    if (dot) {
      slots.push((x, y) => {
        context.beginPath();
        context.arc(x, y, 4.5, 0, Math.PI * 2);
        context.fillStyle = dot;
        context.fill();
        context.lineWidth = 1;
        context.strokeStyle = "rgba(13, 15, 20, 0.6)";
        context.stroke();
      });
    }
    if (slots.length > 0) {
      const gap = 19;
      const rowY = p.y + NODE_RADIUS + 25;
      const x0 = p.x - ((slots.length - 1) * gap) / 2;
      slots.forEach((draw, i) => draw(x0 + i * gap, rowY));
    }
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
      // Light ring lifts the badge off the map (a dark ring sank into tints).
      context.lineWidth = 1.5;
      context.strokeStyle = "rgba(238, 242, 248, 0.85)";
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
    // Ocean clicks select nothing — the sea deselects.
    const n = unprojectXY(px, py);
    if (!shape || !pointInIsland(shape, n.x, n.y)) return null;
    // Hit-test against the *organic* polygons — exactly what is drawn.
    for (let i = 0; i < organic.length; i++) {
      const poly = organic[i]!.poly.map((v) => projectXY(v.x, v.y));
      if (pointInPolygon(poly, px, py)) return state.regions[i]?.id ?? i;
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
    canvas.setPointerCapture(ev.pointerId);
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
    if (pointers.size === 0) wasPinch = false;
  }

  function onWheel(ev: WheelEvent): void {
    ev.preventDefault();
    const p = localXY(ev);
    setZoom(cam.s * Math.exp(-ev.deltaY * 0.0016), p.x, p.y);
  }

  function onDblClick(ev: MouseEvent): void {
    // Double-click toggles between fitted view and a 2× look at the cursor.
    const p = localXY(ev);
    if (cam.s > 1.05) {
      cam.s = 1;
      clampCam();
      camChangedTick = tick;
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
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
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
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDblClick);
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
    zoomBy(factor: number): void {
      setZoom(cam.s * factor, canvas.clientWidth / 2, canvas.clientHeight / 2);
    },
    resetView(): void {
      cam.s = 1;
      clampCam();
      camChangedTick = tick;
    },
  };
}

/** Exposed for potential reuse/testing of the army badge count. */
export function stackLabel(army: Army): string {
  return String(armySize(army.units));
}
