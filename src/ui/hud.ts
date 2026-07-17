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
import { regionProduction, nationalProduction, nationYieldMult, yieldFactors, singleModifierMult, unrestPenalty } from "@/systems/economy";
import { garrisonCalm } from "@/systems/stability";
import { runTutorial } from "@/ui/tutorial";
import { confirmAction } from "@/ui/confirm";
import { isMuted, setMuted, play, isAmbientEnabled, setAmbientEnabled, getVolume, setVolume } from "@/ui/audio";
import {
  isColourblind,
  setColourblind,
  isReduceMotion,
  setReduceMotion,
  isTurnReport,
  setTurnReport,
} from "@/ui/settings";
import { cbSafe } from "@/data/palette";
import { OCEAN } from "@/data/mapstyle";
import { badgeArt, BRANCH_ART, crestSvg, eventVignette, MOMENT_ART, safeColor, TERRAIN_ART, TREATY_ART } from "@/data/art";
import {
  escapeHtml,
  glyphEl,
  glyphHtml,
  iconBtn,
  iconEl,
  iconHtml,
  resourceIconEl,
  resourceIconHtml,
  unitIconHtml,
  buildingIconHtml,
} from "@/ui/icons";
import { loadProfile, type ProfileStats } from "@/ui/profile";
import { ACHIEVEMENTS } from "@/data/achievements";
import { WAR_EDGE_COLOR } from "@/systems/renderer";
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
import { getRelation, getTreaty, wouldJoinWar, warTargetsFor, wouldAccept, nationPower, hasTrade, tradeIncome, TRIBUTE_DEMAND } from "@/systems/diplomacy";
import { nationScore, victoryProgress, endGameSummary } from "@/systems/victory";
import { MANUAL_SLOTS, slotInfo, type SaveSlot } from "@/systems/save";
import type { TurnSummary } from "@/systems/summary";
import { deriveAlerts, type Alert } from "@/ui/alerts";
import { researchFrontier, isBuildingUnlockedFor } from "@/systems/tech";
import { ARCHETYPE_LABEL } from "@/data/personalities";
import { TRAITS } from "@/data/traits";
import { TECHS, TECH_IDS, type TechId, type TechBranch } from "@/data/techs";
import { WONDER_GOAL, DOMINATION_FRACTION, TURN_LIMIT, MODIFIER_LABEL } from "@/systems/state";
import {
  PLAYER_ID,
  RESOURCE_KEYS,
  TAX_MAX,
  TAX_MIN,
  TAX_STEP,
  UNREST_PENALTY_START,
  UNREST_REVOLT,
  SECESSION_REVOLT_TURNS,
  armySize,
  emptyUnits,
  nationInstability,
  playerNation,
  type Army,
  type GameState,
  type Nation,
  type Region,
  type ResourceKey,
} from "@/systems/state";

export type { NewGameConfig } from "@/ui/newgame";
import { buildNewGameForm, type NewGameConfig } from "@/ui/newgame";

export interface HudCallbacks {
  onTaxChange(rate: number): void;
  onEndTurn(): void;
  onNewGame(config: NewGameConfig): void;
  onSave(slot: SaveSlot): void;
  onLoad(slot: SaveSlot): void;
  onClearSlot(slot: SaveSlot): void;
  /** Download the current game as a JSON file (backup / sharing). */
  onExport(): void;
  /** Load a game from an uploaded save-file's JSON text. */
  onImport(json: string): void;
  onQueueBuilding(regionId: number, building: BuildingId): void;
  onCancelConstruction(regionId: number): void;
  onRaiseUnit(regionId: number, unit: UnitType): void;
  onBeginMove(armyId: number): void;
  onCancelMove(): void;
  onDeclareWar(targetId: number): void;
  onMakePeace(targetId: number): void;
  onProposePact(targetId: number, kind: "nap" | "alliance"): void;
  onProposeTrade(targetId: number): void;
  onCallToArms(allyId: number, enemyId: number): void;
  onGift(targetId: number, amount: number): void;
  onDemandTribute(targetId: number): void;
  onAcceptOffer(offerId: number): void;
  onRejectOffer(offerId: number): void;
  onChooseResearch(tech: TechId): void;
  /** Select a region on the map (e.g. from a clicked log entry); null deselects. */
  onSelectRegion(regionId: number | null): void;
  /** Resolve the pending choice event by picking one of its options. */
  onResolveChoice(optionId: string): void;
  /** Camera controls (the map also pans by drag and zooms by wheel/pinch). */
  onZoomIn(): void;
  onZoomOut(): void;
  onResetView(): void;
  /** Colour-blind palette toggled — the parent repaints the canvas + HUD. */
  onSetColourblind(on: boolean): void;
  /** Reduce-motion toggled — the parent tells the renderer to suppress motion. */
  onSetReduceMotion(on: boolean): void;
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
  /** Open the Options overlay (also reachable from the main menu). */
  openOptions(): void;
  /** Open the Records overlay (also reachable from the main menu). */
  openRecords(): void;
  /** Show/hide the map-marker tooltip (renderer hover reports). */
  mapTip(tip: { text: string; x: number; y: number } | null): void;
  /**
   * Pause after a resolved turn with a digest of what changed (optional via
   * Options; quiet turns and turns with a pending decision skip it).
   */
  showTurnReport(turn: number, summary: TurnSummary | null, state: GameState): void;
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

  // --- Top strip (AoE2-style): one slim full-width bar along the top edge ----
  // Resources lead on the left, the turn/realm readout sits centred, victory
  // progress and the ☰ menu (every low-frequency panel) close the right end.
  const topBar = el("div", "hud-topbar");
  const barLeft = el("div", "hud-topbar-left");
  const resourceEls: Record<ResourceKey, { stock: HTMLElement; flow: HTMLElement }> =
    {} as never;
  for (const key of RESOURCE_KEYS) {
    const meta = RESOURCE_META[key];
    const cell = el("div", "hud-resource");
    cell.title = meta.tip;
    const icon = resourceIconEl(key, meta.icon, "hud-resource-icon");
    const body = el("div", "hud-resource-body");
    const label = el("span", "hud-resource-label");
    label.textContent = meta.label;
    const stock = el("span", "hud-resource-stock");
    const flow = el("span", "hud-resource-flow");
    body.append(label, stock, flow);
    cell.append(icon, body);
    barLeft.append(cell);
    resourceEls[key] = { stock, flow };
  }
  topBar.append(barLeft);

  // Resource-count tweening: the displayed stock eases toward the live value so the
  // numbers count up/down instead of snapping. Skipped (snaps) under reduce-motion.
  // The RAF idles itself once every value has settled, so a static HUD costs nothing.
  const displayedStock: Record<ResourceKey, number> = {} as never;
  const targetStock: Record<ResourceKey, number> = {} as never;
  let stockInitialized = false;
  let stockRaf: number | null = null;
  function writeStock(key: ResourceKey, value: number, exact: boolean): void {
    resourceEls[key].stock.textContent = exact ? fmt(value) : String(Math.round(value));
  }
  function snapStocks(): void {
    for (const key of RESOURCE_KEYS) {
      displayedStock[key] = targetStock[key];
      writeStock(key, targetStock[key], true);
    }
    if (stockRaf !== null) {
      cancelAnimationFrame(stockRaf);
      stockRaf = null;
    }
  }
  function stepStock(): void {
    if (isReduceMotion()) {
      snapStocks();
      return;
    }
    let moving = false;
    for (const key of RESOURCE_KEYS) {
      const target = targetStock[key];
      const cur = displayedStock[key] ?? target;
      const diff = target - cur;
      if (Math.abs(diff) < 0.5) {
        displayedStock[key] = target;
        writeStock(key, target, true); // exact (may be fractional) once settled
      } else {
        const next = cur + diff * 0.2; // ease ~20%/frame → ~0.3s to settle
        displayedStock[key] = next;
        writeStock(key, next, false); // rounded while counting
        moving = true;
      }
    }
    stockRaf = moving ? requestAnimationFrame(stepStock) : null;
  }
  function syncStockDisplay(): void {
    if (!stockInitialized || isReduceMotion()) {
      snapStocks();
      stockInitialized = true;
      return;
    }
    if (stockRaf === null) stockRaf = requestAnimationFrame(stepStock);
  }

  const barCenter = el("div", "hud-topbar-center");
  const turnBadge = el("div", "hud-turn");
  barCenter.append(turnBadge);
  topBar.append(barCenter);

  const barRight = el("div", "hud-topbar-right");
  const victoryEl = el("div", "hud-victory");
  victoryEl.title = "Progress toward each victory: leading realm's territory share (domination at "
    + `${Math.round(DOMINATION_FRACTION * 100)}%), Great Works, and the turn ${TURN_LIMIT} prestige deadline.`;
  barRight.append(victoryEl);

  // ☰ menu — standings, help, tutorial, legend, records and options all live
  // behind one toggle, so the strip itself stays pure information.
  const menuWrap = el("div", "hud-menu-wrap");
  const menuToggle = document.createElement("button");
  menuToggle.className = "hud-legend-toggle hud-menu-toggle";
  menuToggle.textContent = "☰";
  menuToggle.title = "Standings, help, tutorial, legend, records and options.";
  menuToggle.setAttribute("aria-label", "Menu");
  const topMenu = el("div", "hud-topmenu");
  topMenu.style.display = "none";
  const closeTopMenu = (): void => {
    topMenu.style.display = "none";
  };
  const menuItem = (glyph: Parameters<typeof iconBtn>[0], fb: string, label: string, run: () => void): HTMLButtonElement =>
    iconBtn(glyph, fb, label, "hud-topmenu-item", () => {
      closeTopMenu();
      run();
    });
  const standingsItem = menuItem("standings", "📊", "Standings", () => toggleStandings());
  standingsItem.title = "See how you rank against every rival. Shortcut: S";
  const legendToggleItem = menuItem("legend", "❔", "Map legend", () => {
    legendPanel.style.display = legendPanel.style.display === "none" ? "block" : "none";
  });
  legendToggleItem.title = "Decode the map markers. Shortcut: L";
  const helpItem = menuItem("help", "💡", "Help", () => showHints());
  helpItem.title = "Reopen the getting-started tips. Shortcut: H";
  topMenu.append(
    standingsItem,
    legendToggleItem,
    helpItem,
    menuItem("tutorial", "🎓", "Tutorial", () => runTutorial()),
    menuItem("records", "🏅", "Records", () => openRecords()),
    menuItem("options", "⚙", "Options", () => openOptions()),
  );
  menuToggle.addEventListener("click", (ev) => {
    ev.stopPropagation();
    topMenu.style.display = topMenu.style.display === "none" ? "flex" : "none";
  });
  // Any click outside the open menu closes it.
  document.addEventListener("click", (ev) => {
    if (topMenu.style.display === "none") return;
    if (!(ev.target instanceof Node) || !menuWrap.contains(ev.target)) closeTopMenu();
  });
  menuWrap.append(menuToggle, topMenu);
  barRight.append(menuWrap);
  topBar.append(barRight);
  root.append(topBar);

