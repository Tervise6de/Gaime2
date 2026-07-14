import "@/ui/style.css";
import {
  armyAt,
  buildFort,
  createInitialState,
  createRng,
  endTurn,
  moveArmy,
  raiseUnits,
} from "@/systems";
import type { GameState, UnitType } from "@/systems";
import { nodeEdgeRenderer, voronoiRenderer, type MapRenderer, type RenderState, type View } from "@/render";
import { createHud, type Hud } from "@/ui/hud";
import { createEndScreen } from "@/ui/endscreen";

/**
 * Application entry point / orchestrator.
 *
 * Owns the single GameState, drives the render loop, mounts the HUD, and
 * translates player input into simulation intents. All randomness flows through
 * the seeded RNG cursor stored in `state.rngState`, so play is deterministic.
 */
function main(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
  const app = document.querySelector<HTMLElement>("#app");
  if (!canvas || !app) throw new Error("Missing #game-canvas / #app");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to acquire 2D rendering context");

  let state: GameState = createInitialState({ seed: pickSeed() });
  // Node+edge is the always-available fallback; Voronoi is the visual upgrade
  // over the identical adjacency graph.
  const renderers: MapRenderer[] = [nodeEdgeRenderer, voronoiRenderer];
  let rendererIdx = 0;
  let renderer: MapRenderer = renderers[rendererIdx];
  let selected = -1;
  let hovered = -1;

  const hudRoot = document.createElement("div");
  hudRoot.id = "hud";
  app.append(hudRoot);

  const view: View = { width: canvas.clientWidth, height: canvas.clientHeight };

  const endScreen = createEndScreen(app, () => {
    state = createInitialState({ seed: pickSeed() });
    selected = -1;
    endScreen.hide();
    refresh();
  });

  const hud: Hud = createHud(hudRoot, {
    onEndTurn: () => {
      state = endTurn(state);
      if (state.phase === "ended") endScreen.show(state);
      refresh();
    },
    onRaise: (type: UnitType) => {
      if (selected < 0) return;
      raiseUnits(state, playerId(), selected, type, 1);
      refresh();
    },
    onBuildFort: () => {
      if (selected < 0) return;
      buildFort(state, playerId(), selected);
      refresh();
    },
    onSetTax: (rate: number) => {
      state.nations[playerId()].taxRate = rate;
      refresh();
    },
    onNewGame: () => {
      state = createInitialState({ seed: pickSeed() });
      selected = -1;
      endScreen.hide();
      refresh();
    },
    onToggleMap: () => {
      rendererIdx = (rendererIdx + 1) % renderers.length;
      renderer = renderers[rendererIdx];
      hud.setMapLabel(`Kaart: ${renderer.label}`);
    },
  });

  hud.setMapLabel(`Kaart: ${renderer.label}`);

  function playerId(): number {
    return state.nations.find((n) => n.isPlayer)!.id;
  }

  function reachable(): number[] {
    if (selected < 0 || state.phase === "ended") return [];
    const army = armyAt(state, playerId(), selected);
    if (!army || army.moved) return [];
    return state.regions[selected].adj.slice();
  }

  function refresh(): void {
    hud.update(state, selected);
  }

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    view.width = canvas!.clientWidth;
    view.height = canvas!.clientHeight;
    canvas!.width = Math.max(1, Math.floor(view.width * dpr));
    canvas!.height = Math.max(1, Math.floor(view.height * dpr));
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(): void {
    const rs: RenderState = { selected, hovered, reachable: reachable() };
    renderer.draw(ctx!, state, view, rs);
    window.requestAnimationFrame(draw);
  }

  function pointerPos(ev: PointerEvent): { x: number; y: number } {
    const rect = canvas!.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  canvas.addEventListener("pointermove", (ev) => {
    const { x, y } = pointerPos(ev);
    hovered = renderer.regionAt(state, view, x, y);
    canvas.style.cursor = hovered >= 0 ? "pointer" : "default";
  });

  canvas.addEventListener("pointerdown", (ev) => {
    if (state.phase === "ended") return;
    const { x, y } = pointerPos(ev);
    const clicked = renderer.regionAt(state, view, x, y);
    if (clicked < 0) {
      selected = -1;
      refresh();
      return;
    }
    // If a selected region holds the player's un-moved army and the click is on
    // an adjacent region, issue a move/attack order.
    if (selected >= 0) {
      const army = armyAt(state, playerId(), selected);
      if (army && !army.moved && state.regions[selected].adj.includes(clicked)) {
        const rng = createRng(state.seed, state.rngState);
        moveArmy(state, rng, army.id, clicked);
        state.rngState = rng.state();
        const after = state.armies.find((a) => a.id === army.id);
        selected = after ? after.location : clicked;
        refresh();
        return;
      }
    }
    selected = clicked;
    refresh();
  });

  // If the game was already over on load (e.g. after a resume), show the summary.
  if (state.phase === "ended") endScreen.show(state);

  window.addEventListener("resize", () => {
    resize();
  });

  resize();
  refresh();
  window.requestAnimationFrame(draw);
}

function pickSeed(): number {
  // A fresh seed per session; the game itself is deterministic given the seed.
  return Math.floor((Date.now() % 2147483647) + 1);
}

main();
