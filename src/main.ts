import { createRenderer } from "@/systems/renderer";
import {
  createGame,
  resolveTurn,
  setTaxRate,
  queueBuilding,
  cancelConstruction,
} from "@/systems/turn";
import type { GameState } from "@/systems/state";
import { createHud } from "@/ui/hud";
import "@/ui/style.css";

/**
 * Application entry point.
 *
 * Wires the three layers of Milestone 1 together: the pure sim (GameState +
 * turn pipeline), the canvas renderer (draws the region graph), and the DOM HUD
 * (reads state, emits intents). `state` is the single source of truth; every
 * intent produces a new GameState and re-syncs the view. Nothing outside the
 * sim mutates state.
 */
function main(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
  const hudRoot = document.querySelector<HTMLElement>("#hud");
  if (!canvas) throw new Error("Canvas element #game-canvas not found");
  if (!hudRoot) throw new Error("HUD element #hud not found");

  let state: GameState = createGame({ seed: 12345 });
  let selectedRegion: number | null = null;

  const renderer = createRenderer(canvas);
  const hud = createHud(hudRoot, {
    onTaxChange(rate) {
      state = setTaxRate(state, rate);
      sync();
    },
    onEndTurn() {
      state = resolveTurn(state);
      sync();
    },
    onNewGame(seed) {
      state = createGame({ seed });
      selectedRegion = null;
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
  });

  renderer.onRegionClick((regionId) => {
    selectedRegion = regionId;
    sync();
  });

  function sync(): void {
    renderer.setState(state);
    renderer.setSelected(selectedRegion);
    hud.update(state, selectedRegion);
  }

  renderer.start();
  sync();

  // eslint-disable-next-line no-console
  console.info("Gaime2 — Milestone 1 ready. Set taxes and end the turn.");
}

main();
