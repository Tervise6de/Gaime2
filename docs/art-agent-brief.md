# Art agent brief — Gaime2 visual identity (Phase D1)

**You are a fresh agent taking over Gaime2 to give it a real visual identity.** The
autonomous *code* development loop is finished and has been stopped: the game is
feature-complete and testing-ready (~90+), 368 tests green, dependencies `{}`, fully
offline. What it lacks is art — today it is flat colours, emoji, and CSS. Your job is
to replace those placeholders with real, coherent, self-contained visual assets.

Read `CLAUDE.md`, `docs/game-design.md` §7 (layering), and the newest `docs/DEVLOG.md`
entries first. Work on branch `claude/gaime2-autonomous-dev-y0q733` (create from
latest `origin/main`); push `main` + mirrors `claude/milestone-1-playable-r0hjxb` and
`claude/gaime2-autonomous-dev-y0q733`; commit messages in Estonian; **no PRs**.

---

## Hard constraints (non-negotiable — from the engineering guardrails)

1. **100% local / offline.** No CDN, no external fonts, no network. Assets ship
   *inside the bundle* (imported via Vite or inlined). The built bundle must keep
   `grep -c 'fetch(' dist/assets/*.js` == 0.
2. **`package.json` dependencies stays `{}`.** No image-pipeline libraries, no icon
   packs as deps. Use Vite's built-in asset handling only.
3. **Prefer SVG.** It's crisp at any canvas zoom, tiny, themeable, and inline-able.
   Use PNG/WebP only where SVG can't express it; if so, embed as `data:` URIs or
   Vite imports, keep them small, and keep the bundle local.
4. **Canvas-drawable.** Map art (terrain, units, buildings, crests) is painted by the
   2D renderer (`src/systems/renderer.ts`) via `drawImage`/paths at small sizes
   (nodes are ~26px radius). Everything must read at those sizes.
5. **Theme- & accessibility-safe.** The UI already has a **colour-blind palette**
   toggle (`data-colourblind`) and a **reduce-motion** toggle (`data-reduce-motion`).
   Art must have enough contrast to survive the colour-blind palette and read on the
   dark background (`#11151c`). Don't reintroduce red/green-only distinctions.
6. **Never break the sim.** `systems/` stay pure and DOM-free; only `ui/` and the
   renderer touch pixels. Keep the turn pipeline deterministic (no `Math.random`/`Date`
   in sim). Keep all tests green.
7. **Licensing.** Only original or clearly-licensed assets. Record provenance in a new
   `docs/THIRD_PARTY_ASSETS.md` (name, source, licence) for anything not hand-made.

## Verify every cycle before committing
`npm run typecheck && npm test && npm run build`, then `grep -c 'fetch(' dist/assets/*.js`
== 0, then **browser-verify** with the Playwright recipe (vite preview :4173 + a scratch
`.mjs`, cleaned up after) — screenshot the map and the HUD to confirm the art renders at
both desktop (1280×860) and phone (390×780) widths, in both light/dark and with the
colour-blind + reduce-motion toggles on. Append a dated `docs/DEVLOG.md` entry.

---

## Current placeholders → what to produce

| Area | Today (placeholder) | Deliverable |
|------|--------------------|-------------|
| **Terrain** (`data/terrain.ts`) | 5 flat colours: plains `#8fae5d`, forest `#3f7a4f`, hills `#a98b52`, mountains `#7c7f88`, coast `#569a87` (teal-green so it reads as coastal *land*, not a lake) | 5 tileable/shadeable terrain fills or textures + coastline/border treatment + a world background (replaces flat `#11151c`) |
| **Units** (`data/units.ts`) | 5 types (militia, infantry, ranged, cavalry, siege) — **no icon**, just a count badge | 5 unit icons, legible at ~24–32px; consistent silhouettes so the counter-loop reads |
| **Buildings** (`data/buildings.ts`) | 14 buildings shown as **text**; nothing on map | 14 building icons (~24px); a distinct **Wonder/Great Work** treatment (it's a victory path) |
| **Resources** (`RESOURCE_META` in `ui/hud.ts`; `RESOURCE_ICON` in renderer) | emoji: 🪙 gold, 🌾 food, ⛏️ materials, 📖 knowledge, ⚒ iron, 🐎 horses | 6 custom resource icons (emoji render inconsistently — highest-visibility swap) |
| **UI glyphs** | emoji chips: 🏆 👑 ⚔ ⚠ 🎓 💡 📊 🗺 ⚙ 🏅 🔊 🎵 | ~12–15 matching UI icons (one designed set, not an emoji grab-bag) |
| **Nation identity** (nation `color` in `data/*`) | player + 5 rivals = **just a colour** | 6+ faction crests/banners (diplomacy panel, standings, capitals); optionally themed to the personality archetypes |
| **Title / menu** | **none** — boots straight into a match; `<title>` = "Gaime2 — Kingdom Management" | title screen / key art + a real logo-wordmark (the name "Gaime2" is itself a placeholder — propose a real one) |
| **App/store icons** | one basic `assets/icons/favicon.svg` | favicon + PWA icons (192/512) + store icon sizes |
| **Moment art** (optional) | events/victory/defeat are text-only | victory/defeat end-cards; a few reusable event vignettes (plague, festival, war, harvest) |

## Priority (biggest visual return first)
1. Resource icons + UI glyph set (kills the emoji look instantly).
2. Nation crests (colored dots → real factions).
3. Terrain treatment + world background (the screen you stare at 95% of the time).
4. Unit + building icons.
5. Title screen / logo + store icon.
6. Victory/defeat + event illustrations.

## The code-side task (do this even before final art exists)
Build the **asset-swap scaffolding** so art slots in as a table edit, not a code hunt:
- A single **asset registry** (e.g. `src/data/art.ts` / `src/ui/assets.ts`) mapping
  terrain / unit / building / resource / nation ids → asset handles, with the current
  emoji/colour as the fallback when an asset is absent.
- Route the renderer's terrain fills, resource glyphs, and (new) unit/building/crest
  draws through the registry; route the HUD's `RESOURCE_META` and toolbar glyphs
  through it too.
- An **image cache/loader** for SVG/`data:` assets so the canvas draws them without
  re-decoding each frame (respect the existing Voronoi-style caching discipline).
- Keep the fallback path working so the game always renders even with zero assets —
  land the scaffolding first (tests green), then drop assets in incrementally.

Each incremental asset drop is one verified cycle: add the asset, wire it in the
registry, browser-verify it renders at both breakpoints and under the a11y toggles,
commit, push, DEVLOG.

## What needs a human decision (surface these, don't guess)
- Final **game name** and logo direction ("Gaime2" is a placeholder).
- Overall **art style** (painterly vs. flat-vector vs. pixel) — commit to one and
  keep everything consistent with it.
- Whether any asset is **commissioned/generated** vs. hand-authored (licence + budget),
  and the **target platform** for store-icon sizes (D3).
