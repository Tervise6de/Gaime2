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

- **Armies** are stacks of units occupying a region. Each of the four counter
  roles has a **basic** (cheap, from the start) and a tech-gated **premium** that
  counters the same type, plus **Siege** as the fortification answer — nine land
  units in a clean four-cycle (SHIPPED v0.42–v0.43):

  | Counters | Basic | Premium (gate) |
  |---|---|---|
  | Cavalry | **Militia** (cheap, defensive) | **Pikemen** — tanky anti-cavalry wall (Feudalism) |
  | Militia | **Infantry** (generalist line) | **Swordsmen** — elite men-at-arms, more bite + armour (Standing Army + iron) |
  | Infantry | **Ranged** (strong attack, weak melee) | **Handgunners** — hard volley, fragile in melee (Gunpowder + iron) |
  | Ranged | **Cavalry** (fast, flanking) | **Knights** — heavy shock horse, the orders' mailed fist (Feudalism + horses) |

  Plus **Siege** (vs. fortifications). Premiums cost more and gate behind tech
  (often a strategic resource), so the early game is the tidy four-unit loop and
  the late game adds heavy specialists — each *counters an existing type*, so the
  loop never widens past four cycles.
- **Counter loop (rock-paper-scissors):** Militia/Pikemen > Cavalry/Knights >
  Ranged/Handgunners > Infantry/Swordsmen > Militia — plus Siege as the
  fortification answer. Composition matters, so "just build the strongest unit"
  is never optimal.
- **Cost:** gold + materials (some need a strategic resource) to raise; gold
  **upkeep** each turn — armies are an ongoing economic drag, not a one-time buy.
- **Movement:** along the adjacency graph, limited moves/turn (cavalry more).
- **Combat (abstract, no tactical grid) — phased (v2, `systems/combat.ts`):**
  A fight resolves as an **opening volley** then up to `MAX_COMBAT_ROUNDS` of
  **melee attrition**, all from the seeded RNG (deterministic, unit-tested):
  ```
  volley:  ranged + siege fire first; siege also strips fortification.
  melee:   each round, atk_power = Σ(strength × counter_mod) × jitter
                        def_power = same × terrain_defense × (1 + eff_fort·FORT) × jitter
           each side sheds a share of its stack scaled by the power ratio; the
           round's loser always sheds ≥1 regiment so the fight converges.
  outcome: defender wiped → captured; attacker wiped → repelled; neither → held.
  ```
  Every fight yields a `BattleReport` — the phase-by-phase blow-by-blow the UI
  replays (Options → Gameplay → "Show combat report"). Terrain and fortification
  make *where* you fight as important as *what* you bring; the counter loop
  (Militia > Cavalry > Ranged > Infantry > Militia, Siege vs. forts) makes
  composition matter.

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
- **Caching discipline**: ocean, terrain and political ink bake ONCE in
  camera-independent base space (supersampled ≈2×, pixel-budgeted) and fold
  into one static composite; every frame draws that composite through the
  live camera transform, so pan/zoom never rebuilds a layer — gestures are
  hitch-free by construction (measured p95 ≈ one 60 Hz frame). Layers rebuild
  only when the map, canvas size, ownership, wars or palette change. A dirty
  flag skips idle frames entirely, and the render loop doesn't start until
  the title menu closes.
- **Tuning**: every knob (framing margins, coast pads/roughness, texture
  densities, political widths/alphas, ocean palette) lives in
  `data/mapstyle.ts` — balancing the look is editing that table, not code.

- **Camera**: the fitted full-map view is the default (zoom 1 = everything
  visible, pan locked); wheel/pinch zooms up to ~2.75×, drag pans, double-
  click or the ⛶ button refits. Mid-gesture frames blit the cached layers
  through a delta transform; the crisp rebuild lands when input settles.
  Hit-testing runs through the same camera, so taps always match pixels.
- **Marker tooltips**: every map glyph (fortification shield, capital crest,
  population chip, resource/unrest/construction icons, army badges) registers
  a hit circle each frame; hovering one floats a plain-language HUD tip, so
  the marker vocabulary is self-teaching (the legend stays for reference).
- **Legible water**: deterministic sea-life silhouettes (whale, fish
  schools, a serpent) scatter in open water so the ocean unmistakably reads
  as ocean.
- **Nameplates**: realm names draw per frame (crisp at any zoom, never cut
  by the sea) with collision avoidance — each plate takes the first vertical
  slot clear of region labels, marker clusters and other plates, so big
  realm names stop stamping over the map's small text.

