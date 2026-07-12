# Gaime2

A browser-based **Kingdom Management / 4X-lite** strategy game. Depth comes
from interacting systems — economy, population, military, diplomacy — rather
than from art. Low-art, high-decision-density, runs anywhere a browser does.

> **Status:** Milestone 1 — Map + Economy skeleton. A seeded procedural region
> graph renders as terrain-coloured nodes + adjacency edges; each region
> produces gold/food/materials/knowledge by terrain; a global tax slider trades
> production for treasury gold; ending the turn advances the economy through a
> pure, deterministic turn pipeline. Click a region to inspect its production.

## Tech stack

- **TypeScript** — typed game logic.
- **Canvas 2D** — rendering (no heavy 3D engine; a systems-heavy, low-art game
  doesn't need one).
- **Vite** — dev server with instant HMR and a fast production build.

No UI framework: the simulation core is small, transparent, and fully under
our control.

## Getting started

```bash
npm install     # install dependencies
npm run dev     # start the dev server (http://localhost:5173)
```

Then open the printed URL (http://localhost:5173). You should see a region-graph
map. Set the **tax rate** with the slider, click **End turn** to tick the
economy, click any region to inspect its per-turn production, and use **New map**
(with an optional seed) to generate a fresh world.

### Other scripts

```bash
npm run build      # type-check and produce a production build in dist/
npm run preview    # serve the production build locally
npm run typecheck  # type-check only (no emit)
npm test           # run the unit test suite (Vitest)
npm run test:watch # run tests in watch mode
```

The simulation is a set of **pure functions** over a serialisable `GameState`
(seeded RNG, deterministic turn pipeline), so the systems are covered by fast
unit tests — 29 tests across the RNG, map generation, economy, and turn
resolution.

## Project structure

```
Gaime2/
├─ index.html          # app shell + <canvas>
├─ src/
│  ├─ main.ts          # entry point — boots the renderer
│  ├─ systems/         # simulation slices (renderer today; economy, pop, ... later)
│  ├─ ui/              # HUD / panels (DOM+CSS over canvas) + global styles
│  └─ data/            # static content definitions (buildings, resources, tech, ...)
├─ docs/               # design + technical notes
├─ assets/             # minimal UI art (icons only — no 3D models)
├─ vite.config.ts
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
