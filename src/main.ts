import { createRenderer } from "@/systems/renderer";
import {
  createGame,
  resolveTurn,
  setTaxRate,
  enqueueBuilding,
  removeQueuedBuilding,
  clearBuildQueue,
  cancelConstruction,
  setRegionFocus,
  chooseResearch,
  queueResearch,
  clearResearchQueue,
} from "@/systems/turn";
import { raiseUnit, moveArmy, moveDetachment, disbandUnits, fortifyArmy, appointCommander, reachableRegions } from "@/systems/military";
import {
  declareWar,
  playerPropose,
  callToArms,
  gift,
  playerDemandTribute,
  acceptOffer,
  rejectOffer,
} from "@/systems/diplomacy";
import { resolveChoice } from "@/systems/events";
import { saveToLocal, loadFromLocal, hasLocalSave, clearLocalSave, serializeGame, deserializeGame } from "@/systems/save";
import { summarizeTurn, type TurnSummary } from "@/systems/summary";
import { PLAYER_ID, type GameState } from "@/systems/state";
import { createHud } from "@/ui/hud";
import { showMainMenu } from "@/ui/title";
import { runTutorial, hasSeenTutorial } from "@/ui/tutorial";
import { play, outcomeCue, armAmbientOnGesture } from "@/ui/audio";
import { applyDisplaySettings, isColourblind, isReduceMotion, isCombatReport } from "@/ui/settings";
import { lensColorsFor, type LensId } from "@/ui/lenses";
import { recordGameEnd } from "@/ui/profile";
import { ACHIEVEMENTS } from "@/data/achievements";
import "@/ui/style.css";

/**
 * Application entry point.
 *
 * Wires the three layers together: the pure sim (GameState + turn pipeline,
 * military and diplomacy intents), the canvas renderer (region graph + armies),
 * and the DOM HUD (reads state, emits intents). `state` is the single source of
 * truth; every intent produces a new GameState and re-syncs the view. The game
 * autosaves to localStorage each change and can be reloaded.
 */