The M1 node+edge fallback served its purpose during development and has been
retired — the island territory view is the game's sole renderer. Political
emphasis is tiered: every realm carries a loud rim (band + crisp two-tone
edge), and the player's realm is unmistakably loudest (stronger wash, wider
double band, full-strength edge) so "mine" reads at a glance.

**Pacing (turn report).** Turn resolution is instant, which made eventful
turns easy to miss. After each non-quiet turn an optional modal (on by
default; Options → Gameplay) replays the outcome at reading speed — the
summary diff plus standing dangers — and holds Enter/Space, so mashing the
end-turn key pauses at each report instead of skipping history. Quiet turns,
pending decisions and decided games never pause.

**Region screen.** Clicking a region on the map opens it full-size — a wide
two-column modal (the same screen behind the Capital rail button and the
inspector's ⛶). The compact right-rail inspector stays as the at-a-glance
residue after the screen closes.

**Time & the top strip.** The top bar is Civ-style: compact icon+value(+flow)
resource chips on the left, crisis/modifier chips and victory progress
centred, and a grand turn readout on the right — turn, calendar year and the
age of the world (`data/eras.ts`: one turn = one year from 900 AD, five named
ages across the 150-turn game). Seed, difficulty and the realm trait live in
the map legend's "This world" card instead of crowding the bar.

**Population & army presentation.** The sim tracks population and army
strength in abstract units (~1–20 per region/stack); the UI presents both as
people at ×1,000 (`systems/format.ts`) — "4,300 / 10,000" population,
"3,000 soldiers" armies ("3k" on badges, one unit = a 1,000-strong regiment;
combat and merge log lines speak in soldiers too) — so the world reads as
populated without touching the simulation's numbers.

**Nothing idle, ever (advisor + production overview).** One construction slot
builds at a time per region, but you may now **queue** the builds that follow
(§9.4, v0.36) so a province's plan isn't lost between turns; the end-turn advisor
still flags a genuinely *idle* slot (nothing building and nothing queued). Two aids
carry that legibility: the end-turn advisor (chips above End turn listing unchosen
research, idle build slots and armies with moves left — each a jump, never a hard
block; `ui/advisor.ts`, pure and unit-tested) and the Production overview
(B / rail button, badge = idle count): every region's project, bar and ETA
on one screen, with a quick-build picker on idle rows.

**Army merging (CK3-style).** Moving an army onto a region holding another
of your armies merges the stacks — the targets panel says "merge → N" before
the click, and the merge is logged ("3 + 2 = 5 units"), so combining forces
is a deliberate, visible act rather than a silent side effect.

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
  migration wave, local uprising, wandering mercenaries for hire, and — tying the
  religious layer (§9.6) into the event stream (v0.34) — a **wandering preacher**
  who wins a nearby province to your faith, a **saint's relic** that firms a
  wavering province, and **heresy** that slips a border province to a rival creed.
  Many events are player **decisions** (the AI auto-resolves its own). **Low
  variance by design** — events add color and small adaptations, never coin-flip
  the game.
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

---

## 9. Post-v1 Roadmap — "CK3 × Civilization" direction (planned)

v1 is a complete, playable loop. This section records the agreed direction for
the next phase and the concrete design for each system, so implementation is
"build the plan", not "invent while coding". Sequenced by felt impact.

### 9.0 World identity — real setting, real powers, wider board
**Shipped (v0.14):** the procedural world is now themed as the **medieval
Baltic rim** (~900 AD onward — the era the game already opens in). Rival powers
are real: **Lithuania, Novgorod, Denmark, Prussia, Livonia, Poland, Sweden,
Curonia** (a mix of pagan tribal confederations, Rus republics and Christian
kingdoms). Regions carry real Baltic toponyms (Riga, Reval, Dorpat, Danzig,
Novgorod, Visby, …). Neutral holders are **Free Tribes**. Map sizes widened
(Small 18 / Medium 30 / Large 40 / Grand 48; default Medium) and up to 6 rivals.

**Shipped (v0.15) — real geographic maps.** A scripted-map format
(`data/maps/*`) supplies authored coastlines (land-around-sea, as separate
blobs) + fixed real regions; `mapgen` derives movement adjacency from the
Voronoi of those sites (capped so cross-water hops are short straits, not
sea-spanning teleports); the renderer clips its cells to the authored coast
instead of a generated island. Two maps ship — **The Baltic** (Sweden,
Finland, Livonia/Rus, Prussia/Poland, Denmark, Gotland, Ösel) and **Europe**
(the continent + Iberia/Italy peninsulas, with Britain, Ireland and
Scandinavia across the seas) — chosen from a **World** picker (Random /
Baltic / Europe) in new-game setup. A guard test asserts every region sits on
land and each graph is connected.

**Outer world + island shapes (v0.17).** Scripted maps gain an optional
`context` layer — faded, non-interactive land beyond the play area (Baltic:
Norway, Lappland, the Rus, the Empire; Europe: the North, the Steppe, Africa,
Byzantium) with dim place labels, drawn under the active land and framed by a
larger inset — so the map reads as a real region of a larger world rather than
floating landmasses. Islands (Gotland, Saaremaa, Sicily) were re-authored with
proper multi-vertex outlines instead of triangles.

**Historical homelands + play-as (v0.16).** Each scripted map declares its
starting **factions** — the real powers, each owning its home regions. Every
region belongs to exactly one realm (guard-tested). New-game setup gains a
CK3-style **"Play as"** picker — choose your realm (or Random); the rest are AI,
all seated on their own ground, the human's realm re-coloured to the player
gold. `createGame` takes a scripted-faction path (no random capitals).

**Playable faction roster (v0.22).** A single data-driven roster of **12 Baltic
realms** (`data/factions.ts`: Sweden, Denmark, Novgorod, Lithuania, Prussia,
Livonia, Poland, Curonia, Estonia, Finland, Gotland, Samogitia), each with an
identity (name, colour, flavour), a **signature national trait** (a yield lean or
cheaper armies, from the five-trait system) **and a unique opening bonus** (v0.28):
a distinct edge applied once at game start — a free Age-of-Founding tech (Novgorod
Writing, Poland Agriculture, Prussia Pottery, Finland Warcraft), extra treasury
(Gotland +55, Denmark +45, Curonia +40, Livonia +35) or extra regiments (Sweden,
Lithuania, Estonia, Samogitia). Applied in both createGame paths; shown in the
picker. Kept to creation-time effects so nothing couples to the live economy/
combat loops. The **"Play as" picker now appears for random games too**, not
just scripted maps: a random game offers the whole roster, the Baltic map its
**ten seated realms** (Finland, Estonia and Gotland joined the original seven).
Realms join by **name**, so a people plays with the same identity and trait in a
random world or on the Baltic map. The player always plays *some* named realm
(Random seed-picks one); rivals are distinct realms from the roster.

**Signature AI disposition (v0.37).** A third, standing per-faction difference
beyond the trait and the one-off opening bonus: each realm now carries a fixed AI
**disposition** (`data/factions.ts` → `Personality` archetype), so when it is
computer-controlled it plays *in character* — warlike Sweden and Samogitia press
war readily (Warlord), the Hansa realms Denmark, Curonia and Gotland prefer trade
and keep their word (Merchant), Novgorod/Prussia/Livonia/Estonia/Finland turn
inward to grow (Builder), and Lithuania and Poland strike at weakness (Opportunist).
Seated in both createGame paths (replacing the old shuffled round-robin; absent =
round-robin fallback), surfaced as a "Temperament" line in the realm picker, and
balanced for a dynamic-but-not-perpetual-war world (a 60-game sweep: ~57/60 games
see war, ~2.3 declarations each, ~⅓ still resolved by prestige). Pure data — the
existing `ai.ts` thresholds already read `personality`, so no new sim logic.

**Signature home focus (v0.41).** A fourth per-faction touch: each realm's
**capital opens with its signature region focus** (`FactionDef.homeFocus`) — a
martial seat (Sweden, Lithuania, Samogitia) starts a **Garrison**, a Hansa one
(Denmark, Curonia, Gotland) a **Market town**, the builders (Prussia, Livonia,
Finland) a **Workshop**, Novgorod an **Academy**, the grain realms (Poland,
Estonia) **Farmland** — so factions read distinctly from turn 1 and the focus
system is introduced by example. It is only a pre-set of a normal player choice
(you can re-focus your capital; the AI keeps its home focus as it does any other),
seated in both createGame paths — no new maths, verified balance-neutral by a
full-game sweep (game length and war frequency unchanged).

**Original plan (for reference).** The current renderer wraps the region
sites in a *generated organic island*. A real Baltic map is a different shape:
**land around a central sea**, with the Gulf of Finland, Gulf of Riga and the
islands (Gotland, Ösel/Saaremaa). Plan:
- New **scenario-map data format**: a hand-authored landmass outline (one or
  more coast polygons in normalised space) + fixed region sites with real
  positions, names, terrain and adjacency — instead of pure procedural scatter.
- Renderer gains a **"scripted map" mode**: clip the Voronoi/organic cells to
  the authored coastline(s) rather than to a generated island blob. The camera,
  layer-caching and political pipeline are unchanged (they already consume an
  arbitrary land path).
- Ship **Baltic** first (≈30–40 regions), then extend the same format to a
  wider **Europe** map as a larger scenario. Procedural "random realm" stays as
  the replayable alternative.
- Keep everything deterministic and data-driven — a new map is a new data file,
  not new engine code.

### 9.1 Diplomacy with opinion — SHIPPED v1 (`systems/diplomacy.ts`, v0.23)
Relations are now **legible**, not an opaque number. Each pair carries an
**opinion log** (`state.opinions`): dated dealings — war, gifts, peace, pacts,
trade — merged by reason and decaying each turn (`recordOpinion` / `decayOpinions`).
`opinionReasons()` returns a CK3-style breakdown surfaced in the diplomacy card:
the recent dated dealings ("The war between us (turn 1) −29", "Gifts given +9")
plus the ongoing standing pulls ("We share an enemy +2/turn", "Bordering my
lands −5/turn"). Each card also shows **rival-to-rival foreign relations**
(`foreignRelations()`: who this realm is at war with / allied to), so the board
reads as a political map, not just you-vs-each. The `relations` scalar the AI
acts on is unchanged, so balance is untouched.

**Casus belli — SHIPPED (v0.27).** `casusBelli(state, a, b)` picks the strongest
war justification: answering an **ally's call**, **reclaiming** land the target
took (tracked via `region.priorOwnerId`, set on conquest), a standing **border
dispute**, or — failing all — **naked aggression**. `declareWar` now applies a
third-party **reputation** cost: an unjustified war sours the declarer's standing
with *every other* realm (−7 naked, −3 border; a justified war none), logged as
"Your wars of aggression" in the opinion breakdown, so coalitions form against
aggressors. The player's declare-war confirm states the cause and its cost.

**Kept the peace — SHIPPED (v0.31).** An unbroken peace now *builds trust*.
`state.peaceSince` tracks the turn each pair's current peace began (set when a war
ends, cleared when one is declared; absent = peace since the founding). Every full
10 turns of peace raises a goodwill **floor** by +5, capped at +25 (`keptPeaceGoodwill`);
`driftRelations` lifts relations toward that floor (+4/turn) — but **only warms an
already-amicable peace** (rel ≥ 0). It never rescues a *souring* relationship, so
border friction can still drive committed rivals below the AI's war trigger (deep
hostility) and into war — goodwill must stay out of a deteriorating relationship,
or the world never fights (fixed v0.35). Long-time
neighbours who never draw swords come to trust one another. It never pushes past
the floor (trust, not vassalage) and a
zero floor is a no-op, so short peaces leave grudges to decay on their own. The
opinion breakdown shows it as a standing "Kept the peace (N turns)" level. The AI
benefits automatically — the lifted `relations` scalar makes enduring-peace
neighbours likelier to trade and ally. **§9.1 is now complete.**

