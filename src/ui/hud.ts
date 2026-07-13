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
import { TERRAIN, TERRAIN_IDS } from "@/data/terrain";
import { regionProduction, nationalProduction, nationYieldMult } from "@/systems/economy";
import { regionCapacity } from "@/systems/population";
import { previewCombat } from "@/systems/combat";
import {
  armyAt,
  anyArmyAt,
  canRaiseUnit,
  reachableRegions,
  totalUpkeep,
  unitCost,
} from "@/systems/military";
import { getRelation, getTreaty, wouldJoinWar, warTargetsFor } from "@/systems/diplomacy";
import { nationScore } from "@/systems/victory";
import type { TurnSummary } from "@/systems/summary";
import { deriveAlerts } from "@/ui/alerts";
import { researchFrontier, isBuildingUnlockedFor } from "@/systems/tech";
import { ARCHETYPE_LABEL } from "@/data/personalities";
import { TRAITS } from "@/data/traits";
import { TECHS, TECH_IDS, type TechId, type TechBranch } from "@/data/techs";
import { WONDER_GOAL, DOMINATION_FRACTION, TURN_LIMIT, type Difficulty } from "@/systems/state";
import {
  PLAYER_ID,
  RESOURCE_KEYS,
  TAX_MAX,
  TAX_MIN,
  TAX_STEP,
  UNREST_PENALTY_START,
  UNREST_REVOLT,
  armySize,
  emptyUnits,
  playerNation,
  type Army,
  type GameState,
  type Nation,
  type Region,
  type ResourceKey,
} from "@/systems/state";

export interface NewGameConfig {
  seed: number;
  difficulty: Difficulty;
  rivals: number;
}

