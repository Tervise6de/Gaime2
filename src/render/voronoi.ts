/**
 * Voronoi-polygon map renderer.
 *
 * A transformative visual over the *identical* adjacency graph: regions become
 * filled Voronoi cells (colour = owner, tint = terrain) that tile the map, with
 * emphasised frontier borders between different owners. It implements the same
 * `MapRenderer` interface as the node+edge fallback, so `main.ts` swaps the two
 * behind a toggle with zero change to game logic.
 *
 * Voronoi cells derive from the same region sites that define adjacency
 * (systems/geometry.ts). Cell geometry in [0,1] space is cached per map; only
 * the cheap re-projection to pixels happens each frame.
 */

import { TERRAIN, totalUnits } from "@/systems/data";
import { voronoiCells, pointInPolygon, type Point } from "@/systems/geometry";
import type { GameState } from "@/systems/types";
import { project, type MapRenderer } from "@/render/types";

const BG = "#0d1016";
const NEUTRAL = "#4a505c";

let cache: { sig: string; cells: Point[][] } | null = null;

function cellsFor(state: GameState): Point[][] {
  const first = state.regions[0];
  const sig = `${state.regions.length}:${first?.x.toFixed(4)}:${first?.y.toFixed(4)}`;
  if (!cache || cache.sig !== sig) {
    const sites: Point[] = state.regions.map((r) => ({ x: r.x, y: r.y }));
    const neighbors = state.regions.map((r) => r.adj);
    cache = { sig, cells: voronoiCells(sites, neighbors) };
  }
  return cache.cells;
}

function centroid(poly: { px: number; py: number }[]): { px: number; py: number } {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.px;
    y += p.py;
  }
  return { px: x / poly.length, py: y / poly.length };
}

export const voronoiRenderer: MapRenderer = {
  id: "voronoi",
  label: "Voronoi",

  draw(ctx, state, view, rs) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, view.width, view.height);

    const cells = cellsFor(state);
    const pxCells = cells.map((cell) => cell.map((p) => project(view, p.x, p.y)));

    // Filled cells with a terrain tint.
    state.regions.forEach((region, i) => {
      const poly = pxCells[i];
      if (poly.length < 3) return;
      const owner = region.owner >= 0 ? state.nations[region.owner] : null;
      tracePoly(ctx, poly);
      ctx.fillStyle = owner ? owner.color : NEUTRAL;
      ctx.fill();
      // Terrain overlay (keeps owner colour dominant for readability).
      tracePoly(ctx, poly);
      ctx.fillStyle = TERRAIN[region.terrain].color;
      ctx.globalAlpha = 0.22;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // Cell outlines.
    ctx.lineJoin = "round";
    for (const poly of pxCells) {
      if (poly.length < 3) continue;
      tracePoly(ctx, poly);
      ctx.strokeStyle = "rgba(10,13,18,0.85)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Frontier emphasis: cells bordering a different owner get a brighter edge.
    state.regions.forEach((region, i) => {
      const poly = pxCells[i];
      if (poly.length < 3) return;
      const frontier = region.adj.some((n) => state.regions[n].owner !== region.owner);
      if (!frontier) return;
      tracePoly(ctx, poly);
      ctx.strokeStyle = "rgba(240,244,248,0.5)";
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Reachable-move highlight (fill wash).
    for (const rid of rs.reachable) {
      const poly = pxCells[rid];
      if (!poly || poly.length < 3) continue;
      tracePoly(ctx, poly);
      ctx.fillStyle = "rgba(120,220,150,0.22)";
      ctx.fill();
      tracePoly(ctx, poly);
      ctx.strokeStyle = "rgba(120,220,150,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Selection / hover outline.
    for (const id of [rs.hovered, rs.selected]) {
      if (id < 0) continue;
      const poly = pxCells[id];
      if (!poly || poly.length < 3) continue;
      tracePoly(ctx, poly);
      ctx.strokeStyle = id === rs.selected ? "#ffffff" : "rgba(255,255,255,0.6)";
      ctx.lineWidth = id === rs.selected ? 3 : 2;
      ctx.stroke();
    }

    // Labels, forts, and army badges at cell centroids.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    state.regions.forEach((region, i) => {
      const poly = pxCells[i];
      if (poly.length < 3) return;
      const c = centroid(poly);

      // Population label with a legibility halo.
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.strokeText(String(Math.round(region.population)), c.px, c.py);
      ctx.fillStyle = "#f2f4f8";
      ctx.fillText(String(Math.round(region.population)), c.px, c.py);

      // Fort pips just above the label.
      if (region.fort > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "9px system-ui, sans-serif";
        ctx.fillText("★".repeat(region.fort), c.px, c.py - 14);
      }
    });

    for (const army of state.armies) {
      const count = totalUnits(army.units);
      if (count === 0) continue;
      const poly = pxCells[army.location];
      if (!poly || poly.length < 3) continue;
      const c = centroid(poly);
      const bx = c.px;
      const by = c.py + 15;
      const nation = state.nations[army.owner];
      ctx.beginPath();
      ctx.arc(bx, by, 9, 0, Math.PI * 2);
      ctx.fillStyle = "#0c0f14";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = nation ? nation.color : "#ccc";
      ctx.stroke();
      ctx.fillStyle = "#f2f4f8";
      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.fillText(String(count), bx, by);
    }
  },

  regionAt(state, view, px, py) {
    const cells = cellsFor(state);
    for (let i = 0; i < cells.length; i++) {
      const poly = cells[i].map((p) => project(view, p.x, p.y));
      if (pointInPolygon(poly.map((p) => ({ x: p.px, y: p.py })), px, py)) return i;
    }
    return -1;
  },
};

function tracePoly(ctx: CanvasRenderingContext2D, poly: { px: number; py: number }[]): void {
  ctx.beginPath();
  ctx.moveTo(poly[0].px, poly[0].py);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].px, poly[i].py);
  ctx.closePath();
}