**Treaty-breaking — SHIPPED (v0.52, roadmap C4).** A NAP or an alliance can now be
*broken* — treachery — at a reputation price. `declareWar` detects a war that
violates a standing pact and applies, in place of the light casus-belli censure, a
steep bilateral wound (`betrayal`) plus a broad standing hit with **every other
realm** (`broken_word`, `TREATY_BREAK`) — so serial oath-breakers become pariahs and
coalitions gather against them (the anti-snowball, self-punishing by design).
Alliances cost more to break than NAPs; answering an ally's call is a duty, not
treachery. The rival AI (`wouldBreakTreaty`, pure) only breaks a pact when its word
is cheap (bottom-tier trustworthiness) *and* the strike is tempting (a reeling foe
with an edge, or an overwhelming edge) — high-trust Hansa realms keep their word;
a treacherous Warlord/Opportunist stabs a cooled NAP partner when it is down. The
player is never auto-betrayed. A broken pact is a `betrayal` chronicle beat. Probed
balance-neutral on pacing/victories while adding ≈1 betrayal per game.

### 9.2 Combat model + unit roles — SHIPPED v2 (`systems/combat.ts`)
Combat is now **phased**: an opening volley (ranged + siege fire first; siege
strips fortification) then up to `MAX_COMBAT_ROUNDS` of melee attrition, with the
round's loser always shedding ≥1 regiment so fights converge. Outcomes are
`captured` / `repelled` / `held`. Delivered:
- **Unit roles at the decision point.** Ranged and Siege carry the volley
  (`volley: true` in `data/units.ts`); the counter loop
  (Militia > Cavalry > Ranged > Infantry > Militia, Siege vs. forts) makes
  composition a real choice. Terrain defence and fortification (net of siege)
  weight the melee each round.
