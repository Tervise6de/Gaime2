/**
 * HUD — the DOM/CSS layer drawn over the canvas map.
 *
 * The UI observes `GameState` and emits intents through callbacks; it never
 * mutates the simulation directly (architectural guardrail, docs/game-design.md
 * §7). `createHud` builds the panels once and returns an `update(state,
 * selected)` that re-renders them from the latest state.
 *
 * M2 surface: resource bar (stockpiles + income, with a famine flag), fiscal
 * panel (tax slider), end-turn / new-map controls, and a rich region panel —
 * population vs capacity, unrest, completed buildings, the construction slot,
 * and a build menu.
 */

import { BUILDINGS, BUILDING_IDS, type BuildingId } from "@/data/buildings";
import { TERRAIN } from "@/data/terrain";
import { regionProduction, nationalProduction } from "@/systems/economy";
import { regionCapacity } from "@/systems/population";
import {
  PLAYER_ID,
  RESOURCE_KEYS,
  TAX_MAX,
  TAX_MIN,
  TAX_STEP,
  UNREST_PENALTY_START,
  UNREST_REVOLT,
  type GameState,
  type Region,
  type ResourceKey,
} from "@/systems/state";

export interface HudCallbacks {
  onTaxChange(rate: number): void;
  onEndTurn(): void;
  onNewGame(seed: number): void;
  onQueueBuilding(regionId: number, building: BuildingId): void;
  onCancelConstruction(regionId: number): void;
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
  taxHint.textContent = "Higher taxes raise gold but push unrest up over time.";
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
    const seed = raw === "" ? (Date.now() >>> 0) : parseSeed(raw);
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
    resourceEls.food.flow.classList.toggle("negative", state.famine || flow.food < 0);
    turnBadge.textContent =
      (state.famine ? "⚠ FAMINE · " : "") + `Turn ${state.turn} · seed ${state.seed}`;
    turnBadge.classList.toggle("famine", state.famine);

    taxInput.value = String(Math.round(state.taxRate * 100));
    taxLabel.textContent = `Tax ${Math.round(state.taxRate * 100)}%`;

    renderRegion(regionBody, state, selectedRegionId, callbacks);

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
  callbacks: HudCallbacks,
): void {
  container.innerHTML = "";
  if (selectedRegionId === null) {
    const hint = el("p", "hud-hint");
    hint.textContent = "Click a region on the map to inspect and develop it.";
    container.append(hint);
    return;
  }
  const region = state.regions[selectedRegionId];
  if (!region) return;
  const terrain = TERRAIN[region.terrain];
  const flow = regionProduction(region, state.taxRate);
  const cap = regionCapacity(region);

  const title = el("p", "hud-region-title");
  title.textContent = region.name;
  const swatch = el("span", "hud-region-swatch");
  swatch.style.background = terrain.color;
  title.prepend(swatch);

  const meta = el("p", "hud-region-meta");
  meta.textContent =
    `${terrain.name} · pop ${fmt(region.population)}/${fmt(cap)} · ` +
    `${region.adjacency.length} borders`;

  // Unrest bar.
  const unrestWrap = el("div", "hud-unrest");
  const unrestLabel = el("div", "hud-unrest-label");
  unrestLabel.textContent = `Unrest ${fmt(region.unrest)}`;
  unrestLabel.append(unrestTag(region));
  const bar = el("div", "hud-unrest-bar");
  const fill = el("div", "hud-unrest-fill");
  fill.style.width = `${Math.min(100, region.unrest)}%`;
  fill.style.background = unrestColor(region.unrest);
  bar.append(fill);
  unrestWrap.append(unrestLabel, bar);

  // Production breakdown.
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

  container.append(title, meta, unrestWrap, table);

  // Completed buildings.
  if (region.buildings.length) {
    const built = el("p", "hud-region-built");
    built.textContent = "Built: " + region.buildings.map((b) => BUILDINGS[b].name).join(", ");
    container.append(built);
  }

  // Construction slot / build menu.
  container.append(renderBuildSection(region, state, callbacks));
}

function renderBuildSection(
  region: Region,
  state: GameState,
  callbacks: HudCallbacks,
): HTMLElement {
  const section = el("div", "hud-build");
  section.append(heading("Construction"));

  if (region.construction) {
    const def = BUILDINGS[region.construction.building];
    const wrap = el("div", "hud-build-progress");
    const label = el("div", "hud-build-progress-label");
    label.textContent = `${def.name} — ${fmt(region.construction.progress)}/${def.cost} materials`;
    const bar = el("div", "hud-build-bar");
    const fill = el("div", "hud-build-fill");
    fill.style.width = `${(region.construction.progress / def.cost) * 100}%`;
    bar.append(fill);
    const cancel = document.createElement("button");
    cancel.className = "hud-build-cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => callbacks.onCancelConstruction(region.id));
    wrap.append(label, bar, cancel);
    section.append(wrap);
    return section;
  }

  const menu = el("div", "hud-build-menu");
  for (const id of BUILDING_IDS) {
    const def = BUILDINGS[id];
    const already = region.buildings.includes(id);
    const btn = document.createElement("button");
    btn.className = "hud-build-btn";
    btn.disabled = already;
    btn.title = def.blurb;
    btn.innerHTML =
      `<span class="hud-build-name">${def.name}</span>` +
      `<span class="hud-build-cost">${already ? "built" : def.cost + "⛏"}</span>`;
    if (!already) {
      btn.addEventListener("click", () => callbacks.onQueueBuilding(region.id, id));
    }
    menu.append(btn);
  }
  section.append(menu);

  const hint = el("p", "hud-hint");
  hint.textContent = `Materials in store: ${fmt(state.stocks.materials)}. Building draws from the national stockpile each turn.`;
  section.append(hint);
  return section;
}

// --- helpers ----------------------------------------------------------------

function unrestTag(region: Region): HTMLElement {
  const tag = el("span", "hud-unrest-state");
  if (region.unrest >= UNREST_REVOLT) {
    tag.textContent = "REVOLT";
    tag.classList.add("bad");
  } else if (region.unrest >= UNREST_PENALTY_START) {
    tag.textContent = "restless";
    tag.classList.add("warn");
  } else {
    tag.textContent = "calm";
  }
  return tag;
}

function unrestColor(unrest: number): string {
  if (unrest >= UNREST_REVOLT) return "#e8776b";
  if (unrest >= UNREST_PENALTY_START) return "#e0b74a";
  return "#6fb98a";
}

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
