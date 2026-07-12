import { createRenderer } from "@/systems/renderer";
import "@/ui/style.css";

/**
 * Application entry point.
 *
 * Infrastructure only for now: acquire the canvas, size it to the viewport,
 * and start an empty render loop that clears to the background colour each
 * frame. No game systems are wired up yet.
 */
function main(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
  if (!canvas) {
    throw new Error("Canvas element #game-canvas not found");
  }

  const renderer = createRenderer(canvas);
  renderer.start();

  // eslint-disable-next-line no-console
  console.info("Gaime2 booted — blank canvas ready.");
}

main();