- **A combat report.** Every fight yields a `BattleReport` (phase-by-phase
  casualties, forces, terrain/fort, outcome) which the UI replays as a modal —
  the player's own attacks pop it immediately; AI attacks on the player are
  listed in the end-turn report to open on click. Toggle in Options → Gameplay.
- **A per-unit combat forecast — SHIPPED (v0.40).** The attack preview is no longer
  just a win-chance %: `forecastCombat` (pure, `systems/combat.ts`) runs the *real*
  resolver on a constant no-swing RNG to report the **expected casualties** — per
  side and per unit type — the survivors, and the mean-case outcome. Each attack
  row now shows a compact `~−you/−them` cost inline, and the chip / Attack-button
  tooltip spells out the likely price ("You lose ~3 (2 Infantry, 1 Ranged); they
  lose ~5…") and whether it's a likely capture, repulse or stalemate — so you weigh
  the *cost*, not just the odds. Because it drives the same maths the sim uses, the
  forecast can never drift from the real fight.
- Still open (future): whether multiple armies **combine** into one battle vs.
  attack **sequentially** (current) — likely a pre-battle merge at a staging region
  with single-battle resolution.

### 9.3 Map lenses (Civ-style overlays) — SHIPPED (`ui/lenses.ts`)
Toggleable map filters so the board is readable at a glance without clicking
each region. A floated lens strip (bottom-centre) offers **Political** (owners,
the default), **Population**, **Gold / Materials / Food income**, **Unrest**, the
**Faith** lens (§9.6, categorical — whose faith holds each province), and the
**Relations** lens (v0.38) — each recolours every region; heat lenses use a
normalised low→high ramp, the categorical ones tint by realm/standing; `M` cycles
them. Colours are computed pure in `ui/lenses.ts` and baked into the renderer's
political layer (`setLens`), so they read at any zoom.

**Political-relations lens — SHIPPED (v0.38).** Reads the diplomatic map from *your*
seat: your land in the player gold, allies green, enemies at war red, and every other
realm on a diverging enemy→neutral→ally warmth ramp by standing (neutral/barbarian
land muted). The picker shows the red→green legend. So the whole board's disposition
toward you is legible at a glance — where the coalitions and the threats are.

**Military lens — SHIPPED (v0.39).** The board's forces at a glance: each province
tints by the army strength standing in it — **your and allied garrisons green** (by
strength), **hostile forces (at war + the Free Tribes) red**, and any **undefended
province of yours with a hostile army next door amber** ("exposed"), the rest muted.
So you can read your defensive posture and where a blow is coming without hunting
army markers. Presentation-only and pure (`armySize` + treaties), like the other
categorical lenses. **§9.3's lens set is now complete.**

### 9.4 Region development & focus — SHIPPED v1 (`data/focuses.ts`, v0.24)
Regions can be **specialised** (the "what is this province for?" decision) from
the region panel, one focus each: **Farmland** (+food, +pop cap), **Market town**
(+gold), **Workshops** (+materials), **Academy** (+knowledge), or **Garrison**
(cheaper local musters + a calmer province). Data-driven in `data/focuses.ts`;
effects plug into the existing hooks (economy yields, population cap, stability,
unit cost) via `focus*` helpers; `setRegionFocus()` is owner-gated and durable.
One focus per region is the whole trade-off.
The **AI specialises its provinces too** (v0.29): each rival assigns a focus by
terrain (plains→Farmland, coast→Market, hills/mountains→Workshops, forest→Academy;
a martial realm musters Garrisons on its rough ground), kept stable once set.

**Focus capstones — SHIPPED (v0.32).** Each specialised focus unlocks one
signature building — its payoff — gated behind BOTH the matching focus and an
Age-of-Crowns tech: **Manor** (Farmland + Feudalism: +4 food, +1 gold, +8 pop),
**Charter Fair** (Market + Guilds: +7 gold), **Foundry** (Workshops + Engineering:
+6 materials), **Athenaeum** (Academy + Philosophy: +6 knowledge, −3 unrest), and
**Citadel** (Garrison + Castles: +3 fortification, −8 unrest). The build menu hides
the four that don't match a province's focus and reveals its one capstone the
moment you specialise it (then tech-locks like anything else); the focus picker
names the capstone each focus unlocks, so the reward is legible at the decision.
`buildingFocusOk` / `focusCapstone` (data/buildings.ts) are the shared gate used
by the sim, UI, advisor and AI — and the **AI raises its provinces' capstones**
too, once the tech lands. Changing focus never removes one already built.

**Build queue — SHIPPED (v0.36).** A province's construction is no longer strictly
one-at-a-time: `region.buildQueue` holds an ordered list of buildings to raise after
the current one, and when a build completes `startQueuedBuildings` (pure, in `turn.ts`)
auto-starts the next still-valid entry — dropping any that became invalid (already built,
tech/terrain/focus no longer met). One click on a building **starts it if the slot is idle,
else appends it to the queue** (`enqueueBuilding`); the region panel lists the queue under
the current job, each entry removable, with a Clear. So you can plan a whole province's
build order and leave it. Player-only QoL (the AI still builds reactively); deterministic;
rides through save/load as an optional field. **§9.4 is now complete.**

### 9.5 Research, ages & game length — SHIPPED v1 (v0.25)
- **Era-gated research** — every tech carries an `era` (0-based age, `data/eras.ts`);
  `researchFrontier(done, era)` / `canResearch` / `selectTech` refuse a tech before
  its age has dawned, for both the player and the AI. No siege engines in the Age
  of Founding. `eraLockedTechs` surfaces the road ahead.
- **A bigger tree** — **30 techs across the five ages** (was ~16) with **8 new
  buildings** (granary, barracks, lighthouse, monastery, watchtower, courthouse,
  printing house, cathedral), so a full game is a long arc of choices.
- **Longer games** — turn limit **150 → 220**, eras re-spaced to span it
  (Founding 1, Banners 45, Crowns 90, Conquest 140, Legacy 185).
- **A tree that reads by age** — the tech-tree overlay labels every node with its
  age and marks future-age techs 🔒; the research drawer previews "Awaiting the
  {next age}".
- **A recommended next tech + a research queue** (v0.30) — the drawer stars the
  cheapest frontier tech in the realm's natural branch (military/civics/economy by
  trait) as ★ recommended, and every frontier tech carries a ＋ that appends it to
  a **queue**. When the current study finishes, `dequeueResearch` auto-starts the
  next queued tech that's valid for the age, skipping any that aren't yet. Queue up
  a path before bed and the realm studies it in order. (`queueResearch` /
  `dequeueResearch` / `clearQueue` / `recommendedTech`, all pure in `systems/tech.ts`.)