  // Critical-events alert strip (just below the resource bar).
  const alertStrip = el("div", "hud-alerts");
  alertStrip.style.display = "none";
  root.append(alertStrip);

  // Map legend (hidden until toggled) — explains the node/marker vocabulary.
  const legendPanel = buildLegend();
  legendPanel.style.display = "none";
  root.append(legendPanel);

  // --- Left rail: compact entry points instead of always-open panels ---------
  // Diplomacy and Notifications open drawers on demand; the badge counts keep
  // pending business visible while the panels stay out of the map's way.
  const leftStack = el("div", "hud-leftstack");
  const rail = el("div", "hud-rail");

  interface RailEntry {
    btn: HTMLButtonElement;
    badge: HTMLElement;
  }
  function railBtn(
    glyph: Parameters<typeof iconBtn>[0],
    fb: string,
    label: string,
    title: string,
    onClick: () => void,
  ): RailEntry {
    const btn = iconBtn(glyph, fb, label, "hud-railbtn", onClick);
    btn.title = title;
    const badge = el("span", "hud-railbadge");
    badge.style.display = "none";
    btn.append(badge);
    return { btn, badge };
  }

  const diploRail = railBtn("flag", "⚑", "Diplomacy", "Relations, treaties and offers. Shortcut: D", () =>
    toggleDrawer("diplo"),
  );
  // Research lives beside Diplomacy — same drawer pattern, badge when a
  // technology choice is waiting.
  const researchRail = railBtn("book", "📖", "Research", "Technology and research. Shortcut: R", () =>
    toggleDrawer("research"),
  );
  researchRail.btn.classList.add("hud-railbtn-research");
  // Capital: highlight the seat of power on the map *and* open the full-size
  // region screen — the compact inspector is too cramped for your most
  // important province (shown only while you still hold it).
  const capitalBtn = iconBtn("crown", "👑", "Capital", "hud-railbtn hud-railbtn-capital", () => {
    const player = lastState?.nations.find((n) => n.isPlayer);
    const cap = player?.capitalRegionId;
    if (cap === undefined || lastState?.regions[cap]?.ownerId !== PLAYER_ID) return;
    callbacks.onSelectRegion(cap);
    openRegionScreen(cap);
  });
  capitalBtn.title = "Open your capital full-screen and highlight it on the map.";
  rail.append(diploRail.btn, researchRail.btn, capitalBtn);
  leftStack.append(rail);

  // --- Drawers (one open at a time, sharing the left stack) ------------------
  interface Drawer {
    root: HTMLElement;
    body: HTMLElement;
  }
  function buildDrawer(title: string, className: string): Drawer {
    const drawerRoot = el("div", `hud-panel hud-drawer ${className}`);
    drawerRoot.style.display = "none";
    const head = el("div", "hud-drawer-head");
    head.append(heading(title), closeButton(() => setDrawer(null)));
    const body = el("div", "hud-drawer-body");
    drawerRoot.append(head, body);
    return { root: drawerRoot, body };
  }
  const diploDrawer = buildDrawer("Diplomacy", "hud-drawer-diplo");
  const researchDrawer = buildDrawer("Research", "hud-drawer-research");
  leftStack.append(diploDrawer.root, researchDrawer.root);
  root.append(leftStack);

  type DrawerId = "diplo" | "research";
  let openDrawer: DrawerId | null = null;
  function setDrawer(id: DrawerId | null): void {
    openDrawer = id;
    diploDrawer.root.style.display = id === "diplo" ? "block" : "none";
    researchDrawer.root.style.display = id === "research" ? "block" : "none";
    diploRail.btn.classList.toggle("active", id === "diplo");
    researchRail.btn.classList.toggle("active", id === "research");
  }
  function toggleDrawer(id: DrawerId): void {
    setDrawer(openDrawer === id ? null : id);
  }

  const diploBody = el("div", "hud-diplo-body");
  diploDrawer.body.append(diploBody);
  const researchBody = el("div", "hud-research-body");
  researchDrawer.body.append(researchBody);

  // --- Bottom-left: the per-turn levers that must stay in reach --------------
  // Tax sits beside End turn deliberately: it is the one global policy you
  // review every turn, so the cluster reads as "set policy → commit". The
  // heading separates the lever from the button so they don't blur together.
  const actions = el("div", "hud-panel hud-actions");
  const fiscalHead = heading("Fiscal policy");
  fiscalHead.classList.add("hud-actions-head");
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

  const endTurnBtn = document.createElement("button");
  endTurnBtn.className = "hud-endturn";
  endTurnBtn.textContent = "End turn ▶";
  endTurnBtn.addEventListener("click", () => callbacks.onEndTurn());

  // Admin (new game / saves / backup) hides behind one Game menu button.
  const gameMenuBtn = btn("Game menu", "hud-gamemenu-btn", () => openGameMenu());
  gameMenuBtn.title = "New game, save slots, import & export.";
  actions.append(fiscalHead, taxRow, upkeepLine, endTurnBtn, gameMenuBtn);
  root.append(actions);

  // --- Game menu overlay: the administrative controls, out of the way --------
  const gameMenuOverlay = el("div", "hud-techtree-overlay");
  gameMenuOverlay.style.display = "none";
  gameMenuOverlay.addEventListener("click", (ev) => {
    if (ev.target === gameMenuOverlay) closeGameMenu();
  });
  root.append(gameMenuOverlay);
  const gameMenuPanel = el("div", "hud-techtree-panel hud-gamemenu-panel");
  const gameMenuHead = el("div", "hud-techtree-head");
  const gameMenuTitle = el("h2", "hud-techtree-title");
  gameMenuTitle.textContent = "Game menu";
  gameMenuHead.append(gameMenuTitle, closeButton(() => closeGameMenu()));
  gameMenuPanel.append(gameMenuHead);
  gameMenuOverlay.append(gameMenuPanel);

  function openGameMenu(): void {
    refreshSlotLabels(); // slot turn markers reflect the latest saves on open
    gameMenuOverlay.style.display = "flex";
  }
  function closeGameMenu(): void {
    gameMenuOverlay.style.display = "none";
  }

  // New-game configuration — the shared form (also used by the main menu), so
  // both surfaces offer identical setup and remember the same preferences.
  gameMenuPanel.append(sectionHeading("New game"));
  const newGameForm = buildNewGameForm();
  gameMenuPanel.append(...newGameForm.rows);

  const newGameRow = el("div", "hud-newgame");
  const newGameBtn = document.createElement("button");
  newGameBtn.className = "hud-newgame-btn primary";
  newGameBtn.textContent = "New game";
  function startNewGame(): void {
    closeGameMenu(); // straight into the fresh realm
    callbacks.onNewGame(newGameForm.readConfig());
  }
  newGameBtn.addEventListener("click", () => {
    // Only guard when there's a live game to discard — a fresh session or a
    // finished game starts immediately.
    const inProgress = lastState !== null && lastState.turn > 1 && lastState.outcome === "playing";
    if (!inProgress) {
      startNewGame();
      return;
    }
    void confirmAction({
      title: "Start a new game?",
      body: `Your current game is at turn ${lastState!.turn} and hasn't been won yet. Starting over replaces the autosave — save it to a slot first if you want to keep it.`,
      confirmLabel: "New game",
      danger: true,
    }).then((ok) => {
      if (ok) startNewGame();
    });
  });
  newGameRow.append(newGameBtn);
  gameMenuPanel.append(newGameRow);

