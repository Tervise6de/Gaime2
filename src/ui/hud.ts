/**
 * HUD — the DOM/CSS layer drawn over the canvas map.
 *
 * The UI observes `GameState` and emits intents through callbacks; it never
 * mutates the simulation directly (architectural guardrail, docs/game-design.md
 * §7). `createHud` builds the panels once and returns an `update(state,
 * selected)` that re-renders them from the latest state.
 *
 * Milestone 1 surface: a top resource bar (stockpiles + per-turn income), a
 * fiscal panel (tax slider), the end-turn control, a selected-region readout,
 * and the turn log.
 */

import { TERRAIN } from "@/data/terrain";
import { regionProduction, nationalProduction } from "@/systems/economy";
import {
  PLAYER_ID,
  RESOURCE_KEYS,
  TAX_MAX,
  TAX_MIN,
  TAX_STEP,
  type GameState,
  type ResourceKey,
} from "@/systems/state";

export interface HudCallbacks {
  onTaxChange(rate: number): void;
  onEndTurn(): void;
  onNewGame(seed: number): void;
}

export interface Hud {
  update(state: GameState, selectedRegionId: number | null): void;
}

const RESOURCE_META: Record<ResourceKey, { label: string; icon: string }> = {
  gold: { label: "Treasury", icon: "🪙" },
  food: { label: "Food", icon: "🌾" },
  materials: { label: "Materials", icon: "⛏️" },
  knowledge: { label: "Knowledge", icon: "📖" },
};

export function createHud(root: HTMLElement, callbacks: HudCallbacks): Hud {
  root.innerHTML = "";

  // --- Top resource bar -----------------------------------------------------
  const topBar = el("div", "hud-topbar");
  const resourceEls: Record<ResourceKey, { stock: HTMLElement; flow: HTMLElement }> =
    {} as never;
  for (const key of RESOURCE_KEYS) {
    const meta = RESOURCE_META[key];
    const cell = el("div", "hud-resource");
    const icon = el("span", "hud-resource-icon");
    icon.textContent = meta.icon;
    const body = el("div", "hud-resource-body");
    const label = el("span", "hud-resource-label");
    label.textContent = meta.label;
    const stock = el("span", "hud-resource-stock");
    const flow = el("span", "hud-resource-flow");
    body.append(label, stock, flow);
    cell.append(icon, body);
    topBar.append(cell);
    resourceEls[key] = { stock, flow };
  }
  const turnBadge = el("div", "hud-turn");
  topBar.append(turnBadge);
  root.append(topBar);

  // --- Left panel: fiscal + turn control ------------------------------------
  const leftPanel = el("div", "hud-panel hud-left");

  const fiscal = el("div", "hud-section");
  fiscal.append(heading("Fiscal policy"));
  const taxRow = el("div", "hud-tax-row");
  const taxLabel = el("span", "hud-tax-label");
  const taxInput = document.createElement("input");
  taxInput.type = "range";
  taxInput.min = String(Math.round(TAX_MIN * 100));
  taxInput.max = String(Math.round(TAX_MAX * 100));
  taxInput.step = String(Math.round(TAX_STEP * 100));
  taxInput.className = "hud-tax-slider";
  taxInput.addEventListener("input", () => {
    callbacks.onTaxChange(Number(taxInput.value) / 100);
  });
  taxRow.append(taxInput, taxLabel);
  const taxHint = el("p", "hud-hint");
  taxHint.textContent =
    "Higher taxes raise more gold now. (Unrest cost arrives in Milestone 2.)";
  fiscal.append(taxRow, taxHint);
  leftPanel.append(fiscal);

  const controls = el("div", "hud-section");
  const endTurnBtn = document.createElement("button");
  endTurnBtn.className = "hud-endturn";
  endTurnBtn.textContent = "End turn ▶";
  endTurnBtn.addEventListener("click", () => callbacks.onEndTurn());
  controls.append(endTurnBtn);

  const newGameRow = el("div", "hud-newgame");
  const seedInput = document.createElement("input");
  seedInput.type = "text";
  seedInput.className = "hud-seed";
  seedInput.placeholder = "seed";
  const newGameBtn = document.createElement("button");
  newGameBtn.className = "hud-newgame-btn";
  newGameBtn.textContent = "New map";
  newGameBtn.addEventListener("click", () => {
    const raw = seedInput.value.trim();
    const seed = raw === "" ? Date.now() >>> 0 : parseSeed(raw);
    callbacks.onNewGame(seed);
  });
  newGameRow.append(seedInput, newGameBtn);
  controls.append(newGameRow);
  leftPanel.append(controls);

  root.append(leftPanel);

  // --- Right panel: selected region -----------------------------------------
  const rightPanel = el("div", "hud-panel hud-right");
  rightPanel.append(heading("Region"));
  const regionBody = el("div", "hud-region-body");
  rightPanel.append(regionBody);
  root.append(rightPanel);

  // --- Bottom: turn log -----------------------------------------------------
  const logPanel = el("div", "hud-panel hud-log");
  logPanel.append(heading("Turn log"));
  const logBody = el("div", "hud-log-body");
  logPanel.append(logBody);
  root.append(logPanel);

  // --- Update ----------------------------------------------------------------
  function update(state: GameState, selectedRegionId: number | null): void {
    const flow = nationalProduction(state, PLAYER_ID);
    for (const key of RESOURCE_KEYS) {
      resourceEls[key].stock.textContent = fmt(state.stocks[key]);
      const f = flow[key];
      resourceEls[key].flow.textContent = `${f >= 0 ? "+" : ""}${fmt(f)}/turn`;
      resourceEls[key].flow.classList.toggle("negative", f < 0);
    }
    turnBadge.textContent = `Turn ${state.turn} · seed ${state.seed}`;

    taxInput.value = String(Math.round(state.taxRate * 100));
    taxLabel.textContent = `Tax ${Math.round(state.taxRate * 100)}%`;

    renderRegion(regionBody, state, selectedRegionId);

    logBody.innerHTML = "";
    for (const line of state.log.slice(-8).reverse()) {
      const p = el("p", "hud-log-line");
      p.textContent = line;
      logBody.append(p);
    }
  }

  return { update };
}

