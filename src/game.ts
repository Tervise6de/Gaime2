/**
 * Game controller.
 *
 * The thin application-boundary layer that owns the live `GameState` and wires
 * the pure systems to the presentation layers. Player intents (tax changes,
 * end turn, region selection) flow in from the HUD and canvas; the controller
 * applies them and refreshes the renderer and HUD.
 *
 * The purity rule lives in the systems (`resolveTurn` is a pure transform);
 * here at the boundary we hold and edit the current state in response to input.
 */

import { MAX_TAX_RATE } from "@/core/constants";
import type { GameState } from "@/core/types";
import { createRenderer, generateGame, resolveTurn } from "@/systems";
import { createHud } from "@/ui";

export interface GameController {
  /** Tear down listeners and DOM. */
  destroy(): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Resolve the starting seed: an explicit `?seed=` query param (for reproducible
 * and shareable games) or a fresh random one. Reading the URL / RNG here is app
 * bootstrap, not game logic, so it does not violate the determinism rule.
 */
function resolveSeed(): number {
  const param = new URLSearchParams(window.location.search).get("seed");
  if (param !== null && param.trim() !== "") {
    const parsed = Number(param);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return Math.floor(Math.random() * 1_000_000_000);
}

/**
 * Start a game: generate the world, mount the renderer and HUD, and begin
 * responding to input. Returns a controller for teardown.
 */
export function startGame(
  canvas: HTMLCanvasElement,
  hudRoot: HTMLElement,
  seed: number = resolveSeed(),
): GameController {
  let state: GameState = generateGame(seed);
  let selectedRegionId: number | null = null;

  const renderer = createRenderer(canvas);
  const hud = createHud(hudRoot, {
    onTaxChange(rate: number): void {
      const player = state.nations.find((n) => n.id === state.playerNationId);
      if (!player) return;
      player.taxRate = clamp(rate, 0, MAX_TAX_RATE);
      refresh();
    },
    onEndTurn(): void {
      state = resolveTurn(state).state;
      refresh();
    },
  });

  function refresh(): void {
    renderer.render(state, { selectedRegionId });
    hud.update(state, selectedRegionId);
  }

  function handleCanvasClick(event: MouseEvent): void {
    const picked = renderer.pick(event.clientX, event.clientY, state);
    // Toggle selection off if the same region is clicked again.
    selectedRegionId = picked === selectedRegionId ? null : picked;
    refresh();
  }

  canvas.addEventListener("click", handleCanvasClick);
  renderer.onResize(refresh);

  refresh();

  // eslint-disable-next-line no-console
  console.info(`Gaime2 — game started (seed ${seed}).`);

  return {
    destroy(): void {
      canvas.removeEventListener("click", handleCanvasClick);
      renderer.stop();
      hud.destroy();
    },
  };
}