export interface HudCallbacks {
  onTaxChange(rate: number): void;
  onEndTurn(): void;
  onNewGame(config: NewGameConfig): void;
  onSave(): void;
  onLoad(): void;
  onQueueBuilding(regionId: number, building: BuildingId): void;
  onCancelConstruction(regionId: number): void;
  onRaiseUnit(regionId: number, unit: UnitType): void;
  onBeginMove(armyId: number): void;
  onCancelMove(): void;
  onDeclareWar(targetId: number): void;
  onMakePeace(targetId: number): void;
  onProposePact(targetId: number, kind: "nap" | "alliance"): void;
  onCallToArms(allyId: number, enemyId: number): void;
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

/** localStorage key marking that the first-time hints have been dismissed. */
const HINTS_KEY = "gaime2:hintsSeen";

export interface Hud {
  update(
    state: GameState,
    selectedRegionId: number | null,
    moveArmyId: number | null,
    summary?: TurnSummary | null,
  ): void;
  /** Flash a transient message (e.g. save/load feedback). */
  toast(message: string): void;
}

const RESOURCE_META: Record<ResourceKey, { label: string; icon: string; tip: string }> = {
  gold: {
    label: "Treasury",
    icon: "🪙",
    tip: "Gold funds armies (upkeep) and gifts. The /turn figure is income minus army upkeep — go negative for long and you risk bankruptcy (troops disband, unrest spikes).",
  },
  food: {
    label: "Food",
    icon: "🌾",
    tip: "Food feeds population. Surplus grows your regions up to their capacity; a shortfall causes famine — population starves and unrest climbs. Stored food is capped by granaries.",
  },
  materials: {
    label: "Materials",
    icon: "⛏️",
    tip: "Materials build structures and raise units. Buildings and armies both draw on this stockpile.",
  },
  knowledge: {
    label: "Knowledge",
    icon: "📖",
    tip: "Knowledge funds research — the /turn figure is invested into your current technology each turn.",
  },
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
    cell.title = meta.tip;
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
  const victoryEl = el("div", "hud-victory");
  victoryEl.title = "Progress toward each victory: leading realm's territory share (domination at "
    + `${Math.round(DOMINATION_FRACTION * 100)}%), Great Works, and the turn ${TURN_LIMIT} prestige deadline.`;
  topBar.append(victoryEl);
  const legendToggle = btn("❔ Legend", "hud-legend-toggle", () => {
    legendPanel.style.display = legendPanel.style.display === "none" ? "block" : "none";
  });
  legendToggle.title = "Decode the map markers. Shortcut: L";
  topBar.append(legendToggle);
  const helpToggle = btn("💡 Help", "hud-legend-toggle", () => showHints());
  helpToggle.title = "Reopen the getting-started tips. Shortcut: H";
  topBar.append(helpToggle);
  root.append(topBar);

  // Critical-events alert strip (just below the resource bar).
  const alertStrip = el("div", "hud-alerts");
  alertStrip.style.display = "none";
  root.append(alertStrip);

  // Map legend (hidden until toggled) — explains the node/marker vocabulary.
  const legendPanel = buildLegend();
  legendPanel.style.display = "none";
  root.append(legendPanel);

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
  taxInput.title =
    "Higher tax converts more of your regions' trade into gold, but steadily raises unrest. " +
    "Ease off when regions grow restless.";
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

  // New-game configuration: seed, difficulty, rivals.
  const cfgRow = el("div", "hud-newgame");
  const seedInput = document.createElement("input");
  seedInput.type = "text";
  seedInput.className = "hud-seed";
  seedInput.placeholder = "seed";
  const difficultySel = select("hud-select", [
    ["easy", "Easy"],
    ["normal", "Normal"],
    ["hard", "Hard"],
  ], "normal");
  const rivalsSel = select("hud-select", [
    ["1", "1 rival"],
    ["2", "2 rivals"],
    ["3", "3 rivals"],
  ], "2");
  cfgRow.append(seedInput, difficultySel, rivalsSel);
  controls.append(cfgRow);

  const btnRow = el("div", "hud-newgame");
  const newGameBtn = document.createElement("button");
  newGameBtn.className = "hud-newgame-btn primary";
  newGameBtn.textContent = "New game";
  newGameBtn.addEventListener("click", () => {
    const raw = seedInput.value.trim();
    callbacks.onNewGame({
      seed: raw === "" ? (Date.now() >>> 0) : parseSeed(raw),
      difficulty: difficultySel.value as Difficulty,
      rivals: Number(rivalsSel.value),
    });
  });
  const saveBtn = document.createElement("button");
  saveBtn.className = "hud-newgame-btn";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", () => callbacks.onSave());
  const loadBtn = document.createElement("button");
  loadBtn.className = "hud-newgame-btn";
  loadBtn.textContent = "Load";
  loadBtn.addEventListener("click", () => callbacks.onLoad());
  btnRow.append(newGameBtn, saveBtn, loadBtn);
  controls.append(btnRow);
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
  const bannerText = el("span", "hud-banner-text");
  const bannerStandings = el("div", "hud-standings");
  const bannerBtn = document.createElement("button");
  bannerBtn.className = "hud-banner-btn";
  bannerBtn.textContent = "New game";
  bannerBtn.addEventListener("click", () => newGameBtn.click());
  banner.append(bannerText, bannerStandings, bannerBtn);
  root.append(banner);

  // --- First-time hints (shown once, until dismissed) -----------------------
  const hints = el("div", "hud-hints");
  hints.style.display = "none";
  const hintsTitle = el("div", "hud-hints-title");
  hintsTitle.textContent = "Welcome, ruler 👑";
  const hintsBody = el("ul", "hud-hints-list");
  for (const tip of [
    "Set your tax rate on the left — more gold, but higher unrest.",
    "Click a region to develop it: queue buildings and raise armies.",
    "Move / Attack an army onto a neighbour to expand or conquer.",
    "End turn to advance; watch the 🏆 victory progress up top.",
    "Tap ❔ Legend (L) to decode markers; 💡 Help (H) reopens these tips.",
  ]) {
    const li = document.createElement("li");
    li.textContent = tip;
    hintsBody.append(li);
  }
  const hintsBtn = btn("Got it", "hud-hints-btn", () => dismissHints());
  hints.append(hintsTitle, hintsBody, hintsBtn);
  root.append(hints);
  let hintsDismissed = false;
  // Set when the player reopens the tips via the Help button, so they stay up
  // past turn 1 until dismissed again.
  let hintsForced = false;
  try {
    hintsDismissed = window.localStorage.getItem(HINTS_KEY) === "1";
  } catch {
    hintsDismissed = false;
  }
  /** Reopen the getting-started tips on demand (Help button / H key). */
  function showHints(): void {
    hintsForced = true;
    hints.style.display = "block";
  }
  /** Close the tips and remember they've been seen (Got it / H key / Esc). */
  function dismissHints(): void {
    hints.style.display = "none";
    hintsDismissed = true;
    hintsForced = false;
    try {
      window.localStorage.setItem(HINTS_KEY, "1");
    } catch {
      /* storage unavailable — dismiss for this session only */
    }
  }

  // --- Transient toast (save/load feedback) ---------------------------------
  const toast = el("div", "hud-toast");
  toast.style.display = "none";
  root.append(toast);
  let toastTimer = 0;
  function flashToast(msg: string): void {
    toast.textContent = msg;
    toast.style.display = "block";
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast.style.display = "none"), 2200);
  }

  // --- Bottom: last-turn summary + turn log ---------------------------------
  const logPanel = el("div", "hud-panel hud-log");
  const summaryBox = el("div", "hud-summary");
  summaryBox.style.display = "none";
  logPanel.append(summaryBox);
  logPanel.append(heading("Turn log"));
  const logBody = el("div", "hud-log-body");
  logPanel.append(logBody);
  root.append(logPanel);

  // --- Tech-tree overlay (whole branching tree; opened from the research bar) -
  const techOverlay = el("div", "hud-techtree-overlay");
  techOverlay.style.display = "none";
  techOverlay.addEventListener("click", (ev) => {
    if (ev.target === techOverlay) closeTechTree(); // backdrop click closes
  });
  root.append(techOverlay);
  let lastPlayer: Nation | null = null;

  function openTechTree(): void {
    if (!lastPlayer) return;
    renderTechTree(techOverlay, lastPlayer, callbacks, closeTechTree);
    techOverlay.style.display = "flex";
  }
  function closeTechTree(): void {
    techOverlay.style.display = "none";
  }

  // --- Keyboard shortcuts for the overlays ----------------------------------
  // L toggles the map legend, H toggles the getting-started tips, Esc closes
  // whatever's open. Ignore while typing in a form control so the tax/seed
  // inputs keep their own keys. (Enter/Space to end turn live in main.ts.)
  window.addEventListener("keydown", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "SELECT")) return;
    const key = ev.key.toLowerCase();
    if (key === "l") {
      ev.preventDefault();
      legendPanel.style.display = legendPanel.style.display === "none" ? "block" : "none";
    } else if (key === "h") {
      ev.preventDefault();
      if (hints.style.display !== "none") dismissHints();
      else showHints();
    } else if (ev.key === "Escape") {
      closeTechTree();
      legendPanel.style.display = "none";
      if (hints.style.display !== "none") dismissHints();
    }
  });

  // --- Update ----------------------------------------------------------------
  function update(
    state: GameState,
    selectedRegionId: number | null,
    moveArmyId: number | null,
    summary?: TurnSummary | null,
  ): void {
    renderSummary(summaryBox, summary ?? null);
    renderAlerts(alertStrip, state, summary ?? null);
    const player = playerNation(state);
    lastPlayer = player;
    // Keep an open tech tree in sync with the latest research state.
    if (techOverlay.style.display !== "none") {
      renderTechTree(techOverlay, player, callbacks, closeTechTree);
    }
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
      `Turn ${state.turn} · ${state.difficulty}` +
      (player.trait ? ` · ${TRAITS[player.trait].label}` : "") +
      ` · seed ${state.seed}`;
    turnBadge.title = player.trait ? TRAITS[player.trait].blurb : "";
    turnBadge.classList.toggle("famine", player.famine || player.bankrupt);

    renderVictoryProgress(victoryEl, state);

    // Hints: auto on turn 1 of a live game until dismissed, or when reopened
    // via the Help button (hintsForced). Never over the end-game banner.
    const showTips =
      state.outcome === "playing" && (hintsForced || (!hintsDismissed && state.turn === 1));
    hints.style.display = showTips ? "block" : "none";

    taxInput.value = String(Math.round(player.taxRate * 100));
    taxLabel.textContent = `Tax ${Math.round(player.taxRate * 100)}%`;
    upkeepLine.textContent = `Army upkeep: ${fmt(upkeep)}g/turn. Higher taxes raise gold but push unrest up.`;

    renderRegion(regionBody, state, selectedRegionId, moveArmyId, callbacks);
    renderDiplomacy(diploBody, state, callbacks);
    renderResearch(researchBody, player, callbacks, openTechTree);

    if (state.outcome === "playing") {
      banner.style.display = "none";
    } else {
      banner.style.display = "flex";
      banner.className = "hud-banner " + (state.outcome === "victory" ? "win" : "lose");
      const kind = state.victoryKind ? ` (${state.victoryKind})` : "";
      bannerText.textContent =
        state.outcome === "victory" ? `Victory${kind}!` : `Defeat${kind} — your realm has fallen.`;
      renderStandings(bannerStandings, state);
    }

    logBody.innerHTML = "";
    for (const line of state.log.slice(-8).reverse()) {
      const p = el("p", "hud-log-line");
      p.textContent = line;
      logBody.append(p);
    }
  }

  return { update, toast: flashToast };
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
  const flow = regionProduction(region, player.taxRate, nationYieldMult(player));

  // Unrest bar.
  const unrestWrap = el("div", "hud-unrest");
  unrestWrap.title =
    `Unrest throttles a region's output. Calm below ${UNREST_PENALTY_START}; ` +
    `production suffers from ${UNREST_PENALTY_START}; at ${UNREST_REVOLT}+ the region revolts ` +
    "and produces nothing. High taxes, famine, over-expansion and fresh conquests all raise it — " +
    "temples and civics tech calm it.";
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
    if (moving) {
      section.append(line("Click a highlighted neighbour to move or attack.", "hud-hint"));
      section.append(renderCombatOdds(state, army));
    }
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
    const cost = unitCost(playerNation(state), t);
    btn.innerHTML =
      `<span class="hud-unit-name">${def.short}</span>` +
      `<span class="hud-unit-cost">${cost.gold}g ${cost.materials}⛏</span>`;
    if (check.ok) btn.addEventListener("click", () => callbacks.onRaiseUnit(region.id, t));
    menu.append(btn);
  }
  section.append(menu);
  return section;
}

