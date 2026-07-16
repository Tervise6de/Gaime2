# Gaime2 — Game Design Document

> Detailed design spec for the Kingdom Management / 4X-lite game. This expands
> on the high-level vision in [`design.md`](design.md) with concrete decisions,
> systems, numbers, and a build plan. All open questions have been decided here
> deliberately (with brief reasoning) so implementation can proceed without
> further design blocking. Numbers are **illustrative starting values for
> tuning**, not final balance.

**Design north star:** a compact, systems-driven strategy game where you are
*always slightly under-resourced*, and every turn forces a trade-off between
**growing, defending, and researching**, against opponents that react to what
you do. Depth from interacting numbers, not from content volume or art.

---

## 1. Core Loop

**Turn-based, not real-time.** Rationale: turn-based is dramatically easier to
build, debug, and make *deterministic* (critical for a numbers-driven game and
for testing AI). It also fits the "menus + map" feel and lets the player think.

A turn is a **plan → commit → resolve** cycle:

1. **Review** (player reads state): treasury & income, resource stocks, per-region
   production/population/unrest, military positions, diplomatic standing, active
   threats and alerts.
2. **Decide / allocate** (the interesting part) — the player issues orders:
   - **Fiscal:** set tax rate (gold vs. unrest trade-off), national budget split.
   - **Regional:** queue a building or unit in each region's production slot.
   - **Research:** pick / continue the current tech.
   - **Military:** raise units, move armies along the region graph, set stances.
   - **Diplomacy:** propose/accept deals, declare war, sue for peace, demand tribute.
3. **End turn → deterministic resolution**, in a fixed order:
   `income & upkeep → production (buildings/units complete) → population growth &
   food → unrest/stability update → research progress → AI nations take their turns
   → army movement & combat resolution → events fire → victory check`.

### What creates tension / decisions

The game is fun because **you can never do everything at once**. Concretely:

- **Guns vs. butter vs. books:** gold funds military *or* buildings *or* research;
  every coin spent on one is denied to the others.
- **Tax vs. unrest:** higher taxes = more gold now, but rising unrest that saps
  production and can trigger revolts. There is no "free" income.
- **Expand vs. consolidate:** conquest grows your economy but adds upkeep,
  unrest, and enemies. Overexpansion is self-punishing (a natural anti-snowball).
- **Now vs. later:** military spending is defensive insurance; research and
  buildings are compounding investments. Under external pressure you rarely
  get to fully invest.
- **External clock:** AI neighbors expand and probe; a victory condition (below)
  means turtling forever loses. You must eventually *act*.

Target session length: **~60–150 turns**, ~30–60 minutes for a full game.

---

## 2. Scope — Smallest Genuinely-Fun Version

**Core thesis:** fun in 4X comes from *meaningful interacting decisions under
scarcity against reactive opponents* — **not** from content volume. So v1 goes
*deep on interaction, shallow on content*. A tight game with 4 resources and 20
regions that all matter beats a bloated one with 20 resources nobody tracks.

### v1 includes (the minimum that is still a real game)

- Procedural region-graph map, ~18–28 regions.
- 4 core resources + 1–2 strategic resources (see §3).
- ~5 terrain types with meaningful modifiers.
- Population + stability/unrest per region.
- ~4–5 unit types with a rock-paper-scissors counter loop; abstract combat.
- 2–3 AI rival nations with rule-based, personality-driven behavior.
- Light diplomacy (a handful of action types).
- A small branching tech tree (~15–20 techs).
- 2–3 victory conditions.
- Bounded random events for texture.
- Seeded procedural generation → replayability.

### Explicitly CUT from v1 (revisit later, if ever)

- **Real-time / simultaneous turns** — turn-based only.
- **Multiplayer / networking.**
- **Unit sprites, animation, tactical battle screens** — combat is resolved by
  math; armies are icons + numbers on the map.
- **SimCity-style in-city building placement** — cities/regions are abstracted
  to a small set of slots and modifiers, not spatial layouts.
- **Spatial trade routes, caravans, roads-as-objects** — trade is abstracted
  into diplomatic deals and coastal/adjacency bonuses.