  // Save/Load act on the chosen checkpoint slot (3 named slots + the autosave).
  gameMenuPanel.append(sectionHeading("Checkpoints"));
  const btnRow = el("div", "hud-newgame");
  const slotSel = select(
    "hud-select hud-slot",
    MANUAL_SLOTS.map((s, i) => [s, `Slot ${i + 1}`] as [string, string]),
    MANUAL_SLOTS[0]!,
  );
  slotSel.title = "Which checkpoint slot Save writes to and Load reads from.";
  // Label each slot with its saved turn (or "empty"), refreshed as saves change.
  function refreshSlotLabels(): void {
    for (const opt of Array.from(slotSel.options)) {
      const i = MANUAL_SLOTS.indexOf(opt.value as SaveSlot);
      const info = slotInfo(opt.value as SaveSlot);
      opt.textContent = `Slot ${i + 1} · ${info ? `T${info.turn}` : "empty"}`;
    }
  }
  refreshSlotLabels();
  const saveBtn = document.createElement("button");
  saveBtn.className = "hud-newgame-btn";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", () => {
    callbacks.onSave(slotSel.value as SaveSlot);
    refreshSlotLabels(); // reflect the just-written turn immediately
  });
  const loadBtn = document.createElement("button");
  loadBtn.className = "hud-newgame-btn";
  loadBtn.textContent = "Load";
  loadBtn.addEventListener("click", () => callbacks.onLoad(slotSel.value as SaveSlot));
  const clearBtn = document.createElement("button");
  clearBtn.className = "hud-newgame-btn hud-clear-btn";
  clearBtn.textContent = "✕";
  clearBtn.setAttribute("aria-label", "Clear the selected save slot");
  clearBtn.title = "Clear the selected slot's checkpoint (the live game is untouched).";
  clearBtn.addEventListener("click", () => {
    const slot = slotSel.value as SaveSlot;
    const info = slotInfo(slot);
    if (!info) {
      // Nothing to lose — let the intent report "already empty" without a prompt.
      callbacks.onClearSlot(slot);
      refreshSlotLabels();
      return;
    }
    const i = MANUAL_SLOTS.indexOf(slot);
    void confirmAction({
      title: `Clear Slot ${i + 1}?`,
      body: `This permanently deletes the checkpoint saved at turn ${info.turn}. The live game is untouched.`,
      confirmLabel: "Clear slot",
      danger: true,
    }).then((ok) => {
      if (!ok) return;
      callbacks.onClearSlot(slot);
      refreshSlotLabels(); // the slot reads "empty" again immediately
    });
  });
  btnRow.append(slotSel, saveBtn, loadBtn, clearBtn);
  gameMenuPanel.append(btnRow);

  // Export / import a save as a downloadable file (backup / sharing) — fully
  // local: a Blob download and a FileReader upload, no network involved.
  gameMenuPanel.append(sectionHeading("Backup"));
  const fileRow = el("div", "hud-newgame");
  const exportBtn = document.createElement("button");
  exportBtn.className = "hud-newgame-btn";
  exportBtn.textContent = "⬇ Export";
  exportBtn.title = "Download this game as a JSON file.";
  exportBtn.addEventListener("click", () => callbacks.onExport());
  const importBtn = document.createElement("button");
  importBtn.className = "hud-newgame-btn";
  importBtn.textContent = "⬆ Import";
  importBtn.title = "Load a game from a saved JSON file.";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json,.json";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      callbacks.onImport(typeof reader.result === "string" ? reader.result : "");
      fileInput.value = ""; // allow re-importing the same file
    };
    reader.readAsText(file);
  });
  importBtn.addEventListener("click", () => fileInput.click());
  fileRow.append(exportBtn, importBtn, fileInput);
  gameMenuPanel.append(fileRow);

  // --- Right panel: the region inspector, contextual -------------------------
  // Shown only while a region is selected; ✕ (or clicking the ocean) deselects.
  // ⛶ opens the same region in the full-size screen for comfortable reading.
  const rightPanel = el("div", "hud-panel hud-right");
  rightPanel.style.display = "none";
  const rightHead = el("div", "hud-drawer-head");
  const expandBtn = btn("⛶", "hud-techtree-close hud-expand", () => {
    if (lastSelected !== null) openRegionScreen(lastSelected);
  });
  expandBtn.title = "Open this region full-screen.";
  expandBtn.setAttribute("aria-label", "Open this region full-screen");
  const rightHeadBtns = el("div", "hud-head-btns");
  rightHeadBtns.append(expandBtn, closeButton(() => callbacks.onSelectRegion(null)));
  rightHead.append(heading("Region"), rightHeadBtns);
  rightPanel.append(rightHead);
  const regionBody = el("div", "hud-region-body");
  rightPanel.append(regionBody);
  root.append(rightPanel);

  // --- End-game screen (a full modal recap, hidden until the game is decided) --
  const endOverlay = el("div", "hud-techtree-overlay hud-end-overlay");
  endOverlay.style.display = "none";
  endOverlay.addEventListener("click", (ev) => {
    if (ev.target === endOverlay) dismissEnd(); // backdrop click keeps viewing the map
  });
  root.append(endOverlay);
  // Once the player chooses "Keep viewing the map", the recap stays closed for
  // this finished game (re-armed when a new game starts).
  let endDismissed = false;

  function dismissEnd(): void {
    endDismissed = true;
    endOverlay.style.display = "none";
  }

  function renderEndScreen(state: GameState): void {
    endOverlay.innerHTML = "";
    const sum = endGameSummary(state);
    const win = sum.outcome === "victory";
    const winner = state.nations.find((n) => n.id === sum.winnerId);
    const kindLabel = sum.kind ? sum.kind.charAt(0).toUpperCase() + sum.kind.slice(1) : "";

    const panel = el("div", "hud-techtree-panel hud-end-panel");

    // End-card medallion (registry art; the banner still reads without it).
    const cardArt = MOMENT_ART[win ? "victory" : "defeat"];
    if (cardArt) {
      const medal = el("div", "hud-end-art " + (win ? "win" : "lose"));
      medal.setAttribute("aria-hidden", "true");
      medal.innerHTML = cardArt;
      panel.append(medal);
    }

    const title = el("h2", "hud-end-title " + (win ? "win" : "lose"));
    title.textContent = win ? "Victory!" : "Defeat";
    if (winner) title.style.color = safeColor(cbSafe(winner.color, isColourblind()));
    const sub = el("p", "hud-end-sub");
    const who = win ? "Your realm" : winner && !winner.isPlayer ? winner.name : "A rival";
    sub.textContent =
      `${who} prevails${kindLabel ? ` by ${kindLabel}` : ""} on turn ${sum.turns} — ` +
      `you finished #${sum.playerRank} of ${sum.rows.length}.`;
    panel.append(title, sub);

    const graph = buildSparkline(state.scoreHistory ?? {}, state.nations, { width: 520, height: 170, pad: 6 });
    if (graph) {
      graph.classList.add("large");
      panel.append(graph);
    }

    const pr = sum.rows.find((r) => r.id === PLAYER_ID);
    if (pr) {
      const sup = el("p", "hud-end-super");
      sup.innerHTML =
        `Your peak prestige: ${pr.peakScore} (turn ${pr.peakTurn}). Final: ${pr.score} · ` +
        `${pr.regions}${glyphHtml("region", "⬢")} · ${pr.wonders}${glyphHtml("star", "★")} · ` +
        `${pr.techs}${glyphHtml("book", "📖")}.`;
      panel.append(sup);
    }

    const board = el("div", "hud-standings");
    renderStandings(board, state, undefined, false); // big graph above replaces the mini one
    panel.append(board);

    const btns = el("div", "hud-end-btns");
    btns.append(
      btn("New game", "hud-end-btn primary", () => newGameBtn.click()),
      btn("Keep viewing the map", "hud-end-btn", dismissEnd),
    );
    panel.append(btns);

    endOverlay.append(panel);
  }

  // --- First-time hints (shown once, until dismissed) -----------------------
  const hints = el("div", "hud-hints");
  hints.style.display = "none";
  const hintsTitle = el("div", "hud-hints-title");
  hintsTitle.append(document.createTextNode("Welcome, ruler "), glyphEl("crown", "👑"));
  const hintsBody = el("ul", "hud-hints-list");
  for (const tip of [
    "Set your tax rate on the left — more gold, but higher unrest.",
    "Click a region to develop it: queue buildings and raise armies.",
    "Move / Attack an army onto a neighbour to expand or conquer.",
    "Zoom with the wheel or pinch; drag to pan; double-click to fit.",
    "End turn to advance; watch the victory progress up top.",
    "Tap Legend (L) to decode markers; Help (H) reopens these tips.",
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

  // --- Map-marker tooltip -----------------------------------------------------
  // The renderer reports which marker the pointer rests on (shield, crest, pop
  // chip, army badge…); we float a plain-language chip beside the cursor,
  // flipping it inward when it would leave the viewport.
  const mapTipEl = el("div", "hud-maptip");
  mapTipEl.style.display = "none";
  root.append(mapTipEl);
  function mapTip(tip: { text: string; x: number; y: number } | null): void {
    if (!tip) {
      mapTipEl.style.display = "none";
      return;
    }
    mapTipEl.textContent = tip.text;
    mapTipEl.style.display = "block";
    const pad = 14;
    let x = tip.x + pad;
    let y = tip.y + pad;
    if (x + mapTipEl.offsetWidth > window.innerWidth - 8) x = tip.x - mapTipEl.offsetWidth - pad;
    if (y + mapTipEl.offsetHeight > window.innerHeight - 8) y = tip.y - mapTipEl.offsetHeight - pad;
    mapTipEl.style.left = `${Math.max(8, x)}px`;
    mapTipEl.style.top = `${Math.max(8, y)}px`;
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

  // --- Map camera controls (bottom-right, above the log) ---------------------
  // The map itself pans by drag and zooms by wheel/pinch; these buttons make
  // that discoverable and give touch users a precise fallback.
  const zoomBox = el("div", "hud-zoom");
  const zoomBtn = (text: string, title: string, run: () => void): HTMLButtonElement => {
    const b = btn(text, "hud-zoom-btn", run);
    b.title = title;
    return b;
  };
  zoomBox.append(
    zoomBtn("＋", "Zoom in (mouse wheel / pinch)", () => callbacks.onZoomIn()),
    zoomBtn("−", "Zoom out", () => callbacks.onZoomOut()),
    zoomBtn("⛶", "Fit the whole island (double-click the map)", () => callbacks.onResetView()),
  );
  root.append(zoomBox);

  // --- Bottom-right: the events & log hub -----------------------------------
  // Notifications live here with the log: collapsed, the hub shows the latest
  // line plus an unseen counter; expanded, it leads with the active alerts and
  // the last-turn summary, then the full scrollback. Open state persists.
  const LOG_OPEN_KEY = "gaime2:logOpen";
  let logOpen = false;
  try {
    logOpen = localStorage.getItem(LOG_OPEN_KEY) === "1";
  } catch {
    /* storage unavailable — default collapsed */
  }
  let logSeen: number | null = null; // log entries acknowledged so far
  const logPanel = el("div", "hud-panel hud-log");
  const logHead = el("div", "hud-log-head");
  logHead.title = "Expand or collapse the events feed and turn log. Shortcut: N";
  const logHeading = heading("Events & log");
  const logBadge = el("span", "hud-railbadge hud-log-badge");
  logBadge.style.display = "none";
  const logChevron = el("span", "hud-log-chevron");
  logHead.append(logHeading, logBadge, logChevron);
  const logLatest = el("p", "hud-log-latest");
  // The notification feed (alert rows + last-turn summary), shown while open.
  const logEvents = el("div", "hud-log-events");
  const notifAlerts = el("div", "hud-notif-alerts");
  const summaryBox = el("div", "hud-summary");
  summaryBox.style.display = "none";
  logEvents.append(notifAlerts, summaryBox);
  const logBody = el("div", "hud-log-body");
  logPanel.append(logHead, logLatest, logEvents, logBody);
  root.append(logPanel);

  function markLogSeen(): void {
    if (lastState) logSeen = lastState.log.length;
    logBadge.style.display = "none";
  }
  function applyLogOpen(): void {
    logPanel.classList.toggle("open", logOpen);
    logBody.style.display = logOpen ? "flex" : "none";
    logEvents.style.display = logOpen ? "block" : "none";
    logLatest.style.display = logOpen ? "none" : "block";
    logChevron.textContent = logOpen ? "▾" : "▸";
  }
  function toggleLog(): void {
    logOpen = !logOpen;
    try {
      localStorage.setItem(LOG_OPEN_KEY, logOpen ? "1" : "0");
    } catch {
      /* storage unavailable — the toggle still works this session */
    }
    markLogSeen();
    applyLogOpen();
    if (lastState) renderLog(lastState);
  }
  logHead.addEventListener("click", toggleLog);
  applyLogOpen();

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

  // --- Standings overlay (mid-game rankings + score race, opened from the top) -
  const standingsOverlay = el("div", "hud-techtree-overlay");
  standingsOverlay.style.display = "none";
  standingsOverlay.addEventListener("click", (ev) => {
    if (ev.target === standingsOverlay) closeStandings(); // backdrop click closes
  });
  root.append(standingsOverlay);
  let lastState: GameState | null = null;
  // The currently-inspected region, so ⛶ can promote it to the full screen.
  let lastSelected: number | null = null;

  function renderStandingsOverlay(): void {
    if (!lastState) return;
    standingsOverlay.innerHTML = "";
    const panel = el("div", "hud-techtree-panel hud-standings-panel");
    const head = el("div", "hud-techtree-head");
    const title = el("h2", "hud-techtree-title");
    title.textContent = `Standings — turn ${lastState.turn}`;
    head.append(title, closeButton(closeStandings));
    panel.append(head);
    const body = el("div", "hud-standings");
    // Rows are clickable here: jump to that nation's capital and close the modal.
    renderStandings(body, lastState, (regionId) => {
      callbacks.onSelectRegion(regionId);
      closeStandings();
    });
    panel.append(body);
    standingsOverlay.append(panel);
  }
  function openStandings(): void {
    if (!lastState) return;
    renderStandingsOverlay();
    standingsOverlay.style.display = "flex";
  }
  function closeStandings(): void {
    standingsOverlay.style.display = "none";
  }
  function toggleStandings(): void {
    if (standingsOverlay.style.display === "none") openStandings();
    else closeStandings();
  }

  // --- Options overlay (sound, accessibility, display; all persisted) --------
  const optionsOverlay = el("div", "hud-techtree-overlay");
  optionsOverlay.style.display = "none";
  optionsOverlay.addEventListener("click", (ev) => {
    if (ev.target === optionsOverlay) closeOptions();
  });
  root.append(optionsOverlay);

  /** A labelled checkbox row bound to a get/set pair; onChange fires after set. */
  function checkboxRow(label: string, get: () => boolean, set: (v: boolean) => void, hint?: string): HTMLElement {
    const row = el("label", "hud-opt-row");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "hud-opt-check";
    box.checked = get();
    box.addEventListener("change", () => set(box.checked));
    const text = el("span", "hud-opt-label");
    text.textContent = label;
    row.append(box, text);
    if (hint) row.title = hint;
    return row;
  }

  function renderOptions(): void {
    optionsOverlay.innerHTML = "";
    const panel = el("div", "hud-techtree-panel hud-options-panel");
    const head = el("div", "hud-techtree-head");
    const title = el("h2", "hud-techtree-title");
    title.textContent = "Options";
    head.append(title, closeButton(closeOptions));
    panel.append(head);

    // Sound ------------------------------------------------------------------
    panel.append(sectionHeading("Sound"));
    panel.append(
      checkboxRow("Mute all sound", isMuted, (v) => {
        setMuted(v);
        if (!v) play("build"); // audible confirmation on unmute
      }),
    );
    // Volume slider.
    const volRow = el("label", "hud-opt-row");
    const volLabel = el("span", "hud-opt-label");
    const volText = (): string => `Volume — ${Math.round(getVolume() * 100)}%`;
    volLabel.textContent = volText();
    const vol = document.createElement("input");
    vol.type = "range";
    vol.min = "0";
    vol.max = "100";
    vol.step = "5";
    vol.className = "hud-opt-range";
    vol.value = String(Math.round(getVolume() * 100));
    vol.addEventListener("input", () => {
      setVolume(Number(vol.value) / 100);
      volLabel.textContent = volText();
    });
    vol.addEventListener("change", () => play("build")); // preview at the new level
    volRow.append(volLabel, vol);
    panel.append(volRow);
    panel.append(
      checkboxRow("Ambient music bed", isAmbientEnabled, (v) => setAmbientEnabled(v), "A soft, sparse motif — off by default."),
    );

    // Gameplay -----------------------------------------------------------------
    panel.append(sectionHeading("Gameplay"));
    panel.append(
      checkboxRow(
        "Pause after each turn with a report",
        isTurnReport,
        (v) => setTurnReport(v),
        "After End turn, review what changed before play continues. Quiet turns never pause.",
      ),
    );

    // Accessibility ----------------------------------------------------------
    panel.append(sectionHeading("Accessibility"));
    panel.append(
      checkboxRow(
        "Colour-blind-safe palette",
        isColourblind,
        (v) => {
          setColourblind(v);
          callbacks.onSetColourblind(v); // repaint canvas + HUD with the new palette
        },
        "A colour-blind-safe owner palette (map + panels).",
      ),
    );
    panel.append(
      checkboxRow(
        "Reduce motion",
        isReduceMotion,
        (v) => {
          setReduceMotion(v);
          callbacks.onSetReduceMotion(v);
        },
        "Disable non-essential UI transitions and animation.",
      ),
    );

    optionsOverlay.append(panel);
  }

  function sectionHeading(text: string): HTMLElement {
    const h = el("div", "hud-opt-section");
    h.textContent = text;
    return h;
  }

  function openOptions(): void {
    renderOptions();
    optionsOverlay.style.display = "flex";
  }
  function closeOptions(): void {
    optionsOverlay.style.display = "none";
  }

  // --- Records overlay (career stats + achievements) ------------------------
  const recordsOverlay = el("div", "hud-techtree-overlay");
  recordsOverlay.style.display = "none";
  recordsOverlay.addEventListener("click", (ev) => {
    if (ev.target === recordsOverlay) closeRecords();
  });
  root.append(recordsOverlay);

  function statRow(label: string, value: string): HTMLElement {
    const row = el("div", "hud-stat-row");
    const l = el("span", "hud-stat-label");
    l.textContent = label;
    const v = el("span", "hud-stat-value");
    v.textContent = value;
    row.append(l, v);
    return row;
  }

  function renderRecords(): void {
    recordsOverlay.innerHTML = "";
    const p: ProfileStats = loadProfile();
    const panel = el("div", "hud-techtree-panel hud-records-panel");
    const head = el("div", "hud-techtree-head");
    const title = el("h2", "hud-techtree-title");
    title.textContent = "Records";
    head.append(title, closeButton(closeRecords));
    panel.append(head);

    // Career stats.
    panel.append(sectionHeading("Career"));
    const winRate = p.gamesPlayed > 0 ? Math.round((p.gamesWon / p.gamesPlayed) * 100) : 0;
    panel.append(statRow("Games played", String(p.gamesPlayed)));
    panel.append(statRow("Games won", `${p.gamesWon} (${winRate}%)`));
    panel.append(statRow("Fastest win", p.fastestWinTurns === null ? "—" : `${p.fastestWinTurns} turns`));
    panel.append(statRow("Longest game", p.longestGameTurns > 0 ? `${p.longestGameTurns} turns` : "—"));

    // Wins by victory path.
    panel.append(sectionHeading("Wins by path"));
    const paths: [string, string][] = [
      ["domination", "Domination"],
      ["conquest", "Conquest"],
      ["great works", "Great Works"],
      ["prestige score", "Prestige"],
    ];
    for (const [key, label] of paths) panel.append(statRow(label, String(p.winsByKind[key] ?? 0)));

    // Achievements grid.
    panel.append(sectionHeading(`Achievements — ${p.achievements.length}/${ACHIEVEMENTS.length}`));
    const grid = el("div", "hud-achv-grid");
    const unlocked = new Set(p.achievements);
    for (const a of ACHIEVEMENTS) {
      const got = unlocked.has(a.id);
      const cell = el("div", "hud-achv" + (got ? " got" : " locked"));
      const badge = el("div", "hud-achv-badge");
      badge.append(got ? iconEl(badgeArt(a.id), "🏅") : glyphEl("lock", "🔒"));
      const body = el("div", "hud-achv-body");
      const name = el("div", "hud-achv-name");
      name.textContent = a.name;
      const desc = el("div", "hud-achv-desc");
      desc.textContent = a.desc;
      body.append(name, desc);
      cell.append(badge, body);
      grid.append(cell);
    }
    panel.append(grid);

    recordsOverlay.append(panel);
  }

  function openRecords(): void {
    renderRecords();
    recordsOverlay.style.display = "flex";
  }
  function closeRecords(): void {
    recordsOverlay.style.display = "none";
  }

  // --- Pending-decision modal (raised by a choice event) --------------------
  // No backdrop/Esc dismissal: a decision must be made before play continues.
  const choiceOverlay = el("div", "hud-techtree-overlay");
  choiceOverlay.style.display = "none";
  root.append(choiceOverlay);
  // The pending decision's options, so a number key can resolve one directly.
  let currentChoice: NonNullable<GameState["pendingChoice"]> | null = null;
  function renderChoice(pc: NonNullable<GameState["pendingChoice"]>): void {
    choiceOverlay.innerHTML = "";
    const panel = el("div", "hud-techtree-panel hud-choice-panel");
    // Themed vignette medallion for the event (falls back to no art).
    const vig = eventVignette(pc.eventId);
    if (vig) {
      const medal = el("div", "hud-choice-vignette");
      medal.setAttribute("aria-hidden", "true");
      medal.innerHTML = vig;
      panel.append(medal);
    }
    const title = el("h2", "hud-techtree-title");
    title.textContent = "A decision";
    panel.append(title);
    const prompt = el("p", "hud-choice-prompt");
    prompt.textContent = pc.prompt;
    panel.append(prompt);
    const opts = el("div", "hud-choice-options");
    pc.options.forEach((o, i) => {
      const wrap = el("div", "hud-choice-option");
      // Numbered so the matching key (1, 2, …) is discoverable.
      wrap.append(btn(`${i + 1} · ${o.label}`, "hud-choice-btn", () => callbacks.onResolveChoice(o.id)));
      const d = el("span", "hud-choice-detail");
      d.textContent = o.detail;
      wrap.append(d);
      opts.append(wrap);
    });
    panel.append(opts);
    choiceOverlay.append(panel);
  }

  // --- Region screen (the big readable view of one province) -----------------
  // The Capital button and the inspector's ⛶ both land here: the same content
  // as the compact right-rail inspector, rendered in a wide two-column modal.
  const regionOverlay = el("div", "hud-techtree-overlay");
  regionOverlay.style.display = "none";
  regionOverlay.addEventListener("click", (ev) => {
    if (ev.target === regionOverlay) closeRegionScreen();
  });
  root.append(regionOverlay);
  let regionScreenId: number | null = null;

  function renderRegionScreen(): void {
    if (regionScreenId === null || !lastState) return;
    const region = lastState.regions[regionScreenId];
    if (!region) {
      closeRegionScreen(); // the subject vanished (new game / import)
      return;
    }
    regionOverlay.innerHTML = "";
    const panel = el("div", "hud-techtree-panel hud-capital-panel");
    const head = el("div", "hud-techtree-head");
    const title = el("h2", "hud-techtree-title");
    const isCapital = lastState.nations.some(
      (n) => n.isPlayer && n.capitalRegionId === region.id && region.ownerId === PLAYER_ID,
    );
    title.textContent = isCapital ? "Your capital" : "Region overview";
    head.append(title, closeButton(closeRegionScreen));
    panel.append(head);
    const body = el("div", "hud-region-body hud-capital-body");
    // Starting a move needs the map — hand over and get out of the way.
    renderRegion(body, lastState, regionScreenId, null, {
      ...callbacks,
      onBeginMove(armyId) {
        closeRegionScreen();
        callbacks.onBeginMove(armyId);
      },
    });
    panel.append(body);
    regionOverlay.append(panel);
  }
  function openRegionScreen(regionId: number): void {
    regionScreenId = regionId;
    renderRegionScreen();
    regionOverlay.style.display = "flex";
  }
  function closeRegionScreen(): void {
    regionScreenId = null;
    regionOverlay.style.display = "none";
    regionOverlay.innerHTML = "";
  }

  // --- Turn report (the "what just happened" pause) ---------------------------
  // Turn resolution is instant; this modal replays the outcome at reading
  // speed — the summary diff plus any standing dangers — before play moves on.
  // Optional (Options → Gameplay), and skipped for quiet turns, pending
  // decisions (their modal owns the screen) and decided games (end screen).
  const reportOverlay = el("div", "hud-techtree-overlay");
  reportOverlay.style.display = "none";
  reportOverlay.addEventListener("click", (ev) => {
    if (ev.target === reportOverlay) closeTurnReport();
  });
  root.append(reportOverlay);

  function closeTurnReport(): void {
    reportOverlay.style.display = "none";
    reportOverlay.innerHTML = "";
  }

  function showTurnReport(turn: number, summary: TurnSummary | null, state: GameState): void {
    if (!isTurnReport() || !summary || summary.quiet) return;
    if (state.pendingChoice || state.outcome !== "playing") return;
    reportOverlay.innerHTML = "";
    const panel = el("div", "hud-techtree-panel hud-report-panel");
    const head = el("div", "hud-techtree-head");
    const title = el("h2", "hud-techtree-title");
    title.textContent = `Turn ${turn} resolved`;
    head.append(title, closeButton(closeTurnReport));
    panel.append(head);

    const list = el("div", "hud-report-list");
    for (const [tone, text] of summaryItems(summary)) {
      const row = el("div", "hud-summary-row " + tone);
      row.innerHTML = text; // glyph HTML + pre-escaped names (see summaryItems)
      list.append(row);
    }
    panel.append(list);

    // Standing dangers the one-turn diff can't carry (active revolts, a rival
    // nearing victory) — the "should I react?" read, front and centre.
    const standing = deriveAlerts(state, null);
    if (standing.length) {
      const box = el("div", "hud-report-alerts");
      for (const a of standing) {
        const row = el("div", "hud-notif-row " + a.severity);
        row.textContent = a.text;
        box.append(row);
      }
      panel.append(box);
    }

    const hint = el("p", "hud-hint hud-report-hint");
    hint.textContent =
      "The full story is in Events & log (N). Turn this pause off in Options → Gameplay.";
    panel.append(hint);

    const btns = el("div", "hud-end-btns");
    const cont = btn(`Continue to turn ${state.turn} ▶`, "hud-end-btn primary", closeTurnReport);
    btns.append(cont);
    panel.append(btns);

    reportOverlay.append(panel);
    reportOverlay.style.display = "flex";
    cont.focus(); // Enter/Space continue immediately
  }

  // --- Keyboard shortcuts for the overlays ----------------------------------
  // L toggles the map legend, H toggles the getting-started tips, Esc closes
  // whatever's open. Ignore while typing in a form control so the tax/seed
  // inputs keep their own keys. (Enter/Space to end turn live in main.ts.)
  window.addEventListener("keydown", (ev) => {
    const target = ev.target as HTMLElement | null;
    // Form controls own their keys (the seed input must keep "l", "s", …) —
    // except Escape, which must always close whatever is open, even when a
    // checkbox or slider inside a modal still holds focus.
    if (target && (target.tagName === "INPUT" || target.tagName === "SELECT") && ev.key !== "Escape") return;
    // A pending decision is modal: number keys pick an option; nothing else fires.
    if (currentChoice && choiceOverlay.style.display !== "none") {
      const idx = Number(ev.key) - 1;
      const opt = currentChoice.options[idx];
      if (opt) {
        ev.preventDefault();
        callbacks.onResolveChoice(opt.id);
      }
      return;
    }
    // The turn report owns Enter/Space while up (= Continue), so mashing the
    // end-turn key pauses at each report instead of skipping past it.
    if (reportOverlay.style.display !== "none" && (ev.key === "Enter" || ev.key === " ")) {
      ev.preventDefault();
      closeTurnReport();
      return;
    }
    const key = ev.key.toLowerCase();
    if (key === "l") {
      ev.preventDefault();
      legendPanel.style.display = legendPanel.style.display === "none" ? "block" : "none";
    } else if (key === "h") {
      ev.preventDefault();
      if (hints.style.display !== "none") dismissHints();
      else showHints();
    } else if (key === "s") {
      ev.preventDefault();
      toggleStandings();
    } else if (key === "d") {
      ev.preventDefault();
      toggleDrawer("diplo");
    } else if (key === "r") {
      ev.preventDefault();
      toggleDrawer("research");
    } else if (key === "n") {
      ev.preventDefault();
      toggleLog();
    } else if (ev.key === "Escape") {
      closeTechTree();
      closeStandings();
      closeOptions();
      closeRecords();
      closeGameMenu();
      closeTopMenu();
      closeTurnReport();
      closeRegionScreen();
      setDrawer(null);
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
    const alerts = deriveAlerts(state, summary ?? null);
    renderAlerts(alertStrip, alerts);
    renderNotifFeed(notifAlerts, alerts);
    const player = playerNation(state);
    lastPlayer = player;
    lastState = state;
    lastSelected = selectedRegionId;

    // Rail badges: offers awaiting your answer; a research choice waiting.
    // The capital jump shows only while you still hold your seat.
    setBadge(diploRail.badge, state.offers.filter((o) => o.to === PLAYER_ID).length);
    const mustChoose =
      !player.research.current && researchFrontier(player.research.done).length > 0;
    setBadge(researchRail.badge, mustChoose ? 1 : 0);
    researchRail.btn.classList.toggle("attention", mustChoose);
    const capId = player.capitalRegionId;
    capitalBtn.style.display =
      capId !== undefined && state.regions[capId]?.ownerId === PLAYER_ID ? "" : "none";
    // Keep an open tech tree in sync with the latest research state.
    if (techOverlay.style.display !== "none") {
      renderTechTree(techOverlay, player, callbacks, closeTechTree);
    }
    // Keep an open standings overlay live as turns resolve.
    if (standingsOverlay.style.display !== "none") renderStandingsOverlay();
    // Keep the big region screen in sync (queueing a building re-renders it).
    if (regionOverlay.style.display !== "none") renderRegionScreen();
    // A pending decision blocks play until resolved — show its modal.
    if (state.pendingChoice) {
      currentChoice = state.pendingChoice;
      renderChoice(state.pendingChoice);
      choiceOverlay.style.display = "flex";
    } else if (choiceOverlay.style.display !== "none") {
      currentChoice = null;
      choiceOverlay.style.display = "none";
      choiceOverlay.innerHTML = "";
    }
    // Keep the save-slot labels' turn markers current (e.g. after autosave/load).
    refreshSlotLabels();
    const flow = nationalProduction(state, PLAYER_ID);
    const upkeep = totalUpkeep(state, PLAYER_ID);
    for (const key of RESOURCE_KEYS) {
      targetStock[key] = player.stocks[key];
      const f = key === "gold" ? round1(flow.gold - upkeep) : flow[key];
      resourceEls[key].flow.textContent = `${f >= 0 ? "+" : ""}${fmt(f)}/turn`;
      resourceEls[key].flow.classList.toggle("negative", f < 0);
    }
    syncStockDisplay(); // ease the displayed stock toward the new target (or snap)
    resourceEls.food.flow.classList.toggle("negative", player.famine || flow.food < 0);
    const activeMods = (player.modifiers ?? [])
      .filter((m) => m.turnsLeft > 0)
      .map((m) => {
        const intensity = (m.stacks ?? 1) > 1 ? ` ×${m.stacks}` : "";
        return `${MODIFIER_LABEL[m.id]}${intensity} (${m.turnsLeft})`;
      })
      .join(" · ");
    // Trait/modifier labels are fixed data-table strings, but difficulty and
    // seed come from the (possibly imported) save — escape them.
    turnBadge.innerHTML =
      (player.famine ? `${glyphHtml("warning", "⚠")} FAMINE · ` : "") +
      (player.bankrupt ? `${glyphHtml("warning", "⚠")} BANKRUPT · ` : "") +
      `Turn ${state.turn} · ${escapeHtml(String(state.difficulty))}` +
      (player.trait ? ` · ${TRAITS[player.trait].label}` : "") +
      (activeMods ? ` · ${activeMods}` : "") +
      ` · seed ${escapeHtml(String(state.seed))}`;
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

    // The region inspector exists only while a region is selected.
    rightPanel.style.display = selectedRegionId === null ? "none" : "block";
    renderRegion(regionBody, state, selectedRegionId, moveArmyId, callbacks);
    renderDiplomacy(diploBody, state, callbacks);
    renderResearch(researchBody, player, callbacks, openTechTree);

    if (state.outcome === "playing") {
      endDismissed = false; // re-arm the recap for the next decided game
      endOverlay.style.display = "none";
    } else if (!endDismissed) {
      renderEndScreen(state);
      endOverlay.style.display = "flex";
    }

    renderLog(state);
  }

  /**
   * Turn-log render: the header count and unseen badge always; the latest line
   * while collapsed; the full scrollback (newest first, numbered chronologically,
   * region mentions clickable) only while expanded. The buffer is capped
   * upstream (~50 entries), so entry #1 is the oldest still kept.
   */
  function renderLog(state: GameState): void {
    const total = state.log.length;
    // First paint (or a fresh/shorter log after New game) counts as seen.
    if (logSeen === null || logSeen > total) logSeen = total;
    if (logOpen) logSeen = total;
    logHeading.textContent = `Events & log (${total})`;
    const unseen = total - logSeen;
    logBadge.textContent = unseen > 9 ? "9+" : String(unseen);
    logBadge.style.display = unseen > 0 && !logOpen ? "inline-flex" : "none";
    const latest = state.log[total - 1] ?? "";
    logLatest.textContent = latest;
    logLatest.title = latest;
    logBody.innerHTML = "";
    if (!logOpen) return;
    for (let i = total - 1; i >= 0; i--) {
      const text = state.log[i]!;
      const regionId = regionMentionedIn(state, text);
      const row = el(
        "p",
        "hud-log-line" + (i === total - 1 ? " latest" : "") + (regionId !== null ? " linked" : ""),
      );
      const num = el("span", "hud-log-num");
      num.textContent = String(i + 1);
      const txt = el("span", "hud-log-text");
      txt.textContent = text;
      row.append(num, txt);
      if (regionId !== null) {
        row.title = `Show ${state.regions[regionId]!.name} on the map`;
        row.addEventListener("click", () => callbacks.onSelectRegion(regionId));
      }
      logBody.append(row);
    }
  }

  return { update, toast: flashToast, openOptions, openRecords, mapTip, showTurnReport };
}

function renderRegion(
  container: HTMLElement,
  state: GameState,
  selectedRegionId: number | null,
  moveArmyId: number | null,
  callbacks: HudCallbacks,
): void {
  container.innerHTML = "";
  // No selection → the panel itself is hidden by the caller; nothing to draw.
  if (selectedRegionId === null) return;
  const region = state.regions[selectedRegionId];
  if (!region) return;
  const terrain = TERRAIN[region.terrain];
  const owned = region.ownerId === PLAYER_ID;
  const ownerName = state.nations.find((n) => n.id === region.ownerId)?.name ?? "Neutral";

  const title = el("p", "hud-region-title");
  title.textContent = region.name;
  const swatch = el("span", "hud-region-swatch");
  swatch.style.background = terrainCss(region.terrain);
  title.prepend(swatch);

  const meta = el("p", "hud-region-meta");
  // Nation names can come from an imported save — escape every name that lands
  // in this innerHTML (terrain names are data-table constants but escaping is harmless).
  const bits = [escapeHtml(terrain.name), escapeHtml(ownerName), `pop ${fmt(region.population)}/${fmt(regionCapacity(region))}`];
  // The held capital of its owner (crown falls with the seat, as on the map).
  const capitalOf = state.nations.find(
    (n) => !n.isBarbarian && n.capitalRegionId === region.id && region.ownerId === n.id,
  );
  if (capitalOf) {
    bits.splice(1, 0, `${glyphHtml("crown", "👑")} capital of ${capitalOf.isPlayer ? "your realm" : escapeHtml(capitalOf.name)}`);
  }
  if (region.fortification > 0) bits.push(`fort ${region.fortification}`);
  if (region.resource) {
    bits.push(
      region.resource === "iron"
        ? `${resourceIconHtml("iron", "⚒")} iron`
        : `${resourceIconHtml("horses", "🐎")} horses`,
    );
  }
  meta.innerHTML = bits.join(" · ");
  container.append(title, meta);

  if (owned) {
    renderOwnedRegion(container, state, region, moveArmyId, callbacks);
  } else {
    renderEnemyRegion(container, state, region);
  }
}

/**
 * A per-resource tooltip for the region breakdown: the base explanation plus,
 * when any apply, the tech / trait / active-modifier multipliers folded into
 * this resource's yield (named, so the player sees *why* it's boosted or dented).
 */
function flowTooltip(key: ResourceKey, player: Nation, region: Region): string {
  const f = yieldFactors(player);
  const pct = (v: number) => `×${v.toFixed(2)}`;
  const parts: string[] = [];
  if (f.tech[key] !== 1) parts.push(`Tech ${pct(f.tech[key])}`);
  if (f.trait[key] !== 1) parts.push(`${player.trait ? TRAITS[player.trait].label : "Trait"} ${pct(f.trait[key])}`);
  for (const m of player.modifiers ?? []) {
    const s = singleModifierMult(m);
    if (s[key] !== 1) parts.push(`${MODIFIER_LABEL[m.id]} ${pct(s[key])}`);
  }
  // Unrest throttles every resource equally; it's already baked into the flow,
  // so name it here too when it bites (or has fully choked a revolting region).
  const uMult = unrestPenalty(region.unrest);
  if (uMult !== 1) parts.push(`Unrest ${pct(uMult)}`);
  const base = RESOURCE_META[key].tip;
  return parts.length ? `${base}\n\nMultipliers: ${parts.join(" · ")}.` : base;
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

  // A friendly garrison polices its region, lowering unrest (design §3.3). Surface
  // its contribution so the drop in the number is legible, not mysterious.
  const garrisonHere = armyAt(state, region.id, PLAYER_ID);
  const garrisonUnits = garrisonHere ? armySize(garrisonHere.units) : 0;
  const garrisonCalmAmt = garrisonCalm(garrisonUnits);

  // Unrest bar. The tooltip states this region's *current* output penalty so the
  // cost of unrest is concrete, not just the general rule.
  const uMult = unrestPenalty(region.unrest);
  const penaltyNote =
    uMult >= 1
      ? "This region is calm — full output."
      : uMult <= 0
        ? "This region is in revolt — it produces nothing."
        : `Right now this region produces ${Math.round(uMult * 100)}% of its output (−${Math.round((1 - uMult) * 100)}%).`;
  const garrisonNote =
    garrisonCalmAmt > 0
      ? `\n\nYour garrison of ${garrisonUnits} unit${garrisonUnits === 1 ? "" : "s"} polices this region, calming it by ${garrisonCalmAmt} unrest.`
      : "";
  const unrestWrap = el("div", "hud-unrest");
  unrestWrap.title =
    `Unrest throttles a region's output. Calm below ${UNREST_PENALTY_START}; ` +
    `production suffers from ${UNREST_PENALTY_START}; at ${UNREST_REVOLT}+ the region revolts ` +
    "and produces nothing. High taxes, famine, over-expansion and fresh conquests all raise it — " +
    `temples, civics tech and a stationed garrison calm it.\n\n${penaltyNote}${garrisonNote}`;
  const unrestLabel = el("div", "hud-unrest-label");
  unrestLabel.textContent = `Unrest ${fmt(region.unrest)}`;
  unrestLabel.append(unrestTag(region));
  // A subtle chip showing the garrison's calming effect (the reason the number is lower).
  if (garrisonCalmAmt > 0) {
    const calmChip = el("span", "hud-unrest-garrison");
    calmChip.append(glyphEl("flag", "⚑"), document.createTextNode(` −${garrisonCalmAmt}`));
    calmChip.title = `A stationed garrison calms this region by ${garrisonCalmAmt} unrest.`;
    unrestLabel.append(calmChip);
  }
  const bar = el("div", "hud-unrest-bar");
  const fill = el("div", "hud-unrest-fill");
  fill.style.width = `${Math.min(100, region.unrest)}%`;
  fill.style.background = unrestColor(region.unrest);
  bar.append(fill);
  unrestWrap.append(unrestLabel, bar);
  container.append(unrestWrap);

  // Secession warning: a revolting region breaks away to rebels unless held.
  // Surface the countdown and the two ways to stop it, so the mechanic is fair.
  if (region.unrest >= UNREST_REVOLT) {
    const held = garrisonUnits > 0;
    const warn = el("div", `hud-secession ${held ? "held" : "danger"}`);
    if (held) {
      warn.append(
        glyphEl("flag", "⚑"),
        document.createTextNode(" Revolt held down by your garrison — it won't secede while troops remain."),
      );
    } else {
      const left = Math.max(1, SECESSION_REVOLT_TURNS - (region.revoltTurns ?? 0));
      warn.append(
        glyphEl("warning", "⚠"),
        document.createTextNode(
          ` Secedes to rebels in ${left} turn${left === 1 ? "" : "s"} — station an army here or cut taxes to calm it.`,
        ),
      );
    }
    container.append(warn);
  }

  // Production breakdown — each row's tooltip attributes the yield to the tech,
  // trait and modifier multipliers folded into this region's output.
  const table = el("div", "hud-region-flows");
  for (const key of RESOURCE_KEYS) {
    const row = el("div", "hud-region-flow");
    row.title = flowTooltip(key, player, region);
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
    section.append(compositionLine(army));
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
      ? `${def.attack} atk / ${def.defense} def · ${def.upkeep}g upkeep${def.requires ? ` · needs ${def.requires}` : ""}`
      : check.reason ?? "";
    const cost = unitCost(playerNation(state), t);
    btn.innerHTML =
      `<span class="hud-unit-name">${unitIconHtml(t, "")}${def.short}</span>` +
      `<span class="hud-unit-cost">${cost.gold}g ${cost.materials}${resourceIconHtml("materials", "⛏")}</span>`;
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
      detail.innerHTML =
        `${glyphHtml("attack", "⚔")}${Math.round(preview.attack)} · ` +
        `${glyphHtml("shield", "🛡")}${Math.round(preview.defense)}`;
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

/** Colour a victory-progress gauge: closer to a win reads more alarming. */
function vpClass(fraction: number): string {
  if (fraction >= 0.75) return "danger";
  if (fraction >= 0.5) return "warn";
  return "calm";
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
    // Terrain-bound buildings (Harbor) are hidden off-terrain, not shown locked —
    // a lock invites research, but no tech makes plains into coast.
    if (def.requiresTerrain && def.requiresTerrain !== region.terrain) continue;
    const already = region.buildings.includes(id);
    const unlocked = isBuildingUnlockedFor(done, id);
    const btn = document.createElement("button");
    btn.className = "hud-build-btn";
    btn.disabled = already || !unlocked;
    btn.title = unlocked ? def.blurb : `Locked — research ${def.requiresTech?.replace(/_/g, " ")}.`;
    const costLabel = already
      ? "built"
      : !unlocked
        ? glyphHtml("lock", "🔒")
        : def.cost + resourceIconHtml("materials", "⛏");
    btn.innerHTML =
      `<span class="hud-build-name">${buildingIconHtml(id, "")}${def.name}</span>` +
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
  const line = (color: string): string =>
    `<span class="hud-legend-line" style="border-top-color:${color}"></span>`;

  section("Terrain");
  for (const t of TERRAIN_IDS) row(disc(terrainCss(t)), TERRAIN[t].name);

  section("Region markers");
  row('<span class="hud-legend-num">6</span>', "Population (dark chip at the region's heart)");
  row(dot("#e0b74a"), "Unrest — unhappy (amber dot in the status row)");
  row(dot("#e8776b"), "Unrest — revolt risk (red dot)");
  row(resourceIconHtml("iron", "⚒", "hud-legend-ico"), "Iron deposit");
  row(resourceIconHtml("horses", "🐎", "hud-legend-ico"), "Horses");
  row(glyphHtml("hammer", "🔨", "hud-legend-ico"), "Building under construction (status row under the name)");
  row(glyphHtml("shield", "🛡", "hud-legend-ico"), "Fortification level (harder to capture; siege strips it)");
  row(glyphHtml("crown", "👑", "hud-legend-ico"), "Capital — the crest beside the population chip");
  row('<span class="hud-legend-badge">3</span>', "Army (owner colour, unit count)");

  section("Territory");
  row(line("#d8a24a"), "Your realm — gold wash, the widest and brightest rim, named YOU");
  row(line("#5b8bd0"), "Rival realm — its colour wash + rim, named on the map");
  row(line("#9a5b53"), "Barbarian camps — faint brown wash, no rim");
  row('<span class="hud-legend-hatch"></span>', "Unclaimed land — darkened with hatching, free to take");
  row(line(WAR_EDGE_COLOR), "War front — a border between two nations at war");
  row(line(OCEAN.lane), "Sea lane — regions connected across water (armies may cross)");

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
  // Nation names can come from an imported save — escape before HTML interpolation.
  elm.innerHTML =
    `${glyphHtml("victory", "🏆")} ${escapeHtml(leaderName)} ${share}%  ·  ` +
    `${glyphHtml("star", "⭐")} ${player.wonders}/${WONDER_GOAL}  ·  ` +
    `${glyphHtml("hourglass", "⏳")} ${state.turn}/${TURN_LIMIT}`;
  const rivalNearing = !!leader && !leader.isPlayer && share >= DOMINATION_FRACTION * 100 - 12;
  elm.classList.toggle("threat", rivalNearing);
}

/**
 * Final standings for the end-game screen: every non-barbarian nation ranked by
 * prestige score, with a compact regions/wonders/techs breakdown. The player row
 * is highlighted and eliminated nations are marked.
 */
/**
 * Ranked nation standings + the score-race sparkline. When `onPick` is given
 * (mid-game overlay), each row is clickable to jump to that nation's capital;
 * omitted for the static end-game banner.
 */
function renderStandings(
  container: HTMLElement,
  state: GameState,
  onPick?: (regionId: number) => void,
  showSpark = true,
): void {
  container.innerHTML = "";
  const rows = state.nations
    .filter((n) => !n.isBarbarian)
    .map((n) => ({
      n,
      score: nationScore(state, n.id),
      regions: state.regions.filter((r) => r.ownerId === n.id).length,
      // Still holding its own capital? (crown falls when the seat is taken.)
      holdsCapital:
        n.capitalRegionId !== undefined && state.regions[n.capitalRegionId]?.ownerId === n.id,
    }))
    .sort((a, b) => b.score - a.score);

  const table = el("div", "hud-standings-table");
  rows.forEach((row, i) => {
    const canPick = onPick && row.n.capitalRegionId !== undefined;
    const tr = el(
      "div",
      "hud-standings-row" +
        (row.n.isPlayer ? " you" : "") +
        (row.n.alive ? "" : " dead") +
        (canPick ? " pickable" : ""),
    );
    const rank = el("span", "hud-standings-rank");
    rank.textContent = String(i + 1);
    const sw = nationMark(row.n);
    const name = el("span", "hud-standings-name");
    name.textContent = (row.n.isPlayer ? "You" : row.n.name) + (row.n.alive ? "" : " ✗");
    if (row.holdsCapital) name.append(document.createTextNode(" "), glyphEl("crown", "👑"));
    const detail = el("span", "hud-standings-detail");
    detail.innerHTML =
      `${row.regions}${glyphHtml("region", "⬢")} · ` +
      `${row.n.wonders}${glyphHtml("star", "★")} · ` +
      `${row.n.research.done.length}${glyphHtml("book", "📖")}`;
    const score = el("span", "hud-standings-score");
    score.textContent = String(row.score);
    tr.append(rank, sw, name, detail, score);
    // Threat gauge: how close this nation is to its nearest victory. The chip
    // shows the progress-to-win % (matching its colour); the tooltip names the
    // path and the concrete stat behind it.
    if (row.n.alive) {
      const vp = victoryProgress(state, row.n.id);
      const chip = el("span", "hud-standings-vp " + vpClass(vp.fraction));
      chip.textContent = `${Math.round(vp.fraction * 100)}%`;
      chip.title = `${Math.round(vp.fraction * 100)}% toward a ${vp.kind} victory (${vp.label})`;
      tr.append(chip);
    }
    if (canPick) {
      tr.title = `Show ${row.n.isPlayer ? "your" : row.n.name + "’s"} capital on the map`;
      tr.addEventListener("click", () => onPick!(row.n.capitalRegionId!));
    }
    table.append(tr);
  });
  container.append(table);

  if (showSpark) {
    const spark = buildSparkline(state.scoreHistory ?? {}, state.nations);
    if (spark) container.append(spark);
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * A tiny inline-SVG line chart of every nation's prestige score over the game —
 * one line per non-barbarian nation in its own colour, the player's drawn last
 * (on top) and thicker with an end dot. Shared y-scale so heights compare.
 * Returns null when there's too little history to be worth drawing. No deps —
 * hand-built SVG so it stays offline and self-contained.
 */
function buildSparkline(
  scoreHistory: Record<number, number[]>,
  nations: Nation[],
  opts: { width?: number; height?: number; pad?: number } = {},
): HTMLElement | null {
  const series = nations
    .filter((n) => !n.isBarbarian && (scoreHistory[n.id]?.length ?? 0) >= 2)
    .map((n) => ({ nation: n, values: scoreHistory[n.id]! }));
  if (series.length === 0) return null;

  const turns = Math.max(...series.map((s) => s.values.length));
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all);
  const min = Math.min(...all);
  const span = max - min || 1;
  const w = opts.width ?? 240;
  const h = opts.height ?? 48;
  const pad = opts.pad ?? 3;
  const stepX = (w - pad * 2) / (turns - 1 || 1);
  const toPoints = (values: number[]): string =>
    values
      .map((v, i) => {
        const x = pad + i * stepX;
        const y = h - pad - ((v - min) / span) * (h - pad * 2);
        return `${round1(x)},${round1(y)}`;
      })
      .join(" ");

  const wrap = el("div", "hud-sparkline");
  const caption = el("span", "hud-sparkline-caption");
  caption.textContent = `Prestige score, turn 1 → ${turns}`;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("class", "hud-sparkline-svg");
  svg.setAttribute("preserveAspectRatio", "none");

  // Line weights scale gently with height so the large end-game graph reads well.
  const playerW = Math.max(2.2, h * 0.02);
  const rivalW = Math.max(1.3, h * 0.012);
  const dotR = Math.max(2.5, h * 0.02);
  // Rivals first (dimmer, thinner), player last so it sits on top.
  const ordered = [...series].sort((a, b) => Number(a.nation.isPlayer) - Number(b.nation.isPlayer));
  for (const s of ordered) {
    const poly = document.createElementNS(SVG_NS, "polyline");
    poly.setAttribute("points", toPoints(s.values));
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", safeColor(cbSafe(s.nation.color, isColourblind())));
    poly.setAttribute("stroke-width", String(round1(s.nation.isPlayer ? playerW : rivalW)));
    poly.setAttribute("stroke-opacity", s.nation.isPlayer ? "1" : "0.65");
    poly.setAttribute("stroke-linejoin", "round");
    poly.setAttribute("stroke-linecap", "round");
    svg.append(poly);
    if (s.nation.isPlayer) {
      const last = toPoints(s.values).split(" ").pop()!.split(",");
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", last[0]!);
      dot.setAttribute("cy", last[1]!);
      dot.setAttribute("r", String(round1(dotR)));
      dot.setAttribute("fill", safeColor(cbSafe(s.nation.color, isColourblind())));
      svg.append(dot);
    }
  }
  wrap.append(caption, svg);
  return wrap;
}

/** Render the critical-events alert strip (danger/warn/good chips), or hide it. */
function renderAlerts(strip: HTMLElement, alerts: Alert[]): void {
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

/** The Notifications drawer's alert feed — the same alerts as list rows. */
function renderNotifFeed(container: HTMLElement, alerts: Alert[]): void {
  container.innerHTML = "";
  if (alerts.length === 0) {
    container.append(line("All quiet — no active alerts.", "hud-hint"));
    return;
  }
  for (const a of alerts) {
    const row = el("div", "hud-notif-row " + a.severity);
    row.textContent = a.text;
    container.append(row);
  }
}

/** Show a count badge (9+ caps it), or hide it entirely at zero. */
function setBadge(badge: HTMLElement, count: number): void {
  badge.textContent = count > 9 ? "9+" : String(count);
  badge.style.display = count > 0 ? "inline-flex" : "none";
}

/**
 * The digest rows for a turn summary, as [tone, html] pairs — shared by the
 * log hub's "Last turn" box and the turn-report modal. The html mixes fixed
 * glyph markup with names pre-escaped here (they can come from imported saves).
 */
function summaryItems(summary: TurnSummary): Array<[string, string]> {
  const items: Array<[string, string]> = [];
  const g = summary.goldDelta;
  items.push([g >= 0 ? "good" : "bad", `${g >= 0 ? "+" : ""}${fmt(g)}g treasury`]);
  const names = (xs: string[]): string => xs.map(escapeHtml).join(", ");
  if (summary.regionsGained.length) items.push(["good", `Gained ${names(summary.regionsGained)}`]);
  if (summary.regionsLost.length) items.push(["bad", `Lost ${names(summary.regionsLost)}`]);
  if (summary.warsDeclared.length) items.push(["bad", `War with ${names(summary.warsDeclared)}`]);
  if (summary.peaceMade.length) items.push(["good", `Peace with ${names(summary.peaceMade)}`]);
  if (summary.eliminated.length) items.push(["good", `Eliminated ${names(summary.eliminated)}`]);
  if (summary.techsCompleted.length) items.push(["good", `Researched ${summary.techsCompleted.map((t) => TECHS[t].name).join(", ")}`]);
  if (summary.famine) items.push(["bad", `${glyphHtml("warning", "⚠")} Famine`]);
  if (summary.bankrupt) items.push(["bad", `${glyphHtml("warning", "⚠")} Bankruptcy`]);
  if (summary.quiet) items.push(["muted", "A quiet turn."]);
  return items;
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
  for (const [tone, text] of summaryItems(summary)) {
    const row = el("div", "hud-summary-row " + tone);
    row.innerHTML = text;
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
        : offer.type === "peace" && offer.gold
          ? `${from} sues for peace, offering ${offer.gold}g in reparations.`
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
    const sw = nationMark(rival);
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
    treatySpan.append(
      iconEl(TREATY_ART[treaty], ""),
      document.createTextNode(treaty === "nap" ? "NAP" : treaty[0]!.toUpperCase() + treaty.slice(1)),
    );
    status.append(relSpan, treatySpan);
    card.append(status);

    // Power balance: how this rival's strength (army + territory + treasury)
    // compares to yours — the key read for whether it's a soft target or a threat.
    const myPower = nationPower(state, PLAYER_ID);
    const ratio = nationPower(state, rival.id) / (myPower || 1);
    const assess = powerAssessment(ratio);
    const powerRow = el("div", "hud-diplo-power");
    const powerChip = el("span", "hud-diplo-power-chip " + assess.cls);
    powerChip.append(glyphEl("attack", "⚔"), document.createTextNode(` ${assess.label}`));
    powerChip.title =
      `${rival.name}'s strength is ${Math.round(ratio * 100)}% of yours ` +
      "(army + territory + treasury). Below 100% is a softer target; well above is a threat.";
    powerRow.append(powerChip);

    // "Reeling" read: famine / bankruptcy / a province in open revolt leaves the
    // rival distracted and poorly placed to defend — the same opportunist signal
    // the AI acts on (it lowers its required power edge to strike a reeling foe).
    const inst = nationInstability(state, rival.id);
    if (inst.reeling) {
      const crises = [
        inst.revolt ? "a province in revolt" : null,
        inst.famine ? "famine" : null,
        inst.bankrupt ? "bankruptcy" : null,
      ].filter(Boolean);
      const reelChip = el("span", "hud-diplo-reeling");
      reelChip.append(glyphEl("warning", "⚠"), document.createTextNode(" Reeling"));
      reelChip.title =
        `${rival.name} is reeling — ${crises.join(", ")}. Distracted and poorly ` +
        "placed to defend: a tempting moment to strike (rivals read this on you too).";
      powerRow.append(reelChip);
    }
    card.append(powerRow);

    const actions = el("div", "hud-diplo-actions");
    if (treaty === "war") {
      actions.append(btn("Sue for peace", "hud-diplo-btn", () => callbacks.onMakePeace(rival.id)));
    } else {
      actions.append(
        btn("Declare war", "hud-diplo-btn war", () => {
          void confirmAction({
            title: `Declare war on ${rival.name}?`,
            body: "War severs any trade route and treaty between you, and can't be called off this turn. Your rivals will take note.",
            confirmLabel: "Declare war",
            danger: true,
          }).then((ok) => {
            if (ok) callbacks.onDeclareWar(rival.id);
          });
        }),
      );
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
      // Extort a weaker rival: it yields only when clearly outmatched and not proud.
      const wouldYield = wouldAccept(state, PLAYER_ID, rival.id, "tribute");
      const demand = btn(`Demand ${TRIBUTE_DEMAND}g`, "hud-diplo-btn", () => callbacks.onDemandTribute(rival.id));
      demand.title = wouldYield
        ? `${rival.name} is cowed enough to pay — but will resent it.`
        : `${rival.name} would scorn the demand (needs to be far weaker).`;
      actions.append(demand);

      // Trade: an active route earns gold each turn (severed by war); otherwise
      // offer to open one, gated by relations.
      const inc = tradeIncome(state, PLAYER_ID, rival.id);
      if (hasTrade(state, PLAYER_ID, rival.id)) {
        const badge = el("span", "hud-diplo-trade");
        badge.textContent = `⇄ Trading +${inc}g`;
        badge.title = `An active trade route earns you +${inc} gold each turn. Going to war would sever it.`;
        actions.append(badge);
      } else {
        const willing = wouldAccept(state, PLAYER_ID, rival.id, "trade");
        const tradeBtn = btn("Open trade", "hud-diplo-btn", () => callbacks.onProposeTrade(rival.id));
        tradeBtn.title = willing
          ? `Open a trade route — +${inc} gold/turn for each of you. ${rival.name} would accept.`
          : `${rival.name} is too cool toward you to trade (improve relations first).`;
        actions.append(tradeBtn);
      }
    }
    card.append(actions);
    container.append(card);
  }
}

/**
 * Research drawer (left rail, like Diplomacy). Leads with the state — current
 * technology + progress bar, or a loud "choose" prompt when a pick is due —
 * then the counts, the tech-tree button, and the frontier cards stacked
 * vertically. Cards mark the in-progress tech; clicking one sets research.
 */
function renderResearch(
  container: HTMLElement,
  player: Nation,
  callbacks: HudCallbacks,
  onOpenTree: () => void,
): void {
  container.innerHTML = "";
  const research = player.research;
  const frontier = researchFrontier(research.done);
  const mustChoose = !research.current && frontier.length > 0;
  const countText = `${research.done.length}/${Object.keys(TECHS).length} techs · ${player.wonders}/${WONDER_GOAL} wonders`;

  const header = el("div", "hud-research-head");
  const title = el("span", "hud-research-title");
  if (research.current) {
    const def = TECHS[research.current];
    const pct = Math.min(100, (research.progress / def.cost) * 100);
    // Progress can overshoot the cost mid-turn (completion lands at resolve);
    // clamp the display so it never reads "32/20".
    const shown = Math.min(Math.floor(research.progress), def.cost);
    title.innerHTML = `${resourceIconHtml("knowledge", "📖")} ${def.name} — ${shown}/${def.cost}`;
    const bar = el("div", "hud-research-bar");
    const fill = el("div", "hud-research-fill");
    fill.style.width = `${pct}%`;
    fill.style.background = BRANCH_COLOR[def.branch];
    bar.append(fill);
    header.append(title, bar);
  } else if (mustChoose) {
    title.textContent = "Choose a technology to research:";
    header.append(title);
  } else {
    title.innerHTML = `${resourceIconHtml("knowledge", "📖")} All technologies researched`;
    header.append(title);
  }
  container.append(header);

  const count = el("p", "hud-research-count");
  count.textContent = countText;
  container.append(count);
  container.append(btn("Open tech tree ▤", "hud-techtree-open", onOpenTree));

  const menu = el("div", "hud-tech-menu");
  for (const id of frontier) {
    const def = TECHS[id];
    const b = document.createElement("button");
    b.className = "hud-tech-btn" + (research.current === id ? " active" : "");
    b.title = def.blurb;
    b.style.borderLeftColor = BRANCH_COLOR[def.branch];
    b.innerHTML =
      `<span class="hud-tech-name">${def.name}</span>` +
      `<span class="hud-tech-blurb">${def.blurb}</span>` +
      `<span class="hud-tech-cost">${def.cost}${resourceIconHtml("knowledge", "📖")} · ${iconHtml(BRANCH_ART[def.branch], "")} ${def.branch}</span>`;
    b.addEventListener("click", () => callbacks.onChooseResearch(id));
    menu.append(b);
  }
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
  head.append(ttTitle, closeButton(onClose));
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
        `<span class="hud-tt-meta">T${def.tier} · ${def.cost}${resourceIconHtml("knowledge", "📖")} · ${iconHtml(BRANCH_ART[def.branch], "")}</span>`;
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

/** A rival's strength relative to the player (ratio = their power / yours) → a label + class. */
function powerAssessment(ratio: number): { label: string; cls: string } {
  if (ratio < 0.7) return { label: "Much weaker", cls: "weak" };
  if (ratio < 0.9) return { label: "Weaker", cls: "weak" };
  if (ratio <= 1.1) return { label: "Evenly matched", cls: "even" };
  if (ratio <= 1.4) return { label: "Stronger", cls: "strong" };
  return { label: "Much stronger", cls: "strong" };
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

/** A ✕ close button carrying an accessible name for screen readers. */
function closeButton(onClick: () => void): HTMLButtonElement {
  const b = btn("✕", "hud-techtree-close", onClick);
  b.setAttribute("aria-label", "Close");
  return b;
}

function composition(army: Army): string {
  const parts: string[] = [];
  for (const t of UNIT_TYPES) if (army.units[t] > 0) parts.push(`${army.units[t]} ${UNITS[t].short}`);
  return parts.join(", ") || "—";
}

/** The army line with unit icons: "3 units — [⚒]2 [🗡]1". Text fallback intact. */
function compositionLine(army: Army): HTMLElement {
  const p = el("p", "hud-army-comp");
  p.append(document.createTextNode(`${armySize(army.units)} units — `));
  let any = false;
  for (const t of UNIT_TYPES) {
    if (army.units[t] <= 0) continue;
    any = true;
    const chip = el("span", "hud-comp-chip");
    chip.title = UNITS[t].name;
    chip.innerHTML = `${unitIconHtml(t, UNITS[t].short + " ")}${army.units[t]}`;
    p.append(chip);
  }
  if (!any) p.append(document.createTextNode("—"));
  return p;
}

/**
 * A nation's identity mark: its crest (in its resolved display colour) when
 * the registry has one, else the legacy colour swatch. Used by standings and
 * diplomacy so factions read as factions, not coloured dots.
 */
function nationMark(n: Nation): HTMLElement {
  const color = cbSafe(n.color, isColourblind());
  const crest = crestSvg(n.id, color);
  if (crest) {
    const span = el("span", "hud-crest ico-svg");
    span.setAttribute("aria-hidden", "true");
    span.innerHTML = crest;
    return span;
  }
  const sw = el("span", "hud-region-swatch");
  sw.style.background = safeColor(color);
  return sw;
}

/** CSS background matching the map's shaded terrain fill (flat colour fallback). */
function terrainCss(t: (typeof TERRAIN_IDS)[number]): string {
  const shade = TERRAIN_ART[t];
  const base = TERRAIN[t].color;
  if (!shade) return base;
  return `radial-gradient(circle at 35% 32%, ${shade.hi}, ${base} 55%, ${shade.lo})`;
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

/**
 * The region a log line refers to, if any — the longest region name that appears
 * in the text (longest wins so "Kelmoor" beats a stray "Kel"). Region names are
 * distinct proper nouns, so a plain substring match is reliable here.
 */
function regionMentionedIn(state: GameState, line: string): number | null {
  let bestId: number | null = null;
  let bestLen = 0;
  for (const r of state.regions) {
    if (r.name.length > bestLen && line.includes(r.name)) {
      bestId = r.id;
      bestLen = r.name.length;
    }
  }
  return bestId;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

