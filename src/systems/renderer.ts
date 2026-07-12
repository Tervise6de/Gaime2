/**
 * Renderer system.
 *
 * A thin wrapper around the 2D canvas context that owns the render loop and
 * keeps the drawing buffer in sync with the CSS size and device pixel ratio.
 * For now it simply clears the screen every frame; drawing of game state will
 * be layered on top later.
 */

const BACKGROUND = "#11151c";

export interface Renderer {
  /** Begin the requestAnimationFrame loop. */
  start(): void;
  /** Stop the loop and detach listeners. */
  stop(): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to acquire 2D rendering context");
  }

  let running = false;
  let frame = 0;

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = canvas;
    canvas.width = Math.max(1, Math.floor(clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(clientHeight * dpr));
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function render(): void {
    if (!running) return;
    const { clientWidth, clientHeight } = canvas;
    ctx!.fillStyle = BACKGROUND;
    ctx!.fillRect(0, 0, clientWidth, clientHeight);
    frame = window.requestAnimationFrame(render);
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      resize();
      window.addEventListener("resize", resize);
      frame = window.requestAnimationFrame(render);
    },
    stop(): void {
      running = false;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    },
  };
}
