# Art plan — executing the D1 brief (`docs/art-agent-brief.md`)

Working plan for giving Hansa its visual identity. Derived directly from the
brief; this file records the decisions the brief left to the executing agent
and the order the work lands in.

## Style decision (committed)

> Codified in **`docs/art-style.md`** — the style bible (palette tokens, grid,
> stroke and legibility rules) every future asset must conform to.

**Flat-vector, stroke-first line icons** on a shared 24×24 grid:

- Single consistent stroke weight (2px at 24px), rounded joins, minimal fills.
- One warm **gold/brass accent** (`#e6c874` on `#c9a24b`) inherited from the
  existing favicon crown — the game's only "brand" mark today.
- Icons are **monochrome by default** (`currentColor`) so they follow UI text
  colour, survive the colour-blind palette, and never rely on hue alone.
- Nation crests are the exception: a shield silhouette **parameterised by the
  nation's colour** (routed through `cbSafe`, so the colour-blind toggle
  remaps crests exactly like map ownership) plus a unique white sigil per
  faction — shape distinguishes factions even at identical-looking colours.

Why flat-vector over painterly/pixel: the design pillar is *systems over
spectacle*; everything must read at ~24px on canvas nodes of ~26px radius;
inline SVG is tiny, crisp at any zoom, theme-able, and needs no pipeline or
dependency (`dependencies: {}` stays).

## Architecture (the code-side task, lands first)

- **`src/data/art.ts`** — the single asset registry. Plain serialisable maps:
  resource / UI-glyph / unit / building / nation / terrain ids → SVG source
  strings (or `null` → caller falls back to today's emoji/colour). Balancing
  art = editing this table, mirroring the data-driven content philosophy.
- **`src/ui/icons.ts`** — DOM-side helper: `iconEl(id)` returns an inline
  `<svg>` element (emoji `<span>` fallback when no asset), used by the HUD.
- **Canvas image cache** in `src/systems/renderer.ts` — SVG source →
  `data:` URI → `HTMLImageElement`, cached by (id, colour, size) so the render
  loop never re-decodes; follows the existing Voronoi caching discipline.
  Fallback path (emoji text / flat colour) stays intact: the game renders
  fine with zero assets.

## Phases (brief's priority order; one verified commit each)

1. **Scaffolding** — registry + icon helper + canvas cache, everything routed,
   zero visual change, tests green.
2. **Resource icons (6) + UI glyph set (~15)** — kills the emoji look:
   top-bar resources, toolbar buttons, legend rows, map markers
   (crown/hammer/shield/iron/horses), victory chips.
3. **Nation crests (7)** — standings, diplomacy panel, capital markers.
4. **Terrain + background** — shaded radial fills per terrain (node view),
   tinted fills (Voronoi view), vignette world background over flat `#11151c`.
5. **Unit + building icons** — recruit/build panels, civic landmarks get
   a distinct laurel treatment.
6. **Favicon + PWA icons (192/512)** — derived from the crest/crown mark.
7. *(stretch)* Victory/defeat end-cards, event vignettes.

## Verify loop (every phase, per the brief)

`npm run typecheck && npm test && npm run build` →
`grep -c 'fetch(' dist/assets/*.js` must be 0 → Playwright browser check
(vite preview :4173, scratch script) screenshotting map + HUD at 1280×860 and
390×780 with colour-blind and reduce-motion toggles exercised → dated
`docs/DEVLOG.md` entry → commit (Estonian) → push `main`.

## Deliberately left for a human (per the brief)

- Final **game name** + logo direction — "Hansa" is the current working title;
  renaming before store launch is a product call.
- Whether any asset gets **commissioned/generated** externally (licence,
  budget) — everything here is hand-authored original SVG, so
  `docs/THIRD_PARTY_ASSETS.md` is not yet needed.
- **Store-icon target platform** sizes beyond the web 192/512 pair (D3).
