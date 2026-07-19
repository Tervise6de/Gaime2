# Hansa

A browser strategy game by **GAIME** about the Hanseatic world: named Baltic and
North Sea realms, trade routes to Kontore, Sound tolls, embargoes, league
politics, armies, diplomacy and prestige.

The live game is now **Hansa-only**. It uses the authored `hansa` map with fixed
real provinces and the full historical realm roster. Retired map modes, setup
presets, passive trade-income diplomacy, and the old monument-race victory path
have been removed from active gameplay.

## Tech Stack

- **TypeScript** for deterministic game logic.
- **Canvas 2D** for the map and armies.
- **Vite** for local development and production builds.

No UI framework and no backend: the simulation is a set of pure functions over a
serialisable `GameState`, with the UI emitting intents into that state.

## Getting Started

```bash
npm install
npm run dev
```

Then open the printed local URL, usually `http://localhost:5173`.

## Scripts

```bash
npm run build      # type-check and produce a production build in dist/
npm run preview    # serve the production build locally
npm run typecheck  # type-check only
npm test           # run the Vitest suite
npm run test:watch # run tests in watch mode
```

## Project Structure

```text
Gaime2/
├─ index.html
├─ src/
│  ├─ main.ts
│  ├─ systems/       # simulation logic
│  ├─ ui/            # DOM HUD, panels and CSS
│  └─ data/          # authored content tables
├─ docs/
├─ assets/
├─ vite.config.ts
└─ tsconfig.json
```

## Deployment

The repo is Vercel-ready as a static Vite build. `vercel.json` pins the build
command and output directory. No environment variables or server process are
needed.

## Credits

Developed by **GAIME**.

## License

MIT
