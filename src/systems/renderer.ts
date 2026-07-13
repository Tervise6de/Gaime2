/**
 * Renderer system.
 *
 * Draws the region graph onto the 2D canvas: adjacency edges, then each region
 * as a terrain-coloured node ringed by its owner's colour, with population,
 * strategic-resource and unrest markers, and any army stacks. This is the
 * node+edge layout the design doc sanctions for M1–M3 (docs/game-design.md §4).
 *
 * The renderer only reads state and reports clicks; it never mutates the sim.
 */

import { TERRAIN } from "@/data/terrain";
import { armySize } from "@/systems/state";
import {
  UNREST_PENALTY_START,
  UNREST_REVOLT,
  type Army,
  type GameState,
  type Region,
} from "@/systems/state";

const BACKGROUND = "#11151c";
const EDGE_COLOR = "rgba(230, 233, 239, 0.14)";
const NODE_RADIUS = 26;
const SELECT_COLOR = "#f4d27a";
const HIGHLIGHT_COLOR = "#63c7d6";
const NEUTRAL_OWNER = "rgba(0,0,0,0.35)";

const RESOURCE_ICON: Record<string, string> = { iron: "⚒", horses: "🐎" };

export interface Renderer {
  start(): void;
  stop(): void;
  setState(state: GameState): void;
  setSelected(regionId: number | null): void;
  /** Regions to highlight as move/attack targets. */
  setHighlights(regionIds: number[]): void;
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
  let clickHandler: (regionId: number | null) => void = () => {};

  function ownerColor(ownerId: number | null): string {
    if (ownerId === null || !state) return NEUTRAL_OWNER;
    return state.nations.find((n) => n.id === ownerId)?.color ?? NEUTRAL_OWNER;
  }

  function project(region: Region): { x: number; y: number } {
    const { clientWidth, clientHeight } = canvas;
    const margin = NODE_RADIUS + 30;
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
      drawArmies(state);
    }
    frame = window.requestAnimationFrame(render);
  }

  function drawEdges(s: GameState): void {
    context.lineWidth = 2;
    for (const region of s.regions) {
      const a = project(region);
      for (const neighbourId of region.adjacency) {
        if (region.id >= neighbourId) continue;
        const neighbour = s.regions[neighbourId];
        if (!neighbour) continue;
        const b = project(neighbour);
        context.strokeStyle = EDGE_COLOR;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
    }
  }

  function drawNodes(s: GameState): void {
    // A nation's capital, marked only while that nation still holds it — the
    // crown vanishes the turn the seat of power is captured.
    const capitals = new Set<number>();
    for (const n of s.nations) {
      if (n.isBarbarian || n.capitalRegionId === undefined) continue;
      const cap = s.regions[n.capitalRegionId];
      if (cap && cap.ownerId === n.id) capitals.add(n.capitalRegionId);
    }

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

      // Population count.
      context.fillStyle = "#0d0f14";
      context.font = "600 13px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(Math.round(region.population)), p.x, p.y);

      // Strategic resource marker (top-left).
      if (region.resource) {
        context.font = "13px system-ui, sans-serif";
        context.fillText(RESOURCE_ICON[region.resource] ?? "?", p.x - NODE_RADIUS + 4, p.y - NODE_RADIUS + 2);
      }

      // Capital marker (crown, bottom-left corner) — the owner's seat of power.
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

      // Region name below.
      context.fillStyle = "#c9cedb";
      context.font = "500 11px system-ui, sans-serif";
      context.textBaseline = "top";
      context.fillText(region.name, p.x, p.y + NODE_RADIUS + 4);
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

  function unrestDot(unrest: number): string | null {
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
    onRegionClick(handler: (regionId: number | null) => void): void {
      clickHandler = handler;
    },
  };
}

/** Exposed for potential reuse/testing of the army badge count. */
export function stackLabel(army: Army): string {
  return String(armySize(army.units));
}
