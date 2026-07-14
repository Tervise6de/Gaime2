# Gaime2

A browser-based **Kingdom Management / 4X-lite** strategy game. Depth comes
from interacting systems — economy, population, military, diplomacy — rather
than from art. Low-art, high-decision-density, runs anywhere a browser does.

> **Status:** M1 — Map + Economy skeleton. A seeded procedural region graph
> renders as nodes + edges; the player holds a starting cluster of provinces
> that produce gold, food, materials, and knowledge by terrain. Set the tax
> rate, click a region to inspect it, and end the turn to tick the economy.
> Population growth, buildings, military, AI, and tech arrive in later
> milestones (see the roadmap).

## Tech stack

- **TypeScript** — typed game logic.
- **Canvas 2D** — map rendering (no heavy 3D engine; a systems-heavy, low-art
  game doesn't need one). DOM + CSS for the HUD, layered over the canvas.
- **Vite** — dev server with instant HMR and a fast production build.
- **Vitest** — unit tests for the pure simulation (RNG, map gen, economy, turn
  resolution) plus a jsdom wiring smoke test.

No UI framework: the simulation core is small, transparent, and fully under
our control. Turn resolution is a **pure function** `GameState -> GameState`,
and all randomness flows through a **seeded RNG** — so the same seed always
reproduces the same game (great for testing and shareable maps).

## Getting started

```bash
npm install     # install dependencies
npm run dev     # start the dev server (http://localhost:5173)
```

Then open the printed URL. You should see a region map with a resource bar,
a tax slider, and an End Turn button. Append `?seed=123` to the URL to play a
specific (reproducible) map.

### Other scripts

```bash
npm run build      # type-check and produce a production build in dist/
npm run preview    # serve the production build locally
npm run typecheck  # type-check only (no emit)
npm test           # run the unit + smoke test suite
npm run test:watch # run tests in watch mode
```

## Project structure

```
Gaime2/
├─ index.html          # app shell + <canvas>
├─ src/
│  ├─ main.ts          # entry point — mounts the game controller
│  ├─ game.ts          # controller: owns live state, wires systems ↔ UI
│  ├─ core/            # types, seeded RNG, constants (the sim's foundation)
│  ├─ systems/         # simulation slices: mapgen, economy, turn, renderer
│  ├─ ui/              # HUD / panels (DOM+CSS over canvas) + global styles
│  └─ data/            # static content definitions (terrain today; buildings, ...)
├─ docs/               # design + technical notes
├─ assets/             # minimal UI art (icons only — no 3D models)
├─ vite.config.ts
├─ vitest.config.ts
└─ tsconfig.json
```

### Architecture at a glance

- **systems/** hold logic and mutate game state; they never touch the DOM.
- **ui/** observes state and emits intents; it never mutates the sim directly.
- **data/** is plain, serialisable content that systems consume — balancing is
  editing tables, not code.

See [`docs/design.md`](docs/design.md) for the design vision and roadmap.

## License

MIT