- **New unit types — SHIPPED (v0.42 → completed v0.43).** Four tech-gated premiums
  now give each counter role a basic + a heavy specialist (see §3.4 for the full
  table): **Pikemen** (Feudalism) and **Handgunners** (Gunpowder + iron) landed in
  v0.42; **Swordsmen** (Standing Army + iron) — elite men-at-arms, 7/6, counters
  Militia — and **Knights** (Feudalism + horses) — heavy shock cavalry, 9/5 moves 2,
  counters Ranged, the crusading orders' mailed fist — complete the symmetry in v0.43.
  Data-only in `data/units.ts` (cost/upkeep/counter/volley/tech + resource gate); the
  muster menu, AI recruitment, combat and forecasts pick every unit up automatically
  from `UNIT_TYPES`. The "ripple through `emptyUnits`/`armySize`" concern that deferred
  this is handled structurally: unit-count records are exhaustive
  `Record<UnitType, number>` (the compiler flags each literal to extend), the
  `emptyUnits`/`armySize`/`zero` helpers now iterate `UNIT_TYPES` instead of
  hand-listing (so **a new unit never needs them touched again** — and `armySize` no
  longer silently undercounts a premium-only stack), `isUnitUnlockedFor` keys off the
  unit's own `requiresTech`, and `deserializeGame` back-fills new slots to 0 so **older
  saves load cleanly**. The AI musters the strongest *available* counter to whatever it
  faces (Knights over Cavalry vs shot, Swordsmen over Infantry vs levy), gated by
  `canRaiseUnit` at the muster. **§9.5 is now complete.**

