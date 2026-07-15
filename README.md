# Petty Kingdoms

A browser-based **Kingdom Management / 4X-lite** strategy game by **GAIME**.
Depth comes
from interacting systems — economy, population, military, diplomacy — rather
than from art. Low-art, high-decision-density, runs anywhere a browser does.

> **Status:** v1 complete (Milestones 1–6). A tight, systems-driven 4X: a seeded
> procedural region-graph map; a terrain economy with taxes, population and the
> **unrest** anti-snowball brake; buildings; a five-unit **counter loop** with
> abstract combat, strategic resources, upkeep and conquest; **1–3 rule-based AI
> rivals** with personality archetypes and a small, expressive **diplomacy** set
> (war, peace, pacts, alliances, gifts, tribute); a branching **16-tech tree**;
> **three victory paths** (domination, Great Works, prestige score); and bounded
> random **events**. M6 adds **difficulty settings**, **save/load** (autosave +
> a manual checkpoint), keyboard end-turn, a victory/defeat screen, and a
> balance pass (with equal AI skill the player — one of three powers — wins ~40%
> on easy, ~30% on normal, ~10% on hard).
>
> **The rival AI is 100% local:** plain TypeScript running in your browser — no
> LLM/API calls, no key, no credits. Free and offline to play.
>
> *Deferred by design:* the map uses the **node+edge renderer** the design doc
> sanctions as the shippable fallback (§4); the game is fully playable this way,
> and a Voronoi-polygon renderer would be a pure visual upgrade over identical
> logic.

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
(seeded RNG, deterministic turn pipeline — combat, AI, research and events
included), so the systems are covered by fast unit tests — 130 tests across the
RNG, map generation, economy, population, stability, construction, combat,
military, diplomacy, rival AI, tech, events, victory, save/load, and turn
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

## Credits

Developed by **GAIME**.

## License

MIT
