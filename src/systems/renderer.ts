/**
 * Renderer system.
 *
 * Draws the region graph onto the 2D canvas: adjacency edges first, then each
 * region as a terrain-coloured node with its name and population. This is the
 * node+edge layout the design doc sanctions as Milestone 1's shippable map
 * (docs/game-design.md §4) — identical logic to what a later Voronoi renderer
 * would draw over the same graph.
 *
 * The renderer only reads state and reports clicks; it never mutates the sim
 * (architectural guardrail: systems hold logic, the UI emits intents).
 */

import { TERRAIN } from "@/data/terrain";
import {
  UNREST_PENALTY_START,
  UNREST_REVOLT,
  type GameState,
  type Region,
} from "@/systems/state";

const BACKGROUND = "#11151c";
const EDGE_COLOR = "rgba(230, 233, 239, 0.14)";
const NODE_RADIUS = 26;
const SELECT_COLOR = "#f4d27a";

export interface Renderer {
  start(): void;
  stop(): void;
  /** Provide the state to draw. */
  setState(state: GameState): void;
  /** Highlight a region (or null to clear). */
  setSelected(regionId: number | null): void;
  /** Register a click handler; receives the clicked region id or null. */
  onRegionClick(handler: (regionId: number | null) => void): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to acquire 2D rendering context");
  }
  const context = ctx;

  let running = false;
  let frame = 0;
  let state: GameState | null = null;
  let selected: number | null = null;
  let clickHandler: (regionId: number | null) => void = () => {};

  /** Map a region's world position [0,1] to canvas pixels, with margins. */
  function project(region: Region): { x: number; y: number } {
    const { clientWidth, clientHeight } = canvas;
    const margin = NODE_RADIUS + 24;
    return {
      x: margin + region.x * (clientWidth - margin * 2),
      y: margin + region.y * (clientHeight - margin * 2),
    };
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
      drawEdges(state);
      drawNodes(state);
    }

    frame = window.requestAnimationFrame(render);
  }

  function drawEdges(s: GameState): void {
    context.strokeStyle = EDGE_COLOR;
    context.lineWidth = 2;
    for (const region of s.regions) {
      const a = project(region);
      for (const neighbourId of region.adjacency) {
        // Draw each edge once (only when id < neighbour).
        if (region.id >= neighbourId) continue;
        const neighbour = s.regions[neighbourId];
        if (!neighbour) continue;
        const b = project(neighbour);
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
    }
  }

  function drawNodes(s: GameState): void {
    for (const region of s.regions) {
      const p = project(region);
      const terrain = TERRAIN[region.terrain];
      const isSelected = region.id === selected;

      context.beginPath();
      context.arc(p.x, p.y, NODE_RADIUS, 0, Math.PI * 2);
      context.fillStyle = terrain.color;
      context.fill();

      // Unrest ring: amber when restless, red when revolting.
      const unrestStroke = unrestRing(region.unrest);
      context.lineWidth = isSelected ? 4 : unrestStroke ? 3 : 2;
      context.strokeStyle = isSelected
        ? SELECT_COLOR
        : unrestStroke ?? "rgba(0,0,0,0.35)";
      context.stroke();

      // Population count, centred.
      context.fillStyle = "#0d0f14";
      context.font = "600 13px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(Math.round(region.population)), p.x, p.y);

      // Construction indicator: a small hammer above the node.
      if (region.construction) {
        context.font = "12px system-ui, sans-serif";
        context.fillText("🔨", p.x, p.y - NODE_RADIUS - 8);
      }

      // Region name below the node.
      context.fillStyle = "#c9cedb";
      context.font = "500 11px system-ui, sans-serif";
      context.textBaseline = "top";
      context.fillText(region.name, p.x, p.y + NODE_RADIUS + 3);
    }
  }

  /** Ring colour for a region's unrest, or null when calm. */
  function unrestRing(unrest: number): string | null {
    if (unrest >= UNREST_REVOLT) return "#e8776b";
    if (unrest >= UNREST_PENALTY_START) return "#e0b74a";
    return null;
  }

  function hitTest(px: number, py: number): number | null {
    if (!state) return null;
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
    const hit = hitTest(ev.clientX - rect.left, ev.clientY - rect.top);
    clickHandler(hit);
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
    onRegionClick(handler: (regionId: number | null) => void): void {
      clickHandler = handler;
    },
  };
}