**Content depth — SHIPPED (v0.53, roadmap C2).** A few more decision-bearing
tables, biased to help the materials/military path. A building may now gate on a
region's **strategic resource** (`requiresResource`, the mirror of `requiresTerrain`;
shared gate `buildingResourceOk`): the **Bloomery** (Metallurgy, iron: +5 materials)
and **Stable** (Husbandry, horses: +materials/gold/pop) let you *develop* a
resource province, not just muster its premium unit — so iron/horse land is doubly
worth holding (design §3.2). Two techs carry them (Husbandry era 1 economy,
Metallurgy era 2 military → 32 techs). Three events join the pool: `hard_winter`
(seasonal setback), `ship_launch` (coastal windfall) and the decision `royal_wedding`
(a dowry seals a NAP with your friendliest neighbour — mirror of the envoy, and a
pact C4 lets a schemer later break). Probed balance-neutral (a touch more conquest);
the AI builds the works in most games.

### 9.6 Victory types — SHIPPED v2 (v0.26, faith v0.33)
The paths (Domination / Great Works / **Faith** / Prestige) are a **legible race**.
`victoryRaces()` (pure, in `systems/victory.ts`) reports, per path, *your* standing
and the **leading rival's**, each 0..1 toward the win, plus an `alarm` when a rival
is dangerously close. The Politics page renders all four as paired bars — you (gold)
vs the top rival (red) — with the goal, live values, and a "⚠ {rival} is closing on
this victory" warning. No path is won or lost invisibly.