/**
 * Combat-odds preview for the army's move/attack targets: for each reachable
 * hostile neighbour, the attacker vs. defender strength and a rough win chance,
 * so the player can weigh an attack before committing. Display only — the same
 * `previewCombat` maths the sim uses to resolve the fight.
 */
function renderCombatOdds(state: GameState, army: Army): HTMLElement {
  const box = el("div", "hud-odds");
  box.append(heading("Attack odds"));

  const rows: HTMLElement[] = [];
  for (const nid of reachableRegions(state, army)) {
    const target = state.regions[nid];
    if (!target || target.ownerId === PLAYER_ID) continue; // friendly = relocate, no fight
    const defender = state.armies.find((a) => a.regionId === nid && a.ownerId !== PLAYER_ID);
    const preview = previewCombat(army.units, defender?.units ?? emptyUnits(), {
      terrainDefense: TERRAIN[target.terrain].defense,
      fortification: target.fortification,
    });

    const row = el("div", "hud-odds-row");
    const name = el("span", "hud-odds-name");
    name.textContent = target.name;
    row.append(name);

    if (preview.undefended) {
      const chip = el("span", "hud-odds-chip win");
      chip.textContent = "capture";
      row.append(chip);
    } else {
      const detail = el("span", "hud-odds-detail");
      detail.textContent = `⚔${Math.round(preview.attack)} · 🛡${Math.round(preview.defense)}`;
      const pct = Math.round(preview.winChance * 100);
      const chip = el("span", "hud-odds-chip " + oddsClass(preview.winChance));
      chip.textContent = `${pct}%`;
      row.append(detail, chip);
    }
    rows.push(row);
  }

  if (rows.length === 0) {
    box.append(line("No hostile neighbour in reach.", "hud-hint"));
  } else {
    for (const r of rows) box.append(r);
  }
  return box;
}

