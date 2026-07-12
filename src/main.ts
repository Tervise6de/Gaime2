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
  gift,
  acceptOffer,
  rejectOffer,
} from "@/systems/diplomacy";
import { saveToLocal, loadFromLocal, hasLocalSave } from "@/systems/save";
import { PLAYER_ID, type GameState } from "@/systems/state";
import { createHud } from "@/ui/hud";
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

  const renderer = createRenderer(canvas);
  const hud = createHud(hudRoot, {
    onTaxChange(rate) {
      state = setTaxRate(state, rate);
      commit();
    },
    onEndTurn() {
      if (state.outcome !== "playing") return;
      state = resolveTurn(state);
      moveArmyId = null;
      commit();
    },
    onNewGame(config) {
      state = createGame(config);
      selectedRegion = null;
      moveArmyId = null;
      commit();
    },
    onSave() {
      const ok = saveToLocal(state, nowStamp(), "manual");
      hud.toast(ok ? "Checkpoint saved." : "Save failed (storage unavailable).");
    },
    onLoad() {
      const loaded = loadFromLocal("manual");
      if (loaded) {
        state = loaded;
        selectedRegion = null;
        moveArmyId = null;
        commit(); // make the restored checkpoint the live autosave too
        hud.toast("Checkpoint loaded.");
      } else {
        hud.toast("No saved checkpoint.");
      }
    },
    onQueueBuilding(regionId, building) {
      state = queueBuilding(state, regionId, building);
      commit();
    },
    onCancelConstruction(regionId) {
      state = cancelConstruction(state, regionId);
      commit();
    },
    onRaiseUnit(regionId, unit) {
      state = raiseUnit(state, regionId, unit);
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
    onGift(targetId, amount) {
      state = gift(state, PLAYER_ID, targetId, amount);
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
    onChooseResearch(tech) {
      state = chooseResearch(state, tech);
      commit();
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

  // Keyboard: Enter / Space ends the turn (unless typing in an input).
  window.addEventListener("keydown", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "SELECT")) return;
    if ((ev.key === "Enter" || ev.key === " ") && state.outcome === "playing") {
      ev.preventDefault();
      state = resolveTurn(state);
      moveArmyId = null;
      commit();
    }
  });

  /** Re-render the view and persist the continuous autosave. */
  function commit(): void {
    sync();
    saveToLocal(state, nowStamp(), "auto");
  }

  function sync(): void {
    renderer.setState(state);
    renderer.setSelected(selectedRegion);
    renderer.setHighlights(highlights());
    hud.update(state, selectedRegion, moveArmyId);
  }

  function highlights(): number[] {
    if (moveArmyId === null) return [];
    const army = state.armies.find((a) => a.id === moveArmyId);
    return army ? reachableRegions(state, army) : [];
  }

  renderer.start();
  sync();

  // eslint-disable-next-line no-console
  console.info("Gaime2 — v1 ready. Build, research, conquer, and outlast your rivals.");
}

/** A wall-clock stamp for saves. Kept out of the sim (which forbids Date). */
function nowStamp(): number {
  return Date.now();
}

main();
