// @vitest-environment happy-dom
/**
 * The map renderer — three thousand lines of canvas, and until now nothing
 * touched it. It cannot be checked pixel by pixel in a unit test, and there is
 * little point trying, but the failures that actually reach players are not
 * subtle: a throw on the first frame leaves a black screen, and a throw on a
 * particular *state* (a fleet at sea, a realm eliminated, a region under
 * blockade) breaks the game halfway through a session.
 *
 * So this stubs the 2D context and paints real boards, asserting only that the
 * renderer survives them and asks the canvas to draw something. The rule-bearing
 * geometry it uses — which borders are open water — is tested for real in
 * `systems/mapview.test.ts`, where it lives as a pure function.
 */

import { describe, it, expect, afterEach, beforeAll, beforeEach } from "vitest";
import { createRenderer } from "@/systems/renderer";
import { createGame, resolveTurn } from "@/systems/turn";
import { emptyUnits, type GameState } from "@/systems/state";

/** Count of drawing calls made, so "it rendered nothing" is distinguishable. */
let strokes = 0;
/**
 * Errors thrown *inside* an animation frame. Without this they vanish into the
 * scheduler: the frame dies, the canvas freezes, and a test that only counts
 * draw calls still passes because the throw came after the first few.
 */
let frameErrors: unknown[] = [];

/**
 * A 2D context that answers every call. happy-dom has no canvas implementation,
 * so anything the renderer reaches for has to exist here — the Proxy makes that
 * true by construction rather than by keeping a list in step.
 */
function stubContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const target: Record<string, unknown> = {
    canvas: null,
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    putImageData: () => undefined,
    setTransform: () => undefined,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    isPointInPath: () => false,
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop as string];
      // Style properties read back as whatever was written; everything else is
      // a method, and a method that draws bumps the counter.
      return (...args: unknown[]) => {
        void args;
        strokes++;
        return undefined;
      };
    },
    set(t, prop, value) {
      t[prop as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/**
 * happy-dom implements neither `Path2D` nor a canvas backend, so both are
 * supplied here. The Path2D stub records nothing: the renderer only ever hands
 * these back to the context, which is itself a stub.
 */
beforeAll(() => {
  // Catch anything a render frame throws, so a mid-frame crash fails the test
  // instead of being reported as a detached error and shrugged off.
  const raf = globalThis.requestAnimationFrame.bind(globalThis);
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    raf((t) => {
      try {
        cb(t);
      } catch (err) {
        frameErrors.push(err);
      }
    })) as typeof globalThis.requestAnimationFrame;

  class StubPath2D {
    addPath(): void {}
    moveTo(): void {}
    lineTo(): void {}
    closePath(): void {}
    arc(): void {}
    ellipse(): void {}
    rect(): void {}
    quadraticCurveTo(): void {}
    bezierCurveTo(): void {}
  }
  (globalThis as Record<string, unknown>).Path2D = StubPath2D;
  // Every canvas the renderer makes for itself (the baked layers) gets the
  // same stub context as the one it was handed.
  const create = document.createElement.bind(document);
  document.createElement = ((tag: string, ...rest: unknown[]) => {
    const el = create(tag as "div", ...(rest as []));
    if (tag === "canvas") {
      Object.defineProperty(el, "getContext", {
        value: () => stubContext(),
        configurable: true,
      });
    }
    return el;
  }) as typeof document.createElement;
});

function canvas(): HTMLCanvasElement {
  const el = document.createElement("canvas");
  el.width = 800;
  el.height = 600;
  Object.defineProperty(el, "getBoundingClientRect", {
    value: () => ({ x: 0, y: 0, width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 }),
    configurable: true,
  });
  document.body.append(el);
  return el;
}

/**
 * Build a renderer, run its loop for a frame or two, and report whether it
 * drew. The loop is `requestAnimationFrame`-driven, so the test yields to let
 * happy-dom's scheduler deliver a frame, then stops it again.
 */
async function paint(state: GameState): Promise<number> {
  strokes = 0;
  const r = createRenderer(canvas());
  r.setState(state);
  r.start();
  await frames();
  r.stop();
  return strokes;
}

/** Let a couple of animation frames run. */
async function frames(n = 3): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise<void>((done) => requestAnimationFrame(() => done()));
  }
}

beforeEach(() => {
  document.body.innerHTML = "";
  strokes = 0;
  frameErrors = [];
});

afterEach(() => {
  // Every test paints; none of them may throw doing it.
  expect(frameErrors, `render frame threw: ${String(frameErrors[0])}`).toEqual([]);
});

describe("the renderer paints a board", () => {
  it("draws the opening position", async () => {
    expect(await paint(createGame({ seed: 5 }))).toBeGreaterThan(0);
  });

  it("draws a board that has been played for a while", async () => {
    let g = createGame({ seed: 3 });
    for (let i = 0; i < 25; i++) g = resolveTurn(g);
    expect(await paint(g)).toBeGreaterThan(0);
  });

  it("draws a fleet at sea, a spent stack and an eliminated realm", async () => {
    const g = createGame({ seed: 5 });
    const awkward: GameState = {
      ...g,
      armies: [
        // At sea, with soldiers aboard: the amphibious case.
        { id: 900, ownerId: 0, regionId: 0, seaZoneId: "north_sea", units: { ...emptyUnits(), infantry: 6, war_cog: 2 }, movesLeft: 1 },
        // A land stack that has been wiped to nothing but still exists.
        { id: 901, ownerId: 2, regionId: 12, units: emptyUnits(), movesLeft: 0 },
      ],
      // A realm holding no ground at all.
      nations: g.nations.map((n) => (n.id === 9 ? { ...n, alive: false } : n)),
      regions: g.regions.map((r) => (r.ownerId === 9 ? { ...r, ownerId: null } : r)),
    };
    expect(await paint(awkward)).toBeGreaterThan(0);
  });

  it("survives every lens and both map modes", async () => {
    const g = createGame({ seed: 5 });
    const r = createRenderer(canvas());
    r.setState(g);
    r.start();
    try {
      for (const mode of ["province", "strategy"] as const) {
        r.setMapMode(mode);
        r.setLens(null);
        strokes = 0;
        await frames();
        expect(strokes, `mode ${mode} drew nothing`).toBeGreaterThan(0);
        // A lens is a per-region colour array; a short one and a full one must
        // both be safe — the political default is the fallback either way.
        r.setLens([]);
        await frames(1);
        r.setLens(g.regions.map(() => "#ff0000"));
        await frames(1);
      }
    } finally {
      r.stop();
    }
  });

  it("draws the trade overlay, and clears it again", async () => {
    let g = createGame({ seed: 5 });
    for (let i = 0; i < 10; i++) g = resolveTurn(g);
    const r = createRenderer(canvas());
    r.setState(g);
    r.setTradeLanes(g.routes ?? []);
    r.start();
    try {
      strokes = 0;
      await frames();
      expect(strokes).toBeGreaterThan(0);
      r.setTradeLanes(null);
      await frames(1);
    } finally {
      r.stop();
    }
  });
});
