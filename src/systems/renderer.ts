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

import { TERRAIN } from "@/data/terrain";
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
  let clickHandler: (regionId: number | null) => void = () => {};

  // Voronoi cells (normalised space) cached until the map geometry changes.
  let cells: VoronoiCell[] = [];
  let cellSig = "";

  function ensureCells(s: GameState): void {
    const first = s.regions[0];
    const sig = `${s.regions.length}:${first?.x.toFixed(5)}:${first?.y.toFixed(5)}`;
    if (sig !== cellSig) {
      cellSig = sig;
      cells = computeVoronoiCells(s.regions.map((r) => ({ x: r.x, y: r.y })));
    }
  }

  function ownerColor(ownerId: number | null): string {
    if (ownerId === null || !state) return NEUTRAL_OWNER;
    return state.nations.find((n) => n.id === ownerId)?.color ?? NEUTRAL_OWNER;
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
    context.fillStyle = BACKGROUND;
    context.fillRect(0, 0, clientWidth, clientHeight);
    if (state) {
      if (layout === "voronoi") {
        drawVoronoi(state);
      } else {
        drawEdges(state);
        drawNodes(state);
      }
      drawArmies(state);
    }
    frame = window.requestAnimationFrame(render);
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
      context.fillStyle = terrain.color;
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
    ensureCells(s);
    const capitals = capitalSet(s);
    const pxCells = cells.map((c) => c.poly.map((v) => projectXY(v.x, v.y)));

    // Fills: terrain colour, then an owner tint (dark wash for neutral/barbarian).
    s.regions.forEach((region, i) => {
      const poly = pxCells[i];
      if (!poly || poly.length < 3) return;
      tracePoly(poly);
      context.fillStyle = TERRAIN[region.terrain].color;
      context.fill();
      tracePoly(poly);
      context.globalAlpha = OWNER_TINT_ALPHA;
      context.fillStyle = ownerColor(region.ownerId);
      context.fill();
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
      context.font = "13px system-ui, sans-serif";
      context.fillText(RESOURCE_ICON[region.resource] ?? "?", p.x - NODE_RADIUS + 4, p.y - NODE_RADIUS + 2);
    }

    // Capital marker (crown, bottom-left corner).
    if (capitals.has(region.id)) {
      context.font = "13px system-ui, sans-serif";
      context.fillText("👑", p.x - NODE_RADIUS + 5, p.y + NODE_RADIUS - 7);
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
      context.font = "12px system-ui, sans-serif";
      context.fillText("🔨", p.x, p.y - NODE_RADIUS - 8);
    }

    // Fortification marker (bottom-centre) — a defended region is harder to take.
    // Bottom-centre is free: the crown sits bottom-left, the army badge bottom-right.
    if (region.fortification > 0) {
      context.font = "600 10px system-ui, sans-serif";
      context.fillText(`🛡${region.fortification}`, p.x, p.y + NODE_RADIUS - 7);
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
    onRegionClick(handler: (regionId: number | null) => void): void {
      clickHandler = handler;
    },
  };
}

/** Exposed for potential reuse/testing of the army badge count. */
export function stackLabel(army: Army): string {
  return String(armySize(army.units));
}
