import { startGame } from "@/game";
import "@/ui/style.css";

/**
 * Application entry point.
 *
 * Acquire the canvas and HUD mount, then hand off to the game controller which
 * generates the world and wires the simulation to the renderer and HUD.
 */
function main(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
  if (!canvas) {
    throw new Error("Canvas element #game-canvas not found");
  }
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) {
    throw new Error("App container #app not found");
  }

  startGame(canvas, app);
}

main();
