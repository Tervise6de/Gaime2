/**
 * Node + edge map renderer (the always-available fallback).
 *
 * Regions are circles coloured by owner, adjacency is drawn as lines, forts are
 * concentric rings, and armies are badges showing their total unit count. This
 * renderer is fully playable on its own; the Voronoi renderer is a visual
 * upgrade over the identical adjacency graph.
 */

import { TERRAIN, totalUnits } from "@/systems/data";
import { project, type MapRenderer } from "@/render/types";

const NODE_RADIUS = 17;
const NEUTRAL_COLOR = "#5a606c";
const BG = "#11151c";

function nodeRadius(pop: number): number {
  return NODE_RADIUS + Math.min(8, pop * 0.5);
}

export const nodeEdgeRenderer: MapRenderer = {
  id: "node-edge",
  label: "Sõlmed + servad",

  draw(ctx, state, view, rs) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, view.width, view.height);

    // Edges first (under the nodes).
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "rgba(160,180,210,0.18)";
    for (const region of state.regions) {
      const a = project(view, region.x, region.y);
      for (const n of region.adj) {
        if (n <= region.id) continue;
        const b = project(view, state.regions[n].x, state.regions[n].y);
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(b.px, b.py);
        ctx.stroke();
      }
    }

    // Reachable-move highlight rings.
    for (const rid of rs.reachable) {
      const r = state.regions[rid];
      if (!r) continue;
      const p = project(view, r.x, r.y);
      ctx.beginPath();
      ctx.arc(p.px, p.py, nodeRadius(r.population) + 6, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(120,220,150,0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Nodes.
    for (const region of state.regions) {
      const p = project(view, region.x, region.y);
      const radius = nodeRadius(region.population);
      const owner = region.owner >= 0 ? state.nations[region.owner] : null;
      const fill = owner ? owner.color : NEUTRAL_COLOR;

      // Terrain tint ring.
      ctx.beginPath();
      ctx.arc(p.px, p.py, radius + 3, 0, Math.PI * 2);
      ctx.fillStyle = TERRAIN[region.terrain].color;
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(p.px, p.py, radius, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();

      // Fort rings.
      for (let f = 0; f < region.fort; f++) {
        ctx.beginPath();
        ctx.arc(p.px, p.py, radius - 3 - f * 3, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Selection / hover outline.
      if (rs.selected === region.id || rs.hovered === region.id) {
        ctx.beginPath();
        ctx.arc(p.px, p.py, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = rs.selected === region.id ? "#ffffff" : "rgba(255,255,255,0.5)";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Population label.
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(Math.round(region.population)), p.px, p.py);
    }

    // Army badges.
    for (const army of state.armies) {
      const count = totalUnits(army.units);
      if (count === 0) continue;
      const r = state.regions[army.location];
      const p = project(view, r.x, r.y);
      const radius = nodeRadius(r.population);
      const bx = p.px + radius * 0.75;
      const by = p.py - radius * 0.75;
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
    let best = -1;
    let bestD = Infinity;
    for (const region of state.regions) {
      const p = project(view, region.x, region.y);
      const dx = p.px - px;
      const dy = p.py - py;
      const d = dx * dx + dy * dy;
      const rad = nodeRadius(region.population) + 5;
      if (d < rad * rad && d < bestD) {
        bestD = d;
        best = region.id;
      }
    }
    return best;
  },
};
