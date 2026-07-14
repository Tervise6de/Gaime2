# DEVLOG

Reverse-chronological log of development cycles. Each entry is one verified,
committed slice.

---

## 2026-07-14 — End-game summary screen

**Development 2 of 3.** A real post-game overlay (`ui/endscreen.ts`) that opens
when a game ends, built as a pure read of existing state.

- **Prestige-history line graph** from `state.scoreHistory` (SVG): one line per
  nation, coloured by the nation entity (identical to the map). Recessive
  gridlines, x/y axis labels, direct end-labels with a vertical de-collision
  pass, and a hover crosshair + per-turn tooltip ranking every nation. Follows
  the dataviz method (change-over-time → lines; colour by identity; names as the
  always-present secondary encoding).
- **Final scoreboard**: rank, nation (swatch + name), regions, prestige, status,
  sorted by prestige with the winner highlighted.
- **Nation palette** promoted to a CVD-validated categorical set (validated with
  the dataviz palette checker: chroma + CVD-separation + contrast pass). One
  source of truth in `state.ts`, so the map, army badges, and graph all agree.
- Wired into `main.ts` (replaces the cycle-1 placeholder banner); "Uus mäng"
  starts a fresh seeded game and dismisses the overlay.

### Verification

- `npm run typecheck` ✓, `npm test` ✓ (12), `npm run build` ✓; `fetch` in
  bundle == 0.
- Playwright browser verification ✓: played to a decisive end, overlay shows
  4 prestige lines, a 4-row scoreboard with the winner highlighted, working
  hover tooltip, and "Uus mäng" dismisses it — zero console errors, zero
  external network. Verification also caught and fixed a real bug: a
  `.endscreen { display:flex }` rule was overriding the `hidden` attribute, so
  the invisible overlay was swallowing all map clicks (fixed with
  `.endscreen[hidden]{display:none}`).
- No AI/balance change this cycle, so no self-play probe was needed.

---

## 2026-07-14 — AI concentration of force (+ game foundation)

**Development 1 of 3.** The AI now masses and merges armies to crack defenders
no single stack can beat — the highest-impact lever on challenge. Because the
repository was infrastructure-only (blank canvas, no game), this cycle also
lands the foundation the behaviour needs.

### Foundation (M1–M5, compressed into pure `systems/`)

- **Seeded RNG** (`rng.ts`, mulberry32) with the cursor persisted in
  `GameState.rngState` — the whole simulation is deterministic and serialisable.
- **Procedural map** (`geometry.ts` Bowyer–Watson Delaunay → `mapgen.ts`):
  relaxed sites, Delaunay adjacency (the logic graph), terrain, and
  well-separated nation starts. Reproducible from a seed.
- **Economy** (`economy.ts`): per-region gold, tax rate, army upkeep,
  population growth toward terrain capacity.
- **Military** (`combat.ts`, `actions.ts`): five unit types with a counter loop,
  fortification + terrain + population defence, abstract combat, army movement,
  and friendly-merge (concentration) on arrival.
- **Prestige scoring** (`scoring.ts`) recorded into `state.scoreHistory` every
  turn — the data the end-game summary (dev 2) will graph.
- **Victory** (`victory.ts`): domination / elimination / prestige-at-turn-limit.
- **Pure turn pipeline** (`turn.ts`): `endTurn(state) => newState`, clones then
  runs economy → AI nations → fort upkeep → snapshot → victory check.
- **Renderer** (`render/nodeEdge.ts`): the always-available node+edge map
  renderer behind a `MapRenderer` interface (the Voronoi renderer in dev 3 will
  implement the same interface). Lives in `render/`, not `systems/`, so the
  DOM-free rule holds.
- **UI** (`ui/hud.ts`, `main.ts`): DOM HUD over the canvas — treasury, income,
  tax slider, region panel, unit/fort actions, event log, end banner. UI emits
  intents; it never mutates the sim directly.

### The development: concentration of force (`systems/ai.ts`)

Rule-based, 100% local, deterministic, no network/LLM calls. Each AI nation
runs: economy (taxes, produce troops, siege when the enemy fortifies, forts for
defensive archetypes) → opportunistic solo strikes → **concentration of force**
→ march idle armies to the front. Concentration evaluates every hostile target,
finds one no single stack can crack but a merged stack can, funnels reachable
armies onto a common staging region (they auto-merge), and strikes with the
combined force. Personality weights shift attack margins without changing the
framework. An `AiOptions.concentrate` flag lets the behaviour be A/B measured.

### Verification

- `npm run typecheck` ✓, `npm test` ✓ (12 tests: RNG + map determinism,
  full-game determinism, score snapshots, guaranteed end state, and the
  concentration property — a fortified defender beats a single stack but not the
  merged stack, and the AI massed rather than attacked alone).
- `npm run build` ✓; `grep -c 'fetch(' dist/assets/*.js` == **0** (disabled
  Vite's module-preload polyfill, which had injected the only `fetch`).
- Playwright browser verification ✓: map + HUD render, turns advance, game
  reaches an end state with a winner banner, zero console errors, zero external
  network requests.
- Temporary self-play probe (deleted): 24 games, concentration ON vs OFF —
  fortified-region captures **25 → 11** with concentration on, games decisive
  (23/24 domination), fully deterministic, no stalls.
