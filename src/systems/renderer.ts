/**
 * Renderer system.
 *
 * Draws the region graph onto the 2D canvas. Two interchangeable layouts over
 * the *identical* adjacency graph and markers:
 *
 *  - **node** (default fallback): each region a terrain-coloured node ringed by
 *    its owner's colour, adjacency drawn as edges.
 *  - **voronoi**: each region a filled Voronoi polygon (terrain fill, owner
 *    tint), borders as polygon edges, war fronts as red shared edges.
 *
 * Both share every marker (population, resources, unrest, capital, construction,
 * army badges) and both are read-only over state — the renderer never mutates
 * the sim. The polygon geometry is pure and cached (systems/voronoi.ts): it is
 * recomputed only when the map changes, never per animation frame.
 */

import { TERRAIN, type TerrainId } from "@/data/terrain";
import { GLYPH_ART, RESOURCE_ART, TERRAIN_ART, TERRAIN_MOTIF, WORLD_BG, crestSvg } from "@/data/art";
import { cbSafe } from "@/data/palette";
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

const BACKGROUND = "#11151c";
/** Adjacency edge (a normal border). Exported so the map legend matches exactly. */
export const EDGE_COLOR = "rgba(230, 233, 239, 0.14)";
/** A border between two nations at war — the map's front line. */
export const WAR_EDGE_COLOR = "rgba(232, 119, 107, 0.6)";
/** Solid border between two regions in the polygon view. */
const CELL_EDGE_COLOR = "rgba(13, 15, 20, 0.75)";
const NODE_RADIUS = 26;
const SELECT_COLOR = "#f4d27a";
const HIGHLIGHT_COLOR = "#63c7d6";
const NEUTRAL_OWNER = "rgba(0,0,0,0.35)";
/** Owner tint strength painted over the terrain fill in the polygon view. */
const OWNER_TINT_ALPHA = 0.5;

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

  // Voronoi cells (normalised space) cached until the map geometry changes.
  let cells: VoronoiCell[] = [];
  let cellSig = "";

  // Projected-geometry cache: the pixel polygons, region sites, per-cell reach
  // and terrain gradients depend only on the map and the canvas size, never on
  // per-frame state — so they are rebuilt only when either changes, not 60×/s.
  interface Projection {
    px: Point[][];
    sites: Point[];
    fills: (string | CanvasGradient)[];
  }
  let projection: Projection | null = null;
  let projSig = "";

  function ensureProjection(s: GameState): Projection {
    ensureCells(s);
    const sig = `${cellSig}|${canvas.clientWidth}x${canvas.clientHeight}`;
    if (projection && sig === projSig) return projection;
    projSig = sig;
    const px = cells.map((c) => c.poly.map((v) => projectXY(v.x, v.y)));
    const sites = s.regions.map((r) => project(r));
    const fills = s.regions.map((r, i) => {
      const site = sites[i]!;
      const poly = px[i] ?? [];
      let reach = 0;
      for (const v of poly) reach = Math.max(reach, Math.hypot(v.x - site.x, v.y - site.y));
      return terrainFill(r.terrain, site.x, site.y, reach || 1);
    });
    projection = { px, sites, fills };
    return projection;
  }

  function ensureCells(s: GameState): void {
    // Signature must change whenever any site moves, else a regenerated map with
    // the same region count could reuse stale cells. A cheap coordinate rollup
    // over every region (there are only ~16–30) catches any change; iterating
    // per frame is negligible next to the cell computation it guards.
    let acc = s.regions.length;
    for (const r of s.regions) acc = (acc * 31 + r.x * 8191 + r.y * 131071) % 1e12;
    const sig = String(acc);
    if (sig !== cellSig) {
      cellSig = sig;
      cells = computeVoronoiCells(s.regions.map((r) => ({ x: r.x, y: r.y })));
    }
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
  function drawIcon(name: string, svg: string | null, color: string, x: number, y: number, size: number): boolean {
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
    context.drawImage(raster, x - size / 2, y - size / 2, size, size);
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
  function terrainFill(t: TerrainId, cx: number, cy: number, r: number): string | CanvasGradient {
    const shade = TERRAIN_ART[t];
    const base = TERRAIN[t].color;
    if (!shade) return base;
    const g = context.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.15, cx, cy, r * 1.05);
    g.addColorStop(0, shade.hi);
    g.addColorStop(0.55, base);
    g.addColorStop(1, shade.lo);
    return g;
  }

  // Background vignette gradient, cached by canvas size (rebuilt only on resize).
  let bgGradient: CanvasGradient | null = null;
  let bgSize = "";

  /** World background: flat until the registry provides a vignette pair. */
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

  function projectXY(x: number, y: number): Point {
    const { clientWidth, clientHeight } = canvas;
    const margin = NODE_RADIUS + 30;
    return { x: margin + x * (clientWidth - margin * 2), y: margin + y * (clientHeight - margin * 2) };
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
    paintBackground(clientWidth, clientHeight);
    if (state) {
      if (layout === "voronoi") {
        drawVoronoi(state);
      } else {
        drawEdges(state);
        drawNodes(state);
      }
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
      context.fillStyle = terrainFill(terrain.id, p.x, p.y, NODE_RADIUS);
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

  /** Fill + border the Voronoi cells, then draw the shared markers on top. */
  function drawVoronoi(s: GameState): void {
    const { px: pxCells, sites, fills } = ensureProjection(s);
    const capitals = capitalSet(s);

    // Fills: terrain colour, then an owner tint (dark wash for neutral/barbarian).
    s.regions.forEach((region, i) => {
      const poly = pxCells[i];
      if (!poly || poly.length < 3) return;
      tracePoly(poly);
      context.fillStyle = fills[i]!;
      context.fill();
      tracePoly(poly);
      context.globalAlpha = OWNER_TINT_ALPHA;
      context.fillStyle = ownerColor(region.ownerId);
      context.fill();
      context.globalAlpha = 1;
    });

    // Faint terrain motif stamped in each cell — terrain reads by shape too.
    s.regions.forEach((region, i) => {
      const poly = pxCells[i];
      if (!poly || poly.length < 3) return;
      const motif = TERRAIN_MOTIF[region.terrain];
      if (!motif) return;
      const site = sites[i]!;
      context.globalAlpha = 0.3;
      drawIcon(`motif:${region.terrain}`, motif, "#0d0f14", site.x, site.y - 21, 17);
      context.globalAlpha = 1;
    });

    // Normal cell borders.
    context.lineWidth = 1.5;
    context.strokeStyle = CELL_EDGE_COLOR;
    for (const poly of pxCells) {
      if (poly.length < 3) continue;
      tracePoly(poly);
      context.stroke();
    }

    // Shoreline treatment: coast cells get a light dashed water-edge inside
    // their border, so the map's one "wet" terrain reads even under palette
    // remaps (shape/texture, not hue alone).
    context.strokeStyle = "rgba(126, 188, 226, 0.4)";
    context.lineWidth = 1.2;
    context.setLineDash([4, 5]);
    s.regions.forEach((region, i) => {
      if (region.terrain !== "coast") return;
      const poly = pxCells[i];
      if (!poly || poly.length < 3) return;
      tracePoly(poly);
      context.stroke();
    });
    context.setLineDash([]);

    // War fronts: shared edges between two warring, non-barbarian owners.
    context.strokeStyle = WAR_EDGE_COLOR;
    context.lineWidth = 3;
    s.regions.forEach((region, i) => {
      const cell = cells[i];
      const poly = pxCells[i];
      if (!poly || poly.length < 3) return;
      const oa = region.ownerId;
      for (let k = 0; k < cell.neighbor.length; k++) {
        const j = cell.neighbor[k];
        if (j < 0) continue;
        const ob = s.regions[j]?.ownerId ?? null;
        const isFront =
          oa !== null && ob !== null && oa !== ob &&
          oa !== BARBARIAN_ID && ob !== BARBARIAN_ID &&
          atWar(s, oa, ob);
        if (!isFront) continue;
        const a = poly[k];
        const b = poly[(k + 1) % poly.length];
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
    });

    // Target highlights, then the selection outline on top.
    for (const region of s.regions) {
      if (!highlights.has(region.id)) continue;
      const poly = pxCells[region.id];
      if (!poly || poly.length < 3) continue;
      tracePoly(poly);
      context.strokeStyle = HIGHLIGHT_COLOR;
      context.lineWidth = 3;
      context.setLineDash([6, 4]);
      context.stroke();
      context.setLineDash([]);
    }
    if (selected !== null) {
      const poly = pxCells[selected];
      if (poly && poly.length >= 3) {
        tracePoly(poly);
        context.strokeStyle = SELECT_COLOR;
        context.lineWidth = 3.5;
        context.stroke();
      }
    }

    // Markers at each region's site (guaranteed inside its own cell).
    for (const region of s.regions) {
      drawMarkers(region, project(region), capitals);
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
      if (!drawIcon(`res:${region.resource}`, art, MAP_ICON_COLOR, rx, ry, 13)) {
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
        !(crestArt && drawIcon(`crest:${owner}`, crestArt, ownerColor(owner), cx, cy, 15)) &&
        !drawIcon("glyph:crown", GLYPH_ART.crown, CAPITAL_ICON_COLOR, cx, cy, 13)
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
      if (!drawIcon("glyph:hammer", GLYPH_ART.hammer, MAP_ICON_COLOR, p.x, hy, 12)) {
        context.font = "12px system-ui, sans-serif";
        context.fillText("🔨", p.x, hy);
      }
    }

    // Fortification marker (bottom-centre) — a defended region is harder to take.
    // Bottom-centre is free: the crown sits bottom-left, the army badge bottom-right.
    if (region.fortification > 0) {
      const fy = p.y + NODE_RADIUS - 7;
      if (drawIcon("glyph:shield", GLYPH_ART.shield, MAP_ICON_COLOR, p.x - 4, fy, 11)) {
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

  function tracePoly(poly: Point[]): void {
    context.beginPath();
    context.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) context.lineTo(poly[i].x, poly[i].y);
    context.closePath();
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
      for (let i = 0; i < cells.length; i++) {
        const poly = cells[i].poly.map((v) => projectXY(v.x, v.y));
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
