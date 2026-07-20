# Sea of Coin — art style bible

The committed visual direction. Everything drawn for this game — by any agent,
now or later — conforms to this document. The working plan that produced it is
`docs/art-plan.md`; the assets themselves live in the registry
(`src/data/art.ts`), one inline-SVG string per id, exactly where the code-side
scaffolding expects them.

## Direction (committed, do not re-litigate per asset)

**Flat-vector heraldic.** Clean geometric silhouettes, stroke-first line work,
a limited warm palette over the dark UI. No painterly rendering, no pixel art,
no gradients inside icons (gradients are reserved for terrain/background
*fills* drawn by the renderer). The game's design pillar is *systems over
spectacle*: an icon exists to be read in a tenth of a second at small sizes,
not admired.

## Grid & geometry

- **viewBox is `0 0 24 24` for every icon.** Draw inside a ~1.5px safe inset
  (nothing outside x/y 2.5-21.5 except deliberate overshoot like a landmark
  laurels).
- **Stroke: 1.8 at 24px** (the "2px-equivalent" weight — it optically matches
  2px once the browser scales). Use `sw: 2` (the `ico()` option) only when a
  shape has very few strokes and needs the extra weight (e.g. the gear).
- `stroke-linecap="round"`, `stroke-linejoin="round"` always.
- **Filled silhouettes are the exception, not the rule** — allowed when an
  icon must read at map-marker size (~13–15px) where strokes vanish: anvil,
  horse head, crown, crest sigils. A filled icon still keeps the family's
  rounded, geometric character.
- Corners: prefer soft radii (`rx` ≈ 1.2–1.8 on rects) over sharp corners.

Author through the shared builder so the shell stays uniform:

```ts
ico('<path d="..."/>')            // stroke-first, currentColor, 1.8 weight
ico('<path d="..."/>', { fill: true })  // filled-silhouette exception
```

## Colour

Icons are **monochrome `currentColor` by default** — they inherit the HUD text
colour and survive theme/palette changes for free. Hard-code colour *only when
the icon is the colour*:

| Token (CSS-var-friendly) | Hex | Use |
|---|---|---|
| `--art-bg` | `#11151c` | UI background every icon must read on |
| `--art-bg-vignette-in / -out` | `#171d29` / `#0b0e14` | world background gradient |
| `--art-ink` | `#e8e2cf` | icon ink rasterised onto the canvas map |
| `--art-ink-bright` | `#f7f4ea` | crest sigils, filled details on colour |
| `--art-gold` | `#d8a24a` | brand/player gold (crest, app mark) |
| `--art-gold-hi` | `#e6c874` | gold highlight; prestige/civic accents |
| `--art-gold-select` | `#f4d27a` | map selection / capital accent |
| `--art-warn` | `#e0b74a` | amber state (unrest warning) |
| `--art-danger` | `#e8776b` | red state (revolt, war front) |
| `--art-calm` | `#6fb98a` | green state (calm) |
| `--art-focus` | `#63c7d6` | move/attack highlight |

Nation colours and their colour-blind-safe remaps are owned by
`src/data/palette.ts` (`cbSafe`) — art never invents faction colours; crests
take the *resolved* colour as a `__C__` substitution.

## Legibility rules (hard requirements)

1. **Reads at 24px in the HUD and ~14px on the canvas.** If a detail
   disappears at those sizes, delete the detail, don't thin it.
2. **Shape, never colour alone.** The colour-blind palette
   (`data-colourblind`) remaps hues freely, so no red/green-only (or any
   hue-only) distinction may carry meaning. Two things that differ must
   differ in silhouette.
3. **Dark-background first.** Every asset is checked on `#11151c`. Map-drawn
   icons sit on a `rgba(13,15,20,0.55)` chip (the renderer draws it) so they
   read over any terrain fill.
4. **Self-contained inline SVG.** No raster, no `<image>`, no font or external
   refs, no scripting. `dependencies` stays `{}`; the built bundle keeps
   `grep -c 'fetch(' dist/assets/*.js` == 0.
5. **Decorative to assistive tech**: icons carry `aria-hidden="true"`; the
   adjacent label/tooltip carries the meaning.

## Family conventions already established

- **Resources** (gold, food, materials, knowledge, iron, horses): object
  icons; iron/horses are filled silhouettes because they double as map
  markers.
- **UI glyphs** (victory/trophy, capital/crown, strength/crossed-swords,
  alert/triangle, tutorial/cap, help/bulb, standings/bars, map, options/gear,
  records/medal, sound/speaker, ambient/note, plus lock, star, hourglass,
  flag, hexagon, book): stroke-first, one visual weight across the set.
- **Crests**: one shield template (`crest()` in `art.ts`), nation colour via
  `__C__`, unique `--art-ink-bright` sigil per faction — shape separates
  factions under any palette.
- **Units**: silhouette-per-role so the counter loop reads (pitchfork, sword,
  bow, horse+lance, catapult). **Buildings**: one-object-per-building; the
  prestige civic icons may use fixed `--art-gold-hi`.
- **Terrain**: flat base colours from `data/terrain.ts` plus hi/lo shade pairs
  in `TERRAIN_ART`; the *renderer* turns them into radial shading. Icons never
  ship their own gradients.

## Workflow for every new asset

Author in `src/data/art.ts` → registry entry (keep the `null`-fallback path
working) → `npm run typecheck && npm test && npm run build` →
`grep -c 'fetch(' dist/assets/*.js` == 0 → Playwright screenshots (desktop
1280×860 + phone 390×780, colour-blind toggle off *and* on) → Estonian commit
→ dated `docs/DEVLOG.md` entry. Scratch files stay in the session scratchpad,
never in the repo.