/** Bucket a win chance into good / even / poor for colour-coding. */
function oddsClass(chance: number): string {
  if (chance >= 0.65) return "win";
  if (chance >= 0.4) return "even";
  return "lose";
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

/**
 * Build the map-legend panel: a static key to the node/marker vocabulary the
 * canvas renderer draws (terrain fills, owner rings, population, unrest dots,
 * strategic-resource icons, construction, army badges, selection/target rings).
 * Colours mirror the renderer constants so the key matches the map exactly.
 */
function buildLegend(): HTMLElement {
  const panel = el("div", "hud-panel hud-legend");
  panel.append(heading("Map legend"));

  const section = (title: string): void => {
    const h = el("div", "hud-legend-h");
    h.textContent = title;
    panel.append(h);
  };
  const row = (swatchHtml: string, label: string): void => {
    const r = el("div", "hud-legend-row");
    const sw = el("span", "hud-legend-swatch");
    sw.innerHTML = swatchHtml;
    const lb = el("span", "hud-legend-label");
    lb.textContent = label;
    r.append(sw, lb);
    panel.append(r);
  };
  const disc = (color: string): string =>
    `<span class="hud-legend-disc" style="background:${color}"></span>`;
  const dot = (color: string): string =>
    `<span class="hud-legend-mdot" style="background:${color}"></span>`;
  const ring = (color: string, dashed = false): string =>
    `<span class="hud-legend-ring${dashed ? " dashed" : ""}" style="border-color:${color}"></span>`;

  section("Terrain (node fill)");
  for (const t of TERRAIN_IDS) row(disc(TERRAIN[t].color), TERRAIN[t].name);

  section("Region markers");
  row(ring("#d8a24a"), "Owner colour (ring) · dark = neutral/barbarian");
  row('<span class="hud-legend-num">6</span>', "Population (number in node)");
  row(dot("#e0b74a"), "Unrest — unhappy (amber dot)");
  row(dot("#e8776b"), "Unrest — revolt risk (red dot)");
  row('<span class="hud-legend-ico">⚒</span>', "Iron deposit");
  row('<span class="hud-legend-ico">🐎</span>', "Horses");
  row('<span class="hud-legend-ico">🔨</span>', "Building under construction");
  row('<span class="hud-legend-badge">3</span>', "Army (owner colour, unit count)");

  section("Selection");
  row(ring("#f4d27a"), "Selected region");
  row(ring("#63c7d6", true), "Move / attack target");

  return panel;
}

/**
 * Compact victory-progress readout for the top bar: the leading realm's
 * territory share (domination fires at DOMINATION_FRACTION), the player's Great
 * Works, and the turn vs. the prestige deadline. The domination math mirrors
 * `checkVictory` exactly (share of all owned regions, barbarians included), so
 * the number matches the actual win condition. Flags a rival nearing domination.
 */
function renderVictoryProgress(elm: HTMLElement, state: GameState): void {
  const total = state.regions.filter((r) => r.ownerId !== null).length || 1;
  let leader: Nation | null = null;
  let leaderRegions = -1;
  for (const n of state.nations) {
    if (n.isBarbarian || !n.alive) continue;
    const held = state.regions.filter((r) => r.ownerId === n.id).length;
    if (held > leaderRegions) {
      leaderRegions = held;
      leader = n;
    }
  }
  const share = Math.round((Math.max(0, leaderRegions) / total) * 100);
  const leaderName = leader ? (leader.isPlayer ? "You" : leader.name) : "—";
  const player = playerNation(state);
  elm.textContent =
    `🏆 ${leaderName} ${share}%  ·  ⭐ ${player.wonders}/${WONDER_GOAL}  ·  ⏳ ${state.turn}/${TURN_LIMIT}`;
  const rivalNearing = !!leader && !leader.isPlayer && share >= DOMINATION_FRACTION * 100 - 12;
  elm.classList.toggle("threat", rivalNearing);
}

/**
 * Final standings for the end-game screen: every non-barbarian nation ranked by
 * prestige score, with a compact regions/wonders/techs breakdown. The player row
 * is highlighted and eliminated nations are marked.
 */
function renderStandings(container: HTMLElement, state: GameState): void {
  container.innerHTML = "";
  const rows = state.nations
    .filter((n) => !n.isBarbarian)
    .map((n) => ({
      n,
      score: nationScore(state, n.id),
      regions: state.regions.filter((r) => r.ownerId === n.id).length,
    }))
    .sort((a, b) => b.score - a.score);

  const table = el("div", "hud-standings-table");
  rows.forEach((row, i) => {
    const tr = el(
      "div",
      "hud-standings-row" + (row.n.isPlayer ? " you" : "") + (row.n.alive ? "" : " dead"),
    );
    const rank = el("span", "hud-standings-rank");
    rank.textContent = String(i + 1);
    const sw = el("span", "hud-region-swatch");
    sw.style.background = row.n.color;
    const name = el("span", "hud-standings-name");
    name.textContent = (row.n.isPlayer ? "You" : row.n.name) + (row.n.alive ? "" : " ✗");
    const detail = el("span", "hud-standings-detail");
    detail.textContent = `${row.regions}⬢ · ${row.n.wonders}★ · ${row.n.research.done.length}📖`;
    const score = el("span", "hud-standings-score");
    score.textContent = String(row.score);
    tr.append(rank, sw, name, detail, score);
    table.append(tr);
  });
  container.append(table);

  const spark = buildSparkline(state.history ?? [], state.nations[PLAYER_ID]!.color);
  if (spark) container.append(spark);
}

/**
 * A tiny inline-SVG line chart of the player's prestige score over the game.
 * Returns null when there's too little history to be worth drawing. No deps —
 * hand-built SVG so it stays offline and self-contained.
 */
function buildSparkline(history: number[], color: string): HTMLElement | null {
  if (history.length < 2) return null;
  const w = 240;
  const h = 48;
  const pad = 3;
  const max = Math.max(...history);
  const min = Math.min(...history);
  const span = max - min || 1;
  const stepX = (w - pad * 2) / (history.length - 1);
  const points = history.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${round1(x)},${round1(y)}`;
  });

  const wrap = el("div", "hud-sparkline");
  const caption = el("span", "hud-sparkline-caption");
  caption.textContent = `Your score, turn 1 → ${history.length}`;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("class", "hud-sparkline-svg");
  svg.setAttribute("preserveAspectRatio", "none");
  const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  poly.setAttribute("points", points.join(" "));
  poly.setAttribute("fill", "none");
  poly.setAttribute("stroke", color);
  poly.setAttribute("stroke-width", "2");
  poly.setAttribute("stroke-linejoin", "round");
  poly.setAttribute("stroke-linecap", "round");
  const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  const last = points[points.length - 1]!.split(",");
  dot.setAttribute("cx", last[0]!);
  dot.setAttribute("cy", last[1]!);
  dot.setAttribute("r", "2.5");
  dot.setAttribute("fill", color);
  svg.append(poly, dot);
  wrap.append(caption, svg);
  return wrap;
}

/** Render the critical-events alert strip (danger/warn/good chips), or hide it. */
function renderAlerts(strip: HTMLElement, state: GameState, summary: TurnSummary | null): void {
  const alerts = deriveAlerts(state, summary);
  if (alerts.length === 0) {
    strip.style.display = "none";
    strip.innerHTML = "";
    return;
  }
  strip.style.display = "flex";
  strip.innerHTML = "";
  for (const a of alerts) {
    const chip = el("span", "hud-alert " + a.severity);
    chip.textContent = a.text;
    strip.append(chip);
  }
}

/** Render the "last turn" summary of strategic changes, or hide it. */
function renderSummary(box: HTMLElement, summary: TurnSummary | null): void {
  if (!summary) {
    box.style.display = "none";
    return;
  }
  box.style.display = "block";
  box.innerHTML = "";
  box.append(heading("Last turn"));

  const items: Array<[string, string]> = [];
  const g = summary.goldDelta;
  items.push([g >= 0 ? "good" : "bad", `${g >= 0 ? "+" : ""}${fmt(g)}g treasury`]);
  if (summary.regionsGained.length) items.push(["good", `Gained ${summary.regionsGained.join(", ")}`]);
  if (summary.regionsLost.length) items.push(["bad", `Lost ${summary.regionsLost.join(", ")}`]);
  if (summary.warsDeclared.length) items.push(["bad", `War with ${summary.warsDeclared.join(", ")}`]);
  if (summary.peaceMade.length) items.push(["good", `Peace with ${summary.peaceMade.join(", ")}`]);
  if (summary.eliminated.length) items.push(["good", `Eliminated ${summary.eliminated.join(", ")}`]);
  if (summary.techsCompleted.length) items.push(["good", `Researched ${summary.techsCompleted.map((t) => TECHS[t].name).join(", ")}`]);
  if (summary.famine) items.push(["bad", "⚠ Famine"]);
  if (summary.bankrupt) items.push(["bad", "⚠ Bankruptcy"]);
  if (summary.quiet) items.push(["muted", "A quiet turn."]);

  for (const [tone, text] of items) {
    const row = el("div", "hud-summary-row " + tone);
    row.textContent = text;
    box.append(row);
  }
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
    const archLabel = rival.personality ? ARCHETYPE_LABEL[rival.personality.archetype] : "";
    const traitLabel = rival.trait ? TRAITS[rival.trait].label : "";
    arch.textContent = [archLabel, traitLabel].filter(Boolean).join(" · ");
    if (rival.trait) arch.title = TRAITS[rival.trait].blurb;
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
      // Call an ally to arms — one button per open front (an enemy the player is
      // fighting but this ally isn't).
      if (treaty === "alliance") {
        for (const enemy of warTargetsFor(state, PLAYER_ID, rival.id)) {
          const enemyName = state.nations.find((n) => n.id === enemy)?.name ?? "the enemy";
          const willing = wouldJoinWar(state, rival.id, PLAYER_ID, enemy);
          const b = btn(`Call to arms vs ${enemyName}`, "hud-diplo-btn", () =>
            callbacks.onCallToArms(rival.id, enemy),
          );
          b.title = willing
            ? `${rival.name} would likely join.`
            : `${rival.name} may decline (needs better relations or a fair fight).`;
          actions.append(b);
        }
      }
      actions.append(btn(`Gift ${GIFT_AMOUNT}g`, "hud-diplo-btn", () => callbacks.onGift(rival.id, GIFT_AMOUNT)));
    }
    card.append(actions);
    container.append(card);
  }
}

function renderResearch(
  container: HTMLElement,
  player: Nation,
  callbacks: HudCallbacks,
  onOpenTree: () => void,
): void {
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
  const treeBtn = btn("Tech tree ▤", "hud-techtree-open", onOpenTree);
  header.append(count, treeBtn);
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

const TECH_BRANCHES: TechBranch[] = ["economy", "military", "civics", "wonders"];

/**
 * Full tech-tree overlay: every tech laid out by branch (row) and tier, marked
 * done / in-progress / available / locked. Available techs are clickable to set
 * research; locked nodes tooltip their missing prerequisites. Read-only apart
 * from the research-selection intent.
 */
function renderTechTree(
  container: HTMLElement,
  player: Nation,
  callbacks: HudCallbacks,
  onClose: () => void,
): void {
  container.innerHTML = "";
  const done = new Set(player.research.done);
  const current = player.research.current;

  const panel = el("div", "hud-techtree-panel");
  const head = el("div", "hud-techtree-head");
  const ttTitle = el("h2", "hud-techtree-title");
  ttTitle.textContent = "Technology tree";
  head.append(ttTitle, btn("✕", "hud-techtree-close", onClose));
  panel.append(head);

  const grid = el("div", "hud-techtree-grid");
  for (const branch of TECH_BRANCHES) {
    const row = el("div", "hud-techtree-row");
    const label = el("div", "hud-techtree-branch");
    label.textContent = branch;
    label.style.color = BRANCH_COLOR[branch];
    row.append(label);

    const track = el("div", "hud-techtree-track");
    const ids = TECH_IDS.filter((id) => TECHS[id].branch === branch).sort(
      (a, b) => TECHS[a].tier - TECHS[b].tier || TECHS[a].cost - TECHS[b].cost,
    );
    for (const id of ids) {
      const def = TECHS[id];
      const isDone = done.has(id);
      const isCurrent = current === id;
      const unlocked = def.requires.every((r) => done.has(r));
      const available = !isDone && !isCurrent && unlocked;
      const state = isDone ? "done" : isCurrent ? "current" : available ? "available" : "locked";

      const node = el("div", "hud-tt-node " + state);
      node.style.borderColor = BRANCH_COLOR[branch];
      const missing = def.requires.filter((r) => !done.has(r)).map((r) => TECHS[r].name);
      node.title = def.blurb + (missing.length ? ` (needs ${missing.join(", ")})` : "");
      node.innerHTML =
        `<span class="hud-tt-name">${isDone ? "✓ " : ""}${def.name}</span>` +
        `<span class="hud-tt-meta">T${def.tier} · ${def.cost}📖</span>`;
      if (available) {
        node.addEventListener("click", () => {
          callbacks.onChooseResearch(id);
          onClose();
        });
      }
      track.append(node);
    }
    row.append(track);
    grid.append(row);
  }
  panel.append(grid);
  panel.append(
    line("✓ researched · glowing = in progress · bright = available · dim = locked", "hud-techtree-legend"),
  );
  container.append(panel);
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

function select(className: string, options: [string, string][], value: string): HTMLSelectElement {
  const sel = document.createElement("select");
  sel.className = className;
  for (const [v, label] of options) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = label;
    sel.append(opt);
  }
  sel.value = value;
  return sel;
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
