/**
 * HUD — the DOM/CSS layer drawn over the canvas map.
 *
 * The UI observes `GameState` and emits intents through callbacks; it never
 * mutates the simulation directly (architectural guardrail, docs/game-design.md
 * §7). `createHud` builds the panels once and returns an `update(...)` that
 * re-renders them from the latest state.
 *
 * M3 surface adds military to the region panel: ownership, fortification and
 * strategic resource, the army stationed there (or the enemy garrison), a
 * raise-unit menu, and a move/attack control that drives the map's target
 * highlighting via the parent.
 */

import { BUILDINGS, BUILDING_IDS, type BuildingId } from "@/data/buildings";
import { UNITS, UNIT_TYPES, type UnitType } from "@/data/units";
import { TERRAIN } from "@/data/terrain";
import { regionProduction, nationalProduction } from "@/systems/economy";
import { regionCapacity } from "@/systems/population";
import {
  armyAt,
  anyArmyAt,
  canRaiseUnit,
  totalUpkeep,
} from "@/systems/military";
import { getRelation, getTreaty } from "@/systems/diplomacy";
import { researchFrontier, isBuildingUnlockedFor, techMultipliers } from "@/systems/tech";
import { ARCHETYPE_LABEL } from "@/data/personalities";
import { TECHS, type TechId } from "@/data/techs";
import { WONDER_GOAL } from "@/systems/state";
import {
  PLAYER_ID,
  RESOURCE_KEYS,
  TAX_MAX,
  TAX_MIN,
  TAX_STEP,
  UNREST_PENALTY_START,
  UNREST_REVOLT,
  armySize,
  playerNation,
  type Army,
  type GameState,
  type Nation,
  type Region,
  type ResourceKey,
} from "@/systems/state";

export interface HudCallbacks {
  onTaxChange(rate: number): void;
  onEndTurn(): void;
  onNewGame(seed: number): void;
  onQueueBuilding(regionId: number, building: BuildingId): void;
  onCancelConstruction(regionId: number): void;
  onRaiseUnit(regionId: number, unit: UnitType): void;
  onBeginMove(armyId: number): void;
  onCancelMove(): void;
  onDeclareWar(targetId: number): void;
  onMakePeace(targetId: number): void;
  onProposePact(targetId: number, kind: "nap" | "alliance"): void;
  onGift(targetId: number, amount: number): void;
  onAcceptOffer(offerId: number): void;
  onRejectOffer(offerId: number): void;
  onChooseResearch(tech: TechId): void;
}

const BRANCH_COLOR: Record<string, string> = {
  economy: "#e0b74a",
  military: "#e8776b",
  civics: "#63c7d6",
  wonders: "#b06ec0",
};

/** Fixed gift size the diplomacy panel offers. */
const GIFT_AMOUNT = 30;

export interface Hud {
  update(state: GameState, selectedRegionId: number | null, moveArmyId: number | null): void;
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
  taxInput.addEventListener("input", () => callbacks.onTaxChange(Number(taxInput.value) / 100));
  taxRow.append(taxInput, taxLabel);
  const upkeepLine = el("p", "hud-hint");
  fiscal.append(taxRow, upkeepLine);
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
    callbacks.onNewGame(raw === "" ? (Date.now() >>> 0) : parseSeed(raw));
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

  // --- Diplomacy panel (top-left) -------------------------------------------
  const diploPanel = el("div", "hud-panel hud-diplo");
  diploPanel.append(heading("Diplomacy"));
  const diploBody = el("div", "hud-diplo-body");
  diploPanel.append(diploBody);
  root.append(diploPanel);

  // --- Research panel (bottom centre) ---------------------------------------
  const researchPanel = el("div", "hud-panel hud-research");
  const researchBody = el("div", "hud-research-body");
  researchPanel.append(researchBody);
  root.append(researchPanel);

  // --- Outcome banner (hidden until decided) --------------------------------
  const banner = el("div", "hud-banner");
  banner.style.display = "none";
  root.append(banner);

  // --- Bottom: turn log -----------------------------------------------------
  const logPanel = el("div", "hud-panel hud-log");
  logPanel.append(heading("Turn log"));
  const logBody = el("div", "hud-log-body");
  logPanel.append(logBody);
  root.append(logPanel);

