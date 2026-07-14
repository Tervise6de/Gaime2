import { createRenderer } from "@/systems/renderer";
import {
  createGame,
  resolveTurn,
  setTaxRate,
  queueBuilding,
  cancelConstruction,
  chooseResearch,
} from "@/systems/turn";
import { raiseUnit, moveArmy, reachableRegions } from "@/systems/military";
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
import { runTutorial, hasSeenTutorial } from "@/ui/tutorial";
import { play, outcomeCue, armAmbientOnGesture } from "@/ui/audio";
import { applyDisplaySettings } from "@/ui/settings";
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
  const hud = createHud(hudRoot, {
    onTaxChange(rate) {
      state = setTaxRate(state, rate);
      commit();
    },
    onEndTurn() {
      advanceTurn();
    },
    onNewGame(config) {
      state = createGame(config);
      selectedRegion = null;
      moveArmyId = null;
      lastSummary = null;
      commit();
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
        hud.toast("Import failed — not a valid Gaime2 save.");
      }
    },
    onQueueBuilding(regionId, building) {
      state = queueBuilding(state, regionId, building);
      play("build");
      commit();
    },
    onCancelConstruction(regionId) {
      state = cancelConstruction(state, regionId);
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
    onResolveChoice(optionId) {
      state = resolveChoice(state, optionId);
      commit();
    },
    onSetMapLayout(mapLayout) {
      // View-only: the continuous render loop picks up the new layout next frame.
      renderer.setLayout(mapLayout);
    },
  });

  renderer.onRegionClick((regionId) => {
    if (moveArmyId !== null && regionId !== null) {
      const army = state.armies.find((a) => a.id === moveArmyId);
      if (army && reachableRegions(state, army).includes(regionId)) {
        state = moveArmy(state, moveArmyId, regionId);
        const moved = state.armies.find((a) => a.id === moveArmyId);
        selectedRegion = moved ? moved.regionId : regionId;
        moveArmyId = moved && moved.movesLeft > 0 ? moved.id : null;
        commit();
        return;
      }
    }
    selectedRegion = regionId;
    moveArmyId = null;
    sync();
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

  /** True while any blocking overlay is on screen (guards the end-turn hotkey). */
  function modalOpen(): boolean {
    // Confirm dialog and tutorial exist in the DOM only while open.
    if (document.querySelector(".confirm-overlay, .tut-overlay")) return true;
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
    // A win/lose fanfare trumps the per-turn news; otherwise sound the top event.
    if (state.outcome === "victory") play("victory");
    else if (state.outcome === "defeat") play("defeat");
    else {
      const cue = outcomeCue(lastSummary);
      if (cue) play(cue);
    }
  }

  /** Re-render the view and persist the continuous autosave. */
  function commit(): void {
    sync();
    saveToLocal(state, nowStamp(), "auto");
  }

  function sync(): void {
    renderer.setState(state);
    renderer.setSelected(selectedRegion);
    renderer.setHighlights(highlights());
    hud.update(state, selectedRegion, moveArmyId, lastSummary);
  }

  function highlights(): number[] {
    if (moveArmyId === null) return [];
    const army = state.armies.find((a) => a.id === moveArmyId);
    return army ? reachableRegions(state, army) : [];
  }

  renderer.start();
  sync();

  // If the ambient bed was left on last session, start it on the first gesture.
  armAmbientOnGesture();

  // Launch the coached tour once the HUD has laid out (first-ever session only).
  if (firstEver) window.setTimeout(runTutorial, 500);

  // eslint-disable-next-line no-console
  console.info("Gaime2 — v1 ready. Build, research, conquer, and outlast your rivals.");
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
