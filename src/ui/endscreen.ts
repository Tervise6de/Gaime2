/**
 * End-game summary overlay.
 *
 * A pure read of existing state: the prestige-history line graph is drawn from
 * `state.scoreHistory` (recorded every turn by the turn pipeline) and the final
 * scoreboard from the live regions/nations. The UI never mutates the sim — it
 * only observes and emits a "new game" intent.
 *
 * The chart follows the dataviz method: change-over-time → lines; colour follows
 * the nation entity (identical to the map); nation names are the always-present
 * secondary encoding (legend + direct end-labels + table); recessive grid/axes;
 * a hover crosshair with a per-turn tooltip.
 */

import { prestige } from "@/systems/scoring";
import type { GameState } from "@/systems/types";

const SVGNS = "http://www.w3.org/2000/svg";
const CHART_W = 760;
const CHART_H = 380;
const PAD = { top: 24, right: 104, bottom: 40, left: 52 };

export interface EndScreen {
  show(state: GameState): void;
  hide(): void;
  root: HTMLElement;
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createEndScreen(root: HTMLElement, onNewGame: () => void): EndScreen {
  const overlay = h("div", "endscreen");
  overlay.hidden = true;
  root.append(overlay);

  function hide(): void {
    overlay.hidden = true;
    overlay.replaceChildren();
  }

  function show(state: GameState): void {
    overlay.replaceChildren();

    const card = h("div", "endscreen-card");
    overlay.append(card);

    // Header.
    const winner = state.winner !== null ? state.nations[state.winner] : null;
    const header = h("div", "endscreen-header");
    const title = h("h1", "endscreen-title");
    if (winner) {
      const sw = h("span", "hud-swatch");
      sw.style.background = winner.color;
      title.append(sw, document.createTextNode(`${winner.name} võitis`));
    } else {
      title.textContent = "Mäng läbi";
    }
    header.append(title, h("div", "endscreen-sub", victoryLine(state)));
    card.append(header);

    const body = h("div", "endscreen-body");
    card.append(body);
    body.append(buildChart(state));
    body.append(buildScoreboard(state));

    const footer = h("div", "endscreen-footer");
    const btn = h("button", "hud-btn hud-btn-primary", "Uus mäng");
    btn.addEventListener("click", onNewGame);
    footer.append(btn);
    card.append(footer);

    overlay.hidden = false;
  }

  return { show, hide, root: overlay };
}

function victoryLine(state: GameState): string {
  const t = state.victoryType;
  const label =
    t === "domination" ? "Domineerimisvõit" : t === "elimination" ? "Hävitamisvõit" : "Prestiiživõit";
  return `${label} · ${state.turn}. käigul · ${state.nations.length} rahvast`;
}

// --- Prestige-history line chart -------------------------------------------

function buildChart(state: GameState): HTMLElement {
  const wrap = h("div", "endscreen-chart");
  wrap.append(h("h2", "endscreen-h2", "Prestiiži ajalugu"));

  const history = state.scoreHistory;
  const nations = state.nations;
  const turns = history.map((s) => s.turn);
  const minTurn = turns[0] ?? 0;
  const maxTurn = turns[turns.length - 1] ?? 1;
  let maxScore = 1;
  for (const snap of history) for (const v of snap.scores) if (v > maxScore) maxScore = v;
  maxScore = Math.ceil((maxScore * 1.08) / 10) * 10;

  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const xOf = (turn: number) =>
    PAD.left + (maxTurn === minTurn ? 0 : ((turn - minTurn) / (maxTurn - minTurn)) * plotW);
  const yOf = (score: number) => PAD.top + plotH - (score / maxScore) * plotH;

  const s = svg("svg", { viewBox: `0 0 ${CHART_W} ${CHART_H}`, class: "endscreen-svg" });
  s.setAttribute("role", "img");
  s.setAttribute("aria-label", "Prestiiži ajalugu käikude lõikes");

  // Y gridlines + labels.
  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const val = (maxScore / yTicks) * i;
    const y = yOf(val);
    s.append(svg("line", { x1: PAD.left, y1: y, x2: CHART_W - PAD.right, y2: y, class: "grid" }));
    const lbl = svg("text", { x: PAD.left - 8, y: y + 4, class: "axis-label", "text-anchor": "end" });
    lbl.textContent = String(Math.round(val));
    s.append(lbl);
  }

  // X axis labels (a few ticks).
  const xTicks = Math.min(6, maxTurn - minTurn || 1);
  for (let i = 0; i <= xTicks; i++) {
    const turn = Math.round(minTurn + ((maxTurn - minTurn) / xTicks) * i);
    const x = xOf(turn);
    const lbl = svg("text", { x, y: CHART_H - PAD.bottom + 20, class: "axis-label", "text-anchor": "middle" });
    lbl.textContent = String(turn);
    s.append(lbl);
  }
  const xTitle = svg("text", { x: PAD.left + plotW / 2, y: CHART_H - 4, class: "axis-title", "text-anchor": "middle" });
  xTitle.textContent = "Käik";
  s.append(xTitle);

