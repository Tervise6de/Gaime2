// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startGame } from "@/game";
import { generateGame } from "@/systems/mapgen";

/**
 * Replicate the renderer's layout math (canvas 800×600, PADDING 44) so the test
 * can click the exact screen pixel of a known region.
 */
function siteToScreen(x: number, y: number): { x: number; y: number } {
  const size = Math.min(800, 600) - 44 * 2; // 512
  const offsetX = (800 - size) / 2; // 144
  const offsetY = (600 - size) / 2; // 44
  return { x: offsetX + x * size, y: offsetY + y * size };
}

/**
 * Wiring smoke test (design doc §7 hybrid: canvas map + DOM HUD).
 *
 * The pure systems are covered by their own unit tests; this exercises the
 * controller ↔ renderer ↔ HUD glue in a jsdom DOM with a stubbed 2D context, so
 * a wiring regression (an intent that throws, a control that isn't hooked up)
 * fails a test instead of only surfacing in the browser.
 */

/** A no-op 2D context stub covering every method/prop the renderer touches. */
function stubContext(): CanvasRenderingContext2D {
  const noop = (): void => undefined;
  return {
    setTransform: noop,
    fillRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    arc: noop,
    fill: noop,
    fillText: noop,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
  } as unknown as CanvasRenderingContext2D;
}

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  // jsdom has no layout engine or canvas backend — stub the bits we use.
  Object.defineProperty(canvas, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(canvas, "clientHeight", { value: 600, configurable: true });
  canvas.getContext = (() =>
    stubContext()) as unknown as HTMLCanvasElement["getContext"];
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 }) as DOMRect;
  return canvas;
}

describe("startGame wiring", () => {
  beforeEach(() => {
    // Deterministic seed via ?seed, and a stable rAF for the resize path.
    window.history.replaceState(null, "", "/?seed=2024");
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
  });

  it("mounts the HUD and renders the starting turn", () => {
    const canvas = makeCanvas();
    const root = document.createElement("div");
    document.body.append(root);

    const controller = startGame(canvas, root, 2024);

    expect(root.querySelector(".hud")).not.toBeNull();
    expect(root.querySelector(".hud-turn")!.textContent).toBe("Turn 1");
    // Four resource stat tiles.
    expect(root.querySelectorAll(".hud-stat").length).toBe(4);

    controller.destroy();
    expect(root.querySelector(".hud")).toBeNull();
  });

  it("advances the turn and grows treasury when End Turn is clicked", () => {
    const canvas = makeCanvas();
    const root = document.createElement("div");
    document.body.append(root);
    startGame(canvas, root, 2024);

    const goldTile = root.querySelectorAll<HTMLElement>(".hud-stat")[0]!;
    const goldBefore = Number(goldTile.querySelector(".hud-stat-value")!.textContent);

    const endTurn = root.querySelector<HTMLButtonElement>(".hud-endturn")!;
    endTurn.click();

    expect(root.querySelector(".hud-turn")!.textContent).toBe("Turn 2");
    const goldAfter = Number(goldTile.querySelector(".hud-stat-value")!.textContent);
    expect(goldAfter).toBeGreaterThan(goldBefore);
  });

  it("updates the tax readout when the slider changes", () => {
    const canvas = makeCanvas();
    const root = document.createElement("div");
    document.body.append(root);
    startGame(canvas, root, 2024);

    const slider = root.querySelector<HTMLInputElement>(".hud-tax-slider")!;
    slider.value = "25";
    slider.dispatchEvent(new Event("input"));

    expect(root.querySelector(".hud-tax-value")!.textContent).toBe("25%");
  });

  it("shows a region detail panel after clicking the map", () => {
    const canvas = makeCanvas();
    const root = document.createElement("div");
    document.body.append(root);
    startGame(canvas, root, 2024);

    // Panel starts empty.
    expect(root.querySelector(".hud-region--empty")).not.toBeNull();

    // Click the exact screen position of an owned region (same seed the
    // controller used), so the pick is deterministic.
    const state = generateGame(2024);
    const owned = state.regions.find((r) => r.ownerId === state.playerNationId)!;
    const px = siteToScreen(owned.site.x, owned.site.y);
    canvas.dispatchEvent(
      new MouseEvent("click", { clientX: px.x, clientY: px.y, bubbles: true }),
    );

    const name = root.querySelector(".hud-region-name");
    expect(name).not.toBeNull();
    expect(name!.textContent).toBe(owned.name);
    // Owned region → production breakdown is shown.
    expect(root.querySelector(".hud-prod")).not.toBeNull();
  });
});