**Faith — SHIPPED (v0.33), fitting the Northern Crusades.** Every settled province
holds a **faith** (`region.faith`, `systems/faith.ts`) — *not* the same as who rules
it. Influence is summed per realm each turn: **inertia** (the standing faith resists,
so conquest occupies but never instantly converts), the **ruler's** promotion at home,
and **holy sites** — temples (2), monasteries (3), cathedrals (5) — that radiate to
their region in full and to *neighbours* at half, so a border cathedral converts
across the frontier. A province flips to whoever leads its current faith by a clear
margin. The upshot: taking land is not enough — you must plant churches to win hearts,
and a missionary realm can hold the faith of lands it does not rule (and convert pagan
frontier). Hold **60% of the settled world's faith** and you win. Wired into
`checkVictory` and the four-way race; the **Faith map lens** tints every province by
the faith that holds it (pagan land muted), the region panel flags a province whose
faith differs from its ruler, and scholarly AI realms press the religious race by
building monasteries and cathedrals. Pure and deterministic (no RNG).
- Still open (future): shared-religion *blocs* (crusader realms cooperating) and a
  distinct **culture** axis; today faith is per-realm, the cleaner single-winner model.

### 9.7 Suggested build sequence
1. ✅ **Real Baltic map** (9.0 scripted-map mode) — shipped: scripted Baltic +
   Europe geography, historical homelands, Play-as picker.
2. ✅ **Combat v2 + report** (9.2) — shipped: phased volley/melee, unit volley
   roles, replayable battle report.
3. ✅ **HUD overhaul + map lenses** (9.3) — shipped: top-bar nav, Politics page,
   redesigned region panel, and CIV5-style population/income/unrest map filters.
4. ✅ **Diplomacy opinion** (9.1) — shipped: dated opinion breakdown + rival-to-rival relations (casus belli still open).
5. **Region focus + buildings** (9.4) and **research tree** (9.5) — the Civ depth.
6. **Victory-type pass** (9.6) — once focus/culture exist to hang a path on.
Each remains a playable, testable slice, per the M1–M6 discipline above.

### 9.8 Open design decisions — the decision queue

The roadmap items above (9.0–9.6) are shipped. What remains are **larger design
calls**, each a subsystem rather than a tweak, listed in rough priority order.
None is committed; this is the queue the next "what do we build?" decision draws
from. Every one must land as a playable, testable, deterministic slice.

1. **Naval / sea power — TO BE DECIDED (flagged 2026-07-18).** Today the sea is
   economic-only: coasts give yields and cross-water *adjacency* (dashed sea lanes),
   with no naval combat (an explicit v1 non-goal, §2). The Baltic *is* a sea, so this
   is the highest-leverage thematic gap — Hanseatic trade lanes, coastal raids,
   blockades, and island hops (Gotland, Ösel). Open sub-questions: do we add ship
   *units* that fight over sea lanes, or an abstract "naval control" of lanes? Does
   losing a lane cut trade/reinforcement? Is there a naval-power victory or just
   leverage? Biggest scope of the queue; the setting rewards it most.
2. **Characters & dynasty — the X-factor (advisor review, 2026-07-18).** The
   design's stated dream mix (AoE2 + CK3 + Civ5) is missing the CK3 ingredient
   entirely: *people*. Proposal, in leverage order: named AI rulers over the
   existing personality AI; a chronicle/story log; governors with traits as
   modifiers on the existing yields/unrest maths; generals; named pretender
   revolts; ruler mortality + succession as a second anti-snowball beat. All
   deterministic data rows plugging into systems that already exist — stories
   from numbers, per the pillars. Itemised as section E of `TODO.md`; the first
   two slices (named rulers, chronicle) are cheap enough to land ahead of naval.
