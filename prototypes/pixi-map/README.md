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

## Realms

Modern admin-1 **provinces** are grouped into the 13th-century **realms** from
the reference map — Sápmi, the Holy Roman Empire's duchies (Saxony, Bavaria,
Swabia, Thuringia, Brandenburg, Franconia, Westphalia…), the Piast Polish
duchies, the Low Countries (Holland/Utrecht/Flanders/Brabant), the Finnish lands
(Suomi/Karelia/Tavastia), the Italian states (Sicily/Papal/Lombardy/Venice/…),
and the Byzantine successors (Nicaea/Trebizond/Latin Empire/Rûm). Provinces keep
their own polygons (the game's province layer), coloured + selected by realm.

The province→realm assignments are best-effort approximations — edit the
`resolve()` table in `prepare-data.mjs` to refine borders or add realms.

## Files

- `prepare-data.mjs` — groups Natural Earth 10m admin-1 provinces into realms
  (colour + label anchor) and emits `europe.json`. Needs the source file:

  ```bash
  curl -sSL -o ne10.geojson \
    https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
  node prepare-data.mjs ne10.geojson
  ```

  (`europe.json` is committed, so you only re-run this to change the realms.)
- `europe.json` — generated province geometry tagged by realm + sea labels.
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