function main(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
  const hudRoot = document.querySelector<HTMLElement>("#hud");
  if (!canvas) throw new Error("Canvas element #game-canvas not found");
  if (!hudRoot) throw new Error("HUD element #hud not found");

  // Resume the last autosave if one exists, otherwise start a fresh game.
  let state: GameState = (hasLocalSave("auto") && loadFromLocal("auto")) || createGame({ seed: 12345 });
  let selectedRegion: number | null = null;
  let moveArmyId: number | null = null;
  let lastSummary: TurnSummary | null = null;
  let activeLens: LensId = "none";

  // First-ever session: the coached tour is the primary onboarding, so retire the
  // legacy first-run hints box (still on 💡 Help) *before* the HUD reads the flag.
  // Reflect persisted accessibility prefs onto the document root before first paint.
  applyDisplaySettings();

  const firstEver = !hasSeenTutorial();
  if (firstEver) {
    try {
      localStorage.setItem("gaime2:hintsSeen", "1");
    } catch {
      /* storage unavailable */
    }
  }

  const renderer = createRenderer(canvas);
  renderer.setColourblind(isColourblind()); // honour the saved palette preference at boot
  renderer.setReduceMotion(isReduceMotion()); // honour the saved motion preference at boot
  const hud = createHud(hudRoot, {
    onTaxChange(rate) {
      state = setTaxRate(state, rate);
      commit();
    },
    onEndTurn() {
      advanceTurn();
    },
    onNewGame(config) {
      startNewGame(config);
    },
    onSave(slot) {
      const ok = saveToLocal(state, nowStamp(), slot);
      hud.toast(ok ? `Saved to ${slotLabel(slot)}.` : "Save failed (storage unavailable).");
    },
    onLoad(slot) {
      const loaded = loadFromLocal(slot);
      if (loaded) {
        state = loaded;
        selectedRegion = null;
        moveArmyId = null;
        lastSummary = null;
        commit(); // make the restored checkpoint the live autosave too
        hud.toast(`Loaded ${slotLabel(slot)}.`);
      } else {
        hud.toast(`${slotLabel(slot)} is empty.`);
      }
    },
    onClearSlot(slot) {
      const cleared = clearLocalSave(slot);
      hud.toast(cleared ? `Cleared ${slotLabel(slot)}.` : `${slotLabel(slot)} is already empty.`);
    },
    onExport() {
      downloadText(`gaime2-turn${state.turn}-seed${state.seed}.json`, serializeGame(state, nowStamp()));
      hud.toast("Save exported to file.");
    },
    onImport(json) {
      const loaded = deserializeGame(json);
      if (loaded) {
        state = loaded;
        selectedRegion = null;
        moveArmyId = null;
        lastSummary = null;
        commit(); // adopt the imported game as the live autosave
        hud.toast(`Imported game — turn ${state.turn}.`);
      } else {
        hud.toast("Import failed — not a valid Petty Kingdoms save.");
      }
    },
    onQueueBuilding(regionId, building) {
      // Start it now if the slot is idle, else append to the region's build queue.
      state = enqueueBuilding(state, regionId, building);
      play("build");
      commit();
    },
    onRemoveQueuedBuilding(regionId, index) {
      state = removeQueuedBuilding(state, regionId, index);
      commit();
    },
    onClearBuildQueue(regionId) {
      state = clearBuildQueue(state, regionId);
      commit();
    },
    onCancelConstruction(regionId) {
      state = cancelConstruction(state, regionId);
      commit();
    },
    onSetFocus(regionId, focus) {
      state = setRegionFocus(state, regionId, focus);
      commit();
    },
    onRaiseUnit(regionId, unit) {
      state = raiseUnit(state, regionId, unit);
      play("build");
      commit();
    },
    onBeginMove(armyId) {
      moveArmyId = armyId;
      sync();
    },
    onCancelMove() {
      moveArmyId = null;
      sync();
    },
    onAttackWith(armyId, regionId) {
      // Attack a region with the army the player chose (same sim path as the
      // map move/attack flow). Guarded to a real, adjacent, ready army.
      const army = state.armies.find(
        (a) =>
          a.id === armyId &&
          a.ownerId === PLAYER_ID &&
          a.movesLeft > 0 &&
          state.regions[a.regionId]?.adjacency.includes(regionId),
      );
      if (!army) return;
      const before = state;
      const battlesBefore = before.battles?.length ?? 0;
      state = moveArmy(state, army.id, regionId);
      const moved = state.armies.find((a) => a.id === army.id);
      // Stay on the fight's outcome region: the captured target, or the army's
      // spot if it was repelled.
      selectedRegion = state.regions[regionId]?.ownerId === PLAYER_ID ? regionId : (moved?.regionId ?? regionId);
      moveArmyId = null;
      commit();
      for (const after of state.regions) {
        if (before.regions[after.id]?.ownerId !== after.ownerId) renderer.pulseCapture(after.id);
      }
      maybeShowBattle(battlesBefore);
    },
    onMoveDetachment(armyId, targetRegionId, subset) {
      state = moveDetachment(state, armyId, targetRegionId, subset);
      commit();
    },
    onDisbandUnits(armyId, subset) {
      state = disbandUnits(state, armyId, subset);
      commit();
    },
    onFortifyArmy(armyId) {
      state = fortifyArmy(state, armyId);
      commit();
    },
    onAppointCommander(armyId) {
      state = appointCommander(state, armyId);
      commit();
    },
    onDeclareWar(targetId) {
      state = declareWar(state, PLAYER_ID, targetId);
      commit();
    },
    onMakePeace(targetId) {
      state = playerPropose(state, targetId, "peace");
      commit();
    },
    onProposePact(targetId, kind) {
      state = playerPropose(state, targetId, kind);
      commit();
    },
    onProposeTrade(targetId) {
      state = playerPropose(state, targetId, "trade");
      commit();
    },
    onCallToArms(allyId, enemyId) {
      state = callToArms(state, PLAYER_ID, allyId, enemyId);
      commit();
    },
    onGift(targetId, amount) {
      state = gift(state, PLAYER_ID, targetId, amount);
      commit();
    },
    onDemandTribute(targetId) {
      state = playerDemandTribute(state, targetId);
      commit();
    },
    onAcceptOffer(offerId) {
      state = acceptOffer(state, offerId);
      commit();
    },
    onRejectOffer(offerId) {
      state = rejectOffer(state, offerId);
      commit();
    },
    onSelectRegion(regionId) {
      selectedRegion = regionId;
      moveArmyId = null;
      sync();
    },
    onChooseResearch(tech) {
      state = chooseResearch(state, tech);
      commit();
    },
    onQueueResearch(tech) {
      state = queueResearch(state, tech);
      commit();
    },
    onClearResearchQueue() {
      state = clearResearchQueue(state);
      commit();
    },
    onResolveChoice(optionId) {
      state = resolveChoice(state, optionId);
      commit();
    },
    onZoomIn() {
      renderer.zoomBy(1.3);
    },
    onZoomOut() {
      renderer.zoomBy(1 / 1.3);
    },
    onResetView() {
      renderer.resetView();
    },
    onSetColourblind(on) {
      renderer.setColourblind(on);
      sync(); // repaint HUD swatches immediately (canvas repaints each frame)
    },
    onSetReduceMotion(on) {
      renderer.setReduceMotion(on);
    },
    onLensChange(lens) {
      activeLens = lens;
      refreshLens();
    },
  });

  // Map-marker hovers (shield, crest, pop chip…) surface as a HUD tooltip.
  renderer.onMarkerHover((tip) => hud.mapTip(tip));

  renderer.onRegionClick((regionId) => {
    if (moveArmyId !== null && regionId !== null) {
      const army = state.armies.find((a) => a.id === moveArmyId);
      if (army && reachableRegions(state, army).includes(regionId)) {
        const battlesBefore = state.battles?.length ?? 0;
        state = moveArmy(state, moveArmyId, regionId);
        const moved = state.armies.find((a) => a.id === moveArmyId);
        selectedRegion = moved ? moved.regionId : regionId;
        moveArmyId = moved && moved.movesLeft > 0 ? moved.id : null;
        commit();
        maybeShowBattle(battlesBefore);
        return;
      }
    }
    selectedRegion = regionId;
    moveArmyId = null;
    sync();
    // A plain map click inspects the region in the right-side panel (the map
    // stays visible for the next move); ⛶ or the Capital button open the
    // full-size screen when more room is wanted. Ocean clicks just deselect.
  });

  // Keyboard: Enter / Space ends the turn (unless typing in an input, or a modal
  // is open — the confirm dialog, tutorial, tech tree, standings and event-choice
  // panels own Enter while up, so ending the turn behind them would be a footgun).
  // Capture phase: evaluate the modal guard *before* a modal's own bubble-phase
  // key handler can remove itself from the DOM (the confirm dialog closes on Enter),
  // which would otherwise let the turn advance behind the just-closed modal.
  window.addEventListener(
    "keydown",
    (ev) => {
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT")) return;
      if (modalOpen()) return;
      if ((ev.key === "Enter" || ev.key === " ") && state.outcome === "playing") {
        ev.preventDefault();
        advanceTurn();
      }
    },
    true,
  );

  /** Replace the live game with a fresh one (HUD panel and main menu both land here). */
  function startNewGame(config: Parameters<typeof createGame>[0]): void {
    state = createGame(config);
    selectedRegion = null;
    moveArmyId = null;
    lastSummary = null;
    commit();
  }

  /** True while any blocking overlay is on screen (guards the end-turn hotkey). */
  function modalOpen(): boolean {
    // Title splash, confirm dialog and tutorial exist in the DOM only while open.
    if (document.querySelector(".title-overlay, .confirm-overlay, .tut-overlay")) return true;
    // Tech tree / standings / event choice share one overlay class, toggled by display.
    for (const o of document.querySelectorAll<HTMLElement>(".hud-techtree-overlay")) {
      if (o.style.display !== "none") return true;
    }
    return false;
  }

  /** Resolve one turn, capturing a summary of what changed for the player. */
  function advanceTurn(): void {
    if (state.outcome !== "playing") return;
    if (state.pendingChoice) {
      hud.toast("Resolve the pending decision first.");
      return;
    }
    const before = state;
    play("endTurn"); // the tick fires on the commit action itself
    state = resolveTurn(state);
    lastSummary = summarizeTurn(before, state);
    moveArmyId = null;
    commit();
    // Pause with a readable digest before play moves on (optional via Options;
    // quiet turns, pending decisions and decided games skip it).
    hud.showTurnReport(before.turn, lastSummary, state);
    // Cosmetic: ripple every region that changed hands this turn (gated inside the
    // renderer by reduce-motion). Uses ids, not the summary's names.
    for (const after of state.regions) {
      if (before.regions[after.id]?.ownerId !== after.ownerId) renderer.pulseCapture(after.id);
    }
    // A win/lose fanfare trumps the per-turn news; otherwise sound the top event.
    if (state.outcome === "victory") play("victory");
    else if (state.outcome === "defeat") play("defeat");
    else {
      const cue = outcomeCue(lastSummary);
      if (cue) play(cue);
    }
    // Meta-progression: fold this game into the profile on the terminal transition
    // (advanceTurn only runs while playing, so reaching a verdict here is fresh).
    if (state.outcome !== "playing") {
      const { newlyUnlocked } = recordGameEnd(state);
      if (newlyUnlocked.length > 0) {
        const names = newlyUnlocked
          .map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id)
          .join(", ");
        hud.toast(`Achievement${newlyUnlocked.length > 1 ? "s" : ""} unlocked: ${names}`);
      }
    }
  }

  /** Re-render the view and persist the continuous autosave. */
  function commit(): void {
    sync();
    saveToLocal(state, nowStamp(), "auto");
  }

  /**
   * Replay the fight the player just fought, if a new battle was recorded and
   * the combat-report option is on. `battlesBefore` is the battle count before
   * the move, so relocations and undefended captures (which record nothing) are
   * skipped, as are purely-AI fights (never player-involved).
   */
  function maybeShowBattle(battlesBefore: number): void {
    if (!isCombatReport()) return;
    const battles = state.battles ?? [];
    if (battles.length <= battlesBefore) return;
    const b = battles[battles.length - 1];
    if (b && (b.attackerIsPlayer || b.defenderIsPlayer)) hud.showBattleReport(b);
  }

  function sync(): void {
    renderer.setState(state);
    renderer.setSelected(selectedRegion);
    renderer.setHighlights(highlights());
    refreshLens(); // keep the active map lens' heat in step with the state
    hud.update(state, selectedRegion, moveArmyId, lastSummary);
  }

  /** Recolour the map for the active lens (null clears it → political default). */
  function refreshLens(): void {
    renderer.setLens(lensColorsFor(state, activeLens));
  }

  function highlights(): number[] {
    if (moveArmyId === null) return [];
    const army = state.armies.find((a) => a.id === moveArmyId);
    return army ? reachableRegions(state, army) : [];
  }

  sync();

  // If the ambient bed was left on last session, start it on the first gesture.
  armAmbientOnGesture();

  // Main menu first; the coached tour (first-ever session only) follows it
  // so the two never stack. The render loop starts only once the menu closes —
  // painting the map behind the opaque splash would just burn frames and make
  // the menu itself stutter.
  void showMainMenu({
    hasSave: hasLocalSave("auto"),
    // A loaded, still-playable game past turn 1 is worth a discard confirm.
    liveGameTurn: state.turn > 1 && state.outcome === "playing" ? state.turn : null,
    onNewGame: startNewGame,
    onOpenOptions: () => hud.openOptions(),
    onOpenRecords: () => hud.openRecords(),
  }).then(() => {
    renderer.start();
    if (firstEver) window.setTimeout(runTutorial, 400);
  });

  // eslint-disable-next-line no-console
  console.info("Petty Kingdoms — v1 ready. Build, research, conquer, and outlast your rivals.");
}

/** A wall-clock stamp for saves. Kept out of the sim (which forbids Date). */
function nowStamp(): number {
  return Date.now();
}

/** "slot2" → "Slot 2" for user-facing save/load toasts. */
function slotLabel(slot: string): string {
  const n = slot.replace("slot", "");
  return `Slot ${n}`;
}

/** Trigger a client-side file download of text — fully local, no network. */
function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

main();

// Register the offline service worker in the production build (skipped in dev so
// it never caches a stale HMR bundle). Failure is non-fatal — the game runs the
// same online; the worker only adds installability and offline replay.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support simply won't be available */
    });
  });
}