3. **Army system completion — IN PROGRESS (started 2026-07-18), see §9.9.** Stacking
   / combined battles plus the surrounding army instrument (split, stance, veterancy,
   commanders, war AI). The chosen "complete" target is an AoE2 × CK3 × Civ5 blend;
   the milestone plan lives in §9.9. (This overlaps item 2 at **commanders/generals**:
   §9.9's M4 delivers the general-as-stack-buff; the broader named-rulers/governors/
   succession layer is item 2's to own.)
4. **Culture axis** (§9.6, still-open). A cultural identity *distinct from faith*:
   assimilation of conquered provinces, cultural unrest on mismatched rule, and maybe
   a culture victory. The setting's German/Baltic/Rus/Norse frictions are begging for
   it. Medium–large; pairs naturally with faith.
5. **Religion blocs / coalitions** (§9.6, still-open). Shared-faith realms cooperating
   — crusader coalitions, joint wars, a bloc's combined victory pressure. The Crusades
   were coalitions; this makes faith a *diplomatic* force, not just a per-realm race.
   Medium.
6. **Vassalage / deeper diplomacy** (§9.1, beyond casus belli). Tributaries, vassal
   states, defensive pacts with teeth, an alliance/diplomatic victory. Casus belli
   already ships (v0.27); this is the layer above it. Medium.
7. **Event chains / branching questlines** (§2 non-goal today). Events are single-beat;
   this would add multi-step storylines with consequences that carry across turns.
   Content-heavy, low mechanical risk — a texture play, not a systems play.
8. **Espionage** (§2 non-goal). Spies, sabotage, stolen tech, intel on rivals. Largest
   new-system scope and the least certain fit; parked at the back deliberately.

### 9.9 Army system completion — the plan (in progress, from v0.44)

**Target: an AoE2 × CK3 × Civ5 blend.** AoE2 gives the *tactics* (hard unit
counters + combined arms — already the strongest pillar, §3.4). CK3 gives the army
as an *instrument* (levy vs. men-at-arms, raise/rally/disband, commanders, supply).
Civ5 gives *persistence & texture* (veterancy/promotions, zone of control, a Great
General, ranged bombardment of forts).

**Where we start (audit, 2026-07-18).** The engine models one merged stack per
`(region, owner)`, enforced by construction (a region only ever holds one owner's
armies; every raise/event/friendly-move folds into the standing stack). Combat is a
deterministic phased volley→melee on *summed* `UnitCounts` — composition-agnostic,
so combining stacks is mostly a matter of gathering participants and apportioning
losses back. What's absent is the whole *control + persistence* layer: no split,
partial move, disband, stance/fortify, waypoints, veterancy, or commanders; the AI
decides attacks with a hand-rolled heuristic that ignores the real combat forecast.

**Milestones** (each a playable, green-gated, deterministic slice; version bumps as
usual):

- **M1 · Stack command — SHIPPED (v0.44).** Split/detach and **partial
  (choose-units) moves** — send cavalry ahead, peel off a garrison, reinforce a
  friendly stack with a chosen subset — plus voluntary **disband** to cut upkeep.
  `moveDetachment` / `disbandUnits` (pure, `systems/military.ts`) move a chosen
  `UnitCounts` subset to an adjacent owned region: the remainder holds in place, the
  detachment forms a new stack in an empty own region or reinforces the standing one;
  selecting the whole stack degrades to a normal `moveArmy`. Only own territory is a
  legal detachment target, so the one-stack-per-region invariant holds and no combat
  is touched. The Army panel gains a "Split / disband" collapsible with a per-regiment
  stepper for each unit type, "Send to {neighbour}" destinations, and a disband button.
- **M2 · Combined battles** (the §9.2 "stacking" item). Attacking a region lets
  friendly stacks in *adjacent* regions join the assault (spending their move); a
  defender is joined by adjacent friendly stacks rallying to the defence. One battle,
  losses apportioned across all participants (new `apportionLosses` in combat.ts).
  Massing along a front finally matters — and doom-stacking stops being the only way
  to concentrate force.
- **M3 · Dig in & hold.** A **fortify/entrench** stance (defence bonus + a clear
  "hold here" signal) and **zone of control** (a stack exerts pull on its neighbours,
  so mobile enemies can't freely walk past a defended front). Forts gain teeth: an
  empty fortified region no longer falls for free.
- **M4 · Veterans & captains.** Battle **XP → promotions** carried on the stack
  (Civ5) so a blooded army is worth preserving, and an optional **commander/leader**
  that buffs the stack (CK3 knights / Civ Great General).
- **M5 · War AI.** The AI decides attacks by the **real forecast** (win chance +
  expected losses, not the divergent heuristic), coordinates **combined assaults**,
  **garrisons/fortifies** frontiers, and values stacks by strength, not headcount —
  so the opponent actually plays the new systems.

**Hardening folded in across the slices:** the empty-but-fortified free-capture, the
"ghost army" of an eliminated nation, `winChance` drifting from the real resolver,
and dead constants (`CASUALTY_SCALE`).
