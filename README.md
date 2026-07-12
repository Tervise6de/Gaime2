# Gaime2

A browser-based **Kingdom Management / 4X-lite** strategy game. Depth comes
from interacting systems — economy, population, military, diplomacy — rather
than from art. Low-art, high-decision-density, runs anywhere a browser does.

> **Status:** Milestone 4 — AI Nations + Diplomacy. It's now a **4X game**. Two
> **rival nations** run the very same economy, population, unrest, building and
> military systems as you, driven by a **rule-based utility AI** with
> personality archetypes (Warlord, Merchant, Builder, Opportunist). They expand,
> raise armies, and fight — reacting to real state, not scripts. **Relations**
> (−100…+100) drift and shift on your actions and proximity; a small but
> expressive **diplomacy** set lets you declare war, sue for peace, sign
> non-aggression pacts and alliances, gift gold, and field/answer offers. Attack
> a rival and it's war; turtle forever and the external clock runs you down
> (defeat if eliminated, victory if you're the last realm standing). Earlier
> layers still apply: terrain economy, tax-vs-unrest, buildings, the unit
> counter loop, strategic resources, upkeep and conquest unrest.
>
> **The rival AI is 100% local:** plain TypeScript running in your browser — no
> LLM/API calls, no key, no credits. Free and offline to play.

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
(seeded RNG, deterministic turn pipeline — combat and AI included), so the
systems are covered by fast unit tests — 104 tests across the RNG, map
generation, economy, population, stability, construction, combat, military,
diplomacy, rival AI, and turn resolution.

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