  // --- Update ----------------------------------------------------------------
  function update(
    state: GameState,
    selectedRegionId: number | null,
    moveArmyId: number | null,
  ): void {
    const player = playerNation(state);
    const flow = nationalProduction(state, PLAYER_ID);
    const upkeep = totalUpkeep(state, PLAYER_ID);
    for (const key of RESOURCE_KEYS) {
      resourceEls[key].stock.textContent = fmt(player.stocks[key]);
      const f = key === "gold" ? round1(flow.gold - upkeep) : flow[key];
      resourceEls[key].flow.textContent = `${f >= 0 ? "+" : ""}${fmt(f)}/turn`;
      resourceEls[key].flow.classList.toggle("negative", f < 0);
    }
    resourceEls.food.flow.classList.toggle("negative", player.famine || flow.food < 0);
    turnBadge.textContent =
      (player.famine ? "⚠ FAMINE · " : "") +
      (player.bankrupt ? "⚠ BANKRUPT · " : "") +
      `Turn ${state.turn} · seed ${state.seed}`;
    turnBadge.classList.toggle("famine", player.famine || player.bankrupt);

    taxInput.value = String(Math.round(player.taxRate * 100));
    taxLabel.textContent = `Tax ${Math.round(player.taxRate * 100)}%`;
    upkeepLine.textContent = `Army upkeep: ${fmt(upkeep)}g/turn. Higher taxes raise gold but push unrest up.`;

    renderRegion(regionBody, state, selectedRegionId, moveArmyId, callbacks);
    renderDiplomacy(diploBody, state, callbacks);
    renderResearch(researchBody, player, callbacks);

    if (state.outcome === "playing") {
      banner.style.display = "none";
    } else {
      banner.style.display = "flex";
      banner.className = "hud-banner " + (state.outcome === "victory" ? "win" : "lose");
      const kind = state.victoryKind ? ` (${state.victoryKind})` : "";
      banner.textContent =
        state.outcome === "victory" ? `Victory${kind}!` : `Defeat${kind} — your realm has fallen.`;
    }

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
  moveArmyId: number | null,
  callbacks: HudCallbacks,
): void {
  container.innerHTML = "";
  if (selectedRegionId === null) {
    const hint = el("p", "hud-hint");
    hint.textContent = "Click a region to inspect, develop, and defend it.";
    container.append(hint);
    return;
  }
  const region = state.regions[selectedRegionId];
  if (!region) return;
  const terrain = TERRAIN[region.terrain];
  const owned = region.ownerId === PLAYER_ID;
  const ownerName = state.nations.find((n) => n.id === region.ownerId)?.name ?? "Neutral";

  const title = el("p", "hud-region-title");
  title.textContent = region.name;
  const swatch = el("span", "hud-region-swatch");
  swatch.style.background = terrain.color;
  title.prepend(swatch);

  const meta = el("p", "hud-region-meta");
  const bits = [terrain.name, ownerName, `pop ${fmt(region.population)}/${fmt(regionCapacity(region))}`];
  if (region.fortification > 0) bits.push(`fort ${region.fortification}`);
  if (region.resource) bits.push(region.resource === "iron" ? "⚒ iron" : "🐎 horses");
  meta.textContent = bits.join(" · ");
  container.append(title, meta);

  if (owned) {
    renderOwnedRegion(container, state, region, moveArmyId, callbacks);
  } else {
    renderEnemyRegion(container, state, region);
  }
}

function renderOwnedRegion(
  container: HTMLElement,
  state: GameState,
  region: Region,
  moveArmyId: number | null,
  callbacks: HudCallbacks,
): void {
  const player = playerNation(state);
  const flow = regionProduction(region, player.taxRate, techMultipliers(player.research.done));

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
  container.append(unrestWrap);

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
  container.append(table);

  if (region.buildings.length) {
    const built = el("p", "hud-region-built");
    built.textContent = "Built: " + region.buildings.map((b) => BUILDINGS[b].name).join(", ");
    container.append(built);
  }

  // Army in the region.
  const army = armyAt(state, region.id, PLAYER_ID);
  container.append(renderArmySection(state, region, army, moveArmyId, callbacks));

  // Construction.
  container.append(renderBuildSection(region, playerNation(state).research.done, callbacks));
}

function renderEnemyRegion(container: HTMLElement, state: GameState, region: Region): void {
  const garrison = anyArmyAt(state, region.id);
  const box = el("div", "hud-enemy");
  const t = TERRAIN[region.terrain];
  if (garrison && armySize(garrison.units) > 0) {
    box.append(line(`Enemy garrison: ${armySize(garrison.units)} units (${composition(garrison)})`));
  } else {
    box.append(line("Undefended — an army walking in captures it."));
  }
  box.append(line(`Terrain defence ×${t.defense}${region.fortification ? `, fort ${region.fortification}` : ""}.`, "hud-hint"));
  box.append(line("Move an adjacent army here to attack.", "hud-hint"));
  container.append(box);
}

function renderArmySection(
  state: GameState,
  region: Region,
  army: Army | undefined,
  moveArmyId: number | null,
  callbacks: HudCallbacks,
): HTMLElement {
  const section = el("div", "hud-military");
  section.append(heading("Army"));

  if (army && armySize(army.units) > 0) {
    section.append(line(`${armySize(army.units)} units — ${composition(army)}`, "hud-army-comp"));
    section.append(line(`Moves left: ${army.movesLeft}`, "hud-hint"));
    const moving = moveArmyId === army.id;
    const moveBtn = document.createElement("button");
    moveBtn.className = "hud-move-btn" + (moving ? " active" : "");
    moveBtn.textContent = moving ? "Cancel move" : "Move / Attack ▸";
    moveBtn.disabled = !moving && army.movesLeft <= 0;
    moveBtn.addEventListener("click", () =>
      moving ? callbacks.onCancelMove() : callbacks.onBeginMove(army.id),
    );
    section.append(moveBtn);
    if (moving) section.append(line("Click a highlighted neighbour to move or attack.", "hud-hint"));
  } else {
    section.append(line("No army stationed here.", "hud-hint"));
  }

  // Raise-unit menu.
  const menu = el("div", "hud-unit-menu");
  for (const t of UNIT_TYPES) {
    const def = UNITS[t];
    const check = canRaiseUnit(state, region.id, t, PLAYER_ID);
    const btn = document.createElement("button");
    btn.className = "hud-unit-btn";
    btn.disabled = !check.ok;
    btn.title = check.ok
      ? `${def.attack}⚔ / ${def.defense}🛡 · ${def.upkeep}g upkeep${def.requires ? ` · needs ${def.requires}` : ""}`
      : check.reason ?? "";
    btn.innerHTML =
      `<span class="hud-unit-name">${def.short}</span>` +
      `<span class="hud-unit-cost">${def.cost.gold}g ${def.cost.materials}⛏</span>`;
    if (check.ok) btn.addEventListener("click", () => callbacks.onRaiseUnit(region.id, t));
    menu.append(btn);
  }
  section.append(menu);
  return section;
}

function renderBuildSection(region: Region, done: TechId[], callbacks: HudCallbacks): HTMLElement {
  const section = el("div", "hud-build");
  section.append(heading("Construction"));

  if (region.construction) {
    const def = BUILDINGS[region.construction.building];
    const wrap = el("div", "hud-build-progress");
    wrap.append(line(`${def.name} — ${fmt(region.construction.progress)}/${def.cost} materials`, "hud-build-progress-label"));
    const bar = el("div", "hud-build-bar");
    const fill = el("div", "hud-build-fill");
    fill.style.width = `${(region.construction.progress / def.cost) * 100}%`;
    bar.append(fill);
    const cancel = document.createElement("button");
    cancel.className = "hud-build-cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => callbacks.onCancelConstruction(region.id));
    wrap.append(bar, cancel);
    section.append(wrap);
    return section;
  }

  const menu = el("div", "hud-build-menu");
  for (const id of BUILDING_IDS) {
    const def = BUILDINGS[id];
    const already = region.buildings.includes(id);
    const unlocked = isBuildingUnlockedFor(done, id);
    const btn = document.createElement("button");
    btn.className = "hud-build-btn";
    btn.disabled = already || !unlocked;
    btn.title = unlocked ? def.blurb : `Locked — research ${def.requiresTech?.replace(/_/g, " ")}.`;
    const costLabel = already ? "built" : !unlocked ? "🔒" : def.cost + "⛏";
    btn.innerHTML =
      `<span class="hud-build-name">${def.name}</span>` +
      `<span class="hud-build-cost">${costLabel}</span>`;
    if (!already && unlocked) btn.addEventListener("click", () => callbacks.onQueueBuilding(region.id, id));
    menu.append(btn);
  }
  section.append(menu);
  return section;
}

function renderDiplomacy(
  container: HTMLElement,
  state: GameState,
  callbacks: HudCallbacks,
): void {
  container.innerHTML = "";
  const rivals = state.nations.filter((n) => !n.isPlayer && !n.isBarbarian && n.alive);
  if (!rivals.length) {
    container.append(line("No rival powers remain.", "hud-hint"));
    return;
  }

  // Pending offers addressed to the player.
  for (const offer of state.offers.filter((o) => o.to === PLAYER_ID)) {
    const from = state.nations.find((n) => n.id === offer.from)?.name ?? "A rival";
    const box = el("div", "hud-offer");
    const text =
      offer.type === "tribute"
        ? `${from} demands ${offer.gold ?? 0}g tribute.`
        : `${from} offers ${offer.type === "nap" ? "a non-aggression pact" : offer.type}.`;
    box.append(line(text, "hud-offer-text"));
    const row = el("div", "hud-offer-actions");
    row.append(
      btn("Accept", "hud-diplo-btn accept", () => callbacks.onAcceptOffer(offer.id)),
      btn("Reject", "hud-diplo-btn", () => callbacks.onRejectOffer(offer.id)),
    );
    box.append(row);
    container.append(box);
  }

  for (const rival of rivals) {
    const rel = getRelation(state, PLAYER_ID, rival.id);
    const treaty = getTreaty(state, PLAYER_ID, rival.id);
    const card = el("div", "hud-diplo-card");

    const head = el("div", "hud-diplo-head");
    const sw = el("span", "hud-region-swatch");
    sw.style.background = rival.color;
    const nm = el("span", "hud-diplo-name");
    nm.textContent = rival.name;
    const arch = el("span", "hud-diplo-arch");
    arch.textContent = rival.personality ? ARCHETYPE_LABEL[rival.personality.archetype] : "";
    head.append(sw, nm, arch);
    card.append(head);

    const status = el("div", "hud-diplo-status");
    const relSpan = el("span", "hud-diplo-rel");
    relSpan.textContent = `${rel > 0 ? "+" : ""}${rel} ${relationLabel(rel)}`;
    relSpan.style.color = relationColor(rel);
    const treatySpan = el("span", "hud-diplo-treaty " + treaty);
    treatySpan.textContent = treaty === "nap" ? "NAP" : treaty[0]!.toUpperCase() + treaty.slice(1);
    status.append(relSpan, treatySpan);
    card.append(status);

    const actions = el("div", "hud-diplo-actions");
    if (treaty === "war") {
      actions.append(btn("Sue for peace", "hud-diplo-btn", () => callbacks.onMakePeace(rival.id)));
    } else {
      actions.append(btn("Declare war", "hud-diplo-btn war", () => callbacks.onDeclareWar(rival.id)));
      if (treaty === "peace") {
        actions.append(
          btn("NAP", "hud-diplo-btn", () => callbacks.onProposePact(rival.id, "nap")),
          btn("Alliance", "hud-diplo-btn", () => callbacks.onProposePact(rival.id, "alliance")),
        );
      }
      actions.append(btn(`Gift ${GIFT_AMOUNT}g`, "hud-diplo-btn", () => callbacks.onGift(rival.id, GIFT_AMOUNT)));
    }
    card.append(actions);
    container.append(card);
  }
}

function renderResearch(container: HTMLElement, player: Nation, callbacks: HudCallbacks): void {
  container.innerHTML = "";
  const research = player.research;

  const header = el("div", "hud-research-head");
  const title = el("span", "hud-research-title");
  if (research.current) {
    const def = TECHS[research.current];
    const pct = Math.min(100, (research.progress / def.cost) * 100);
    title.textContent = `Researching: ${def.name} (${Math.floor(research.progress)}/${def.cost})`;
    const bar = el("div", "hud-research-bar");
    const fill = el("div", "hud-research-fill");
    fill.style.width = `${pct}%`;
    fill.style.background = BRANCH_COLOR[def.branch];
    bar.append(fill);
    header.append(title, bar);
  } else {
    title.textContent = "Choose a technology to research →";
    header.append(title);
  }
  const count = el("span", "hud-research-count");
  count.textContent = `${research.done.length}/${Object.keys(TECHS).length} techs · ${player.wonders}/${WONDER_GOAL} wonders`;
  header.append(count);
  container.append(header);

  const frontier = researchFrontier(research.done);
  const menu = el("div", "hud-tech-menu");
  for (const id of frontier) {
    const def = TECHS[id];
    const b = document.createElement("button");
    b.className = "hud-tech-btn" + (research.current === id ? " active" : "");
    b.title = def.blurb;
    b.style.borderLeftColor = BRANCH_COLOR[def.branch];
    b.innerHTML =
      `<span class="hud-tech-name">${def.name}</span>` +
      `<span class="hud-tech-cost">${def.cost}📖 · ${def.branch}</span>`;
    b.addEventListener("click", () => callbacks.onChooseResearch(id));
    menu.append(b);
  }
  if (!frontier.length) menu.append(line("All technologies researched.", "hud-hint"));
  container.append(menu);
}

// --- helpers ----------------------------------------------------------------

function relationLabel(rel: number): string {
  if (rel >= 40) return "friendly";
  if (rel <= -30) return "hostile";
  return "neutral";
}

function relationColor(rel: number): string {
  if (rel >= 40) return "#6fb98a";
  if (rel <= -30) return "#e8776b";
  return "#c9cedb";
}

function btn(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = className;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function composition(army: Army): string {
  const parts: string[] = [];
  for (const t of UNIT_TYPES) if (army.units[t] > 0) parts.push(`${army.units[t]} ${UNITS[t].short}`);
  return parts.join(", ") || "—";
}

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

function line(text: string, className = ""): HTMLElement {
  const p = el("p", className || "hud-line");
  p.textContent = text;
  return p;
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

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

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
