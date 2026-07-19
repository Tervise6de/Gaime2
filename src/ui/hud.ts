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

import { BUILDINGS, BUILDING_IDS, BUILD_RATE, buildingFocusOk, buildingResourceOk, type BuildingId } from "@/data/buildings";
import { UNITS, UNIT_TYPES, type UnitType } from "@/data/units";
import { TERRAIN, TERRAIN_IDS } from "@/data/terrain";
import { regionProduction, nationalProduction, nationYieldMult, yieldFactors, singleModifierMult, unrestPenalty } from "@/systems/economy";
import { garrisonCalm, overexpansionUnrest } from "@/systems/stability";
import { techUnrestReduction } from "@/systems/tech";
import { runTutorial } from "@/ui/tutorial";
import { confirmAction } from "@/ui/confirm";
import { t, LOCALES, getLocale, setLocale, isLocale } from "@/ui/i18n";
import { isMuted, setMuted, play, isAmbientEnabled, setAmbientEnabled, getVolume, setVolume } from "@/ui/audio";
import {
  isColourblind,
  setColourblind,
  isReduceMotion,
  setReduceMotion,
  isTurnReport,
  setTurnReport,
  isCombatReport,
  setCombatReport,
} from "@/ui/settings";
import type { BattleReport } from "@/systems/combat";
import { LENSES, lensGradient, type LensId } from "@/ui/lenses";
import { FOCUSES, type FocusId } from "@/data/focuses";
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
import { popDisplay, soldiersCompact, soldiersDisplay } from "@/systems/format";
import { buildOptions, deriveAdvice, regionCanStartBuild } from "@/ui/advisor";
import { previewCombat, forecastCombat } from "@/systems/combat";
import {
  armyAt,
  anyArmyAt,
  canRaiseUnit,
  strategicAccess,
  totalUpkeep,
  unitCost,
} from "@/systems/military";
import { getRelation, getTreaty, wouldJoinWar, warTargetsFor, wouldAccept, nationPower, hasTrade, tradeIncome, opinionReasons, foreignRelations, casusBelli, CASUS_BELLI, TRIBUTE_DEMAND } from "@/systems/diplomacy";
import { nationScore, victoryProgress, victoryRaces, endGameSummary } from "@/systems/victory";
import { GOODS, type GoodId } from "@/data/goods";
import { KONTORE, type KontorId } from "@/data/kontore";
import { routeOptions, regionGoodOutput } from "@/systems/trade";
import { MANUAL_SLOTS, slotInfo, type SaveSlot } from "@/systems/save";
import type { TurnSummary } from "@/systems/summary";
import { deriveAlerts, type Alert } from "@/ui/alerts";
import { researchFrontier, recommendedTech, isBuildingUnlockedFor } from "@/systems/tech";
import { eraIndexForTurn, eraByIndex } from "@/data/eras";
import { ARCHETYPE_LABEL } from "@/data/personalities";
import { eraForTurn, yearForTurn } from "@/data/eras";
import { TRAITS } from "@/data/traits";
import { TECHS, TECH_IDS, type TechId, type TechBranch } from "@/data/techs";
import { WONDER_GOAL, DOMINATION_FRACTION, TURN_LIMIT, MODIFIER_LABEL, MAX_ENTRENCH } from "@/systems/state";
import {
  commanderAttack,
  commanderDefense,
  commanderTitle,
} from "@/data/commanders";
import { rulerTitle } from "@/data/rulers";
import {
  BARBARIAN_ID,
  MAX_ROUTES_PER_NATION,
  PLAYER_ID,
  RESOURCE_KEYS,
  TAX_MAX,
  TAX_MIN,
  TAX_STEP,
  UNREST_BASE,
  UNREST_TAX_MAX,
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
  /** Remove the building at `index` from a region's build queue. */
  onRemoveQueuedBuilding(regionId: number, index: number): void;
  /** Empty a region's build queue (the current construction keeps running). */
  onClearBuildQueue(regionId: number): void;
  onCancelConstruction(regionId: number): void;
  /** Assign a region's specialisation focus (or "balanced" to clear it). */
  onSetFocus(regionId: number, focus: FocusId): void;
  /** Open a trade route: ship `good` from a region to a Kontor that demands it. */
  onOpenRoute(regionId: number, good: GoodId, kontorId: KontorId): void;
  /** Close one of your trade routes by id. */
  onCloseRoute(routeId: number): void;
  onRaiseUnit(regionId: number, unit: UnitType): void;
  onBeginMove(armyId: number): void;
  onCancelMove(): void;
  /** Order an army to march on a region (travels over turns, fights on arrival). */
  onAttackWith(armyId: number, regionId: number): void;
  /** Cancel an army's standing march order. */
  onCancelMarch(armyId: number): void;
  /** Split a chosen subset of an army off into an adjacent region you own. */
  onMoveDetachment(armyId: number, targetRegionId: number, subset: Partial<Record<UnitType, number>>): void;
  /** Disband a chosen subset of an army's units to cut upkeep. */
  onDisbandUnits(armyId: number, subset: Partial<Record<UnitType, number>>): void;
  /** Dig an army in where it stands to entrench (M3). */
  onFortifyArmy(armyId: number): void;
  /** Appoint a commander to lead an army (M4). */
  onAppointCommander(armyId: number): void;
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
  /** Map lens changed — the parent recolours the board by the chosen metric. */
  onLensChange(lens: LensId): void;
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
  /** Open the full-size region screen (map clicks land here, like the Capital button). */
  openRegionScreen(regionId: number): void;
  /**
   * Pause after a resolved turn with a digest of what changed (optional via
   * Options; quiet turns and turns with a pending decision skip it).
   */
  showTurnReport(turn: number, summary: TurnSummary | null, state: GameState): void;
  /** Replay a battle blow-by-blow (a player-involved fight). */
  showBattleReport(report: BattleReport): void;
  /** The HUD-owned minimap canvas (in the Map panel), handed to renderer.setMinimap. */
  minimapCanvas: HTMLCanvasElement;
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

  // --- Top strip: one slim full-width bar along the top edge ------------------
  // Labelled resource segments lead on the left (icon · name / value /
  // +flow per turn, divided like cards); the turn block (turn·year, age·
  // difficulty·trait, active modifiers) sits centre-left with crisis chips
  // and victory progress beside it; labelled quick buttons (Legend / Help /
  // Standing / Game) and the ☰ menu close the right end.
  const topBar = el("div", "hud-topbar");
  const barLeft = el("div", "hud-topbar-left");
  const resourceEls: Record<ResourceKey, { stock: HTMLElement; flow: HTMLElement }> =
    {} as never;
  for (const key of RESOURCE_KEYS) {
    const meta = RESOURCE_META[key];
    const cell = el("div", "hud-resource");
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
    // Hovering a resource chip floats a per-region income breakdown (CK3-style),
    // so "where does my materials come from?" is answered without opening a panel.
    cell.addEventListener("mouseenter", (ev) => showResourceTip(key, ev.clientX, ev.clientY));
    cell.addEventListener("mousemove", (ev) => positionResourceTip(ev.clientX, ev.clientY));
    cell.addEventListener("mouseleave", hideResourceTip);
  }
  topBar.append(barLeft);

  // Floating resource-income tooltip (per-region breakdown), shown on chip hover.
  const resourceTipEl = el("div", "hud-restip");
  resourceTipEl.style.display = "none";
  root.append(resourceTipEl);
  function showResourceTip(key: ResourceKey, x: number, y: number): void {
    if (!lastState || !lastPlayer) return;
    resourceTipEl.innerHTML = resourceTipHtml(lastState, lastPlayer, key);
    resourceTipEl.style.display = "block";
    positionResourceTip(x, y);
  }
  function positionResourceTip(x: number, y: number): void {
    if (resourceTipEl.style.display === "none") return;
    const pad = 14;
    let left = x + pad;
    let top = y + pad;
    if (left + resourceTipEl.offsetWidth > window.innerWidth - 8) {
      left = window.innerWidth - resourceTipEl.offsetWidth - 8;
    }
    if (top + resourceTipEl.offsetHeight > window.innerHeight - 8) {
      top = y - resourceTipEl.offsetHeight - pad;
    }
    resourceTipEl.style.left = `${Math.max(8, left)}px`;
    resourceTipEl.style.top = `${Math.max(8, top)}px`;
  }
  function hideResourceTip(): void {
    resourceTipEl.style.display = "none";
  }

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

  // The turn block: turn·year on top, then age · difficulty · trait, then any
  // active timed modifiers ("War-weariness ×2 (3)") — one bordered segment.
  const turnBlock = el("div", "hud-turnblock");
  const turnMain = el("div", "hud-turn-main");
  const turnSub = el("div", "hud-turn-sub");
  const turnMods = el("div", "hud-turn-mods");
  turnMods.style.display = "none";
  turnBlock.append(turnMain, turnSub, turnMods);
  topBar.append(turnBlock);

  const barCenter = el("div", "hud-topbar-center");
  // Crises never hide behind a digest: famine/bankruptcy chips persist every
  // turn the condition holds.
  const crisisEl = el("div", "hud-crisis");
  crisisEl.style.display = "none";
  // Victory progress no longer rides the top bar (it moved to the Politics
  // page); the element is created here and re-parented there, still refreshed
  // every turn by update().
  const victoryEl = el("div", "hud-victory hud-victory-politics");
  victoryEl.title = "Progress toward each victory: leading realm's territory share (domination at "
    + `${Math.round(DOMINATION_FRACTION * 100)}%), Great Works, and the turn ${TURN_LIMIT} prestige deadline.`;
  barCenter.append(crisisEl);
  topBar.append(barCenter);

  const barRight = el("div", "hud-topbar-right");
  // The everyday panels (Diplomacy · Research · Production · Army · Politics)
  // are inserted here as first-class nav buttons further down — once their open
  // handlers exist. The ☰ menu (below) keeps the rarer, less-frequent panels.

  // ☰ menu — legend, help, standing, tutorial, records, game admin and options
  // all live behind one toggle, so the bar itself stays lean.
  const menuWrap = el("div", "hud-menu-wrap");
  const menuToggle = document.createElement("button");
  menuToggle.className = "hud-legend-toggle hud-menu-toggle";
  menuToggle.textContent = "☰";
  menuToggle.title = "Tutorial, records and options.";
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
  // The nav buttons now hold Diplomacy/Research/Production/Army/Politics; the ☰
  // gathers the reference & system panels so the bar stays uncluttered.
  topMenu.append(
    menuItem("legend", "❔", "Legend", () => {
      legendPanel.style.display = legendPanel.style.display === "none" ? "block" : "none";
    }),
    menuItem("help", "💡", "Help", () => showHints()),
    menuItem("standings", "📊", "Standing", () => toggleStandings()),
    menuItem("tutorial", "🎓", "Tutorial", () => runTutorial()),
    menuItem("records", "🏅", "Records", () => openRecords()),
    menuItem("options", "⚙", "Options", () => openOptions()),
    menuItem("crown", "🎲", "Game — new / save", () => openGameMenu()),
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

  // Move-mode banner: while an army awaits its destination, the whole screen
  // says so — what's moving, what to click, and how to bail out.
  const moveBanner = el("div", "hud-move-banner");
  moveBanner.style.display = "none";
  root.append(moveBanner);

  // Map legend (hidden until toggled) — explains the marker vocabulary and
  // carries the World card (seed, difficulty, age…) filled live in update().
  const legendPanel = buildLegend();
  legendPanel.style.display = "none";
  const legendWorld = el("div", "hud-legend-world");
  legendPanel.insertBefore(legendWorld, legendPanel.children[1] ?? null);
  root.append(legendPanel);

  // --- Top-bar nav buttons: the everyday panels, one click from anywhere ------
  // Diplomacy · Research · Production · Army · Politics — each a labelled button
  // with a badge for pending business (a waiting tech, idle builds, ready
  // armies, incoming offers). They sit in the top bar's right cluster.
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
    const btn = iconBtn(glyph, fb, label, "hud-navbtn", onClick);
    btn.title = title;
    const badge = el("span", "hud-railbadge");
    badge.style.display = "none";
    btn.append(badge);
    return { btn, badge };
  }

  const diploRail = railBtn("flag", "⚑", t("nav.diplomacy"), t("nav.diplomacy.tip"), () =>
    toggleScreen("diplo"),
  );
  // D5 keeps the label/​tip localised; the fixes make the button open the tree
  // directly (it is the sole research page now) instead of the old list screen.
  const researchRail = railBtn("book", "📖", t("nav.research"), t("nav.research.tip"), () =>
    toggleTechTree(),
  );
  researchRail.btn.classList.add("hud-railbtn-research");
  const productionRail = railBtn(
    "hammer",
    "🔨",
    t("nav.production"),
    t("nav.production.tip"),
    () => openProduction(),
  );
  const armiesRail = railBtn(
    "attack",
    "⚔",
    t("nav.armies"),
    t("nav.armies.tip"),
    () => openArmies(),
  );
  // Politics: taxes, fiscal policy and the victory race — the realm's governance
  // page (tax used to sit by End turn; victory used to ride the top bar).
  const politicsRail = railBtn(
    "crown",
    "⚖",
    t("nav.politics"),
    t("nav.politics.tip"),
    () => openPolitics(),
  );
  const navWrap = el("div", "hud-navwrap");
  navWrap.append(diploRail.btn, researchRail.btn, productionRail.btn, armiesRail.btn, politicsRail.btn);
  barRight.insertBefore(navWrap, menuWrap);

  // --- Diplomacy & Research: big centred screens ------------------------------
  // Every rail tab opens the same way — a readable modal in the middle of the
  // screen (the old left-side drawers were cramped and could hide behind the
  // actions cluster). The bodies persist, so update() keeps them live.
  interface Screen {
    overlay: HTMLElement;
    panel: HTMLElement;
    body: HTMLElement;
  }
  function buildScreen(title: string, panelClass: string, onClose: () => void): Screen {
    const overlay = el("div", "hud-techtree-overlay");
    overlay.style.display = "none";
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) onClose();
    });
    const panel = el("div", `hud-techtree-panel ${panelClass}`);
    const head = el("div", "hud-techtree-head");
    const h = el("h2", "hud-techtree-title");
    h.textContent = title;
    head.append(h, closeButton(onClose));
    const body = el("div", "hud-screen-body");
    panel.append(head, body);
    overlay.append(panel);
    root.append(overlay);
    return { overlay, panel, body };
  }
  // Diplomacy is the one remaining big-screen tab here; Research now opens the
  // tech-tree overlay directly (see toggleTechTree), so the tree is its sole page.
  const diploScreen = buildScreen("Diplomacy", "hud-diplo-panel", () => setScreen(null));

  type ScreenId = "diplo";
  let openScreenId: ScreenId | null = null;
  function setScreen(id: ScreenId | null): void {
    openScreenId = id;
    diploScreen.overlay.style.display = id === "diplo" ? "flex" : "none";
    diploRail.btn.classList.toggle("active", id === "diplo");
    // A freshly opened screen always starts at its top.
    if (id === "diplo") diploScreen.panel.scrollTop = 0;
  }
  function toggleScreen(id: ScreenId): void {
    setScreen(openScreenId === id ? null : id);
  }

  const diploBody = el("div", "hud-diplo-body");
  diploScreen.body.append(diploBody);

  // --- Bottom-left: commit the turn, and what still wants orders -------------
  // Fiscal policy (tax) now lives on the Politics page (P); this cluster keeps
  // only the one-line tax read-out that opens it, the advisor, and End turn.
  const actions = el("div", "hud-panel hud-actions");

  // Fiscal controls — created here but parented into the Politics page below.
  // update() writes to them by reference regardless of where they're mounted.
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
  // The other half of the tax trade-off, live: where this tax level pulls
  // every region's unrest — so "more gold" is never a free lunch on screen.
  const taxUnrestLine = el("p", "hud-hint hud-tax-unrest");

  // A compact tax read-out that opens Politics — the lever stays visible and
  // one click away without crowding the commit button.
  const taxJump = btn("Tax —", "hud-taxjump", () => openPolitics());
  taxJump.title = "Open Politics (P) to set taxes and review the victory race.";

  const endTurnBtn = document.createElement("button");
  endTurnBtn.className = "hud-endturn";
  endTurnBtn.textContent = t("action.endTurn");
  endTurnBtn.addEventListener("click", () => callbacks.onEndTurn());

  // End-turn advisor: what still wants orders (research / idle builds /
  // restless armies), each chip a jump to the right place. Civ-style
  // guidance, never a hard block — End turn always works.
  const advisorBox = el("div", "hud-advisor");
  advisorBox.style.display = "none";

  actions.append(taxJump, advisorBox, endTurnBtn);
  // `actions` is parented into the bottom-left stack below (beneath the Map
  // panel), so End turn keeps the corner while the minimap sits just above it.

  // --- Politics page: taxes, fiscal policy and the victory race --------------
  // Governance in one place: the tax lever (moved off the End-turn cluster) and
  // the victory progress (moved off the top bar).
  const politicsOverlay = el("div", "hud-techtree-overlay");
  politicsOverlay.style.display = "none";
  politicsOverlay.addEventListener("click", (ev) => {
    if (ev.target === politicsOverlay) closePolitics();
  });
  root.append(politicsOverlay);
  const politicsPanel = el("div", "hud-techtree-panel hud-politics-panel");
  const politicsHead = el("div", "hud-techtree-head");
  const politicsTitle = el("h2", "hud-techtree-title");
  politicsTitle.textContent = "Politics";
  politicsHead.append(politicsTitle, closeButton(() => closePolitics()));
  politicsPanel.append(politicsHead);
  politicsPanel.append(sectionHeading("Fiscal policy"));
  const taxHint = el("p", "hud-hint");
  taxHint.textContent =
    "Set the realm-wide tax rate. Higher tax fills the treasury but stokes unrest across every region.";
  politicsPanel.append(taxHint, taxRow, upkeepLine, taxUnrestLine);
  politicsPanel.append(sectionHeading("Victory race"));
  politicsPanel.append(victoryEl);
  politicsOverlay.append(politicsPanel);

  function openPolitics(): void {
    politicsOverlay.style.display = "flex";
    politicsPanel.scrollTop = 0;
  }
  function closePolitics(): void {
    politicsOverlay.style.display = "none";
  }

  // --- Map panel (CK3-style): a small minimap + a map-mode dropdown ----------
  // Bottom-left corner. The minimap is painted by the renderer (setMinimap, wired
  // in main.ts); the dropdown picks the overlay lens, echoed by main.ts into the
  // renderer which bakes the heat into the political layer.
  let activeLens: LensId = "none";
  const mapPanel = el("div", "hud-panel hud-mappanel");
  const mapPanelHead = el("div", "hud-mappanel-head");
  const mapPanelTitle = el("span", "hud-mappanel-title");
  mapPanelTitle.textContent = "Map";
  mapPanelHead.append(mapPanelTitle);
  const minimapCanvas = document.createElement("canvas");
  minimapCanvas.className = "hud-minimap";
  minimapCanvas.title = "Minimap — click to jump the camera there.";
  const lensRow = el("div", "hud-lens-row");
  const lensSelectLabel = el("span", "hud-lens-select-label");
  lensSelectLabel.textContent = "View";
  const lensSelect = document.createElement("select");
  lensSelect.className = "hud-lens-select";
  for (const lens of LENSES) {
    const opt = document.createElement("option");
    opt.value = lens.id;
    opt.textContent = lens.label;
    opt.title = lens.hint;
    lensSelect.append(opt);
  }
  lensSelect.value = "none";
  lensSelect.addEventListener("change", () => setLens(lensSelect.value as LensId));
  lensRow.append(lensSelectLabel, lensSelect);
  const lensScale = el("div", "hud-lens-scale");
  lensScale.style.display = "none";
  lensScale.innerHTML = `<span>low</span><i class="hud-lens-ramp"></i><span>high</span>`;
  mapPanel.append(mapPanelHead, minimapCanvas, lensRow, lensScale);

  // Bottom-left column: the Map panel (minimap + filter) sits above the actions
  // cluster, so End turn stays in the corner and the two never overlap however
  // many advisor chips the actions cluster grows.
  // Actions cluster stays bottom-left; the Map panel (minimap + lens) moves to
  // its own bottom-right corner, and the events log centres along the bottom
  // (see the CSS) — so the middle of the board is clear and the minimap sits
  // where the eye expects it (CK3/Civ-style).
  const bottomLeft = el("div", "hud-bottomleft");
  bottomLeft.append(actions);
  root.append(bottomLeft);
  root.append(mapPanel);

  function setLens(id: LensId): void {
    activeLens = id;
    if (lensSelect.value !== id) lensSelect.value = id;
    const grad = lensGradient(id);
    lensScale.style.display = grad ? "flex" : "none";
    if (grad) {
      const ramp = lensScale.querySelector<HTMLElement>(".hud-lens-ramp");
      if (ramp) ramp.style.background = grad;
    }
    lensSelect.title = LENSES.find((l) => l.id === id)?.hint ?? "";
    callbacks.onLensChange(id);
  }
  /** Step to the next lens (keyboard M) — cycles Political → … → Military → back. */
  function cycleLens(): void {
    const i = LENSES.findIndex((l) => l.id === activeLens);
    setLens(LENSES[(i + 1) % LENSES.length]!.id);
  }

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
    newGameForm.refreshSeed(); // every visit shows a fresh, real seed
    gameMenuOverlay.style.display = "flex";
    gameMenuPanel.scrollTop = 0; // the panel persists — reset to its top on open
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
  newGameBtn.textContent = "Start new game ▶";
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

    // The chronicle (E2): the run's story, read back as a closing saga.
    const chron = renderChronicle(state, 10);
    if (chron) panel.append(chron);

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
    "Click a region to open it full-screen: queue a building (it builds a little each End turn) and raise units.",
    "Armies are the numbered badges on the map — 3k means 3,000 soldiers; yours wear a gold ring.",
    "To move or attack: open your region → Move / Attack ▸ → click a highlighted neighbour.",
    "Research (R): pick a technology — your knowledge income advances it every End turn.",
    "Hover any map icon for a plain-language explanation; L opens the legend.",
    "End turn (Enter) advances the world; the report shows what changed.",
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
  // Latest player knowledge/turn, so the tech tree can show turns-to-complete.
  let lastKnowledgeFlow = 0;

  function openTechTree(): void {
    if (!lastPlayer) return;
    renderTechTree(techOverlay, lastPlayer, eraIndexForTurn(lastState?.turn ?? 1), lastKnowledgeFlow, callbacks, closeTechTree);
    techOverlay.style.display = "flex";
    techOverlay.scrollTop = 0;
    researchRail.btn.classList.add("active");
  }
  function closeTechTree(): void {
    techOverlay.style.display = "none";
    researchRail.btn.classList.remove("active");
  }
  /** The Research button / R key toggle the tree (it is the research page now). */
  function toggleTechTree(): void {
    if (techOverlay.style.display === "none") openTechTree();
    else closeTechTree();
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
  // The army currently picking a destination (Esc cancels the move).
  let lastMoveArmy: number | null = null;

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
    // The chronicle so far (E2): the run's story, readable mid-game.
    const chron = renderChronicle(lastState);
    if (chron) panel.append(chron);
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
  // The extra marker class lets the title menu raise this overlay above itself
  // with a plain descendant selector (no :has() — see title.ts).
  const optionsOverlay = el("div", "hud-techtree-overlay hud-overlay-options");
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

    // Language ---------------------------------------------------------------
    // The localisation scaffold (D5): pick the UI language. The HUD reads its
    // copy at build time, so a change reloads the app (the continuous autosave
    // resumes the game) to re-render every string in the new locale.
    panel.append(sectionHeading(t("options.language")));
    const langRow = el("label", "hud-opt-row");
    const langLabel = el("span", "hud-opt-label");
    langLabel.textContent = t("options.language");
    const langSel = document.createElement("select");
    langSel.className = "hud-select";
    for (const l of LOCALES) {
      const opt = document.createElement("option");
      opt.value = l.id;
      opt.textContent = l.label;
      if (l.id === getLocale()) opt.selected = true;
      langSel.append(opt);
    }
    langSel.addEventListener("change", () => {
      if (isLocale(langSel.value) && langSel.value !== getLocale()) {
        setLocale(langSel.value);
        location.reload();
      }
    });
    langRow.append(langLabel, langSel);
    panel.append(langRow);

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
    panel.append(
      checkboxRow(
        "Show combat report after a battle",
        isCombatReport,
        (v) => setCombatReport(v),
        "Replay each of your battles blow-by-blow — volley, melee rounds, and the outcome.",
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
  const recordsOverlay = el("div", "hud-techtree-overlay hud-overlay-records");
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
    // Starting a move or an attack needs the map — hand over and get out of
    // the way (the attack chooser is its own modal, so close this one first).
    renderRegion(
      body,
      lastState,
      regionScreenId,
      null,
      {
        ...callbacks,
        onBeginMove(armyId) {
          closeRegionScreen();
          callbacks.onBeginMove(armyId);
        },
      },
      (rid) => {
        closeRegionScreen();
        openAttack(rid);
      },
    );
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

  // --- Production overview (the realm's construction on one screen) ----------
  // One row per owned region: what it's building (bar + ETA) or an idle slot
  // with a quick-build picker. The idle count also badges the rail button and
  // feeds the end-turn advisor.
  const productionOverlay = el("div", "hud-techtree-overlay");
  productionOverlay.style.display = "none";
  productionOverlay.addEventListener("click", (ev) => {
    if (ev.target === productionOverlay) closeProduction();
  });
  root.append(productionOverlay);
  // Which idle region's build cards are expanded (persists across re-renders).
  let prodExpanded: number | null = null;

  function renderProduction(): void {
    if (!lastState) return;
    const state = lastState;
    productionOverlay.innerHTML = "";
    const panel = el("div", "hud-techtree-panel hud-production-panel");
    const head = el("div", "hud-techtree-head");
    const title = el("h2", "hud-techtree-title");
    title.textContent = "Production";
    head.append(title, closeButton(closeProduction));
    panel.append(head);

    const player = playerNation(state);
    const owned = state.regions.filter((r) => r.ownerId === PLAYER_ID);
    const summaryLine = el("p", "hud-hint hud-prod-summary");
    summaryLine.textContent =
      `Materials: ${fmt(player.stocks.materials)} in store · ` +
      `each project draws up to ${BUILD_RATE}/turn from that stockpile at End turn.`;
    panel.append(summaryLine);

    const list = el("div", "hud-prod-list");
    for (const region of owned) {
      const item = el("div", "hud-prod-item");
      const rowEl = el("div", "hud-prod-row");
      const name = btn(region.name, "hud-prod-name", () => {
        callbacks.onSelectRegion(region.id);
        closeProduction();
        openRegionScreen(region.id);
      });
      name.title = `Open ${region.name} full-screen.`;
      rowEl.append(name);

      const status = el("div", "hud-prod-status");
      if (region.construction) {
        const def = BUILDINGS[region.construction.building];
        const remaining = def.cost - region.construction.progress;
        const eta = Math.max(1, Math.ceil(remaining / BUILD_RATE));
        const label = el("span", "hud-prod-label");
        label.innerHTML = `${buildingIconHtml(region.construction.building, "")}${def.name} · ~${eta}t`;
        const bar = el("div", "hud-build-bar hud-prod-bar");
        const fill = el("div", "hud-build-fill");
        fill.style.width = `${(region.construction.progress / def.cost) * 100}%`;
        bar.append(fill);
        const cancel = btn("✕", "hud-prod-cancel", () => callbacks.onCancelConstruction(region.id));
        cancel.title = `Cancel ${def.name} (progress is lost).`;
        cancel.setAttribute("aria-label", `Cancel ${def.name}`);
        status.append(label, bar, cancel);
      } else {
        const options = buildOptions(state, region.id);
        if (options.length === 0) {
          const done = el("span", "hud-prod-label muted");
          done.textContent = "Fully built";
          status.append(done);
        } else {
          const idle = el("span", "hud-prod-idle");
          idle.textContent = "Idle";
          const expanded = prodExpanded === region.id;
          const choose = btn(expanded ? "Choose build ▴" : "Choose build ▾", "hud-prod-choose" + (expanded ? " open" : ""), () => {
            prodExpanded = expanded ? null : region.id;
            renderProduction();
          });
          status.append(idle, choose);
        }
      }
      rowEl.append(status);
      item.append(rowEl);

      // Expanded: the same build cards the region screen uses — icon, name,
      // cost and duration on gold-bordered buttons, no native dropdowns.
      if (prodExpanded === region.id && !region.construction) {
        const cards = el("div", "hud-build-menu hud-prod-cards");
        for (const id of buildOptions(state, region.id)) {
          const def = BUILDINGS[id];
          const eta = Math.max(1, Math.ceil(def.cost / BUILD_RATE));
          const card = document.createElement("button");
          card.className = "hud-build-btn";
          card.title = `${def.blurb}\n\nCosts ${def.cost} materials over ~${eta} turn${eta === 1 ? "" : "s"}.`;
          card.innerHTML =
            `<span class="hud-build-name">${buildingIconHtml(id, "")}${def.name}</span>` +
            `<span class="hud-build-cost">${def.cost}${resourceIconHtml("materials", "⛏")} · ${eta}t</span>`;
          card.addEventListener("click", () => {
            prodExpanded = null;
            callbacks.onQueueBuilding(region.id, id);
          });
          cards.append(card);
        }
        item.append(cards);
      }
      list.append(item);
    }
    panel.append(list);
    productionOverlay.append(panel);
  }
  function openProduction(): void {
    // Auto-expand when exactly one region is idle — one less click.
    if (lastState) {
      const idle = lastState.regions.filter((r) => regionCanStartBuild(lastState!, r.id));
      prodExpanded = idle.length === 1 ? idle[0]!.id : null;
    }
    renderProduction();
    productionOverlay.style.display = "flex";
  }
  function closeProduction(): void {
    productionOverlay.style.display = "none";
    productionOverlay.innerHTML = "";
  }

  // --- Armies overview (every stack, its strength, and a Move order) ---------
  const armiesOverlay = el("div", "hud-techtree-overlay");
  armiesOverlay.style.display = "none";
  armiesOverlay.addEventListener("click", (ev) => {
    if (ev.target === armiesOverlay) closeArmies();
  });
  root.append(armiesOverlay);
  // The muster picker's chosen region, kept across re-renders (raising re-renders
  // the overview) so it doesn't snap back to the capital after each regiment.
  let musterRegionId: number | null = null;

  function renderArmies(): void {
    if (!lastState) return;
    const state = lastState;
    armiesOverlay.innerHTML = "";
    const panel = el("div", "hud-techtree-panel hud-armies-panel");
    const head = el("div", "hud-techtree-head");
    const title = el("h2", "hud-techtree-title");
    title.textContent = "Armies";
    head.append(title, closeButton(closeArmies));
    panel.append(head);

    const mine = state.armies.filter((a) => a.ownerId === PLAYER_ID && armySize(a.units) > 0);
    const totalSoldiers = mine.reduce((s, a) => s + armySize(a.units), 0);
    const upkeep = totalUpkeep(state, PLAYER_ID);
    const summaryLine = el("p", "hud-hint hud-prod-summary");
    summaryLine.textContent =
      `${mine.length} arm${mine.length === 1 ? "y" : "ies"} · ${soldiersDisplay(totalSoldiers)} soldiers · ` +
      `upkeep ${fmt(upkeep)}g/turn. Moving onto your own army merges the stacks.`;
    panel.append(summaryLine);

    // Muster troops — raising a regiment, moved here from the region screen.
    // Pick one of your regions and raise (units gate on the region's tech /
    // strategic resource, exactly as before).
    const ownRegions = state.regions.filter((r) => r.ownerId === PLAYER_ID);
    if (ownRegions.length) {
      const muster = el("div", "hud-muster");
      const mhead = el("div", "hud-muster-head");
      mhead.append(regionSubhead("Muster troops"));
      const select = document.createElement("select");
      select.className = "hud-muster-region";
      for (const r of ownRegions) {
        const opt = document.createElement("option");
        opt.value = String(r.id);
        opt.textContent = r.name;
        select.append(opt);
      }
      // Remember the last-picked region; default to the capital, else the first.
      const cap = playerNation(state).capitalRegionId;
      const preferred =
        musterRegionId != null && ownRegions.some((r) => r.id === musterRegionId)
          ? musterRegionId
          : cap != null && ownRegions.some((r) => r.id === cap)
            ? cap
            : ownRegions[0]!.id;
      select.value = String(preferred);
      musterRegionId = preferred;
      mhead.append(select);
      muster.append(mhead);
      const menuWrap = el("div", "hud-muster-menu");
      const drawMenu = (): void => {
        menuWrap.innerHTML = "";
        const r = state.regions[Number(select.value)];
        if (r) menuWrap.append(raiseUnitMenu(state, r, callbacks));
      };
      select.addEventListener("change", () => {
        musterRegionId = Number(select.value);
        drawMenu();
      });
      drawMenu();
      muster.append(menuWrap);
      panel.append(muster);
    }

    if (mine.length === 0) {
      panel.append(line("No armies yet — muster your first regiment above, then move it from here.", "hud-hint"));
    }
    const list = el("div", "hud-prod-list");
    for (const army of mine) {
      const region = state.regions[army.regionId];
      if (!region) continue;
      const item = el("div", "hud-prod-item");
      const rowEl = el("div", "hud-prod-row");
      const name = btn(region.name, "hud-prod-name", () => {
        callbacks.onSelectRegion(region.id);
        closeArmies();
        openRegionScreen(region.id);
      });
      name.title = `Open ${region.name} full-screen.`;
      rowEl.append(name);

      const status = el("div", "hud-prod-status");
      status.append(compositionLine(army));
      const ready = army.movesLeft > 0;
      const pill = el("span", ready ? "hud-army-ready" : "hud-prod-label muted");
      pill.textContent = ready ? "Ready" : "Moved";
      pill.title = ready
        ? "This army can still act this turn."
        : "Out of moves — it acts again after End turn.";
      status.append(pill);
      const moveBtn = btn("Move ▸", "hud-army-move", () => {
        closeArmies();
        callbacks.onSelectRegion(region.id);
        callbacks.onBeginMove(army.id);
      });
      moveBtn.disabled = !ready;
      moveBtn.title = ready
        ? "Pick a destination on the map (highlighted regions)."
        : "No moves left this turn.";
      status.append(moveBtn);
      rowEl.append(status);
      item.append(rowEl);
      list.append(item);
    }
    panel.append(list);
    armiesOverlay.append(panel);
  }
  function openArmies(): void {
    renderArmies();
    armiesOverlay.style.display = "flex";
  }
  function closeArmies(): void {
    armiesOverlay.style.display = "none";
    armiesOverlay.innerHTML = "";
  }

  // --- Attack chooser: pick WHICH of your armies strikes a region ------------
  const attackOverlay = el("div", "hud-techtree-overlay");
  attackOverlay.style.display = "none";
  attackOverlay.addEventListener("click", (ev) => {
    if (ev.target === attackOverlay) closeAttack();
  });
  root.append(attackOverlay);

  /** The player's adjacent, ready armies that could strike `regionId`. */
  function eligibleAttackers(state: GameState, regionId: number): Army[] {
    return state.armies
      .filter(
        (a) =>
          a.ownerId === PLAYER_ID &&
          a.movesLeft > 0 &&
          armySize(a.units) > 0 &&
          state.regions[a.regionId]?.adjacency.includes(regionId),
      )
      .sort((a, b) => armySize(b.units) - armySize(a.units));
  }

  /** Open the attack flow for a region: 0 → nothing, 1 → strike, 2+ → chooser. */
  function openAttack(regionId: number): void {
    if (!lastState) return;
    const attackers = eligibleAttackers(lastState, regionId);
    if (attackers.length === 0) return;
    if (attackers.length === 1) {
      callbacks.onAttackWith(attackers[0]!.id, regionId);
      return;
    }
    renderAttack(regionId);
    attackOverlay.style.display = "flex";
  }
  function renderAttack(regionId: number): void {
    if (!lastState) return;
    const state = lastState;
    const target = state.regions[regionId];
    if (!target) return closeAttack();
    const attackers = eligibleAttackers(state, regionId);
    if (attackers.length <= 1) return closeAttack(); // a resolved fight emptied the list

    attackOverlay.innerHTML = "";
    const panel = el("div", "hud-techtree-panel hud-attack-panel");
    const head = el("div", "hud-techtree-head");
    const title = el("h2", "hud-techtree-title");
    title.textContent = `Attack ${target.name}`;
    head.append(title, closeButton(closeAttack));
    panel.append(head);

    const garrison = anyArmyAt(state, regionId);
    const defLine = el("p", "hud-hint hud-prod-summary");
    defLine.innerHTML = garrison
      ? `Defender: ${soldiersDisplay(armySize(garrison.units))} soldiers (${composition(garrison)}) · ` +
        `${glyphHtml("shield", "🛡")} ×${TERRAIN[target.terrain].defense}${target.fortification ? ` +fort ${target.fortification}` : ""}. ` +
        `Choose which army leads the assault.`
      : "Undefended — any army that walks in captures it. Choose which one.";
    panel.append(defLine);

    const list = el("div", "hud-prod-list");
    attackers.forEach((army, i) => {
      const from = state.regions[army.regionId];
      const preview = previewCombat(army.units, garrison?.units ?? emptyUnits(), {
        terrainDefense: TERRAIN[target.terrain].defense,
        fortification: target.fortification,
      });
      const row = el("div", "hud-prod-row");
      const name = el("div", "hud-attack-from");
      name.innerHTML =
        `<span class="hud-attack-fromname">${escapeHtml(from?.name ?? "Army")}</span>` +
        `<span class="hud-attack-comp">${soldiersDisplay(armySize(army.units))} — ${composition(army)}</span>`;
      row.append(name);
      const chipWrap = el("div", "hud-prod-status");
      const chip = el("span", "hud-odds-chip " + (preview.undefended ? "win" : oddsClass(preview.winChance)));
      chip.textContent = preview.undefended ? "capture" : `${Math.round(preview.winChance * 100)}%`;
      const go = btn(i === 0 ? "March ▸ (strongest)" : "March ▸", "hud-army-move", () => {
        callbacks.onAttackWith(army.id, regionId);
        closeAttack(); // the assault is ordered — it resolves when the army arrives
      });
      chipWrap.append(chip, go);
      row.append(chipWrap);
      // Long odds get a plain-language reason so a doomed assault isn't a mystery.
      if (!preview.undefended && preview.winChance < 0.4) {
        const warn = el("div", "hud-attack-warn");
        warn.innerHTML = `${glyphHtml("warning", "⚠")} ${escapeHtml(attackWarning(army, target))}`;
        row.append(warn);
      }
      list.append(row);
    });
    panel.append(list);
    attackOverlay.append(panel);
  }
  function closeAttack(): void {
    attackOverlay.style.display = "none";
    attackOverlay.innerHTML = "";
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

    // Battles this turn involving the player — each opens the full report.
    const battles = (state.battles ?? []).filter((b) => b.attackerIsPlayer || b.defenderIsPlayer);
    if (battles.length) {
      const box = el("div", "hud-report-alerts");
      box.append(heading("Battles"));
      for (const b of battles) {
        const you = b.attackerIsPlayer;
        const foe = you ? b.defenderName : b.attackerName;
        const won = you ? b.outcome === "captured" : b.outcome !== "captured";
        const row = btn("", "hud-battle-link " + (won ? "good" : "bad"), () => showBattleReport(b));
        row.innerHTML =
          `${glyphHtml("attack", "⚔")} ${escapeHtml(b.regionName)} — ` +
          `${you ? "you attacked" : "you defended against"} ${escapeHtml(foe)} · ` +
          `<b>${battleVerdict(b, you)}</b>`;
        box.append(row);
      }
      panel.append(box);
    }

    reportOverlay.append(panel);
    reportOverlay.style.display = "flex";
    cont.focus(); // Enter/Space continue immediately
  }

  // --- Combat report: a battle replayed blow-by-blow -------------------------
  const battleOverlay = el("div", "hud-techtree-overlay");
  battleOverlay.style.display = "none";
  battleOverlay.addEventListener("click", (ev) => {
    if (ev.target === battleOverlay) closeBattle();
  });
  root.append(battleOverlay);

  function forceLine(units: Record<UnitType, number>): string {
    const parts: string[] = [];
    for (const t of UNIT_TYPES) if (units[t] > 0) parts.push(`${unitIconHtml(t, UNITS[t].short + " ")}${soldiersCompact(units[t])}`);
    return parts.join(" ") || "—";
  }

  function showBattleReport(report: BattleReport): void {
    battleOverlay.innerHTML = "";
    const panel = el("div", "hud-techtree-panel hud-battle-panel");
    const head = el("div", "hud-techtree-head");
    const title = el("h2", "hud-techtree-title");
    title.textContent = `Battle of ${report.regionName}`;
    head.append(title, closeButton(closeBattle));
    panel.append(head);

    // Setting line: terrain, fort (and how far siege battered it down).
    const setting = el("p", "hud-hint hud-prod-summary");
    setting.innerHTML =
      `${escapeHtml(report.terrainName)} · ${glyphHtml("shield", "🛡")} defence ×${report.terrainDefense}` +
      (report.fortification > 0
        ? ` · fort ${report.fortification}${report.effectiveFort < report.fortification ? ` → ${report.effectiveFort} (siege)` : ""}`
        : "") +
      (report.defenderReinforcements
        ? ` · ${glyphHtml("shield", "🛡")} neighbours rallied +${soldiersDisplay(report.defenderReinforcements)}`
        : "");
    panel.append(setting);

    // The two forces, side by side.
    const forces = el("div", "hud-battle-forces");
    const side = (name: string, isYou: boolean, units: Record<UnitType, number>, role: string): HTMLElement => {
      const col = el("div", "hud-battle-side" + (isYou ? " you" : ""));
      const nm = el("div", "hud-battle-name");
      nm.textContent = `${role}: ${name}`;
      const comp = el("div", "hud-battle-comp");
      comp.innerHTML = `${forceLine(units)} <span class="muted">(${soldiersDisplay(sumUnits(units))})</span>`;
      col.append(nm, comp);
      return col;
    };
    forces.append(
      side(report.attackerName, report.attackerIsPlayer, report.attackerStart, "Attacker"),
      side(report.defenderName, report.defenderIsPlayer, report.defenderStart, "Defender"),
    );
    panel.append(forces);

    // Phase-by-phase casualties.
    const phases = el("div", "hud-battle-phases");
    for (const ph of report.phases) {
      const row = el("div", "hud-battle-phase");
      const label = el("div", "hud-battle-phase-label");
      label.textContent = ph.kind === "volley" ? "Volley" : `Round ${ph.round}`;
      const note = el("div", "hud-battle-phase-note");
      note.textContent = ph.note;
      const cas = el("div", "hud-battle-phase-cas");
      const a = sumUnits(ph.attackerLosses);
      const d = sumUnits(ph.defenderLosses);
      cas.innerHTML =
        `<span class="atk">−${soldiersCompact(a)}</span> / <span class="def">−${soldiersCompact(d)}</span>`;
      cas.title = "Attacker losses / defender losses this phase.";
      row.append(label, note, cas);
      phases.append(row);
    }
    panel.append(phases);

    // Outcome banner + casualty totals.
    const you = report.attackerIsPlayer;
    const won = you ? report.outcome === "captured" : report.outcome !== "captured";
    const banner = el("div", "hud-battle-outcome " + (won ? "win" : "lose"));
    banner.textContent = `${battleVerdict(report, you)} — ${report.decisive}`;
    panel.append(banner);

    const totals = el("p", "hud-hint hud-battle-totals");
    totals.innerHTML =
      `Losses — ${escapeHtml(report.attackerName)}: <b>${soldiersDisplay(sumUnits(report.attackerLosses))}</b>` +
      ` · ${escapeHtml(report.defenderName)}: <b>${soldiersDisplay(sumUnits(report.defenderLosses))}</b> soldiers.`;
    panel.append(totals);

    const btns = el("div", "hud-end-btns");
    const cont = btn("Close ▶", "hud-end-btn primary", closeBattle);
    btns.append(cont);
    panel.append(btns);

    battleOverlay.append(panel);
    battleOverlay.style.display = "flex";
    cont.focus();
  }
  function closeBattle(): void {
    battleOverlay.style.display = "none";
    battleOverlay.innerHTML = "";
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
      toggleScreen("diplo");
    } else if (key === "r") {
      ev.preventDefault();
      toggleTechTree();
    } else if (key === "n") {
      ev.preventDefault();
      toggleLog();
    } else if (key === "b") {
      ev.preventDefault();
      if (productionOverlay.style.display === "none") openProduction();
      else closeProduction();
    } else if (key === "a") {
      ev.preventDefault();
      if (armiesOverlay.style.display === "none") openArmies();
      else closeArmies();
    } else if (key === "p") {
      ev.preventDefault();
      if (politicsOverlay.style.display === "none") openPolitics();
      else closePolitics();
    } else if (key === "m") {
      ev.preventDefault();
      cycleLens();
    } else if (ev.key === "Escape") {
      if (lastMoveArmy !== null) callbacks.onCancelMove(); // abort picking a destination
      closeTechTree();
      closeStandings();
      closeOptions();
      closeRecords();
      closeGameMenu();
      closeTopMenu();
      closeTurnReport();
      closeRegionScreen();
      closeProduction();
      closeArmies();
      closeAttack();
      closeBattle();
      closePolitics();
      setScreen(null);
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
    // Inspecting a different region starts its panel at the top (the panel
    // element persists, so a previous region's scroll would otherwise linger).
    if (selectedRegionId !== lastSelected) rightPanel.scrollTop = 0;
    lastSelected = selectedRegionId;
    lastMoveArmy = moveArmyId;

    // Move-mode banner (what's moving, what to click, how to cancel).
    if (moveArmyId !== null) {
      const movingArmy = state.armies.find((a) => a.id === moveArmyId);
      const unitCount = movingArmy ? armySize(movingArmy.units) : 0;
      moveBanner.innerHTML = "";
      const txt = el("span", "hud-move-banner-text");
      txt.textContent = `Moving ${soldiersDisplay(unitCount)} soldiers — click a highlighted region to move or attack`;
      moveBanner.append(txt, btn("✕ Cancel", "hud-move-banner-cancel", () => callbacks.onCancelMove()));
      moveBanner.style.display = "flex";
    } else {
      moveBanner.style.display = "none";
    }

    // End-turn advisor: chips for whatever still wants orders, each a jump.
    const advice = state.outcome === "playing" ? deriveAdvice(state) : [];
    advisorBox.innerHTML = "";
    advisorBox.style.display = advice.length ? "flex" : "none";
    for (const item of advice) {
      const glyph =
        item.kind === "research"
          ? glyphHtml("book", "📖")
          : item.kind === "build"
            ? glyphHtml("hammer", "🔨")
            : glyphHtml("flag", "⚑");
      const chip = btn("", "hud-advice-chip " + item.kind, () => {
        if (item.kind === "research") openTechTree();
        else if (item.kind === "build") openProduction();
        else openArmies();
      });
      chip.innerHTML = `${glyph} ${escapeHtml(item.label)}`;
      chip.title =
        item.kind === "research"
          ? "Pick a technology — knowledge income is wasted without one."
          : item.kind === "build"
            ? "Open the production overview and put the idle slots to work."
            : "Open the armies overview — every stack that can still act.";
      advisorBox.append(chip);
    }

    // Production rail badge: how many regions sit idle.
    const idleBuilds = advice.find((a) => a.kind === "build")?.regionIds.length ?? 0;
    setBadge(productionRail.badge, idleBuilds);
    // Keep an open production overview live (queueing from it re-renders).
    if (productionOverlay.style.display !== "none") renderProduction();
    // Armies rail badge: stacks that can still act this turn.
    const readyArmies = state.armies.filter((a) => a.ownerId === PLAYER_ID && a.movesLeft > 0 && armySize(a.units) > 0).length;
    setBadge(armiesRail.badge, readyArmies);
    if (armiesOverlay.style.display !== "none") renderArmies();

    // National flow (knowledge feeds the research ETA below; gold/food/etc. the chips).
    const flow = nationalProduction(state, PLAYER_ID);
    const upkeep = totalUpkeep(state, PLAYER_ID);
    lastKnowledgeFlow = flow.knowledge;

    // Rail badges: offers awaiting your answer; a research choice waiting.
    setBadge(diploRail.badge, state.offers.filter((o) => o.to === PLAYER_ID).length);
    const mustChoose =
      !player.research.current && researchFrontier(player.research.done, eraIndexForTurn(state.turn)).length > 0;
    setBadge(researchRail.badge, mustChoose ? 1 : 0);
    researchRail.btn.classList.toggle("attention", mustChoose);
    // Keep an open tech tree in sync with the latest research state (it's now the
    // sole research page — opened straight from the Research button).
    if (techOverlay.style.display !== "none") {
      renderTechTree(techOverlay, player, eraIndexForTurn(state.turn), flow.knowledge, callbacks, closeTechTree);
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
    for (const key of RESOURCE_KEYS) {
      targetStock[key] = player.stocks[key];
      const f = key === "gold" ? round1(flow.gold - upkeep) : flow[key];
      resourceEls[key].flow.textContent = `${f >= 0 ? "+" : ""}${fmt(f)}/turn`;
      resourceEls[key].flow.classList.toggle("negative", f < 0);
    }
    syncStockDisplay(); // ease the displayed stock toward the new target (or snap)
    resourceEls.food.flow.classList.toggle("negative", player.famine || flow.food < 0);

    // Crisis chips — persistent while the condition holds, impossible to miss.
    const crises: string[] = [];
    if (player.famine) crises.push(`${glyphHtml("warning", "⚠")} FAMINE`);
    if (player.bankrupt) crises.push(`${glyphHtml("warning", "⚠")} BANKRUPT`);
    crisisEl.innerHTML = crises.join(" · ");
    crisisEl.style.display = crises.length ? "flex" : "none";
    crisisEl.title =
      "Famine: population starves and unrest climbs — fix your food flow. " +
      "Bankruptcy: the treasury ran dry and troops disband.";

    // The turn block: turn·year, then age · difficulty · trait, then any
    // active timed modifiers ("War-weariness ×2 (3)"). Seed stays in the
    // legend's World card.
    const era = eraForTurn(state.turn);
    turnMain.textContent = `Turn ${state.turn} · ${yearForTurn(state.turn)} AD`;
    turnSub.textContent =
      `${era.name} · ${state.difficulty}` + (player.trait ? ` · ${TRAITS[player.trait].label}` : "");
    const mods = (player.modifiers ?? []).filter((m) => m.turnsLeft > 0);
    turnMods.textContent = mods
      .map((m) => {
        const stacks = (m.stacks ?? 1) > 1 ? ` ×${m.stacks}` : "";
        return `${MODIFIER_LABEL[m.id]}${stacks} (${m.turnsLeft})`;
      })
      .join(" · ");
    turnMods.style.display = mods.length ? "block" : "none";
    turnBlock.title =
      `${era.blurb}\n\nDifficulty: ${state.difficulty} · seed ${state.seed}` +
      (player.trait ? `\n${TRAITS[player.trait].label} — ${TRAITS[player.trait].blurb}` : "") +
      (mods.length ? `\nActive effects: ${turnMods.textContent} — number in brackets = turns remaining.` : "");

    // Legend "This world" card: the game's identity facts, off the busy bar.
    legendWorld.innerHTML = "";
    const worldHead = el("div", "hud-legend-h");
    worldHead.textContent = "This world";
    legendWorld.append(worldHead);
    const worldRow = (label: string, value: string, tip?: string): void => {
      const r = el("div", "hud-legend-fact");
      const l = el("span", "hud-legend-fact-label");
      l.textContent = label;
      const v = el("span", "hud-legend-fact-value");
      v.textContent = value;
      if (tip) r.title = tip;
      r.append(l, v);
      legendWorld.append(r);
    };
    worldRow("Seed", String(state.seed), "The world seed — the same seed and settings rebuild this exact world.");
    worldRow("Difficulty", String(state.difficulty));
    worldRow("Regions", String(state.regions.length));
    worldRow("Age", `${era.name} · ${yearForTurn(state.turn)} AD`, era.blurb);
    if (player.trait) worldRow("Trait", TRAITS[player.trait].label, TRAITS[player.trait].blurb);
    worldRow("Build", `v${typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"}`);

    renderVictoryProgress(victoryEl, state);

    // Hints: auto on turn 1 of a live game until dismissed, or when reopened
    // via the Help button (hintsForced). Never over the end-game banner.
    const showTips =
      state.outcome === "playing" && (hintsForced || (!hintsDismissed && state.turn === 1));
    hints.style.display = showTips ? "block" : "none";

    taxInput.value = String(Math.round(player.taxRate * 100));
    taxLabel.textContent = `Tax ${Math.round(player.taxRate * 100)}%`;
    taxJump.innerHTML = `${glyphHtml("crown", "⚖")} Tax ${Math.round(player.taxRate * 100)}% · Politics ▸`;
    upkeepLine.textContent = `Army upkeep: ${fmt(upkeep)}g/turn.`;
    // The unrest side of the tax lever, with real numbers: the steady state
    // this policy drifts regions toward (before local calming effects).
    const ownedCount = state.regions.filter((r) => r.ownerId === PLAYER_ID).length;
    const unrestPull =
      UNREST_BASE +
      (player.taxRate / TAX_MAX) * UNREST_TAX_MAX +
      overexpansionUnrest(ownedCount) -
      techUnrestReduction(player.research.done);
    const pull = Math.max(0, Math.round(unrestPull * 10) / 10);
    taxUnrestLine.textContent = "";
    taxUnrestLine.append(document.createTextNode("Unrest pull: regions drift toward "));
    const pullVal = el("span", "hud-tax-unrest-val");
    pullVal.textContent = `~${fmt(pull)}`;
    pullVal.classList.add(pull >= UNREST_PENALTY_START ? "bad" : pull >= UNREST_PENALTY_START - 8 ? "warn" : "good");
    taxUnrestLine.append(pullVal, document.createTextNode(` (output suffers at ${UNREST_PENALTY_START}+).`));
    taxUnrestLine.title =
      `Every region drifts a few points per turn toward a target set by your policy:\n` +
      `base ${UNREST_BASE} + tax pressure ${fmt(Math.round((player.taxRate / TAX_MAX) * UNREST_TAX_MAX * 10) / 10)}` +
      ` + over-expansion ${fmt(overexpansionUnrest(ownedCount))}` +
      ` − tech calm ${fmt(techUnrestReduction(player.research.done))}.\n` +
      `Temples and stationed garrisons lower it further per region. ` +
      `At ${UNREST_PENALTY_START}+ a region's output suffers; at ${UNREST_REVOLT}+ it revolts.`;

    // The narrow right-side inspector is retired: clicking a region now opens the
    // full-screen region view (openRegionScreen) directly, so the panel stays hidden.
    rightPanel.style.display = "none";
    void regionBody;
    // Keep an open attack chooser live as the roster changes (a resolved
    // strike removes that army; a capture flips the region to yours).
    if (attackOverlay.style.display !== "none" && selectedRegionId !== null) {
      renderAttack(selectedRegionId);
    }
    renderDiplomacy(diploBody, state, callbacks);

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

  return { update, toast: flashToast, openOptions, openRecords, mapTip, openRegionScreen, showTurnReport, showBattleReport, minimapCanvas };
}

function renderRegion(
  container: HTMLElement,
  state: GameState,
  selectedRegionId: number | null,
  moveArmyId: number | null,
  callbacks: HudCallbacks,
  openAttack: (regionId: number) => void,
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
  // Population gets its own bar below; the meta line stays a terse identity strip.
  const bits = [
    escapeHtml(terrain.name),
    escapeHtml(ownerName),
  ];
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
  if (region.focus) bits.push(`${FOCUSES[region.focus].icon} ${escapeHtml(FOCUSES[region.focus].label)}`);
  // Faith — shown when it differs from the ruler (the telling cases: a province
  // occupied but not yet converted, or one whose people you've won to your faith).
  if (region.faith !== undefined && region.faith !== region.ownerId) {
    const holder = state.nations.find((n) => n.id === region.faith);
    const faithName = region.faith === PLAYER_ID ? "your faith" : `${escapeHtml(holder?.name ?? "pagan")}’s faith`;
    bits.push(`🛐 ${faithName}`);
  }
  meta.innerHTML = bits.join(" · ");
  container.append(title, meta);

  // At-a-glance stat row: defence, unrest state, garrison strength.
  const stats = el("div", "hud-region-stats");
  const defStat = el("span", "hud-region-stat");
  defStat.innerHTML = `${glyphHtml("shield", "🛡")} ×${terrain.defense}${region.fortification ? ` +fort ${region.fortification}` : ""}`;
  defStat.title = `Defence: terrain ×${terrain.defense}${region.fortification ? `, fortification level ${region.fortification} (siege strips it)` : ""}.`;
  const unrestStat = el("span", "hud-region-stat");
  unrestStat.append(unrestTag(region));
  unrestStat.title = `Unrest ${fmt(region.unrest)} — output suffers at ${UNREST_PENALTY_START}+, revolt at ${UNREST_REVOLT}+.`;
  const garrison = anyArmyAt(state, region.id);
  const garrisonStat = el("span", "hud-region-stat");
  garrisonStat.innerHTML = garrison
    ? `${glyphHtml("attack", "⚔")} ${soldiersCompact(armySize(garrison.units))}`
    : `${glyphHtml("attack", "⚔")} —`;
  garrisonStat.title = garrison
    ? `${soldiersDisplay(armySize(garrison.units))} soldiers garrison this region.`
    : "No garrison stationed here.";
  stats.append(defStat, unrestStat, garrisonStat);
  container.append(stats);

  // Population, its own bar — a legible read of "how full is this province?".
  container.append(populationBlock(region));

  if (owned) {
    renderOwnedRegion(container, state, region, moveArmyId, callbacks);
  } else {
    renderEnemyRegion(container, state, region, openAttack);
  }
}

/** Population vs. its sustainable cap, as a labelled bar (shown for any region). */
function populationBlock(region: Region): HTMLElement {
  const cap = regionCapacity(region);
  const frac = cap > 0 ? Math.min(1, region.population / cap) : 0;
  const wrap = el("div", "hud-popblock");
  wrap.title =
    `Population: ${popDisplay(region.population)} of a sustainable ${popDisplay(cap)}. ` +
    "A food surplus grows it toward the cap; farms, harbours and aqueducts raise the cap.";
  const label = el("div", "hud-popblock-label");
  label.innerHTML =
    `Population <span class="hud-popblock-val">${popDisplay(region.population)} / ${popDisplay(cap)}</span>`;
  const bar = el("div", "hud-popbar");
  const fill = el("div", "hud-popbar-fill");
  fill.style.width = `${Math.round(frac * 100)}%`;
  // Near the cap reads amber (growth stalling); comfortable headroom reads green.
  fill.style.background = frac >= 0.98 ? "#e0b74a" : "#6fae7f";
  bar.append(fill);
  wrap.append(label, bar);
  return wrap;
}

/**
 * The Trade section of a region panel: what the province exports, the routes it
 * already runs (income or a "severed" flag, each with a close button), and the
 * routes you could open to a demanding Kontor — one click each, richest first,
 * gated by your route-book cap. Reads/writes only through callbacks; the sim
 * (`routeOptions`, `createRoute`, `closeRoute`) is the source of truth.
 */
function tradeSection(state: GameState, region: Region, callbacks: HudCallbacks): HTMLElement {
  const wrap = el("div", "hud-region-trade");
  wrap.append(regionSubhead("Trade"));

  const sourced = regionGoodOutput(region);
  const exports = el("p", "hud-hint hud-trade-exports");
  exports.innerHTML = sourced.length
    ? "Exports " + sourced.map((s) => `${GOODS[s.good].glyph} ${escapeHtml(GOODS[s.good].name)}`).join(" · ")
    : "No goods to export — but its ports can still carry others’ trade.";
  wrap.append(exports);

  // Standing routes from this province.
  const routes = (state.routes ?? []).filter((r) => r.ownerId === region.ownerId && r.fromRegionId === region.id);
  for (const rt of routes) {
    const g = GOODS[rt.good];
    const k = KONTORE[rt.toKontorId];
    const row = el("div", "hud-trade-route");
    const label = el("span", "hud-trade-route-label");
    const worth = rt.disrupted
      ? `<span class="hud-trade-severed">severed</span>`
      : `<span class="hud-trade-income">+${fmt(rt.lastIncome ?? 0)}g</span>`;
    label.innerHTML = `${g.glyph} ${escapeHtml(g.name)} → ${escapeHtml(k.name)} ${worth}`;
    const close = btn("✕", "hud-trade-close", () => callbacks.onCloseRoute(rt.id));
    close.title = `Close this ${g.name} route to ${k.name}.`;
    close.setAttribute("aria-label", `Close ${g.name} route to ${k.name}`);
    row.append(label, close);
    wrap.append(row);
  }

  // Routes you could open (your land only).
  if (region.ownerId === PLAYER_ID) {
    const total = (state.routes ?? []).filter((r) => r.ownerId === PLAYER_ID).length;
    if (total >= MAX_ROUTES_PER_NATION) {
      const full = el("p", "hud-hint muted");
      full.textContent = `Your trade book is full (${total}/${MAX_ROUTES_PER_NATION}) — close a route to open another.`;
      wrap.append(full);
    } else {
      const opts = routeOptions(state, region.id, PLAYER_ID);
      if (opts.length) {
        const menu = el("div", "hud-trade-open");
        for (const o of opts) {
          const g = GOODS[o.good];
          const k = KONTORE[o.toKontorId];
          const b = btn("", "hud-trade-open-btn", () => callbacks.onOpenRoute(region.id, o.good, o.toKontorId));
          b.innerHTML =
            `<span class="hud-trade-open-name">${g.glyph} ${escapeHtml(g.name)} → ${escapeHtml(k.name)}</span>` +
            `<span class="hud-trade-open-inc">+${fmt(o.income)}g</span>`;
          b.title =
            `Ship ${g.name} to ${k.name} — about ${o.hops} stop${o.hops === 1 ? "" : "s"} away, ` +
            `paying ~${fmt(o.income)} gold a turn while the road stays open (a war astride the lane severs it).`;
          menu.append(b);
        }
        wrap.append(menu);
      } else if (sourced.length) {
        const none = el("p", "hud-hint muted");
        none.textContent = routes.length
          ? "Every Kontor that wants these goods is already served from here."
          : "No Kontor in reach demands these goods yet.";
        wrap.append(none);
      }
    }
  }
  return wrap;
}

/** A small uppercase divider inside the region panel ("Income / turn"). */
function regionSubhead(text: string): HTMLElement {
  const h = el("div", "hud-region-subhead");
  h.textContent = text;
  return h;
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

/**
 * Per-region income breakdown for a resource, sorted high→low. Uses the same
 * `regionProduction` the sim's flow does, so the hover tooltip can never drift
 * from the /turn figure on the chip. Pure.
 */
function resourceBreakdown(
  state: GameState,
  player: Nation,
  key: ResourceKey,
): { name: string; value: number }[] {
  const mult = nationYieldMult(player);
  return state.regions
    .filter((r) => r.ownerId === player.id)
    .map((r) => ({ name: r.name, value: regionProduction(r, player.taxRate, mult)[key] }))
    .sort((a, b) => b.value - a.value);
}

/**
 * The floating resource tooltip's HTML: a per-region income list (highest
 * first), and — for gold — the army-upkeep deduction and the net the chip
 * shows. Long empires collapse the tail into a "+N more" row so the tip never
 * overruns the screen.
 */
function resourceTipHtml(state: GameState, player: Nation, key: ResourceKey): string {
  const meta = RESOURCE_META[key];
  const rows = resourceBreakdown(state, player, key);
  const gross = round1(rows.reduce((s, r) => s + r.value, 0));
  const upkeep = key === "gold" ? round1(totalUpkeep(state, player.id)) : 0;
  const net = round1(gross - upkeep);
  const icon = resourceIconHtml(key, meta.icon);
  const MAX = 16;
  const shown = rows.slice(0, MAX);
  const rest = rows.slice(MAX);
  const rowHtml = (name: string, value: number, extraClass = ""): string =>
    `<div class="hud-restip-row ${extraClass}"><span class="hud-restip-name">${escapeHtml(name)}</span>` +
    `<span class="hud-restip-val${value < 0 ? " neg" : ""}">${fmt(value)}</span></div>`;
  let body = shown.map((r) => rowHtml(r.name, r.value)).join("");
  if (rest.length) {
    const more = round1(rest.reduce((s, r) => s + r.value, 0));
    body += rowHtml(`+${rest.length} more region${rest.length === 1 ? "" : "s"}`, more, "muted");
  }
  if (!rows.length) body = `<div class="hud-restip-row muted"><span class="hud-restip-name">No regions producing yet.</span></div>`;
  const upkeepBlock = key === "gold" ? rowHtml("Army upkeep", -upkeep, "hud-restip-upkeep") : "";
  const totalVal = key === "gold" ? net : gross;
  return (
    `<div class="hud-restip-head">${icon} ${escapeHtml(meta.label)} — income by region</div>` +
    `<div class="hud-restip-rows">${body}</div>` +
    upkeepBlock +
    `<div class="hud-restip-total"><span class="hud-restip-name">${key === "gold" ? "Net / turn" : "Total / turn"}</span>` +
    `<span class="hud-restip-val${totalVal < 0 ? " neg" : " pos"}">${totalVal >= 0 ? "+" : ""}${fmt(totalVal)}</span></div>`
  );
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

  // Two columns that fit one screen: the settlement's economy at a glance on the
  // left, and Construction — the heart of this screen — on the right. Army
  // management (raise / move / fortify) has moved to the Armies tab and Focus to
  // politics; this screen is now about what the town *produces* and *builds*.
  void moveArmyId; // army controls live in the Armies overview now
  const cols = el("div", "hud-capital-cols");
  const left = el("div", "hud-capital-col hud-capital-left");
  const right = el("div", "hud-capital-col hud-capital-right");

  // Income — compact icon chips (icon + per-turn value), one per resource.
  const income = el("div", "hud-income-card");
  income.append(regionSubhead("Income / turn"));
  const chips = el("div", "hud-income-chips");
  for (const key of RESOURCE_KEYS) {
    const value = flow[key];
    const chip = el("span", "hud-income-chip" + (value < 0 ? " negative" : ""));
    chip.innerHTML =
      `${resourceIconHtml(key, RESOURCE_META[key].icon)}` +
      `<span class="hud-income-v">${value >= 0 ? "+" : ""}${fmt(value)}</span>`;
    chip.title = flowTooltip(key, player, region);
    chips.append(chip);
  }
  income.append(chips);
  left.append(income);

  // Trade: exported goods (icon chips), standing routes and openable routes.
  left.append(tradeSection(state, region, callbacks));

  // Construction — the main event: current build, queue, and the build grid.
  right.append(renderBuildSection(region, playerNation(state).research.done, callbacks));

  cols.append(left, right);
  container.append(cols);
}

function renderEnemyRegion(
  container: HTMLElement,
  state: GameState,
  region: Region,
  openAttack: (regionId: number) => void,
): void {
  const garrison = anyArmyAt(state, region.id);
  const box = el("div", "hud-enemy");
  if (garrison && armySize(garrison.units) > 0) {
    box.append(line(`Enemy garrison: ${soldiersDisplay(armySize(garrison.units))} soldiers (${composition(garrison)})`));
    if (garrison.commander) {
      const c = garrison.commander;
      const rebel = garrison.ownerId === BARBARIAN_ID;
      box.append(
        htmlLine(
          `${glyphHtml("attack", "⚔")} ${rebel ? "Pretender" : "Led by"}: <b>${escapeHtml(commanderTitle(c))}</b> — martial ${c.martial}`,
          "hud-hint",
        ),
      );
    }
    if ((garrison.entrenchment ?? 0) > 0) {
      box.append(htmlLine(`${glyphHtml("shield", "🛡")} Dug in — entrenchment ${garrison.entrenchment}/${MAX_ENTRENCH}`, "hud-hint"));
    }
  } else {
    box.append(line("Undefended — an army walking in captures it."));
  }

  // Attack: your adjacent, ready armies that could strike here. One → the
  // button attacks with it (odds on the label); several → it opens a chooser
  // so YOU pick which army leads the assault (CK3-style).
  const attackers = state.armies
    .filter(
      (a) =>
        a.ownerId === PLAYER_ID &&
        a.movesLeft > 0 &&
        armySize(a.units) > 0 &&
        state.regions[a.regionId]?.adjacency.includes(region.id),
    )
    .sort((a, b) => armySize(b.units) - armySize(a.units));
  const attackBtn = document.createElement("button");
  attackBtn.className = "hud-attack-btn";
  if (attackers.length === 0) {
    attackBtn.innerHTML = `${glyphHtml("attack", "⚔")} Attack`;
    attackBtn.disabled = true;
    attackBtn.title = "No army of yours with moves left borders this region — march one next door first.";
  } else if (attackers.length === 1) {
    const preview = forecastCombat(attackers[0]!.units, garrison?.units ?? emptyUnits(), {
      terrainDefense: TERRAIN[region.terrain].defense,
      fortification: region.fortification + (garrison?.entrenchment ?? 0),
      attackerCommand: commanderAttack(attackers[0]!.commander),
      defenderCommand: commanderDefense(garrison?.commander),
    });
    const oddsText = preview.undefended ? "capture" : `${Math.round(preview.winChance * 100)}%`;
    attackBtn.innerHTML = `${glyphHtml("attack", "⚔")} Attack (${oddsText})`;
    const from = state.regions[attackers[0]!.regionId]?.name ?? "next door";
    attackBtn.title = preview.undefended
      ? `Strike with your ${soldiersDisplay(armySize(attackers[0]!.units))}-soldier army from ${from} — undefended, walking in captures it.`
      : `Strike with your ${soldiersDisplay(armySize(attackers[0]!.units))}-soldier army from ${from} — ${oddsText} to win.\n` +
        `Likely cost: you ~${soldiersDisplay(armySize(preview.attackerLosses))} (${lossBreakdown(preview.attackerLosses)}), them ~${soldiersDisplay(armySize(preview.defenderLosses))} (${lossBreakdown(preview.defenderLosses)}).`;
    attackBtn.addEventListener("click", () => openAttack(region.id));
  } else {
    attackBtn.innerHTML = `${glyphHtml("attack", "⚔")} Attack (${attackers.length} armies)`;
    attackBtn.title = `Choose which of your ${attackers.length} bordering armies leads the assault.`;
    attackBtn.addEventListener("click", () => openAttack(region.id));
  }
  box.append(attackBtn);
  box.append(
    line(
      "Or pick from the map: Armies (A) → Move ▸, then click this region.",
      "hud-hint",
    ),
  );
  container.append(box);
}

/**
 * The muster menu — one button per unit type, gated by tech and strategic
 * resource, with cost on the face. Strategic-resource gates surface right on the
 * buttons: a unit whose resource you lack says "needs ⚒/🐎" — whatever else also
 * blocks it — so the map's iron/horses markers stop being trivia. Shared by the
 * region panel (legacy) and the Armies overview's "Muster troops" picker.
 */
function raiseUnitMenu(state: GameState, region: Region, callbacks: HudCallbacks): HTMLElement {
  const access = strategicAccess(state, PLAYER_ID);
  const menu = el("div", "hud-unit-menu");
  for (const t of UNIT_TYPES) {
    const def = UNITS[t];
    const check = canRaiseUnit(state, region.id, t, PLAYER_ID);
    const btn = document.createElement("button");
    btn.className = "hud-unit-btn";
    btn.disabled = !check.ok;
    btn.title = check.ok
      ? `Raises a 1,000-strong ${def.name} regiment (deploys next turn). ` +
        `${def.attack} atk / ${def.defense} def · ${def.upkeep}g upkeep${def.requires ? ` · needs ${def.requires}` : ""}`
      : check.reason ?? "";
    const cost = unitCost(playerNation(state), t, region.focus); // Garrison focus discounts musters
    const resourceLocked = !!def.requires && !access.has(def.requires);
    const costHtml = resourceLocked
      ? `needs ${resourceIconHtml(def.requires!, def.requires === "iron" ? "⚒" : "🐎")}`
      : `${cost.gold}g ${cost.materials}${resourceIconHtml("materials", "⛏")}`;
    btn.innerHTML =
      `<span class="hud-unit-name">${unitIconHtml(t, "")}${def.short}</span>` +
      `<span class="hud-unit-cost">${costHtml}</span>`;
    if (resourceLocked) {
      btn.title =
        `${check.ok ? "" : `${check.reason ?? ""}\n`}` +
        `${def.name} needs ${def.requires} — conquer or settle any region bearing the ` +
        `${def.requires === "iron" ? "⚒ iron deposit" : "🐎 horses"} marker to unlock it.`;
    }
    if (check.ok) btn.addEventListener("click", () => callbacks.onRaiseUnit(region.id, t));
    menu.append(btn);
  }
  return menu;
}

/** Bucket a win chance into good / even / poor for colour-coding. */
function oddsClass(chance: number): string {
  if (chance >= 0.65) return "win";
  if (chance >= 0.4) return "even";
  return "lose";
}

/**
 * The most actionable reason an assault faces long odds — so a doomed attack
 * reads as a choice, not a mystery. Militia-as-a-defensive-levy first (the classic
 * trap), then soft-hitting armies, then walls and ground.
 */
function attackWarning(army: Army, target: Region): string {
  const total = armySize(army.units) || 1;
  if (army.units.militia / total >= 0.5) {
    return "Militia are a defensive levy — weak on the attack. Lead with Infantry or Ranged.";
  }
  let atk = 0;
  for (const t of UNIT_TYPES) atk += army.units[t] * UNITS[t].attack;
  if (atk / total < 4) return "Your troops hit softly attacking — bring Infantry, Ranged or Cavalry.";
  if (target.fortification >= 2) return "The walls favour the defender — bring Siege to batter them down.";
  if (TERRAIN[target.terrain].defense >= 1.2) return "The defender holds strong, high ground here.";
  return "The defender is simply the stronger force — mass more troops before you strike.";
}

/** Per-type casualty list in *soldiers* for a forecast tooltip, e.g. "500 Militia, 250 Ranged".
 *  Losses are tracked internally in abstract units; the forecast must speak the same
 *  soldier scale as the army strength beside it (1 unit = SOLDIERS_PER_UNIT men), or a
 *  wiped 750-soldier stack misreads as "3 lost". */
function lossBreakdown(losses: Record<UnitType, number>): string {
  const parts: string[] = [];
  for (const t of UNIT_TYPES) if (losses[t] > 0) parts.push(`${soldiersDisplay(losses[t])} ${UNITS[t].name}`);
  return parts.length ? parts.join(", ") : "no losses";
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

  const order = region.construction;
  if (order) {
    const def = BUILDINGS[order.building];
    const remaining = def.cost - order.progress;
    // Best-case pace: BUILD_RATE materials flow into a site per turn while the
    // stockpile lasts — so the estimate is a floor, not a promise.
    const eta = Math.max(1, Math.ceil(remaining / BUILD_RATE));
    const wrap = el("div", "hud-build-progress");
    wrap.append(
      line(
        `Building ${def.name} — ${fmt(order.progress)}/${def.cost} materials · ~${eta} turn${eta === 1 ? "" : "s"} left`,
        "hud-build-progress-label",
      ),
    );
    const bar = el("div", "hud-build-bar");
    const fill = el("div", "hud-build-fill");
    fill.style.width = `${(order.progress / def.cost) * 100}%`;
    bar.append(fill);
    const cancel = document.createElement("button");
    cancel.className = "hud-build-cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => callbacks.onCancelConstruction(region.id));
    wrap.append(bar, cancel);
    section.append(wrap);
    // The build queue that follows the current job (if any).
    if (region.buildQueue?.length) section.append(renderBuildQueue(region, callbacks));
  }

  const menu = el("div", "hud-build-menu");
  for (const id of BUILDING_IDS) {
    const def = BUILDINGS[id];
    // Terrain-bound buildings (Harbor) are hidden off-terrain, not shown locked —
    // a lock invites research, but no tech makes plains into coast.
    if (def.requiresTerrain && def.requiresTerrain !== region.terrain) continue;
    // Resource works (Stable, Bloomery) are likewise hidden where the region lacks
    // the strategic resource — no tech puts iron under a province that has none.
    if (!buildingResourceOk(region.resource, id)) continue;
    // Focus capstones are hidden unless the region carries the matching focus —
    // the capstone appears the moment you specialise the province (then tech-locks
    // like any other), so the menu stays uncluttered by the other four.
    if (!buildingFocusOk(region.focus, id)) continue;
    const already = region.buildings.includes(id);
    const isCurrent = order?.building === id;
    const isQueued = (region.buildQueue ?? []).includes(id);
    const unlocked = isBuildingUnlockedFor(done, id);
    const addable = !already && !isCurrent && !isQueued && unlocked;
    const btn = document.createElement("button");
    btn.className = "hud-build-btn";
    btn.disabled = !addable;
    const eta = Math.max(1, Math.ceil(def.cost / BUILD_RATE));
    btn.title = !unlocked
      ? `Locked — research ${def.requiresTech?.replace(/_/g, " ")}.`
      : addable
        ? `${def.blurb}\n\nCosts ${def.cost} materials over ~${eta} turn${eta === 1 ? "" : "s"} (up to ${BUILD_RATE}/turn). ${order ? "Adds to the build queue." : "Starts now."}`
        : def.blurb;
    const costLabel = already
      ? "built"
      : isCurrent
        ? "building…"
        : isQueued
          ? "queued"
          : !unlocked
            ? glyphHtml("lock", "🔒")
            : `${def.cost}${resourceIconHtml("materials", "⛏")} · ${eta}t`;
    btn.innerHTML =
      `<span class="hud-build-name">${buildingIconHtml(id, "")}${def.name}</span>` +
      `<span class="hud-build-cost">${costLabel}</span>`;
    if (addable) btn.addEventListener("click", () => callbacks.onQueueBuilding(region.id, id));
    menu.append(btn);
  }
  section.append(menu);
  section.append(
    line(
      order
        ? "Click a building to queue it after the current one — the queue builds in order."
        : "One project builds at a time; start one, then queue more to plan the province.",
      "hud-hint",
    ),
  );
  return section;
}

/** The ordered build queue beneath the current construction — each entry removable. */
function renderBuildQueue(region: Region, callbacks: HudCallbacks): HTMLElement {
  const queue = region.buildQueue ?? [];
  const wrap = el("div", "hud-build-queue");
  const head = el("div", "hud-build-queue-head");
  const title = el("span", "hud-build-queue-title");
  title.textContent = `Up next (${queue.length})`;
  const clear = document.createElement("button");
  clear.className = "hud-build-queue-clear";
  clear.textContent = "Clear";
  clear.title = "Empty the build queue (the current build keeps going).";
  clear.addEventListener("click", () => callbacks.onClearBuildQueue(region.id));
  head.append(title, clear);
  wrap.append(head);
  queue.forEach((id, i) => {
    const def = BUILDINGS[id];
    const row = el("div", "hud-build-queue-row");
    const name = el("span", "hud-build-queue-name");
    name.innerHTML = `<span class="hud-build-queue-ord">${i + 1}</span>${buildingIconHtml(id, "")}${escapeHtml(def.name)}`;
    const rm = document.createElement("button");
    rm.className = "hud-build-queue-rm";
    rm.textContent = "✕";
    rm.title = `Remove ${def.name} from the queue`;
    rm.addEventListener("click", () => callbacks.onRemoveQueuedBuilding(region.id, i));
    row.append(name, rm);
    wrap.append(row);
  });
  return wrap;
}

/**
 * Build the map-legend panel: a static key to the node/marker vocabulary the
 * canvas renderer draws (terrain fills, owner rings, population, unrest dots,
 * strategic-resource icons, construction, army badges, selection/target rings).
 * Colours mirror the renderer constants so the key matches the map exactly.
 */
function buildLegend(): HTMLElement {
  const panel = el("div", "hud-panel hud-legend");
  const head = el("div", "hud-drawer-head");
  head.append(
    heading("Map legend"),
    closeButton(() => {
      panel.style.display = "none";
    }),
  );
  panel.append(head);

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
  row('<span class="hud-legend-badge">3k</span>', "Army — soldier count (thousands) on the owner's colour; yours wears a gold ring");

  section("Territory");
  row(line("#d8a24a"), "Your realm — gold wash, the widest and brightest rim, named YOU");
  row(line("#5b8bd0"), "Rival realm — its colour wash + rim, named on the map");
  row(line("#9a5b53"), "Free tribes — independent holdings, faint brown wash, no rim");
  row('<span class="hud-legend-hatch"></span>', "Unclaimed land — darkened with hatching, free to take");
  row(line(WAR_EDGE_COLOR), "War front — a border between two nations at war");
  row(line(OCEAN.lane), "Sea lane — regions connected across water (armies may cross)");

  section("Selection");
  row(ring("#f4d27a"), "Selected region");
  row(ring("#63c7d6", true), "Move / attack target");

  return panel;
}

/**
 * Compact victory-progress readout for the top bar, phrased as progress toward
 * the goal so it makes sense from turn 1: whoever holds the most land is the
 * "leader", and their share is shown as % of the DOMINATION_FRACTION target
 * (everyone starts with a few regions, so the race never starts at zero).
 * The domination math mirrors `checkVictory` exactly. Flags a rival nearing it.
 */
function renderVictoryProgress(elm: HTMLElement, state: GameState): void {
  elm.innerHTML = "";
  const races = victoryRaces(state);
  elm.classList.toggle("threat", races.some((r) => r.alarm));

  for (const race of races) {
    const card = el("div", "hud-vrace" + (race.alarm ? " alarm" : ""));
    const head = el("div", "hud-vrace-head");
    const title = el("span", "hud-vrace-title");
    title.innerHTML = `${glyphHtml("victory", "🏆")} ${escapeHtml(race.title)}`;
    const goal = el("span", "hud-vrace-goal");
    goal.textContent = race.goal;
    head.append(title, goal);
    card.append(head);

    // Your progress bar.
    card.append(vraceBar("You", race.you.value, race.you.fraction, true));
    // The leading rival's, if any.
    if (race.rival) {
      card.append(vraceBar(race.rival.name, race.rival.value, race.rival.fraction, false));
    }
    if (race.alarm && race.rival) {
      const warn = el("p", "hud-vrace-warn");
      warn.innerHTML = `${glyphHtml("warning", "⚠")} ${escapeHtml(race.rival.name)} is closing on this victory.`;
      card.append(warn);
    }
    elm.append(card);
  }
}

/** One labelled progress bar inside a victory race (you = accent, rival = red). */
function vraceBar(name: string, value: string, fraction: number, isYou: boolean): HTMLElement {
  const row = el("div", "hud-vrace-row" + (isYou ? " you" : ""));
  const lab = el("span", "hud-vrace-name");
  lab.textContent = name;
  const bar = el("div", "hud-vrace-bar");
  const fill = el("div", "hud-vrace-fill");
  fill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
  bar.append(fill);
  const val = el("span", "hud-vrace-val");
  val.textContent = value;
  row.append(lab, bar, val);
  return row;
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

/**
 * The chronicle as a list of dated story beats (E2). Returns null when empty.
 * `limit` caps how many of the most recent beats to show (0 = all), with a note
 * counting the earlier ones.
 */
function renderChronicle(state: GameState, limit = 0): HTMLElement | null {
  const entries = state.chronicle ?? [];
  if (entries.length === 0) return null;
  const box = el("div", "hud-chronicle");
  box.append(heading("Chronicle"));
  if (limit > 0 && entries.length > limit) {
    box.append(line(`…and ${entries.length - limit} earlier beats.`, "hud-hint"));
  }
  const list = el("div", "hud-chronicle-list");
  const shown = limit > 0 ? entries.slice(-limit) : entries;
  for (const e of shown) {
    const row = el("div", `hud-chronicle-row kind-${e.kind}`);
    const t = el("span", "hud-chronicle-turn");
    t.textContent = `T${e.turn}`;
    const txt = el("span", "hud-chronicle-text");
    txt.textContent = e.text;
    row.append(t, txt);
    list.append(row);
  }
  box.append(list);
  return box;
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
    // Speak as the ruler (E1): "Visvaldis the Cruel · Lithuania".
    nm.textContent = rival.ruler ? `${rulerTitle(rival.ruler)} · ${rival.name}` : rival.name;
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

    // Foreign relations — who this rival stands with or against (the board is a
    // political map, not just you-vs-each).
    const fr = foreignRelations(state, rival.id);
    const nameOf = (id: number): string => escapeHtml(state.nations.find((n) => n.id === id)?.name ?? "?");
    if (fr.wars.length || fr.allies.length || fr.naps.length) {
      const frRow = el("div", "hud-diplo-foreign");
      const parts: string[] = [];
      if (fr.wars.length) parts.push(`${glyphHtml("attack", "⚔")} at war with ${fr.wars.map(nameOf).join(", ")}`);
      if (fr.allies.length) parts.push(`${glyphHtml("flag", "⚑")} allied with ${fr.allies.map(nameOf).join(", ")}`);
      if (fr.naps.length) parts.push(`NAP: ${fr.naps.map(nameOf).join(", ")}`);
      frRow.innerHTML = parts.join(" · ");
      card.append(frRow);
    }

    // Why they feel this way — the opinion breakdown: recent dated dealings and
    // the ongoing standing pulls (border friction, shared enemies, a pact).
    const reasons = opinionReasons(state, PLAYER_ID, rival.id);
    if (reasons.length) {
      const why = document.createElement("details");
      why.className = "hud-diplo-why";
      const sum = document.createElement("summary");
      sum.className = "hud-diplo-why-summary";
      sum.textContent = `Why ${rival.name} feels this way`;
      why.append(sum);
      const list = el("div", "hud-diplo-why-list");
      for (const r of reasons) {
        const row = el("div", "hud-diplo-why-row");
        const lab = el("span", "hud-diplo-why-label");
        lab.textContent = r.kind === "event" && r.turn ? `${r.label} (turn ${r.turn})` : r.label;
        const val = el("span", "hud-diplo-why-val " + (r.delta >= 0 ? "good" : "bad"));
        val.textContent = `${r.delta > 0 ? "+" : ""}${r.delta}${r.kind === "standing" && !r.level ? "/turn" : ""}`;
        row.append(lab, val);
        list.append(row);
      }
      why.append(list);
      card.append(why);
    }

    const actions = el("div", "hud-diplo-actions");
    if (treaty === "war") {
      actions.append(btn("Sue for peace", "hud-diplo-btn", () => callbacks.onMakePeace(rival.id)));
    } else {
      actions.append(
        btn("Declare war", "hud-diplo-btn war", () => {
          const cb = CASUS_BELLI[casusBelli(state, PLAYER_ID, rival.id)];
          const justification = cb.justified
            ? `You have a just cause — ${cb.label.toLowerCase()} — so other realms won't hold this war against you.`
            : `You have no just cause (${cb.label.toLowerCase()}): every other realm's opinion of you will sour.`;
          void confirmAction({
            title: `Declare war on ${rival.name}?`,
            body: `War severs any trade route and treaty between you, and can't be called off this turn. ${justification}`,
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

const TECH_BRANCHES: TechBranch[] = ["economy", "military", "civics", "wonders"];

/**
 * The tech tree — the sole research page (opened straight from the Research
 * button). Leads with the live research status: the current study's progress
 * bar and its turns-to-complete (cost remaining ÷ knowledge income), or a
 * prompt to pick when none is set. Then every tech laid out by branch (row) ×
 * tier, each node tagged done / in-progress / available / age-locked / locked
 * and — for the ones you could study now — its ETA in turns. Clicking an
 * available node sets research (the page stays open so its bar starts filling).
 * Read-only otherwise.
 */
function renderTechTree(
  container: HTMLElement,
  player: Nation,
  era: number,
  knowledgeFlow: number,
  callbacks: HudCallbacks,
  onClose: () => void,
): void {
  container.innerHTML = "";
  const research = player.research;
  const done = new Set(research.done);
  const current = research.current;
  const total = Object.keys(TECHS).length;

  // Turns to finish a tech at the current knowledge income (null = no income → stalled).
  const etaTurns = (cost: number, progress = 0): number | null =>
    knowledgeFlow > 0 ? Math.max(1, Math.ceil((cost - progress) / knowledgeFlow)) : null;

  const panel = el("div", "hud-techtree-panel");
  const head = el("div", "hud-techtree-head");
  const ttTitle = el("h2", "hud-techtree-title");
  ttTitle.textContent = "Research — Technology tree";
  head.append(ttTitle, closeButton(onClose));
  panel.append(head);

  // --- Live research status: what's studying now and how long it has left ----
  const frontier = researchFrontier(research.done, era);
  const mustChoose = !current && frontier.length > 0;
  const status = el("div", "hud-research-status" + (mustChoose ? " choose" : ""));
  if (current) {
    const def = TECHS[current];
    const pct = Math.min(100, (research.progress / def.cost) * 100);
    // Progress can overshoot the cost mid-turn (completion lands at resolve).
    const shown = Math.min(Math.floor(research.progress), def.cost);
    const eta = etaTurns(def.cost, research.progress);
    const l = el("div", "hud-research-status-line");
    l.innerHTML =
      `<span class="hud-research-status-label">Researching</span>` +
      `<span class="hud-research-status-tech">${resourceIconHtml("knowledge", "📖")} ${escapeHtml(def.name)}</span>` +
      `<span class="hud-research-status-eta">${shown}/${def.cost} · ` +
      (eta !== null ? `~${eta} turn${eta === 1 ? "" : "s"} left` : "stalled — no knowledge income") +
      `</span>`;
    const bar = el("div", "hud-research-bar");
    const fill = el("div", "hud-research-fill");
    fill.style.width = `${pct}%`;
    fill.style.background = BRANCH_COLOR[def.branch];
    bar.append(fill);
    status.append(l, bar);
    status.title =
      eta !== null
        ? `Your ${fmt(knowledgeFlow)} knowledge/turn flows into this technology each End turn.`
        : "No knowledge income — build Libraries or work hills/mountains to research at all.";
  } else {
    const l = el("div", "hud-research-status-line");
    l.innerHTML = mustChoose
      ? `<span class="hud-research-status-tech">${glyphHtml("book", "📖")} Pick a technology below — knowledge income is wasted without one.</span>`
      : `<span class="hud-research-status-tech">${resourceIconHtml("knowledge", "📖")} All technologies researched.</span>`;
    status.append(l);
  }
  const counts = el("span", "hud-research-status-counts");
  counts.textContent = `${done.size}/${total} techs · ${player.wonders}/${WONDER_GOAL} wonders · +${fmt(knowledgeFlow)} 📖/turn`;
  status.append(counts);
  panel.append(status);

  // Recommended next pick — the cheapest available tech in the realm's branch.
  const recBranch: TechBranch =
    player.trait === "martial" ? "military" : player.trait === "scholarly" ? "civics" : "economy";
  const rec = recommendedTech(research.done, era, recBranch);

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
      const ageReached = def.era <= era;
      const available = !isDone && !isCurrent && unlocked && ageReached;
      // A tech of a future age reads as age-locked (whether or not its prereqs
      // are met), so the whole tree is legible by age at a glance.
      const ageLocked = !isDone && !isCurrent && !ageReached;
      const isRec = available && id === rec;
      const state = isDone ? "done" : isCurrent ? "current" : available ? "available" : ageLocked ? "agelocked" : "locked";

      const node = el("div", "hud-tt-node " + state + (isRec ? " recommended" : ""));
      node.style.borderColor = BRANCH_COLOR[branch];
      const missing = def.requires.filter((r) => !done.has(r)).map((r) => TECHS[r].name);
      // Turns-to-complete shown for the current study (remaining) and anything
      // you could pick right now, so cost reads as time, not just a raw number.
      const eta = isCurrent ? etaTurns(def.cost, research.progress) : available ? etaTurns(def.cost) : null;
      node.title =
        def.blurb +
        (eta !== null ? ` — ~${eta} turn${eta === 1 ? "" : "s"} at your current knowledge income` : "") +
        (missing.length ? ` (needs ${missing.join(", ")})` : "") +
        (ageLocked ? ` — awaits the ${eraByIndex(def.era).name}` : "") +
        (isRec ? " — recommended for your realm." : "");
      node.innerHTML =
        `<span class="hud-tt-name">${isDone ? "✓ " : ""}${ageLocked ? "🔒 " : ""}${escapeHtml(def.name)}${isRec ? ' <span class="hud-tt-rec">★</span>' : ""}</span>` +
        `<span class="hud-tt-meta">${eraByIndex(def.era).name.replace("Age of ", "")} · ${def.cost}${resourceIconHtml("knowledge", "📖")}${eta !== null ? ` · ~${eta}t` : ""} · ${iconHtml(BRANCH_ART[def.branch], "")}</span>`;
      if (available) {
        // Selecting keeps the page open so its progress bar starts filling in.
        node.addEventListener("click", () => callbacks.onChooseResearch(id));
      }
      track.append(node);
    }
    row.append(track);
    grid.append(row);
  }
  panel.append(grid);
  panel.append(
    line(
      "✓ researched · glowing = in progress · ★ recommended · bright = available (~Nt = turns to complete) · 🔒 = awaits its age · dim = locked",
      "hud-techtree-legend",
    ),
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
  for (const t of UNIT_TYPES) if (army.units[t] > 0) parts.push(`${soldiersCompact(army.units[t])} ${UNITS[t].short}`);
  return parts.join(", ") || "—";
}

/** Total regiments across all unit types in a loss/composition record. */
function sumUnits(units: Record<UnitType, number>): number {
  let s = 0;
  for (const t of UNIT_TYPES) s += units[t];
  return s;
}

/**
 * One-line battle verdict from the viewer's seat. `youAttacked` marks which
 * side the player was on, so a held region reads as a win for the defender and
 * a stalled assault for the attacker.
 */
function battleVerdict(report: BattleReport, youAttacked: boolean): string {
  if (youAttacked) {
    return report.outcome === "captured"
      ? "Victory — region taken"
      : report.outcome === "repelled"
        ? "Defeat — army destroyed"
        : "Repulsed — the assault stalled";
  }
  return report.outcome === "captured"
    ? "Defeat — region lost"
    : report.outcome === "repelled"
      ? "Victory — attackers destroyed"
      : "Held — the line stood";
}

/** The army line with unit icons: "3,000 soldiers — [⚒]2k [🗡]1k". Text fallback intact. */
function compositionLine(army: Army): HTMLElement {
  const p = el("p", "hud-army-comp");
  p.append(document.createTextNode(`${soldiersDisplay(armySize(army.units))} soldiers — `));
  let any = false;
  for (const t of UNIT_TYPES) {
    if (army.units[t] <= 0) continue;
    any = true;
    const chip = el("span", "hud-comp-chip");
    chip.title = `${UNITS[t].name} — ${soldiersDisplay(army.units[t])} soldiers`;
    chip.innerHTML = `${unitIconHtml(t, UNITS[t].short + " ")}${soldiersCompact(army.units[t])}`;
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

/** Like `line`, but the content is trusted HTML (glyphs, <b>) rather than text. */
function htmlLine(html: string, className = ""): HTMLElement {
  const p = el("p", className || "hud-line");
  p.innerHTML = html;
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