- **Full culture / religion / espionage systems** — at most light flavor later.
- **Naval and air layers** — coasts give economic bonuses and adjacency only;
  no separate naval combat in v1.
- **Deep treaty webs** (defensive pacts chains, guarantees, world congress).
- **Fine-grained event chains / branching questlines** — events are single-beat.
- **Save/load complexity** — a simple JSON snapshot is enough for v1.

The discipline: **anything that adds art or content without adding a new
*decision* is cut.**

---

## 3. Core Systems

All systems are **numbers-driven** and, where possible, **data-defined** (tables
in `/src/data`) so balancing is editing data, not code. Turn resolution is a set
of **pure functions** over `GameState` → new `GameState` (deterministic, testable).

### 3.1 Map / Territory

- The world is a **graph of regions** (provinces). Each region has: owner, terrain
  type, population, buildings, stockpile contribution, unrest, fortification level,
  and a set of adjacent regions.
- Adjacency drives *everything spatial*: army movement, combat fronts, borders,
  trade/coast bonuses, and "border friction" with neighbors.
- Chokepoints, frontier vs. core regions, and defensible terrain create
  territorial decisions without a fine tile grid. (Technical details in §4.)

### 3.2 Economy

Per region, each turn:

```
food_out       = base(terrain) + buildings + pop_workers − pop_consumption
materials_out  = base(terrain) + buildings + pop_workers
gold_out       = trade(terrain, coast, buildings) × (1 + tax_rate) − upkeep
knowledge_out  = buildings + specialists
```

- **National treasury** accumulates gold; resources (food/materials/knowledge)
  are largely consumed the turn they're produced, with small stockpiles.
- **Upkeep**: armies and some buildings cost gold each turn. Negative treasury →
  **bankruptcy penalties** (forced unit disband, unrest spike). Debt is a real
  failure state, not a soft warning.
- **Taxes**: a global slider (e.g., 0–40%) converts more production into gold at
  a rising unrest cost. The central fiscal lever.
- **Core resources (4):** **Gold** (currency/upkeep), **Food** (feeds pop),
  **Materials** (builds units & buildings), **Knowledge** (research).
- **Strategic resources (1–2):** e.g., **Iron** / **Horses**, present only on
  certain terrains. Required to build advanced units → makes *specific territory*
  worth fighting for and enables resource-driven diplomacy/trade.

### 3.3 Population

- Each region has a population that **grows with food surplus and stability**,
  shrinks with famine or high unrest.
- Population works the land: more pop → more food/materials output, up to a
  **region capacity** (terrain + buildings raise the cap). Growth past capacity
  stalls → pressure to expand or invest in buildings.
- **Stability / Unrest** is the connective tissue that stops snowballing:
  - Rises from: high taxes, overexpansion (many/distant regions), recent conquest
    of foreign population, famine, war weariness.
  - Lowered by: certain buildings, garrisons, low taxes, tech.
  - High unrest → production penalty → at threshold, **revolt** (region stops
    producing, may spawn rebels or secede). This is the built-in brake: growth
    that outruns control collapses.

### 3.4 Military

- **Armies** are stacks of units occupying a region. Unit types (v1, ~5):
  **Militia** (cheap, weak, defensive), **Infantry** (generalist), **Ranged**
  (strong attack, weak in melee), **Cavalry** (fast, flanking), **Siege**
  (vs. fortifications).
- **Counter loop (rock-paper-scissors):** Spear/Militia > Cavalry > Ranged >
  Infantry > Spear — plus Siege as the fortification answer. Composition matters,
  so "just build the strongest unit" is never optimal.
- **Cost:** gold + materials (some need a strategic resource) to raise; gold
  **upkeep** each turn — armies are an ongoing economic drag, not a one-time buy.
- **Movement:** along the adjacency graph, limited moves/turn (cavalry more).
- **Combat (abstract, no tactical grid):**
  ```
  effective_strength = Σ(unit_strength × counter_modifier × terrain_mod × morale)
  defender gets: fortification_mod + terrain_defense + garrison
  outcome = f(attacker_strength, defender_strength, randomness)
  → casualties on both sides scaled by ratio; loser retreats or region is captured
  ```
  Terrain and fortification make *where* you fight as important as *what* you bring.

