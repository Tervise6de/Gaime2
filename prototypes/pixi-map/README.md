# PixiJS Map Prototype

A visual proof-of-concept: the Gaime2 world map rendered as a clean, playable
strategy map using **PixiJS (WebGL)** — real European geography with
13th-century realms, crisp borders, readable labels, coastal depth, and
**hover / click selection**. This is a rendering-layer demo only; it does not
touch the game's simulation code.

## Why PixiJS

The sim stays pure TypeScript; only the *render layer* changes. PixiJS is
GPU-accelerated 2D, so a whole zoomable world with 100+ territories and visual
effects stays smooth — far beyond what hand-rolled Canvas 2D sustains.

## Files

- `prepare-data.mjs` — carves Europe out of Natural Earth data (`world-atlas`)
  and tags each realm with a medieval name, colour, and label anchor. Emits
  `europe.json` (committed, so you don't need to re-run it).
- `europe.json` — generated realm geometry + sea labels.
- `map.ts` — the PixiJS renderer (projection, realms, labels, interaction).
- `index.html` — page shell.
- `shot.mjs` — headless screenshot helper (dev-only; needs `playwright-core`).

## Run it

From the repo root:

```bash
npm install
npx vite            # then open /prototypes/pixi-map/index.html
```

Regenerate the map data (only if you change the realm table):

```bash
node prototypes/pixi-map/prepare-data.mjs
```

## Notes / next steps

- Realms are one polygon per modern country here; the real game would use its
  own province graph. Swapping in that geometry is a data change, not a rewrite.
- Natural extensions: zoom/pan camera, terrain tints, army/city icons, faction
  recolouring on conquest, per-province selection.
