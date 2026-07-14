/**
 * Rendering-layer contracts.
 *
 * A `MapRenderer` turns GameState into pixels on a 2D canvas and hit-tests
 * pointer positions back to region ids. The node+edge renderer and (later) the
 * Voronoi renderer both implement this, so `main.ts` can swap them behind a
 * toggle over identical game logic.
 */

import type { GameState } from "@/systems/types";

export interface View {
  /** CSS pixel size of the canvas drawing area. */
  width: number;
  height: number;
}

export interface RenderState {
  /** Currently selected region id, or -1. */
  selected: number;
  /** Region under the pointer, or -1. */
  hovered: number;
  /** Region ids reachable by the selected army this turn (move highlight). */
  reachable: number[];
}

export interface MapRenderer {
  id: "node-edge" | "voronoi";
  label: string;
  draw(ctx: CanvasRenderingContext2D, state: GameState, view: View, rs: RenderState): void;
  /** Map a canvas point to a region id, or -1 if none. */
  regionAt(state: GameState, view: View, px: number, py: number): number;
}

export const MAP_PADDING = 48;

/** Project a region's normalised [0,1] position to canvas pixels. */
export function project(view: View, x: number, y: number): { px: number; py: number } {
  const w = Math.max(1, view.width - MAP_PADDING * 2);
  const h = Math.max(1, view.height - MAP_PADDING * 2);
  return { px: MAP_PADDING + x * w, py: MAP_PADDING + y * h };
}