### 3.5 Diplomacy

- Each rival nation has a **relations score** with the player (and with each
  other), −100…+100, drifting over time and shifting on actions.
- **Player/AI actions (v1 set):** Declare War, Sue for Peace, Offer/Demand
  Tribute (gold or resource), Trade (resource/gold swap or per-turn deal),
  Non-Aggression Pact, Alliance. Deliberately small but expressive.
- Relations respond to: border friction, army buildup near borders (fear),
  broken deals (big penalty), gifts/trades (goodwill), shared enemies, and
  relative power. This makes diplomacy *reactive*, not scripted.

### 3.6 Tech / Research

- Knowledge accumulates into research points; the player picks one tech at a
  time from an unlocked frontier of a **small branching tree** (~15–20 nodes).
- Techs grant: new buildings, new units, economic multipliers, unrest tools,
  and new diplomatic options. Branches force build diversity — you **cannot get
  everything in one game**, so tech choice = strategy identity.
- Research is a **multiplier on your other systems**, which is why it's added
  after they exist (see build plan, §8).

### 3.7 How the systems interact (the web)

```
terrain ─▶ production ─▶ food ─▶ population ─▶ more production (‑unrest)
                    └─▶ gold ─┬─▶ military ─▶ conquest ─▶ +regions (+upkeep,+unrest,+enemies)
                              ├─▶ buildings ─▶ +production, −unrest
                              └─▶ research ─▶ unlocks ─▶ compounding edge, diplo options
diplomacy ─▶ avoid multi‑front war / gain resources ─▶ frees gold for growth
unrest ◀─ taxes, overexpansion, conquest, war  ── the brake that ties it together
```

The single most important feedback loop is **unrest as the anti-snowball**:
every powerful action (tax hard, expand fast, conquer foreigners) feeds unrest,
which throttles the very economy that powers it. Balance lives here.

---

## 4. Map — Technical Approach

**Decision: a graph of regions (provinces), not a hex tile grid.**

Reasoning:

- **Simplest thing that still creates interesting territorial decisions.** A ~20-node
  adjacency graph gives chokepoints, borders, and frontier/core dynamics without
  the entity count, pathfinding, and balancing burden of hundreds/thousands of hexes.
- **Lower art & rendering overhead** — matches the low-art brief. Regions are
  filled polygons with a border and an icon/label; no tilesets.
- **Trivial pathfinding** — BFS/Dijkstra over ~20–30 nodes is instant and easy
  to reason about (vs. hex A\* at scale).
- **Easier AI** — evaluating "attack which neighbor?" over a handful of adjacent
  regions is tractable and debuggable.

**Data model vs. rendering are separated:**

- **Logic layer = pure graph:** `regions[]` with `adjacency[]`. All rules
  (movement, combat, borders, trade) touch *only* the graph. This never changes
  regardless of how we draw it.
- **Rendering layer = Voronoi polygons:** generate region sites with relaxed/
  Poisson-ish sampling, compute a Voronoi diagram for cell shapes and a
  Delaunay triangulation for natural adjacency. Draw cells as colored polygons
  (color = owner; hatch/tint = terrain), armies/resources as icons on top.
- **Shippable fallback for M1:** if Voronoi polish isn't ready, render the same
  graph as **nodes + edges** (circles connected by lines). The game is fully
  playable this way; the polygon renderer is a visual upgrade over identical logic.

**Procedural generation** (seeded): place N sites → relax → Delaunay for
adjacency → assign terrain via a few noise/cluster passes (coasts on the hull,
mountains as barriers/borders, resource nodes scattered with constraints) →
place nations far apart with fair-ish starts. Everything derives from a single
seed for reproducible testing and shareable maps.

### 4.1 Island-world presentation (visual layer, decided in the M6 overhaul)

The territory view presents the region graph as an **organic landmass floating
in ocean**, not an edge-to-edge Voronoi mosaic. All of it is presentation over
the untouched graph, and all of it derives from the seed (no `Math.random`
anywhere in rendering):