function renderRegion(
  container: HTMLElement,
  state: GameState,
  selectedRegionId: number | null,
): void {
  container.innerHTML = "";
  if (selectedRegionId === null) {
    const hint = el("p", "hud-hint");
    hint.textContent = "Click a region on the map to inspect it.";
    container.append(hint);
    return;
  }
  const region = state.regions[selectedRegionId];
  if (!region) return;
  const terrain = TERRAIN[region.terrain];
  const flow = regionProduction(region, state.taxRate);

  const title = el("p", "hud-region-title");
  title.textContent = region.name;
  const swatch = el("span", "hud-region-swatch");
  swatch.style.background = terrain.color;
  title.prepend(swatch);

  const meta = el("p", "hud-region-meta");
  meta.textContent = `${terrain.name} · pop ${region.population} · ${region.adjacency.length} borders`;

  const table = el("div", "hud-region-flows");
  for (const key of RESOURCE_KEYS) {
    const row = el("div", "hud-region-flow");
    const k = el("span", "");
    k.textContent = RESOURCE_META[key].label;
    const v = el("span", "hud-region-flow-val");
    const value = flow[key];
    v.textContent = `${value >= 0 ? "+" : ""}${fmt(value)}`;
    if (value < 0) v.classList.add("negative");
    row.append(k, v);
    table.append(row);
  }

  container.append(title, meta, table);
}

// --- helpers ----------------------------------------------------------------

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function heading(text: string): HTMLElement {
  const h = el("h2", "hud-heading");
  h.textContent = text;
  return h;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Parse a seed string: numeric strings become numbers, else a stable hash. */
function parseSeed(raw: string): number {
  const n = Number(raw);
  if (Number.isFinite(n)) return Math.abs(Math.trunc(n)) >>> 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