  // One polyline per nation, coloured by the nation entity.
  const last = history[history.length - 1];
  const lx = xOf(last.turn);
  for (const nation of nations) {
    const pts = history.map((snap) => `${xOf(snap.turn)},${yOf(snap.scores[nation.id] ?? 0)}`).join(" ");
    s.append(svg("polyline", { points: pts, fill: "none", stroke: nation.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    const ly = yOf(last.scores[nation.id] ?? 0);
    s.append(svg("circle", { cx: lx, cy: ly, r: 3.5, fill: nation.color }));
  }

  // Direct end-labels, de-collided vertically so flat/overlapping lines stay legible.
  const labels = nations
    .map((n) => ({ n, y: yOf(last.scores[n.id] ?? 0) }))
    .sort((a, b) => a.y - b.y);
  const MIN_GAP = 14;
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < MIN_GAP) labels[i].y = labels[i - 1].y + MIN_GAP;
  }
  for (const { n, y } of labels) {
    const name = svg("text", { x: lx + 8, y: y + 4, class: "series-label", fill: n.color });
    name.textContent = n.name;
    s.append(name);
  }

  // Hover crosshair + tooltip.
  const crosshair = svg("line", { x1: 0, y1: PAD.top, x2: 0, y2: PAD.top + plotH, class: "crosshair" });
  crosshair.style.opacity = "0";
  s.append(crosshair);
  const hit = svg("rect", { x: PAD.left, y: PAD.top, width: plotW, height: plotH, fill: "transparent" });
  s.append(hit);

  const tooltip = h("div", "endscreen-tooltip");
  tooltip.hidden = true;
  wrap.append(tooltip);

  hit.addEventListener("mousemove", (ev) => {
    const rect = s.getBoundingClientRect();
    const scaleX = CHART_W / rect.width;
    const px = (ev.clientX - rect.left) * scaleX;
    // Nearest snapshot by turn.
    const frac = (px - PAD.left) / plotW;
    const turn = Math.round(minTurn + frac * (maxTurn - minTurn));
    const idx = history.findIndex((snap) => snap.turn >= turn);
    const snap = history[idx < 0 ? history.length - 1 : idx];
    if (!snap) return;
    crosshair.setAttribute("x1", String(xOf(snap.turn)));
    crosshair.setAttribute("x2", String(xOf(snap.turn)));
    crosshair.style.opacity = "1";
    tooltip.replaceChildren();
    tooltip.append(h("div", "endscreen-tooltip-turn", `Käik ${snap.turn}`));
    const ranked = nations
      .map((n) => ({ n, v: snap.scores[n.id] ?? 0 }))
      .sort((a, b) => b.v - a.v);
    for (const { n, v } of ranked) {
      const line = h("div", "endscreen-tooltip-line");
      const sw = h("span", "hud-swatch");
      sw.style.background = n.color;
      line.append(sw, h("span", "endscreen-tooltip-name", n.name), h("span", "endscreen-tooltip-val", String(v)));
      tooltip.append(line);
    }
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(ev.clientX - rect.left + 14, rect.width - 150)}px`;
    tooltip.style.top = `12px`;
  });
  hit.addEventListener("mouseleave", () => {
    crosshair.style.opacity = "0";
    tooltip.hidden = true;
  });

  wrap.append(s);
  return wrap;
}

// --- Final scoreboard -------------------------------------------------------

function buildScoreboard(state: GameState): HTMLElement {
  const wrap = h("div", "endscreen-board");
  wrap.append(h("h2", "endscreen-h2", "Lõpptabel"));

  const rows = state.nations
    .map((n) => ({
      nation: n,
      regions: state.regions.filter((r) => r.owner === n.id).length,
      score: prestige(state, n.id),
    }))
    .sort((a, b) => b.score - a.score || b.regions - a.regions);

  const table = h("table", "endscreen-table");
  const thead = h("thead");
  const htr = h("tr");
  for (const label of ["#", "Rahvas", "Alad", "Prestiiž", "Seis"]) {
    htr.append(h("th", undefined, label));
  }
  thead.append(htr);
  table.append(thead);

  const tbody = h("tbody");
  rows.forEach((row, i) => {
    const tr = h("tr");
    if (row.nation.id === state.winner) tr.classList.add("is-winner");
    tr.append(h("td", "rank", String(i + 1)));
    const nameTd = h("td", "name");
    const sw = h("span", "hud-swatch");
    sw.style.background = row.nation.color;
    nameTd.append(sw, document.createTextNode(row.nation.name));
    tr.append(nameTd);
    tr.append(h("td", "num", String(row.regions)));
    tr.append(h("td", "num", String(row.score)));
    tr.append(h("td", "status", row.nation.alive ? "elus" : "hävitatud"));
    tbody.append(tr);
  });
  table.append(tbody);
  wrap.append(table);
  return wrap;
}