- **Silhouette** (`systems/island.ts`): a radial support outline around the
  sites — smoothed so flats swell outward while extreme sites keep a
  guaranteed pad (every site provably stays on land) — plus hashed harmonic
  swell and fractal midpoint displacement for the coast. Decorative islets
  scatter in the remaining water.
- **Archetypes**: small / medium / large follow region count; qualifying maps
  (≥20 regions) roll archipelago on 1-in-4 seeds, clustering sites into 2–3
  landmasses. Cross-water adjacencies draw as dashed sea lanes. Framing
  margins per archetype make world size *feel* different at a glance.
- **Organic borders**: every shared Voronoi edge becomes a canonical
  midpoint-displaced polyline reused by both neighbouring cells (gap-free by
  construction); hit-testing uses the same polygons the player sees.
- **Political ink**: terrain reads first (fills + baked texture stamps);
  ownership reads at the borders — a light wash, a wide inner band along each
  realm's outer border/coast, a crisp owner-coloured edge per side (two-tone
  frontiers), a dark centreline, and loud red war fronts.
- **Caching discipline**: ocean, terrain and political ink are pre-rendered
  offscreen layers, rebuilt only when map/canvas size/ownership/wars/palette
  change; the steady-state frame is three blits + selection + markers.
- **Tuning**: every knob (framing margins, coast pads/roughness, texture
  densities, political widths/alphas, ocean palette) lives in
  `data/mapstyle.ts` — balancing the look is editing that table, not code.

- **Camera**: the fitted full-map view is the default (zoom 1 = everything
  visible, pan locked); wheel/pinch zooms up to ~2.75×, drag pans, double-
  click or the ⛶ button refits. Mid-gesture frames blit the cached layers
  through a delta transform; the crisp rebuild lands when input settles.
  Hit-testing runs through the same camera, so taps always match pixels.

The M1 node+edge fallback served its purpose during development and has been
retired — the island territory view is the game's sole renderer. Political
emphasis is tiered: every realm carries a loud rim (band + crisp two-tone
edge), and the player's realm is unmistakably loudest (stronger wash, wider
double band, full-strength edge) so "mine" reads at a glance.

---

## 5. AI Opponents

**Decision: rule-based *utility (weighted-scoring)* AI with personality
archetypes.** No ML. Deterministic, debuggable, tunable — and, done right, it
*feels* reactive because it responds to the real game state.

> **Hard constraint — the AI is 100% local and free to run.** Rival-nation AI
> is plain TypeScript that executes **entirely in the player's browser**. It
> makes **no LLM/API calls**, needs **no API key**, and consumes **no credits or
> tokens** — playing the game costs the player nothing and works fully offline.
> Claude (this assistant) is used only at *development* time to write and tune
> the rules; **none of that runs at play time**. This is a firm design rule, not
> an implementation detail: no game system may call out to any AI service at
> runtime. The upside is not just cost — a pure-function local AI is also
> deterministic (seeded), instant (no network latency), and unit-testable.

### How it works

Each AI nation runs the **same decision framework** each turn, under the same
rules and scarcity as the player:

1. **Assess** the situation into a few scalars: own power, each neighbor's power
   and relations, treasury health, unrest, threats (enemy armies on borders),
   opportunities (a weak, reachable neighbor).
2. **Score candidate actions** with a utility function weighted by the nation's
   **personality** (see below). Candidate actions span all systems: raise/move
   army, attack neighbor X, build/tax, research, propose trade/pact, demand
   tribute, sue for peace.
3. **Commit** the highest-utility actions that fit its budget; add small random
   tie-breaking for variety so games aren't identical.

### Personality archetypes (weights, drawn per game)

