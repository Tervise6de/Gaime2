/**
 * Renderer system.
 *
 * Draws the region graph onto a 2D canvas (design doc §4). This milestone uses
 * the shippable node+edge fallback: regions are circles coloured by terrain
 * with an owner-coloured ring; adjacency is drawn as connecting lines. The
 * logic layer is unchanged — a Voronoi polygon renderer can replace this later
 * over identical data.
 *
 * Rendering is event-driven (turn-based game): the controller calls `render`
 * when state or selection changes, and on resize. The renderer never mutates
 * game state; it only reads it.
 */

import type { GameState, Point, Region } from "@/core/types";
import { TERRAIN } from "@/data/terrain";

const BACKGROUND = "#11151c";
const EDGE_COLOR = "rgba(255, 255, 255, 0.10)";
const NEUTRAL_RING = "rgba(255, 255, 255, 0.22)";
const SELECTED_RING = "#ffffff";
const LABEL_COLOR = "#c2cad6";
const PADDING = 44;

export interface RenderOptions {
  selectedRegionId?: number | null;
}

export interface Renderer {
  /** Draw the current game state (optionally highlighting a selected region). */
  render(state: GameState, options?: RenderOptions): void;
  /** Map a canvas-relative click to a region id, or null if none was hit. */
  pick(clientX: number, clientY: number, state: GameState): number | null;
  /** Register a callback fired (debounced to a frame) when the canvas resizes. */
  onResize(callback: () => void): void;
  /** Stop listening and release resources. */
  stop(): void;
}

interface Layout {
  toScreen(p: Point): Point;
  nodeRadius(region: Region): number;
}

/** Fit the unit-square map into the canvas, centred, preserving aspect. */
function computeLayout(canvas: HTMLCanvasElement): Layout {
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  const size = Math.max(1, Math.min(cw, ch) - PADDING * 2);
  const offsetX = (cw - size) / 2;
  const offsetY = (ch - size) / 2;
  return {
    toScreen(p: Point): Point {
      return { x: offsetX + p.x * size, y: offsetY + p.y * size };
    },
    nodeRadius(region: Region): number {
      return Math.max(9, Math.min(20, 9 + region.population * 0.5));
    },
  };
}

/** Owner ring colour for a region (nation colour, or neutral grey). */
function ownerColor(state: GameState, region: Region): string {
  if (region.ownerId === null) return NEUTRAL_RING;
  const nation = state.nations.find((n) => n.id === region.ownerId);
  return nation ? nation.color : NEUTRAL_RING;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to acquire 2D rendering context");
  }
  const context = ctx;

  let resizeCallback: (() => void) | null = null;
  let resizeRaf = 0;

  function syncBackingStore(): void {
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = canvas;
    canvas.width = Math.max(1, Math.floor(clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(clientHeight * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function handleResize(): void {
    if (resizeRaf) return;
    resizeRaf = window.requestAnimationFrame(() => {
      resizeRaf = 0;
      resizeCallback?.();
    });
  }

  window.addEventListener("resize", handleResize);

  function render(state: GameState, options: RenderOptions = {}): void {
    syncBackingStore();
    const layout = computeLayout(canvas);
    const selected = options.selectedRegionId ?? null;

    context.fillStyle = BACKGROUND;
    context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    // Edges first (each undirected pair once).
    context.strokeStyle = EDGE_COLOR;
    context.lineWidth = 1.5;
    context.beginPath();
    for (const region of state.regions) {
      const from = layout.toScreen(region.site);
      for (const neighbourId of region.adjacency) {
        if (neighbourId <= region.id) continue; // draw each pair once
        const neighbour = state.regions[neighbourId];
        if (!neighbour) continue;
        const to = layout.toScreen(neighbour.site);
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
      }
    }
    context.stroke();

    // Nodes.
    for (const region of state.regions) {
      const pos = layout.toScreen(region.site);
      const radius = layout.nodeRadius(region);
      const owned = region.ownerId !== null;

      context.beginPath();
      context.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      context.fillStyle = TERRAIN[region.terrain].color;
      context.globalAlpha = owned ? 1 : 0.55;
      context.fill();
      context.globalAlpha = 1;

      // Owner / selection ring.
      const isSelected = region.id === selected;
      context.lineWidth = isSelected ? 4 : owned ? 3 : 1.5;
      context.strokeStyle = isSelected ? SELECTED_RING : ownerColor(state, region);
      context.beginPath();
      context.arc(pos.x, pos.y, radius + (isSelected ? 3 : 1), 0, Math.PI * 2);
      context.stroke();

      // Coastal marker: small inner dot.
      if (region.coastal) {
        context.beginPath();
        context.arc(pos.x, pos.y, 2.2, 0, Math.PI * 2);
        context.fillStyle = "rgba(255,255,255,0.65)";
        context.fill();
      }
    }

    // Labels last so they sit on top.
    context.fillStyle = LABEL_COLOR;
    context.font = "11px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "top";
    for (const region of state.regions) {
      const pos = layout.toScreen(region.site);
      const radius = layout.nodeRadius(region);
      context.fillText(region.name, pos.x, pos.y + radius + 3);
    }
  }

  function pick(
    clientX: number,
    clientY: number,
    state: GameState,
  ): number | null {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const layout = computeLayout(canvas);

    let hit: number | null = null;
    let bestD = Infinity;
    for (const region of state.regions) {
      const pos = layout.toScreen(region.site);
      const radius = layout.nodeRadius(region);
      const dx = x - pos.x;
      const dy = y - pos.y;
      const d = dx * dx + dy * dy;
      const hitRadius = radius + 6;
      if (d <= hitRadius * hitRadius && d < bestD) {
        bestD = d;
        hit = region.id;
      }
    }
    return hit;
  }

  return {
    render,
    pick,
    onResize(callback: () => void): void {
      resizeCallback = callback;
    },
    stop(): void {
      window.removeEventListener("resize", handleResize);
      if (resizeRaf) window.cancelAnimationFrame(resizeRaf);
      resizeCallback = null;
    },
  };
}
