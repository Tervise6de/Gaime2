import { createRenderer } from "@/systems/renderer";
import {
  createGame,
  resolveTurn,
  setTaxRate,
  queueBuilding,
  cancelConstruction,
} from "@/systems/turn";
import { raiseUnit, moveArmy, reachableRegions } from "@/systems/military";
import type { GameState } from "@/systems/state";
import { createHud } from "@/ui/hud";
import "@/ui/style.css";

/**
 * Application entry point.
 *
 * Wires the three layers together: the pure sim (GameState + turn pipeline and
 * military intents), the canvas renderer (region graph + armies), and the DOM
 * HUD (reads state, emits intents). `state` is the single source of truth;
 * every intent produces a new GameState and re-syncs the view.
 *
 * Army movement uses a small "move mode": selecting a player army and pressing
 * Move highlights reachable neighbours; the next click on a highlighted region
 * issues `moveArmy` (which may resolve combat and capture).
 */
function main(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
  const hudRoot = document.querySelector<HTMLElement>("#hud");
  if (!canvas) throw new Error("Canvas element #game-canvas not found");
  if (!hudRoot) throw new Error("HUD element #hud not found");

  let state: GameState = createGame({ seed: 12345 });
  let selectedRegion: number | null = null;
  let moveArmyId: number | null = null;

  const renderer = createRenderer(canvas);
  const hud = createHud(hudRoot, {
    onTaxChange(rate) {
      state = setTaxRate(state, rate);
      sync();
    },
    onEndTurn() {
      state = resolveTurn(state);
      moveArmyId = null;
      sync();
    },
    onNewGame(seed) {
      state = createGame({ seed });
      selectedRegion = null;
      moveArmyId = null;
      sync();
    },
    onQueueBuilding(regionId, building) {
      state = queueBuilding(state, regionId, building);
      sync();
    },
    onCancelConstruction(regionId) {
      state = cancelConstruction(state, regionId);
      sync();
    },
    onRaiseUnit(regionId, unit) {
      state = raiseUnit(state, regionId, unit);
      sync();
    },
    onBeginMove(armyId) {
      moveArmyId = armyId;
      sync();
    },
    onCancelMove() {
      moveArmyId = null;
      sync();
    },
  });

  renderer.onRegionClick((regionId) => {
    // In move mode, a click on a reachable neighbour issues the move/attack.
    if (moveArmyId !== null && regionId !== null) {
      const army = state.armies.find((a) => a.id === moveArmyId);
      if (army && reachableRegions(state, army).includes(regionId)) {
        state = moveArmy(state, moveArmyId, regionId);
        // Selection and move mode follow the (possibly relocated) army.
        const moved = state.armies.find((a) => a.id === moveArmyId);
        selectedRegion = moved ? moved.regionId : regionId;
        moveArmyId = moved && moved.movesLeft > 0 ? moved.id : null;
        sync();
        return;
      }
    }
    // Otherwise just select; leaving move mode.
    selectedRegion = regionId;
    moveArmyId = null;
    sync();
  });

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
  console.info("Gaime2 — Milestone 3 ready. Raise armies, march, and conquer.");
}

main();