| Archetype | Aggression | Expansion | Economy | Trustworthiness |
|-----------|-----------|-----------|---------|-----------------|
| Warlord   | high      | high      | low     | low             |
| Merchant  | low       | med       | high    | high            |
| Builder   | low       | low       | high    | med             |
| Opportunist | med (spikes when you're weak) | high | med | low |

These weights change *thresholds*, not the framework — a Warlord declares war at
a less favorable power ratio; a Merchant prefers trades and only fights when
cornered. Same code, different feel.

### Why it feels reactive (not scripted)

- It attacks when the **power ratio + opportunity + aggression** align — i.e., it
  punishes your weakness and hesitates when you're strong.
- Relations shift on *your* behavior (army buildup near its border → fear → cooler
  relations → preemption; gifts/trades → goodwill).
- It sues for peace when losing, piles on when you're already at war, and forms
  convenient alliances against a runaway leader. All emergent from scoring, not
  hand-written scripts.

Difficulty knobs: number of AI, aggression weights, and small AI economic
bonuses on higher difficulty (never hidden rule-breaking that feels unfair).

---

## 6. Progression & Replayability

Each playthrough differs along several independent axes, so the space of games
is large without hand-authored content:

- **Procedural map** (seeded): region layout, adjacency, terrain, strategic-resource
  placement, and starting positions all vary.
- **Randomized start:** your starting terrain mix and neighbors; each nation
  (including you, optionally) draws a **national trait** from a pool (e.g.,
  *Fertile* +food, *Industrious* +materials, *Martial* cheaper units, *Mercantile*
  +trade gold, *Scholarly* +knowledge). Traits nudge you toward different openings.
- **Rival personalities & positions:** who you're boxed in with reshapes the game
  (a Warlord neighbor is a very different game than two Merchants).
- **Branching tech tree:** you can't unlock everything, so tech order becomes a
  build identity (rush military tech vs. economy vs. diplomacy tools).
- **Bounded random events** for texture: good harvest, plague, ore discovery,
  migration wave, local uprising, wandering mercenaries for hire. **Low variance
  by design** — events add color and small adaptations, never coin-flip the game.
- **Multiple victory paths** (choose your own goal each game):
  1. **Domination** — control ≥ ~60% of regions, or eliminate all rivals.
  2. **Economic / Great Works** — build a set of prestige projects (or reach a
     treasury + tech milestone) — a builder/turtle path.
  3. **Prestige (score) at turn limit** — highest score at turn ~150 (fallback so
     every game ends decisively).

Different victory paths reward different strategies from the *same* systems,
which is the cheapest, highest-leverage source of replayability we have.

---

## 7. Tech Stack Decision

**Confirmed from setup, with a few additions.**

| Concern | Decision | Why |
|--------|----------|-----|
| Language | **TypeScript** | Typed game state catches whole classes of bugs in a numbers-heavy sim. |
| Map rendering | **Canvas 2D** | Polygons/icons/lines, no 3D, no asset pipeline. |
| UI / HUD | **DOM + CSS over the canvas** | Menus, panels, tooltips, tables are far faster to build and style as HTML than drawn on canvas. Hybrid: canvas = map, DOM = UI. |
| Build/dev | **Vite** | Instant HMR, fast prod build, zero-config TS. |
| State | **Plain `GameState` object + pure reducer-style turn functions** | Deterministic, serializable, testable; no heavy state library needed. |
| Randomness | **Seeded RNG** (e.g., mulberry32) | Reproducible map gen and AI for debugging, testing, and shareable seeds. *Mandatory* — no `Math.random()` in game logic. |
| Testing | **Vitest** | Systems are pure functions → cheap, high-value unit tests. Essential for balancing a numbers game with confidence. |
| **Opponent AI** | **Local rule-based TS, zero runtime API calls** | Runs in-browser, offline, free — **no LLM/credits/API key to play**. See §5's hard constraint. |
| Geometry | Tiny vendored Delaunay/Voronoi helper (or hand-rolled) | Only external code we likely need; keep deps minimal. |

**Revisions vs. the setup doc:** add **Vitest** (test the sim), mandate a
**seeded RNG** and **pure-function turn resolution** (determinism), and formalize
the **Canvas-for-map / DOM-for-UI hybrid**. No game engine, no art dependencies.
This is the simplest stack that lets us iterate fast on *systems*.

Architectural guardrails (unchanged from `design.md`): **systems** hold logic and
never touch the DOM; **ui** observes state and emits intents, never mutates the
sim; **data** holds serializable content. Turn resolution stays a pure pipeline.

---

## 8. Build Plan (Milestones)

Each milestone is an **independently playable, testable slice** — never a
half-system that can't be run. Ordering principle: build the **economic
substrate first**, then the **pressures** that make it a game, then the
**opponents**, then the **goals/variety**, then **polish**. Research lands after
the systems it multiplies exist.

> **M0 — Infrastructure ✅ (done):** Vite + TS + Canvas scaffold, blank canvas,
> folder structure, build/dev verified.

**M1 — Map + Economy skeleton.**
Seeded procedural region graph; render it (node+edge fallback is fine, Voronoi if
ready); one nation (the player); regions produce gold/materials/food/knowledge by
terrain; treasury; tax slider; **end-turn advances the economy**.
*Playable slice:* set taxes, watch the economy tick, manage a treasury. Establishes
the core loop, `GameState`, seeded RNG, and the pure turn pipeline. Unit-tested.

**M2 — Population + Stability + Buildings.**
Population growth from food; region capacity; **unrest/stability**; buildings you
queue in a region's production slot (production/unrest/knowledge modifiers).
*Playable slice:* real economic decisions appear — tax vs. unrest, build vs. save,
grow vs. stall. The guns-vs-butter tension (minus guns) is now live.

**M3 — Military + Territorial conflict.**
Unit types + counter loop; armies; movement on the graph; abstract combat;
fortification/terrain defense; capturing regions. Populate the map with **neutral
/ barbarian regions** to conquer (no rival diplomacy yet).
*Playable slice:* expansion via force; the guns-vs-butter-vs-consolidation
trade-off is complete. Conquest feeds economy and unrest.

**M4 — AI Nations + Diplomacy.**
Rival nations with the §5 rule-based AI and personalities; relations; the §3.5
diplomatic action set (war/peace/trade/tribute/pact/alliance).
*Playable slice:* it is now a **4X game** — reactive opponents, multi-front
pressure, diplomacy to avoid it. The external clock starts ticking.

**M5 — Tech/Research + Victory + Events.**
Branching tech tree; research loop; the 2–3 victory conditions with an end-game
check; bounded random events.
*Playable slice:* games now have **goals and divergent strategies** end-to-end —
a full, winnable, replayable game.

**M6 — Polish + Balance.**
Tuning passes on the data tables; difficulty settings; UX (tooltips, alerts,
turn summary); simple JSON save/load; playtest-driven balance. Voronoi map
rendering polish if still on the node+edge fallback.
*Outcome:* a tight, shippable v1.

Rationale for the order: economy is the substrate everything reads from; unrest
must exist before conquest or expansion has no downside; conquest must exist
before AI opponents matter; research is a multiplier so it's most valuable once
there are systems to multiply; polish/balance can only be done meaningfully once
the whole loop is playable. Every step leaves us with something we can actually
play and test.

---

## Summary of key decisions

- **Turn-based**, plan → commit → deterministic resolve; tension from *guns vs.
  butter vs. books* under permanent scarcity, with **unrest as the anti-snowball**.
- **Small but deep** v1: ~20-region graph, 4 core + 1–2 strategic resources,
  ~5 unit types with a counter loop, 2–3 AIs, light diplomacy, ~15–20 techs,
  2–3 victory paths. Real-time, multiplayer, tactical battles, and city-building
  micro are **cut**.
- **Map = region adjacency graph** (logic) rendered as Voronoi polygons (visual),
  with a node+edge fallback — simplest approach that still yields territorial play.
- **AI = rule-based utility scoring** with personality archetypes — reactive by
  responding to real state, not scripts. **Runs 100% locally in the browser:
  no LLM/API calls, no API key, no credits — free and offline to play.**
- **Replayability** from seeded procedural maps, national traits, rival
  personalities, branching tech, bounded events, and multiple victory paths.
- **Stack** confirmed: TS + Canvas (map) + DOM (UI) + Vite, **plus** Vitest,
  seeded RNG, and pure-function deterministic turn resolution.
- **Build plan:** M1 economy → M2 population/unrest → M3 military → M4 AI/diplomacy
  → M5 tech/victory → M6 polish, each a playable, testable slice.
