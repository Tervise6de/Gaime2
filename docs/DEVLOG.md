# Gaime2 — development log

Newest entries at the top. Each autonomous overnight cycle appends one entry:
what changed and why, the test count after, and ideas for next time. See
`docs/autonomous-dev-prompt.md` for the playbook these runs follow.

---

## 2026-07-21 — Pirates & guard-ships: the Victual Brothers era (v0.102.0)

Connected the two sea-facing layers that had lived apart — trade was safe gold,
war-fleets only mattered in a war. Now **trade routes are raidable and fleets earn
a peacetime job guarding them.** Every rich route becomes a *guard-or-gamble* call.

**The era model.** Piracy is an *age*, gated on `state.piracy.pressure` (0..1),
which is **0 by default so the system is a no-op** — the existing `victual_brothers`
epoch event (c. 1395) now *raises* it (and records a chronicle beat), and it eases
each turn. Faithful to the real Victual Brothers (hired 1392 → suppressed at Hamburg
1400/01) and keeps every prior test green.

**Each turn (`stepPiracy`, before `stepTrade`):** per route, a raid chance from
lane exposure × pressure × cargo value (capped; the Naval Power doctrine deters).
A raided route unguarded → convoy taken, `pirated` flag → `stepTrade` pays it 0. A
route **guarded** — the owner has a war-fleet parked on its lane (reuses fleet
movement, *no new UI*) — fights a **sea battle** (`resolveCombat`): win → cargo safe
+ a named-captain **bounty**; lose → convoy taken *and* fleet losses.

**Named captains** (`data/piracy.ts`, stat-cards, legend-flagged per `hansa
times.md` §7): Wichmann, Magister Wigbold, Gödeke Michels, and the marquee **Klaus
Störtebeker** (hulk flagship, big bounty, a chronicle beat on capture) — the hotter
the era, the more infamous the captain, each recurring until a guard-fleet takes him.

Determinism kept via a salted side-stream off `state.rngState` (never perturbs the
main AI/event stream). New: `systems/piracy.ts`, `data/piracy.ts`, `PiracyState` +
`TradeRoute.pirated` + a `"piracy"` chronicle kind; `routeFlows`/`stepTrade` honour
the flag; turn pipeline calls `stepPiracy`. **746 tests pass** (+15). Design:
`docs/pirates-and-guard-ships.md`. Next: pirate havens + the Hunt, letters of marque,
and surfacing raid/guard status in the trade UI.

## 2026-07-20 — Parchment grain + hand-inked frames (v0.95.0)

Two hand-craft passes against the "too clean, too generated" feel of the top
bar (`ui/style.css` only):

**Parchment texture.** The bar and the gilt panels now carry two tiled
`feTurbulence` SVG layers over the navy: a fine warm speckle (180px tile,
baseFrequency .75, alpha .07) for tooth, and a broad low-frequency mottle
(260px tile, baseFrequency .045) for the cloudy tone shifts that make paper
read as paper. Static background rasters — zero runtime cost, no
backdrop-filter.

**Hand-inked frames.** The shared `.hud-frame` border-image SVG is redrawn so
nothing is mathematically identical: the four main strokes bow slightly and
overshoot at the corners like crossed nib strokes, each corner's tick differs
in length and weight, the four diamond finials sit at different rotations and
sizes, and the inner hairline wobbles. The slicing contract is unchanged
(slice 14, same widths), so every framed panel picks the look up as-is.

691 tests green, typecheck + production build clean (CSS +0.4 kB gzipped).

## 2026-07-20 — Centred turn panel; army numbers become privileged intel (v0.94.0)

**Turn panel at true centre.** The gilt turn panel is now absolutely centred in
the top bar (`left: 50%`), so the realm/resource cluster's width never nudges it
off the screen's midline. Crisis chips dock left of it in the elastic middle and
stack above it if the two ever meet (a famine warning outranks the date). In the
≤1024px scroll mode the panel rejoins the flow.

**Army strength chips: own + allies, zoomed in only** (`systems/renderer.ts`).
The number chip under an army banner/cog now draws only for the player's own
armies and their allies' (alliance treaty, or fellow League members), and it
rides the same zoom reveal as the province labels (`regionLabelAlpha`, fading in
across cam 1.22→1.6) — so the fit view is clean of numbers entirely. Rival
banners and cogs stay visible (presence is public; the count is not), and the
hover tooltip still reports strength on deliberate inspection. Read-only
renderer change — no sim behaviour touched.

Captures: fit zoom (no chips anywhere), zoomed into the home realm (own chip
visible). 691 tests green, typecheck + build clean.

## 2026-07-20 — Icon-only nav + realm-name floor (v0.93.0)

Nav buttons (Ledger · Diplomacy · Research · Production · Armies · Politics)
are now uniform 44px icon squares — captions moved into the hover tooltip
(`title`, led by the panel name: "Diplomacy — Relations, treaties and offers.
Shortcut: D") and an `aria-label` for screen readers. Because Ledger and
Research shared the open-book glyph and became indistinguishable without
captions, the ledger got its own `GLYPH_ART` mark — a receipt leaf with a
zigzag foot and ruled entry lines. The gear matches the new square size.

The realm name also gained a hard min-width floor (with the elastic centre and
turn subtitle ceding space first), fixing "Lübec…" truncation at squeezed
window widths; the caption-era responsive rules were retired.

Captures at 1280/1920 + a DOM check of every tooltip. 691 tests green,
typecheck + build clean.

## 2026-07-20 — Top bar declutter: no Food chip, unframed read-outs, uniform nav (v0.92.0)

Three requested refinements to the gilt top bar (`ui/hud.ts` + `ui/style.css`):

- **Food left the bar.** It lives in the goods ledger under the wares economy,
  so the strip keeps only Treasury · Knowledge · Stability
  (`TOPBAR_RESOURCE_KEYS` narrowed; the famine crisis chip still surfaces food
  emergencies). Freed width means the full-caption nav now fits even at 1280px.
- **Fewer boxes.** The realm mark and the resource read-outs sit directly on
  the bar again — engraved hairline dividers instead of frames — so only two
  gilt-framed elements remain on the left: the crest plaque and the Turn panel
  (End turn stays the gold slab on the right).
- **Uniform nav buttons.** `.hud-navwrap` became a column grid with `1fr`
  auto-columns — under shrink-to-fit sizing every track resolves to the widest
  caption ("Production"), so Ledger through Politics are exactly equal width at
  every breakpoint, still with zero truncation.

Captures at 1280/1440/1920. 691 tests green, typecheck + build clean.

## 2026-07-20 — Top bar rebuilt as gilt-framed panels (mockup pass 2) (v0.91.0)

The first gilded pass kept the bar as one continuous strip; the target mockup
frames every section as its own panel, and at real-world window widths the strip
overflowed (clipped End turn, truncated captions). Rebuilt (`ui/hud.ts` DOM +
`ui/style.css`):

**Framed panels.** A shared `.hud-frame` class draws the mockup's ornamental
gold frame — double line, corner ticks, diamond finials — via an SVG
`border-image`, so realm, resources and turn each sit in an identical gilt frame
at any size. The right cluster's group frame is gone; nav buttons, the End-turn
slab and the gear stand as individual bordered boxes, as in the mockup.

**Resource columns.** Cells restructured label-top / icon+value / flow-below
(centred columns, engraved hairlines between), matching the mockup instead of
the old icon-left rows. Crest moved from a round medallion to the mockup's
square gold-bordered plaque; realm/turn subtitles switched to quiet cream
regular case.

**Fit — nothing truncates, nothing clips.** Nav buttons now size to their
caption (no fixed widths), so Production/Diplomacy read in full at any width
that shows captions. A progressive ladder sheds padding (≤1560), tightens
panels (≤1366), drops captions to icons+tooltips (≤1200), and finally lets the
strip scroll sideways (≤1024) — End turn is whole at every width; the elastic
centre and the ellipsising realm/turn text cede space first. Bar height 78→88px;
the panels pinned beneath (ledger drawer, alerts, move banner, region inspector,
outcome banner) moved down to match.

Verified with captures at 1120/1280/1440/1920 plus the ledger open. 686 tests
green, typecheck + production build clean.

## 2026-07-20 — R4: Production chains, salted-fish premium & luxury prestige (v0.90.0)

The trade layer gains manufacturing depth and a reason to chase luxuries.

**Production chains.** Two wares are now *manufactured*, not just gathered:
- **Hopped beer** — the Export Brewery yields beer (`wareYield`, +2 gold), turning a
  brewing town into a beer exporter.
- **Wool → cloth** — a new raw ware, **wool** (upland/hill pastures, sold raw to the
  western wool markets), plus a new **Weaving Works** building (Guilds) that yields
  cloth. The strategic chain: export raw wool, or build the works to sell far dearer
  cloth. (16 wares now.)

**Salted-herring premium.** Herring and stockfish trade routes pay
`SALTED_FISH_PREMIUM` (×1.4) when the realm holds salt to preserve the catch
(`systems/trade.ts`) — the salt→fish chain now bites on the *export* side as well as
the food side (R3).

**Luxury → prestige.** `nationScore` gains a term for luxury-ware trade income (furs,
wax, amber, cloth, copper, honey, wool) — the Hansa's luxury trade is renown as well as
gold, making the merchant path a real prestige-victory lever.

**Food tighten (adjusted).** foodValues were cut ~30%. A self-play probe (since deleted)
showed famine stays at 0% even so: population is **capacity-limited**, so food never
binds into famine without a drastic cut that would risk mass starvation in wartime.
Kept the reduced surplus and left food as a *geographic* constraint (hold food land or
trade/farm for it); the anti-snowball brake stays unrest, by design. Noted in the design doc.

**Verification.** typecheck + build clean; **691 unit tests green** (2 new: salted-fish
premium, luxury prestige); 0 `fetch`; deps `{}`. goods⇄kontore consistency still holds
with wool added.

**Next:** deeper Kontor price/scarcity tuning; a stability/consumption sink for luxuries;
optionally a genuine per-turn refine mechanic (consume inputs → refined wares) if the
stockpile gains more sinks.

---

## 2026-07-20 — R3 + R2: Food from the food wares (salt→fish chain) & AI produce-to-need (v0.89.0)

Two follow-ups to the wares overhaul, landed together.

**R3 — Food review.** Food is no longer an abstract terrain scalar; it now flows from
the realm's **food wares**. Each food ware carries a `foodValue` (grain 1.2, stockfish
0.7, herring 0.6, beer 0.5, honey 0.4); terrain base food is cut to a little
subsistence (`data/terrain.ts`). The turn pipeline adds `nationFoodOutput`
(`systems/trade.ts`) to the food balance, keeping the existing famine/population
pipeline unchanged. The historical **salt→fish chain is live**: herring and stockfish
feed a town at full value only when the realm holds salt, else at `FISH_UNSALTED_MULT`
(0.4) — so salt land underwrites a fishery. The result is a real food geography:
grain-plains feed themselves, a salted coast is a breadbasket, and forest/hill/mountain
realms must trade for grain or build farms. HUD food tip updated.

**R2 (part) — AI produce-to-need.** `chooseBuilding` takes optional hints so a realm
**plants food** when its larder is low (`stocks.food < AI_FOOD_LOW`, or famine) and
**develops ware industry** when its build-ware chest is thin
(`timber+brick+iron+naval < AI_BUILD_WARE_LOW`) — with food need outranking ware need,
and unrest/temple and focus-capstones still first. `manageEconomy` computes the hints
from the nation's live stores. The Goods Ledger also now scales region output by the
owner's `regionWareMult`, so it matches what actually accrues.

**Verification.** typecheck + build clean; **689 unit tests green** (3 new produce-to-need
tests); 0 `fetch`; deps `{}`. Two temporary self-play probes (10–12 seeds, since deleted):
- R3 food: avg length ~156, population *tripled* (no starvation), 0% famine, salt→fish
  gate confirmed to bite.
- R2/R3 combined: avg length 146, **10/10 games decisive** (no economic stalemate), 0%
  famine, and realms actively built ~1,200 food buildings + ~864 ware-industry buildings —
  produce-to-need is firing.

**Next:** R4 — refined-ware chains (salted herring, hopped beer, wool→cloth), luxury
demand feeding prestige/stability, and a food-scarcity tighten so famine becomes an
occasional real pressure (the model currently runs with ample headroom).

---

## 2026-07-20 — Stronger crest enamel + redesigned sigils (v0.88.0)

Second crest pass (`data/art.ts`, art data only). Pushed the `crest()` finish
further — a brighter graded top sheen (two stacked highlight bands), a deeper
shadow at the point, and a stronger gilt rim — so shields read as domed, struck
enamel. Redesigned four vague/duplicate sigils for distinctness (England and
Poland were near-identical eagle-ish marks): England → St George's cross;
Poland → the White Eagle (head, raised spread wings, fanned tail); Sweden → Tre
Kronor (three crowns, 2 over 1); Lithuania → the Jagiellon double cross. Verified
at 64/34/18px. 685 tests green, typecheck + build clean.

## 2026-07-20 — Crest enamel finish + bolder resource icons (v0.87.0)

First crest pass + icon weight (`data/art.ts`). The shared `crest()` template
gained a lit "chief" band, a soft point shadow, a dark rim (map contrast at
~17px) and a fine gilt inner line, turning the flat colour shields into enamel
badges — upgrading every crest at once (map capital markers, the top-bar
medallion, standings and diplomacy). Bumped the stroke weight of the treasury /
food / knowledge / stability (and materials) icons for more presence at HUD sizes.

## 2026-07-20 — Gilded top bar: navbar + resource strip reskin (v0.86.0)

Reskinned the in-game top bar (`ui/hud.ts` / `ui/style.css`) to the title
screen's premium gilded look: a deep-navy ground with a gold gradient frame (top
hairline + bottom rail), the crest in a gold-ringed medallion, a serif
gold-gradient realm name + turn read-out, a gilded resource strip (gold icons /
labels, cream values, engraved fading dividers), and the right cluster (nav ·
End turn · settings) framed as one strip with a prominent End turn and a gear
toggle (was `☰`). The compact base fits ~1366px laptops without clipping End
turn; a `min-width:1660px` block widens the nav on wide displays. The redundant
bar tax shortcut was dropped (tax stays on the Politics page), matching the mockup.

---

## 2026-07-20 — R1: the Wares economy — "Materials" retired for ~15 era wares (v0.85.0)

The abstract **"Materials"** resource is gone. In its place the game runs a single
unified layer of **era wares** — the real Hanseatic commodities — so what you build
and whom you arm now depends on which land you hold and what it yields. This unifies
the two former layers (the four-resource economy and the parallel trade-goods
system) into one. Grounded in `hansa times.md` §5/§13; design in
`docs/game-design.md` "Resources — the Wares economy" + the R-series build plan.

**The catalog (`data/goods.ts`, now 15 wares).** grain, herring, stockfish, beer,
timber, naval stores, brick, iron, copper, salt, furs, wax, amber, cloth, honey —
each tagged with `roles` (food / build / arms / luxury / industry). Sourced from
terrain, strategic resources, and — new — **industry buildings** (a Mine now yields
iron + copper; workshops/bloomery/foundry yield timber/iron). Kontor demand
(`data/kontore.ts`) extended to buy the new wares; `goods.test.ts` still proves
goods⇄kontore never drift.

**The cut.** `materials` removed from `ResourceStocks` / `ResourceYield` /
`ResourceFlow` / `RESOURCE_KEYS`. Nations gain a per-ware stockpile `Nation.wares`
(`emptyWares`/`spendWares`/`addWares`/`canAfford` helpers). Region ware production
(`trade.ts nationalWareOutput`, scaled by a new `regionWareMult` from tech/trait/
focus) accrues each turn in `turn.ts`. The "industrious" trait and "workshop" focus,
and the six production techs, now drive a **ware-output multiplier** instead of a
materials one.

**Consumption.** Buildings carry a `buildWare` (default timber; brick for masonry
monuments, naval stores for ports) and cost is drawn from that ware's stockpile at
`BUILD_RATE`/turn (`construction.ts`). Units cost gold + **arms wares** (timber for
the levy; iron/copper for siege, handgunners, swordsmen, knights) — basic troops
stay timber-funded so an iron-poor realm can still field an army. Material-flavoured
events/epochs now grant/burn wares (ore→iron, expedition/academy/public-works→timber,
walls→brick, great fire→timber). `save.ts` back-fills `wares` onto pre-wares saves.

**UI.** The production panel shows a build-wares ledger; build and unit costs render
with ware glyphs; the old "Materials" map lens became a **Wares** (total ware output)
lens.

**Verification.** `typecheck` + `build` clean; **686 unit tests green**; built bundle
still makes **0 `fetch`** calls; `dependencies` stays `{}`. A temporary self-play
probe (40 turns, since deleted) confirmed wares accrue, construction funds and
completes, recruitment spends, and rivals run the same ware economy.

**Next (R2+):** balance-tune ware values/outputs and starting stores via a self-play
probe; surface per-ware flows in the trade UI and teach the AI to produce-to-demand;
then R3 — review "Food" onto the food-ware pool with the salt→fish preservation chain.

---

## 2026-07-18 — D4: performance profiling harness + findings (partial) (v0.56.0)

Roadmap D4 (profile at the largest configs; optimise hot paths *only if measured
slow*). Built the harness, measured, and — per the rule — changed no hot path,
because none is slow.

**The harness (`systems/profile.ts`, tree-shaken from the app bundle).** Tooling,
not sim logic: it observes the pure pipeline from the outside with
`performance.now()` and never feeds timing back into state, so determinism is
untouched. Two views: `profileGame`/`summarizeGame` — per-turn `resolveTurn` cost
across a full game with an early-vs-late split (a superlinear-growth probe); and
`profilePhases` — a micro-benchmark of the individually-exported hot phases on one
representative state, to attribute the cost without instrumenting `resolveTurn`
(which would risk its shared AI/event RNG stream). `profile.test.ts` guards it:
structural checks plus a *very* generous catastrophe-only wall-clock ceiling.

**Findings (30 regions × 6 nations, this box).**
- **≈1.1–1.5 ms/turn**; a full 219-turn game resolves in **~250 ms** end to end.
- **No superlinear growth** — early- and late-game ms/turn are flat (often
  *decreasing* as nations are eliminated); the O(n)-per-turn shape holds.
- **The rival AI is the dominant term** (≈60–80% of a turn): a single nation's
  `runNationTurn` (~0.08 ms) is 3–4× the next phase (`applyTradeIncome` ~0.026,
  `advanceNationEconomy` ~0.020, `driftRelations` ~0.014). Everything else is
  noise by comparison.

**Verdict: no optimisation warranted.** At ~1.3 ms/turn the largest game is
~250 ms of compute — orders of magnitude inside any interactive budget — so
touching the (correct, deterministic, well-tested) hot paths would only add risk.
The harness stays as the instrument to re-check after any future sim change, and
the perf integration test keeps its own catastrophe ceiling.

624 tests green (+4 for the harness), typecheck + build clean; app bundle
unchanged (harness tree-shaken out).

---

## 2026-07-18 — D5: localisation scaffolding — a string catalogue + a live Estonian locale (v0.55.0)

Roadmap D5 (extract UI strings). Stood up the i18n foundation and wired a
representative slice through it, with a real second locale as the worked example.

**The engine (`ui/i18n.ts`, dependency-free, environment-safe).** A dotted-key
string catalogue with `t("menu.newGame")` lookup: the active locale first, English
as the fallback for any untranslated key, and the key itself for an unknown one (so
a gap is *visible*, never a crash). `{name}` placeholders interpolate. The locale
is persisted (`localStorage`), defaults from `navigator.language`, and stamps
`<html lang>`. It lives in `ui/` (not the sim — strings are presentation) and
degrades to English with no DOM/`localStorage` (the Node test env), so importing it
never throws.

**Extracted as the worked example.** The whole boot screen (`ui/title.ts`) and the
top-bar navigation rail + End-turn button (`ui/hud.ts`) now read their copy from
`t()`. English is the exhaustive reference; **Estonian (`et`) ships as a real
partial locale** (the setting is literally the Baltic) — brand strings (wordmark,
studio) stay English via fallback. An **Options → Language** picker switches locale
and reloads (the continuous autosave resumes the game) so every string re-renders.

**How the rest follows.** Adding a string is: add the key to `EN`, switch the call
site to `t()`, optionally translate. No engine changes — the scaffold is the point.

**Verified** in the running app: the title menu and in-game nav rail flip cleanly
between English ("Begin your reign · Diplomacy · Research…") and Estonian ("Alusta
valitsemist · Diplomaatia · Teadus…"), diacritics intact, `<html lang>` tracks the
choice, zero console errors.

620 tests green (+10 for i18n: lookup, interpolation, fallback, locale coverage),
typecheck + build clean.

---

## 2026-07-18 — B6: responsive/touch layout — the lens strip no longer fights the frame (v0.54.0)

Roadmap B6. The pointer-event map input (tap to select, drag to pan, pinch to
zoom), `touch-action` rules and coarse-pointer tap targets were already in place;
driving the real app across five viewports (Playwright + the pre-installed
Chromium) surfaced the one genuine layout bug and fixed it.

**The lens strip collided with the bottom corner panels.** The Civ-style map-lens
strip floats bottom-centre, and once the frame narrows the bottom corners (the
action stack 236px, the log 300px) leave no centred room — so on phones/tablets/
small laptops the strip landed on top of the panels, and (worse) `flex-wrap` turned
it into a *tall* block that swallowed the End-turn button. Fixes:
- The strip is now a single **horizontally-scrollable row** (`nowrap`), never a
  tall block — a strict improvement at every width.
- **Below 1100px it docks to the top**, a compact scrollable strip just under the
  resource bar, with the side panels dropped below it — leaving the whole bottom
  edge to the action + log panels (its title and heat-ramp legend drop to save
  width). Above 1100px it keeps the wide-desktop bottom-centre look unchanged.
- Lens and nav buttons join the coarse-pointer 40px min-hit-area set.

**Verified** at 390×780, 780×390, 834×1112, 1024×768 and 1440×900: zero console
errors, no horizontal overflow, tap-to-select works, and the End-turn button is
unobscured at every size (the wide-desktop layout is pixel-identical to before).

610 tests green (CSS-only change), typecheck + build clean.

---

## 2026-07-18 — C2: content depth — resource works + more events (v0.53.0)

Roadmap C2: a few more carefully-balanced techs / buildings / events, each adding
a *decision*, biased to help the materials/military path the DEVLOG flagged as weak.

**Strategic-resource works (a new territorial decision).** A building may now gate
on a region's **strategic resource** (`BuildingDef.requiresResource`, the mirror of
`requiresTerrain`; shared gate `buildingResourceOk` wired into the sim's build
validity, the build menu, the advisor and the AI). Two works use it:
- **Bloomery** (Metallurgy, iron country): +5 materials — forge your iron into arms.
- **Stable** (Husbandry, horse country): +2 materials, +2 gold, +2 pop.
Both are gated on the same resource that gates a *premium unit*, so an iron/horse
province is now worth **developing**, not just mustering from — deepening "specific
territory worth fighting for" (design §3.2). Both pay in materials, aiding the
military/expansion path without swelling gold. Two new techs carry them —
**Husbandry** (economy, era 1) and **Metallurgy** (military, era 2).

**Three new events.** `hard_winter` (a Baltic seasonal setback — food + unrest),
`ship_launch` (a coastal windfall — a merchant fleet's coin and catch), and the
decision **`royal_wedding`**: a dowry warms your *friendliest* neighbour and seals a
NAP — the mirror of `envoy_exchange` (which mends your worst relation), and a neat
tie to C4 (a pact a faithless realm might one day break).

**Balance (probe: 36 all-AI games).** Victory spread and pacing unchanged (median
still 220 all-AI; a touch more conquest — elimination 9→12 — exactly the nudge the
military path wanted). The new works are reachable and used: the AI raised a Stable
in 81% of games, a Bloomery in 67%. No archetype or path dominates.

610 tests green (+4), typecheck + build clean.

---

## 2026-07-18 — C4: treaty-breaking with a reputation cost (v0.52.0)

Diplomacy/AI depth II (roadmap C4): a NAP or an alliance is now a *given word*
that can be broken — treachery — at a price paid to every court.

**The price of a broken word (`systems/diplomacy.ts`).** `declareWar` now detects
when the war breaks a standing NAP or alliance and, instead of the light
casus-belli censure, applies a **treachery cost**: a steep extra wound to the
betrayed party (`betrayal` opinion) *and* a broad standing hit with **every other
realm** (`broken_word` opinion) — the reputation term that makes coalitions gather
against a serial oath-breaker. An alliance is more sacred than a NAP, so betraying
one costs more (`TREATY_BREAK`: nap 15/10, alliance 30/18). Honouring an ally's
call to a war they are already in is a higher duty, explicitly *not* treachery. A
broken pact is a `betrayal` chronicle beat, distinct from an honest war.

**Who betrays (`wouldBreakTreaty`, pure).** Only a realm whose word is cheap — the
bottom tier of trustworthiness (< 0.3 for a NAP, < 0.18 for an alliance) — breaks
it, and only for a *tempting* strike: a foe caught **reeling** (famine / revolt /
bankruptcy) with a solid edge, or an overwhelming power edge outright. High-trust
Hansa realms keep their word; a treacherous Warlord or Opportunist will stab a
lukewarm NAP partner when it is down. The player is never auto-betrayed into
anything — their pacts are theirs to break through the UI.

**AI wiring (`systems/ai.ts`).** The opportunistic-war test is now treaty-aware:
no pact → hostility + a power edge as before; a NAP/alliance → only if the realm
`wouldBreakTreaty` *and* the partnership has cooled below friendly. The new opinion
reasons surface automatically in the diplomacy "Why they feel this way" breakdown
(the renderer was already generic).

**Balance (probe: 36 all-AI games across proc-large / Baltic / Europe).** Treaty-
breaking adds ≈1 betrayal per game beyond the existing commander-defection beats —
present in a meaningful share of games, never the everyday route to war — and lifts
war frequency (3.6 → 5.9 wars/game) without shifting pacing or the victory spread.
No archetype dominates; the stress matrix's invariants all hold.

606 tests green (+11 for C4), typecheck clean.

---

## 2026-07-18 — F1: Steam Coming-Soon package + two bugs the screenshots caught (v0.51.0)

Prepared everything a human needs to stand up a **Coming Soon** page and start
collecting wishlists (roadmap F1) — and, capturing the marketing screenshots,
found and fixed two real issues visual verification had missed.

**Store package (`docs/press/steam-store.md`).** Rewrote the copy (short
description, About, features, tags) to lead with the new differentiator — the
character/story layer the advisor said was missing — instead of the generic 4X
pitch. Corrected stale facts (nine units not five, 30-tech tree, four victory
paths) and added a "what needs a human" note (Steamworks account + $100 fee +
key art). Everything else is paste-ready.

**Three new screenshots** (`docs/press/screenshots/`, 1920×1080), the shots that
sell the game: `08-diplomacy-rulers` (rivals led by named rulers), `09-chronicle`
(a run's wars, a revolt, two betrayals and its fall, in prose), and
`10-army-commander` (a stack with its commander, entrenchment and fortify).

**Bug — raw HTML in the army panel (fix).** The M3/M4/E5 commander and
entrenchment hint lines passed markup (glyph SVG + `<b>`) to `line()`, which sets
`textContent` — so they rendered as literal `<span class="ico…` gibberish in both
the army panel and the enemy-region panel. Added an `htmlLine()` helper and
switched those lines to it. The screenshot caught what the log/click checks
hadn't — exactly why the visual pass matters.

**Chronicle quality (fixes).** Re-declaring an already-active war no longer writes
a beat; consecutive identical beats are collapsed; and every beat is sentence-cased
("your realm" → "Your realm"). A recurring grudge now reads once and cleanly.

595 tests green, typecheck + build clean; every screenshot re-verified in the
running app after each fix.

---

## 2026-07-18 — Stress / bug-bash harness (roadmap A4)

A permanent self-play regression net now that the army/character stack is
feature-complete. `src/systems/stress.test.ts` plays a matrix of full games —
6 configs (procedural small/large/hard/easy + scripted Baltic & Europe) × several
seeds, with the AI driving *every* nation including the player — to their verdict
or the turn cap, checking a set of hard invariants after **every turn**: finite
stocks, unrest ∈ [0, 100], integer non-negative unit counts, no orphaned/empty
armies, valid region owners, commander loyalty ∈ [0, 100], a valid rngState, and
well-formed chronicle entries. It also asserts **determinism** (same seed+config →
byte-identical game) and **termination**, plus a **coverage guard** proving the
matrix actually drives conflict (wars, revolts/betrayals, decisive games).

Result: **no invariant violations across ~42 full games** — the whole interacting
stack (combined battles, allied rally, ZoC, entrenchment, commanders, defection,
reconquest, revolts, chronicle) holds up under long-run self-play. 595 tests green.

---

## 2026-07-18 — E1 + E2: named rulers & the chronicle (v0.50.0)

The X-factor layer — turning an anonymous colour on the map into someone with a
reputation, and the run into a story you can read back.

**E1 — named rulers.** Every non-barbarian realm gets a generated ruler (name +
epithet), flavoured by its AI disposition — a warlord earns "the Cruel / the
Conqueror", a merchant "the Rich / the Shrewd" (`src/data/rulers.ts`,
deterministic from the seed). The diplomacy panel now leads with the ruler
("Visvaldis the Cruel · Lithuania"), and the chronicle speaks in their name.
New optional `Nation.ruler`.

**E2 — the chronicle.** A curated, run-long list of the story's major beats in
prose (`src/systems/chronicle.ts`, persisted `GameState.chronicle`): **wars**
(`declareWar`), **revolts** and **betrayals** (secession / defection — the E5
drama), the **fall** of a realm, and the closing **victory**. It renders in the
Standings overlay mid-game and on the end screen, colour-coded by beat kind. This
is the screenshot/share generator, and it now has E5's defections to tell about.

Verified: 592 tests green (+7 rulers + chronicle). Typecheck + build clean.
Browser: rulers show in diplomacy ("Vykintas the Fair · Sweden"); a full game to
a faith victory rendered the closing chronicle beat in the UI with zero console
errors. New optional `Nation.ruler` / `GameState.chronicle` — saves load clean.

Next: with the character/story layer in, the sim is feature-complete enough for a
dedicated **stress / bug-bash pass** (self-play across seeds + a Playwright fuzz
run) before onboarding polish.

---

## 2026-07-18 — Close the defection loop: AI reconquest + war confirm (v0.49.0)

Making E5's breakaways *bite* in AI games, and guarding the player against
starting a war by accident.

- **Breakaway regions remember their former ruler.** A seceded (`applySecession`)
  or defected (`applyDefection`) region now records `priorOwnerId`, which also
  hands the former owner the existing **reclaim** casus belli.
- **The AI prioritises retaking its own lost land.** `bestTarget` adds a
  `RECLAIM_VALUE` bonus for a target whose `priorOwnerId` is the attacker —
  so a rival whose province revolts or whose general defects marches to take it
  back rather than shrugging it off. E5's consequences now land in rival play.
- **War-confirm dialog.** Ordering an attack that would start a *new* war now
  asks first ("Attack Lithuania? Striking here declares war… their allies may be
  drawn in") — because combined battles + allied rally made an accidental war
  costly. Barbarians, current enemies, and plain relocations never prompt; the
  explicit Declare-war button already confirmed. Wraps both attack paths
  (the map click and the Attack chooser) via the shared `confirmAction`.

Verified: 585 tests green (+1 reclaim-priority + priorOwnerId assertions).
Typecheck + build clean; 12 browser turns with zero console errors.

---

## 2026-07-18 — E5: named pretender revolts + commander defection (v0.48.0)

Deepening the army systems: commanders become a *threat*, not just a combat
bonus — the CK3 "your own appointments turn on you" beat, built on M4's loyalty.

- **Loyalty now drifts** (`applyCommanderEffects`, replacing the old
  unrest-only hook). A commander's loyalty erodes each turn it sits in a
  high-unrest province (≥ `UNREST_PENALTY_START`) and recovers in a calm one —
  so neglect radicalises your officers, good governance settles them. A
  disloyal one (≤ 30) still foments unrest where it stands.
- **Defection** (`applyDefection`, new pipeline step before secession). A
  disloyal commander garrisoning one of its realm's own regions that has fallen
  into open revolt (unrest ≥ `UNREST_REVOLT`) **turns his coat** — the region
  and the whole army pass to the Free Tribes with the commander still at their
  head. A normally-loyal garrison would have *held* that province; a disloyal
  one seizes it instead, and as a *led* stack it's harder to retake.
- **Named pretenders on secession.** Ordinary ungarrisoned revolts now throw up
  a generated pretender to lead the rebel militia ("…rises in revolt under
  Visvaldis the Bold, seceding from your realm"), deterministic from the seed.
- **UI.** The enemy-region panel names the pretender/commander and shows a
  dug-in note; its attack forecast folds in entrenchment + commanders like the
  main odds preview.

The slow fuse: a disloyal commander foments unrest → the province tips into
revolt → their loyalty erodes → they defect and take it. All telegraphed (the
army panel shows loyalty + a "disloyal" warning) and fully deterministic.

Verified: 584 tests green (+4 E5 + drift/defection coverage). Typecheck + build
clean. Browser: 12 turns run with zero console errors (the new pipeline steps
fire every turn). New optional `Army.commander` on rebel stacks — saves load clean.

---

## 2026-07-18 — Army M4: commanders (v0.47.0)

The last army step — characters who lead stacks, built as a pure army feature
(the CK3 "Generals" track stays for the dynasty work later).

- **`src/data/commanders.ts`** — a commander is a data row: name + epithet
  (Baltic-crusades flavour), a 2–9 martial rating, one of six traits
  (Brilliant/Bold/Cautious/Reckless/Ambitious/Steadfast), and loyalty.
  `generateCommander(rng)` draws one deterministically; `commanderAttack` /
  `commanderDefense` fold martial + trait into a strength multiplier.
- **Combat (`combat.ts`).** `CombatContext` gains `attackerCommand` /
  `defenderCommand` multipliers, applied to both the volley and the melee, and to
  `combatStrengths` so the UI win-odds stay honest. Absent = an unchanged fight
  (fully backward compatible).
- **`military.ts`.** `appointCommander` attaches a fresh officer (advances the
  RNG); `moveArmy` feeds both sides' commanders into the resolver.
  `applyCommanderUnrest` — a disloyal commander (loyalty ≤ 30) foments unrest in
  the home region it occupies (the seed of the roadmap's named-pretender revolts).
- **AI.** Rivals appoint commanders to any sizeable unled stack (a new Phase 0 in
  the army loop), so they benefit from the same martial edge.
- **UI.** The army panel shows the commander (name, martial, trait, a loyalty
  warning) and an Appoint/Replace button; the combat-odds preview now folds in
  entrenchment (M3) and commanders (M4).
- New optional `Army.commander` — legacy saves load clean.

Verified: 580 tests green (+11: commander data, combat-bonus, appoint, loyalty).
Typecheck + build clean. Browser end-to-end: a fresh game runs 8+ turns with zero
console errors, and the player's Appoint-commander and Fortify buttons both work
(panel + log update live). That closes the M2→M4 army arc; M5 (AI concentration
of force) was already on `main`.

---

## 2026-07-18 — Army M3: fortify + zone of control, and allied rally (v0.46.0)

Third army step, plus the alliance extension of M2's combined defence.

**Allied rally (extends M2).** A defended region now rallies not just its own
realm's neighbours but its **formal allies'** adjacent garrisons. Answering the
call draws the ally into the war against the aggressor (the `ally_call` casus
belli), so an alliance finally has teeth on the battlefield. A non-allied
neighbour stands aside. (`military.ts` `ralliedDefenders` + a war-entry pass in
`moveArmy`.)

**M3 fortify (entrenchment).** A new **Fortify (dig in)** stance: an army forgoes
the rest of its turn's movement to entrench, and its region's defence climbs one
level per held turn up to `MAX_ENTRENCH` (3), grown in the turn pipeline
(`tickEntrenchment`). A dug-in garrison fights as if the region had that much
extra fortification — siege still strips it. Attacking or relocating gives up the
stance. The rival AI digs in idle frontier garrisons automatically (a Phase 3 in
the army loop). New `Army.fortifying` / `Army.entrenchment` (both optional →
legacy saves load clean).

**M3 zone of control.** An enemy stack now **pins the ground around it**: marching
into a region adjacent to a hostile army ends that army's movement for the turn
(`inEnemyZoc` + a clamp in every move path). Armies can no longer slip past enemy
forces freely — you have to deal with the stack. Allies and non-belligerents exert
no ZoC; barbarians (always hostile) do. Applies to the AI through the same
`moveArmy`.

**UI.** The army panel shows entrenchment (`n/3`, "deepening") and an
"in an enemy zone of control" note, and offers the Fortify button. The battle
report already surfaced rallied reinforcements (M2).

Verified: 569 tests green (+7 fortify/ZoC, +2 allied rally on top of M2's), typecheck
+ production build clean, app boots with no console errors. Save round-trips the new
army fields.

---

## 2026-07-18 — Army M2: combined battles (v0.45.0)

Second step of the army-stacking arc (after M1's stack command). Attacking a
defended region no longer pits your stack against that region's garrison alone:
the defender's realm **rallies its adjacent garrisons into one combined
defence**. This is the missing symmetric half of concentration-of-force — the
attacker already massed (M1 merge + the AI's own massing), but a defender could
never coordinate across regions.

- **`military.ts`** — `moveArmy` now pools the garrison with every same-realm
  army standing in a region adjacent to the target that still has a move, and
  resolves the assault once against the combined stack (`resolveCombat`
  unchanged: sum the defenders, split the casualties back). Casualties are
  distributed per unit type by the **largest-remainder method** so per-stack
  losses reconcile exactly with the combined total and never exceed what a
  stack holds. Rallying stacks spend a move (they marched to the guns) and hold
  their own ground; the garrison in place does not. Automatic and symmetric —
  player and AI both benefit, no new UI or player micro.
- **Barbarians never coordinate** — a barbarian holder stands alone and draws
  no rally, keeping them the static neutral foil they're designed to be.
- **`combat.ts` / `hud.ts`** — the battle report carries `defenderReinforcements`
  (soldiers rallied, counted inside `defenderStart`) and the report header shows
  a "neighbours rallied +N" note so the combined defence is legible.

Design note: this makes a layered line meaningfully harder to crack than a
single forward stack, which is the groundwork for M3 (fortify + zone of
control). 560 tests green (+6), typecheck + production build clean.

---

## 2026-07-15 (ninth pass) — Vercel-ready

Prepared `main` for one-click Vercel deployment (static build, no backend):

- **`vercel.json`** — pins `buildCommand` (`npm run build`), `outputDirectory`
  (`dist`), the Vite framework preset, and response headers: `nosniff`,
  `Referrer-Policy: no-referrer`, HSTS, a locked-down `Permissions-Policy`,
  `Cache-Control: must-revalidate` on `/sw.js` (so the service worker updates),
  the correct `application/manifest+json` type on the manifest, and immutable
  long-cache on hashed `/assets/*`. Deliberately **no** `X-Frame-Options` — the
  game should stay embeddable (itch.io iframe, blog embeds), and it's a
  single-player local app with no clickjacking-worthy actions.
- **`package.json`** — `engines.node >= 18` (Vite 5).
- **README** — a "Deploying (Vercel)" section (import repo → auto-detected → push
  `main` = production; PRs get previews). Any static host works identically.

Verified a clean `rm -rf dist && npm run build`: `dist/` ships `index.html`,
`sw.js`, `manifest.webmanifest`, the icons and hashed `assets/` — exactly what
Vercel serves. 379 tests green.

---

## 2026-07-15 (eighth pass) — real PWA: installable + offline

The marketing claim "installs as a PWA, works offline" was aspirational — there
was no manifest and no service worker. Made it true:

- **`public/manifest.webmanifest`** — name/short_name "Petty Kingdoms",
  standalone display, theme/background `#11151c`, the 192/512 PNG + SVG
  (maskable) icons. Linked from `index.html` with `theme-color` and an
  apple-touch-icon.
- **`public/sw.js`** — a tiny hand-rolled service worker (no workbox, no dep):
  stale-while-revalidate over same-origin GETs, navigation fallback to the
  cached shell, old-cache cleanup on activate. Registered from `main.ts` in
  production only (dev keeps HMR).
- **CSP updated** for the new surfaces: `connect-src` `'none'` → `'self'` (the
  SW re-fetches the app's own assets; cross-origin is still blocked), plus
  `worker-src`/`manifest-src 'self'`.

Verified in a headless browser: SW registers and controls the page, the
manifest parses, and — the real test — **reloading with the network cut still
loads and runs the game**, with zero CSP violations and zero console errors.
The app bundle's `fetch(` count stays 0 (the SW's own `fetch` lives in
`dist/sw.js`, intentional same-origin caching); marketing copy clarified to
"the app bundle makes zero network calls" so the guarantee stays airtight.
379 tests green; build clean.

---

## 2026-07-15 (seventh pass) — security review

Full-codebase security pass (threat model + review recorded in
`docs/security.md`). The game is offline and backend-less, so the surface is
essentially "untrusted save files → DOM."

**Found and fixed one real DOM XSS.** `nation.color` from an imported/shared
save was substituted unsanitised into the crest SVG (`fill="__C__"`) and set via
`innerHTML` in the standings/diplomacy panels — a colour like `"><img onerror=…>`
executed script. (The fifth-pass hunt fixed the *name*/seed/difficulty sinks but
missed *colour*.) Reproduced it headless — the page title flipped to "CRESTPWN"
— then fixed it two ways:
- **`safeColor()`** validates a colour is hex or `rgb()/rgba()`, else falls back
  to neutral grey; `crestSvg` and every save-derived colour sink now route
  through it.
- A strict **production CSP** (`vite.config.ts`, build-time `<meta>`, skipped in
  dev): `script-src 'self'` blocks inline handlers (a hard second layer),
  `connect-src 'none'` enforces the no-network guarantee, `img-src 'self' data:`
  keeps the canvas SVG rasters working. Confirmed the app runs with zero CSP
  violations and the XSS no longer fires.

Also swept: no `eval`/`Function`/`document.write`/`insertAdjacentHTML`; the only
network-shaped call is `new Image()` on a `data:` SVG (non-scripting context);
runtime `dependencies: {}` so nothing third-party ships. `npm audit` flags a
dev-only esbuild/Vite advisory (dev server only, not the shipped bundle;
remediation is a breaking Vite 8 upgrade) — documented and accepted, not fixed
in this pass. 379 tests green (added `safeColor` + hostile-crest guards); build
clean; bundle `fetch(` 0.

---

## 2026-07-15 (sixth pass) — behaviour-driven UI bug hunt

Drove the real app through its major flows (Playwright) rather than only reading
code: every overlay open/close, end-turn guarding, diplomacy + confirm dialog,
save/load, a junk-slot load, recruit/build/move, tax dragging, a full game to the
end screen, tutorial navigation, and phone-width layout — watching for console
errors, broken interactions and layout overflow.

Almost everything held up cleanly (zero console errors throughout; overlays are
mutually exclusive via their backdrops and all closable; end-turn is correctly
blocked behind overlays; junk saves load to a toast, not a crash; the region
panel follows ownership changes; the tax slider only autosaves on distinct value
changes, not once per input tick; no horizontal overflow and overlays fit on a
390×780 phone).

**One real bug, fixed:** `runTutorial` added a `window` "resize" listener that
`finish()` never removed (it removed only the keydown listener). Because the tour
is re-openable from the toolbar, every run leaked a listener that kept calling
`render()` against detached DOM on every resize. Named it `onResize` and remove it
in `finish()`; verified net listener count stays flat across the Start-playing,
Esc and Skip close paths. 377 tests green, build clean.

---

## 2026-07-15 (fifth pass) — bug hunt over the session's changes

Ran a structured four-track bug hunt (renderer, DOM-injection, menu/boot wiring,
art registry), verified each finding in code, and fixed the real ones.

**Security — stored XSS via imported save (high).** `deserializeGame` only shape-
checks, so nation/region names, `seed` and `difficulty` from a shared/edited save
are attacker-controlled — and this session's icon work had turned four sinks from
`textContent` to `innerHTML` (victory bar, region meta, turn summary, turn badge).
A save with `nation.name = "<img onerror=…>"` executed on load. Fixed: escape
every save-derived string at those sinks (exported `escapeHtml`), and, defence in
depth, coerce `seed`→number and whitelist `difficulty` in `deserializeGame`.
Verified with a tampered-autosave probe: the name now renders as inert text, no
script runs, seed/difficulty degrade cleanly.

**Menu (high).** The menu's New game → Start overwrote a live autosave with no
confirmation (the HUD form guards it) — added a two-step "Discard your turn N
game?" arm. Added a Tab focus trap so keyboard focus can't escape the opaque menu
to the live HUD buttons behind it (one path reached an invisible destructive
confirm dialog). Narrowed the overlay z-raise + `hudOverlayOpen` to Options/Records
only, so a choice/end overlay from a loaded save stays *behind* the menu. Clamped
new-game prefs so a stale value can't start a 0-rival / 0-region game.

**Renderer.** `ico()` (and the hand-built SVGs) now carry explicit width/height —
some engines rasterise an unsized SVG to a blank canvas and cache it as "ready",
silently defeating the emoji fallback. Cached the Voronoi projection (pixel
polygons, sites, reach, terrain gradients) and the background gradient by
size+signature instead of rebuilding them 60×/second. Fixed fortification/resource
fallback text inheriting a stale `fillStyle`.

**Art + tests.** Six choice events had drifted out of `EVENT_THEME` and showed no
vignette — added them (plus a `works` theme). Tests now derive ids from
`EVENTS`/`ACHIEVEMENTS` (a new event/achievement that forgets its art fails the
suite) and sweep every SVG table. 377 tests green; typecheck/build clean; bundle
`fetch(` 0; 7-scenario Playwright matrix + the XSS and discard-confirm probes all
pass with no console errors.

Follow-up: the three low/latent items were then fixed too — `ensureCells` now
rolls up every region's coordinates (a same-count regen can't reuse stale cells);
the trade vignette's pans attach directly to the beam (dropped the transform that
detached them); and `iconEl`/`iconHtml` emit nothing (not a zero-size span) when a
registry entry is null with no fallback, honouring the all-null-registry contract.
377 tests green, build clean, Voronoi + regen verified with no console errors.

---

## 2026-07-15 (fourth pass) — main menu: the title screen grows up

The splash became a conventional main menu: **Continue** (or *Begin your
reign*), **New game**, **Options** and **Records**, with Esc continuing into
the game. New game expands the full setup inline — scenario presets, seed,
difficulty, rivals, map size — via a new shared module (`ui/newgame.ts`) that
the HUD's left panel now uses too, so both surfaces stay identical and share
the remembered preferences. Options/Records reuse the HUD's overlays, raised
above the menu (the menu mounts inside `#hud`, since `position: fixed` traps
child z-indexes in its stacking context).

Fixed along the way: the HUD's Escape handler never closed the Options and
Records overlays (only tech tree/standings/legend/hints) — Esc now closes
every dismissable overlay.

Verify: 375 tests green, typecheck/build clean, `fetch(` count 0; Playwright
flows — menu → new game on Hard actually starts on Hard, Options opens above
the menu and Esc unwinds overlay → menu → game, plus the 8-scenario matrix
(menu, both layouts, colour-blind, reduce-motion, phone) with zero console
errors.

---

## 2026-07-15 (third pass) — D1 polish: badges, branch/treaty glyphs, army chips

- **Achievement badges**: all 10 achievements got a unique motif in a shared
  soft-hexagon frame (`BADGE_ART` + `badgeArt()`); locked entries keep the
  padlock, unknown ids fall back to the generic medal.
- **Tech-branch glyphs** (`BRANCH_ART`): coin / crossed swords / columned hall
  / star beside the branch name in the research picker and the tech tree.
- **Treaty glyphs** (`TREATY_ART`): the diplomacy status chip now leads with
  crossed swords (war), an olive sprig (peace), two standing shields (NAP) or
  interlocked rings (alliance) — treaty state reads before the word does.
- **Army composition chips**: "2 Mil, 1 Inf" is now unit-icon chips with
  counts (tooltip carries the full name); the text path remains the fallback.

Verify: 375 tests green, typecheck/build clean, `fetch(` count 0, Playwright
pass over the region panel and Records overlay — no console errors.

---

## 2026-07-15 (later) — D1 continued: title screen, moment art, map texture

Second art cycle of the day, finishing the brief's remaining deliverables
(style rules per `docs/art-style.md`):

- **Title screen** (`src/ui/title.ts`): crest-medallion key art + a gold
  wordmark and "Begin/Continue your reign" entry. The name renders as DOM
  text — "Gaime2" is still the placeholder, so the eventual rename is a copy
  edit, not an art change. Blocks hotkeys while up, skips its fade under
  reduce-motion, and the first-run tutorial now waits for it.
- **Victory/defeat end-cards**: struck-seal medallions (laurelled trophy in
  gold / toppled crown in slate) above the end-game banner.
- **Event vignettes**: six reusable themes (harvest, plague, festival, war,
  trade, scholars); `eventVignette()` maps every event id to a theme, so the
  decision modal now opens with matching art and a new event inherits a
  vignette with one map line.
- **Map texture**: each Voronoi cell is stamped with a faint terrain emblem
  (grain / pine / mounds / peaks / waves) and coast cells get a dashed
  shoreline — terrain reads by shape at the map level, matching the
  no-hue-only rule.

Verify: 375 tests green (registry tests now cover the new tables), typecheck +
build clean, bundle `fetch(` count 0, Playwright checks of the title screen,
post-title boot and Voronoi motifs at both breakpoints with colour-blind on
and off — no console errors. Remaining art ideas: per-achievement badge art,
animated capture flourishes (reduce-motion-gated), store-icon platform set
once the D3 platform call is made.

---

## 2026-07-15 — D1: visual identity — the emoji/flat-colour era ends

Executed the art brief (`docs/art-agent-brief.md`; plan in `docs/art-plan.md`,
style bible in `docs/art-style.md` — palette tokens, 24×24 grid, stroke and
legibility rules all future assets conform to). Committed style:
**flat-vector, stroke-first line icons**
on a shared 24×24 grid, `currentColor`, one gold/brass accent inherited from
the crown favicon. Everything hand-authored inline SVG — no deps, no network,
`dependencies` still `{}`.

- **Scaffolding first** (per the brief): `src/data/art.ts` is the single asset
  registry (resources / glyphs / units / buildings / crests / terrain shades);
  `src/ui/icons.ts` builds DOM icons; the renderer got an SVG→canvas image
  cache keyed by (id, colour, size). Every consumer falls back to the old
  emoji/flat colour when a registry entry is null — the game renders with
  zero assets.
- **Resource icons (6) + UI glyphs (22)**: coin-stack, wheat, pickaxe, book,
  anvil, horse head; toolbar/legend/victory/marker glyphs. Emoji fully gone
  from HUD, tutorial, toasts and sim-side labels.
- **Nation crests (7)**: one shield template, per-faction white sigil (crown /
  crossed axes / peaks / crescent / broken ring / flame / tower), filled with
  the nation's `cbSafe`-resolved colour — crests follow the colour-blind
  palette; shape still separates factions. Shown in standings, diplomacy and
  the map's capital marker.
- **Terrain + background**: each terrain got a hi/lo shade pair (radial
  shading in both node and Voronoi views, mirrored in HUD legend/panel via
  CSS); flat `#11151c` replaced with a quiet vignette.
- **Units (5) + buildings (14)**: distinct silhouettes (pitchfork / sword /
  bow / horse+lance / catapult); buildings legible at ~14px; the Great Work is
  a laurelled monument in fixed gold.
- **App mark**: favicon upgraded to the player crest; 192/512 PNG app icons +
  master SVG in `assets/icons/` (manifest wiring left for D3's platform call).

Verified per the brief every cycle: typecheck + 373 tests green + build with
`fetch(` count 0, plus Playwright screenshots at 1280×860 and 390×780, node +
Voronoi layouts, colour-blind and reduce-motion toggles — no console errors.
All assets original (no `THIRD_PARTY_ASSETS.md` needed yet).

**Left for a human (per the brief):** final game name + logo direction
("Gaime2" wordmark untouched), commissioned-art budget/licensing, store-icon
platform targets (D3). **Next art ideas:** victory/defeat end-cards, event
vignettes, subtle terrain motifs in Voronoi cells.

---

## 2026-07-14 — B5 follow-up: resource-count tweening (deferred juice, now done)

Closed the visual-juice follow-up flagged when B5 shipped: the top-bar resource
numbers now **count up/down** to their new value instead of snapping. Pure HUD, no
sim touch, and gated by the same reduce-motion flag as the other B5 motion.

**How:** the resource cells are stable DOM refs, so `update()` now sets a *target*
per resource and a small self-idling RAF eases the displayed value toward it
(~20%/frame → ~0.3 s), rounding while counting and showing the exact (possibly
fractional) value once settled. The loop stops itself when every value has settled,
so a static HUD costs nothing. Under reduce-motion — or on the very first paint — it
snaps immediately. A mid-tween reduce-motion toggle snaps on the next frame.

**Verify:** typecheck ✓, **368 tests ✓**, build ✓ (0 `fetch`, deps `{}`). Browser
(Playwright): with motion on, ending a turn walks gold 60→66→67→69→71→72→**72.7**
(six distinct intermediate frames, rounded while counting, exact when settled); with
reduce-motion on it jumps straight to 72.7 (one frame); no page errors. UI-only, so
no probe.

**Roadmap position unchanged:** A–C + D4 complete; remaining Phase-D items are
`[RESOURCE]`-gated. This tidied the last deferred code-side polish; next cycles turn
to the code-side *scaffolding* for the resource-gated items (D5 UI-string extraction)
and surfacing what external input each needs.

---

## 2026-07-14 — ROADMAP D4: Performance profiling — measured fast, guard added

First Phase-D item the loop can complete alone (D1–D3 are `[RESOURCE]`; D4 is not).
Profiled the whole pipeline at the largest configuration (30 regions × 6 nations ×
150 turns, AI self-play) with a temporary harness.

**Measured baseline (this box):**
- Full turn loop (AI + events + resolve): **~0.62 ms/turn**.
- `resolveTurn` alone, mid-game: **~0.35 ms**.
- `computeVoronoiCells` (30 regions): **~0.115 ms** — and already cached by the
  renderer (recomputed only when map geometry changes, never per frame).

Everything is far under the 16.6 ms/frame budget, so — per the roadmap's "optimise
only if measured slow" — **no hot path warrants optimisation**; forcing a
micro-optimisation on already-fast code would add risk for no gain.

**Durable deliverable:** a committed max-config integration + regression guard
(`systems/perf.test.ts`). It plays five full 30r/6n games to completion and asserts
the game always terminates, region ownership is conserved, and every stock stays
finite and non-negative — the first end-to-end test at the largest config — plus a
deliberately generous wall-clock ceiling (8 s vs ~0.33 s measured; ~24× headroom) so
it never flakes but would still trip on an accidental O(n²)→O(n³) blow-up. The temp
harness was deleted.

**Verify:** typecheck ✓, **368 tests ✓** (+1; the new test runs in ~0.33 s), build ✓
(0 `fetch`, deps `{}`, bundle byte-identical — test-only change). No browser/probe
needed (no runtime, UI, or sim change).

**Roadmap position:** with A–C complete and D4 done, the loop-tractable code work is
essentially finished. **Remaining is `[RESOURCE]`-gated** — D1 art (needs an artist),
D2 human playtesting (needs people), D3 store/packaging (needs a target + accounts),
D5 localisation (only if targeting non-English). Next cycles will do the *code-side
scaffolding* for these (e.g. D5 UI-string extraction) and surface to the human what
external input each needs; the project sits at a genuine **~90+**, testing-ready and
feature-complete, with market-readiness now gated on non-code inputs.

---

## 2026-07-14 — ROADMAP C4: Diplomacy depth II — peace offers with reparations

Fourth Phase-C item of `docs/roadmap-to-ready.md`, and the last before ~95: give AI
peace bids real terms. A losing AI now **sweetens its peace offer to the player with
gold reparations** — a concrete reason to grant peace, and a richer negotiation than
a bare white-peace.

**Sim:**
- `peaceReparations(state, from, to)` (pure, exported) — only the clearly-weaker
  party (power ratio < 0.75) offers, spending a bounded slice of its treasury
  (≤40, ≥10 or nothing).
- `acceptOffer` "peace" case now transfers `offer.gold` from the suing nation to the
  player (capped at what it still holds — it may have spent since offering) before
  the war ends. Existing gold-less peace offers are unaffected.
- `ai.ts` `suePeace` attaches reparations when suing to the player; AI-to-AI peace is
  unchanged (resolves immediately, no offer).

**UI:** the offer reads "*X sues for peace, offering Ng in reparations*" when gold is
attached (plain peace otherwise).

**Verify:** typecheck ✓, **367 tests ✓** (+4: reparations only from the weaker party
and bounded; accept transfers the gold and ends the war; the transfer caps at the
payer's balance; a plain peace moves no gold). Build ✓ (0 `fetch`, deps `{}`). A
temporary 40-game self-play probe exercised the path (177 reparations offers) with
**0 timeouts**, turn length min 24 / median 100 / max 150 — stable — then deleted.
Browser (Playwright, crafted autosave): the offer renders "…offering 30g in
reparations", accepting moves the player's gold 60→90 and clears the offer; no page
errors.

**Phase C nearly done:** C1–C4 shipped (meta-progression, content events, scenarios,
diplomacy depth). **Next:** the remaining polish toward market-ready lives in Phase D
(`[RESOURCE]`-tagged: real art, human playtesting, store, perf, localisation) — the
code-only headroom in A–C is largely spent, so upcoming cycles will pick the most
code-tractable D items (e.g. a perf pass, or a localisation scaffold) and flag the
rest as needing a human/budget.

---

## 2026-07-14 — ROADMAP C3: Start scenarios — hand-set openings at new-game

Third Phase-C item of `docs/roadmap-to-ready.md`: replay variety through preset
openings, so a returning player has curated setups (not just the raw sliders).

**Scenarios (`data/scenarios.ts`, content):** six hand-set openings bundling map
size + rival count + difficulty, two with a **themed twist** (a pinned opening
trait): Classic Realm, Border Duel (1 rival, small), Age of Warlords (5 rivals,
large, hard), The Long Peace (2 rivals, large, easy — a builder's game), Scholar-
Kings (opens Scholarly), The Warhost (opens Martial, hard).

**Sim (`turn.ts`):** `NewGameOptions.playerTrait` optionally pins the player's
opening trait; rivals then draw from the remaining pool. **Determinism preserved** —
with `playerTrait` unset the trait draw is byte-identical to before (verified), so
no existing seed shifts.

**UI:** a **Scenario** dropdown in the new-game panel. Picking one fills the
difficulty/rivals/map selectors and shows its blurb; editing any of them by hand
drops back to "Custom". The chosen scenario's trait rides through to `createGame`.

**Verify:** typecheck ✓, **363 tests ✓** (+4: `playerTrait` pins the player's trait
while rivals stay distinct, the unset path stays deterministic, and the scenarios
table is well-formed with no `custom` collision), build ✓ (0 `fetch`, deps `{}`).
Browser (Playwright): the dropdown lists all six; "Age of Warlords" sets hard / 5 /
large + blurb; a manual rivals edit reverts to Custom and clears the blurb; starting
"Scholar-Kings" opens the player with the Scholarly trait; no page errors. (No
self-play probe — default-game balance is untouched; scenarios only bundle existing
knobs and the trait pin is a player-facing themed choice.)

**Next (roadmap order):** C4 diplomacy/AI depth II — richer AI decision-making or a
new diplomatic action, deepening the strategic layer.

---

## 2026-07-14 — ROADMAP C2: Content — five new events (incl. a diplomacy lever)

Second Phase-C item of `docs/roadmap-to-ready.md`: deepen the mid-game with more
event texture. All additive to the `systems/events.ts` table — the same bounded,
low-variance, deterministic shape as the existing ~28 — so no cross-system wiring.

**New events:**
- **drought** (setback) — a dry year; −12 food (floored at 0) + a little unrest. The
  counterweight the food windfall lacked.
- **caravan_raided** (setback) — bandits cost 12 gold (floored at 0). Balances the
  market boom.
- **border_raid** (setback, frontier-gated) — a raid on your most-exposed border
  region: −1 population (never below the minimum) + unrest. War-front flavour.
- **traveling_fair** (windfall) — a small dual boon: +10 gold and a touch of calm.
- **envoy_exchange** (DECISION, **new diplomacy lever**) — spend 20 gold to warm
  relations +15 with your lowest-standing living rival; the first event to touch
  diplomacy (a de-escalation option). AI funds it when flush and the rival is still
  cool.

**Verify:** typecheck ✓, **359 tests ✓** (+5: envoy send/abstain relation + gold
effects, and the three setbacks respecting their floors with no ownership change),
build ✓ (0 `fetch`, deps `{}`). A temporary 40-game self-play probe (AI-driven,
3 rivals) confirmed the additions keep games stable: **0 timeouts**, turn length
min 24 / median 98 / max 150 — squarely in the healthy band — then deleted.

**Next (roadmap order):** C3 scenarios — a few hand-set start configurations (map
size, rivals, a themed twist) selectable at new-game, for replay variety.

---

## 2026-07-14 — ROADMAP C1: Meta-progression — profile stats & achievements

First item of **Phase C** (`docs/roadmap-to-ready.md`) — the reasons to come back.
A per-browser player profile now accumulates across games and unlocks achievements,
persisted to localStorage. Purely observational: it reads a finished `GameState` and
changes no gameplay (guardrail-clean).

**Store (`ui/profile.ts`):** `ProfileStats` tracks games played/won, wins by victory
kind (domination / conquest / great works / prestige score) and by difficulty,
fastest win, and longest game. `recordGameEnd(state)` folds a finished game in and
returns any newly-unlocked achievements; `deriveAchievements` is pure. Fired once
from `main.ts` on the terminal transition (advanceTurn only runs while playing, so
reaching a verdict there is fresh), and a toast celebrates fresh unlocks.

**Achievements (`data/achievements.ts`, content):** 10 milestones as pure predicates
over the stats — First Crown, Conqueror, Wonder of the Age, Enlightened, **Polymath**
(win all three paths), Veteran, Warlord, Blitz (≤45-turn win), The Long Game, Iron
Blood (win on Hard). The type-only `ProfileStats` import keeps it cycle-free.

**Records screen:** a new **🏅 Records** top-bar chip opens a modal — career stats,
wins by path, and an achievements grid (unlocked gold, locked greyed with the
unlock hint).

**Verify:** typecheck ✓, **354 tests ✓** (+6: achievement derivation incl. the
three-path Polymath gate, and `recordGameEnd` win/loss/fastest/longest folding with
persistence, on an in-memory localStorage). Build ✓ (0 `fetch`, deps `{}`). Browser
(Playwright): a fresh profile shows 0/0 and all 10 achievements locked; playing a
game to its end writes `gaime2:profile` (played 1, longest 30) — verified on a real
~29-turn game; a seeded full profile renders every stat and 10/10 unlocked; no page
errors.

**Next (roadmap order):** C2 content — more events, buildings, techs or a wonder or
two, to deepen the mid-game (data-table additions, unit-tested).

---

## 2026-07-14 — ROADMAP B6: Responsive & touch layout (Phase B closes → ~85)

Sixth and final Phase-B item of `docs/roadmap-to-ready.md`. The desktop HUD is a
picture frame of six fixed-width panels around the map; on anything narrower they
overlapped and overflowed. Pure CSS — no markup or JS change — so the sim and desktop
layout are untouched.

**Breakpoints:**
- **≤1024px (tablet/small laptop):** tighten every panel and let the top bar wrap so
  the frame still fits.
- **≤640px (phone):** reflow into four height-capped corner panels (diplomacy /
  region up top, fiscal + turn-log at the bottom) with the research bar as a
  full-width strip along the bottom edge; the map shows through the middle. The top
  bar becomes a **single horizontally-scrollable row** (wrapping grew it tall enough
  to cover the panels below) that starts at the resources.

**Touch:** `touch-action: manipulation` on the map/app kills the 300ms tap delay and
double-tap zoom; a `@media (pointer: coarse)` block gives every button/slider a ≥40px
hit target. Region select/move already ran on `click`, which fires on tap — so touch
play needed no JS.

**Verify:** typecheck ✓, **348 tests ✓**, build ✓ (0 `fetch`, deps `{}`). Browser
(Playwright, four viewports 1280/900/768/390): every one reports **no horizontal
overflow, all panels within bounds, end-turn reachable, zero page errors**; a
touch-tap on the phone canvas selects a region; a phone screenshot confirms the
four-corner + bottom-strip reflow with the resources visible and no overlap.

**Phase B complete (B1–B6).** Procedural audio + ambient, options panel, colour-blind
palette + a11y, visual juice, and now responsive/touch put the project at **~85 —
"feel & platform"**. **Next:** Phase C opens with **C1 meta-progression** — per-profile
stats and achievements in localStorage with a stats/awards screen (reads outcomes, no
gameplay change).

---

## 2026-07-14 — ROADMAP B5: Visual juice — capture ripples + modal transitions

Fifth Phase-B item of `docs/roadmap-to-ready.md`: motion feedback, no art assets,
all gated by the reduce-motion flag B3 added.

**Capture ripple (canvas):** when a region changes hands, the renderer flashes a
transient effect at that region — a quick bright core, then an expanding fading ring
in the new owner's colour (colour-blind palette respected, since it reuses
`ownerColor`). Purely cosmetic and aged by a frame **tick** (no wall-clock, no sim
touch). The renderer gained `pulseCapture(regionId)` and `setReduceMotion(on)`;
`main.ts` diffs region owners after each turn and pulses every region that flipped,
and honours the saved motion pref at boot. Toggling reduce-motion mid-game clears
in-flight ripples live via a new `onSetReduceMotion` callback.

**Modal transitions (CSS):** the tech-tree/standings/options/confirm modals now fade
in and rise (`hud-panel-rise`). The existing `:root[data-reduce-motion]` rule
collapses these to ~instant, so the accessibility opt-in overrides the flourish
automatically.

**Verify:** typecheck ✓, **348 tests ✓**, build ✓ (0 `fetch`, deps `{}`). Browser
(Playwright, differential canvas-hash): idle frames are identical (no idle
animation), so motion is detectable as frame-to-frame change. With motion on,
**27/30 turns showed ripple animation** (captures happen as rivals fight); with
reduce-motion on, **0/22 turns animated** — ripples fully suppressed — and the
options-panel animation duration collapses to 0.001s. No page errors.

**Scoped out (noted as follow-ups):** resource-count tweening and a battle
flash/shake distinct from capture need a per-frame HUD tween loop and a combat-event
signal from the sim respectively — larger than one cycle; the capture ripple already
covers the highest-value "something happened here" feedback.

**Phase B nearly done:** B1–B5 shipped; only **B6 responsive/touch layout** remains
before Phase B closes (~85). **Next:** B6 — `@media` breakpoints so panels reflow on
narrow screens, pointer/touch handlers, larger tap targets.

---

## 2026-07-14 — ROADMAP B4: Accessibility — colour-blind palette, focus, ARIA

Fourth Phase-B item of `docs/roadmap-to-ready.md`. The map encodes ownership purely
by colour, and the default rivals include a green and a red-orange — the classic
red/green confusion. This delivers the colour-blind-safe palette the B3 toggle was
already wired for, plus two broad accessibility wins.

**Colour-blind-safe palette** (`data/palette.ts`, serialisable content): when the
option is on, each nation's base colour maps to an Okabe-Ito-derived replacement
chosen for maximum separation under deuteranopia/protanopia (green→bluish-green,
red-orange→vermillion, the two blues split by lightness, etc.). `cbSafe(hex, on)` is
a pure, case-insensitive lookup so the **canvas and the HUD share one mapping**. The
renderer gained `setColourblind()` and remaps at its single `ownerColor()` choke
point; the HUD wraps every nation-colour swatch (diplomacy, standings, Voronoi
minimap, win banner). Toggling repaints canvas + HUD live via a new
`onSetColourblind` callback, and the preference is honoured at boot.

**Focus rings:** a clear `:focus-visible` outline (keyboard-only, mouse clicks stay
ringless) on every button, select, input and link — keyboard users can finally see
where they are.

**ARIA:** the icon-only ✕ close buttons and the ✕ clear-slot button now carry
accessible names (`aria-label`) instead of reading as a bare glyph.

**Verify:** typecheck ✓, **348 tests ✓** (+5: `cbSafe` off/on/case/unknown/distinct),
build ✓ (0 `fetch`, deps `{}`). Browser (Playwright): enabling the palette flips the
map (canvas pixels change) and the diplomacy swatch `#5b8bd0`→`#56b4e9`, and both
survive a reload (renderer honours the saved pref at boot); a close button reports
`aria-label="Close"`; tabbing to a control shows a 2px focus ring; no page errors.

**Follow-up noted:** deeper keyboard navigation (selecting/moving map regions without
the mouse) is a larger pass — native tab order + focus rings cover the HUD controls
today; region-by-keyboard can come in a later a11y cycle.

**Next (roadmap order):** B5 visual juice — battle flash/shake, capture ripple,
resource-count tweening, panel transitions, all gated by the reduce-motion flag B3
added.

---

## 2026-07-14 — ROADMAP B3: Options panel — one home for sound/access/display

Third Phase-B item of `docs/roadmap-to-ready.md`: a single **⚙ Options** panel that
consolidates the scattered top-bar audio chips and adds the settings the next
features need. All preferences persist to localStorage.

**Panel contents:**
- **Sound:** mute-all, a **master volume slider** (new — all cues now route through
  one master `GainNode`, so the slider is a single live knob; persisted, clamped to
  0–1), and the ambient-bed toggle.
- **Accessibility:** a **colour-blind-safe palette** toggle and a **reduce-motion**
  toggle. Both reflect onto the document root as data-attributes
  (`:root[data-colourblind]` / `[data-reduce-motion]`). Reduce-motion is **honoured
  now** — CSS strips non-essential UI transitions/animations. The colour-blind
  palette flag is persisted and exposed for **B4** to consume (palette swap lands
  there); the toggle sets the attribute today.
- **Display:** a **default map view** select (Nodes / Territory) — persisted and
  applied to the live session, and honoured at boot by the map chip.

**Structure:** new `ui/settings.ts` owns the non-audio prefs (colourblind,
reduce-motion, default map layout) with typed get/set + `applyDisplaySettings()`;
volume/mute/ambient stay owned by `ui/audio.ts`. The two old top-bar audio chips are
replaced by the single ⚙ Options chip, decluttering the bar. `main.ts` applies the
display prefs before first paint.

**Verify:** typecheck ✓, **343 tests ✓**, build ✓ (0 `fetch`, deps `{}`). Browser
(Playwright): the single ⚙ chip replaces Sound/Ambient; the panel shows all six
rows; the volume slider writes `gaime2:volume=0.4`; reduce-motion sets
`data-reduce-motion=1` + persists and is **re-applied on boot after reload**;
colour-blind sets `data-colourblind=1`; mute writes `gaime2:muted=1`; the default-map
select writes `gaime2:mapLayout=voronoi` and flips the top chip to "Territory";
backdrop and ✕ both close the panel; no page errors.

**Next (roadmap order):** B4 accessibility — the colour-blind-safe owner/relation
palette (behind the flag this panel now sets), keyboard nav of the HUD, ARIA labels,
visible focus rings.

---

## 2026-07-14 — ROADMAP B2: Procedural ambient bed (optional, off by default)

Second Phase-B item of `docs/roadmap-to-ready.md`: atmosphere without asset files.
Extends `ui/audio.ts` with an optional ambient music bed — **still zero audio files,
deps `{}`**, everything synthesised.

**Design decision:** not a continuous drone (those grate). Instead a **sparse
generative motif** — every ~11s a soft, low C-pentatonic pad (slow 1.2s swell, long
release, ~0.05 gain) drifts by, stepping through a **fixed six-chord sequence**. The
sequence is deterministic (no RNG) so it's testable and never jarring. It lives
behind **its own toggle, off by default**, and the master mute silences it like any
other cue. `ambientMotif(index)` is a pure, wrap-safe function (handles negative
indices) so it's unit-tested in the DOM-less env.

Kept it distinct from the SFX mute (a separate design call from the roadmap's "same
toggle" note): players who want music opt in without it riding on the SFX switch.
A persisted-enabled bed re-arms on the first user gesture (autoplay policy) via
`armAmbientOnGesture()`, called on boot.

**Wiring:** a **🎵 Ambient** top-bar toggle (dimmed when off); `main.ts` arms it on
boot if it was left on.

**Verify:** typecheck ✓, **343 tests ✓** (+2: the motif loops a non-empty chord
sequence and wraps deterministically incl. negatives), build ✓ (0 `fetch`, deps
`{}`). Browser (Playwright, AudioContext instrumented): the toggle is off by default;
enabling sounds the first pad immediately (+3 oscillators for the 3-note chord),
flips the label, and writes `gaime2:ambient=1`; while muted no pad fires; the state
survives a reload; no page errors.

**Next (roadmap order):** B3 options panel (volume slider + mute + colourblind and
reduce-motion toggles + default map layout, all persisted) — it will absorb these
top-bar audio toggles into one place.

---

## 2026-07-14 — ROADMAP B1: Procedural audio — synthesised SFX (Phase B opens)

First item of Phase B (`docs/roadmap-to-ready.md`), the push from testing-ready
toward *feel & platform*. A game with no sound feels lifeless; now key moments have
a cue — **with zero audio files and deps still `{}`**, because every sound is
synthesised at play time from Web Audio oscillators + gain envelopes.

**New module (`ui/audio.ts`, UI-only, never touches the sim):** a small synth with
hand-tuned little motifs — end-turn tick, build/raise confirm, tech chime, a rising
*capture* vs falling *loss* two-tone, low sawtooth *war*, soft *peace*, triumphant
*eliminate*, a *victory* fanfare, a descending *defeat*, and an urgent *alert* for
famine/bankruptcy. Rising = good, falling = bad, dense-and-low = danger. A **master
mute** persists to localStorage and no-ops all playback; the AudioContext is created
lazily on the first cue (which always follows a click/keypress) to satisfy the
browser autoplay policy.

**Cue selection is a pure function** — `outcomeCue(TurnSummary)` returns the single
most salient cue for a resolved turn, ordered so bad/urgent news wins when several
things happen at once (losing territory over a captured region, danger over good
news). That purity means it's unit-tested in the DOM-less env.

**Wiring:** `main.ts` sounds the tick on end-turn, then win/lose fanfare or the
top event cue; queue-building / raise-unit get a soft confirm blip. A **🔊/🔇 Sound**
top-bar toggle flips and persists mute (dimmed when muted).

**Verify:** typecheck ✓, **341 tests ✓** (+3: the cue map and its priority order),
build ✓ (0 `fetch`, deps `{}`, bundle +~2 kB). Browser (Playwright, AudioContext
instrumented): ending a turn synthesises oscillators; muting flips the label to 🔇,
writes `gaime2:muted=1`, and produces **zero** oscillators on the next turn; the mute
survives a reload; no page errors.

**Next (roadmap order):** B2 optional ambient bed (same toggle, off by default),
then B3 options panel (volume/mute + colourblind + reduce-motion toggles).

---

## 2026-07-14 — ROADMAP A4: UI bug-bash — end-turn hotkey leaked through modals

Fourth and final Phase-A item of `docs/roadmap-to-ready.md`, closing the gate to
**testing-ready (~75)**. Two-pronged bug-bash: a randomized Playwright fuzz plus
targeted code inspection.

**Fuzz:** 220 iterations of random HUD-button clicks, map clicks, tax-slider
nudges and end-turns against a live game (deterministic PRNG for reproducibility).
Result: 100 clicks, **52 turns played**, 3 confirm dialogs exercised, HUD and canvas
still alive, **zero page errors, zero console errors**. The UI is robust under
random stress.

**Bug found (inspection, then fixed):** the global **Enter / Space = end turn**
hotkey didn't account for open modals. Pressing Enter to confirm a dialog *also*
advanced the turn behind it; Enter over the tutorial, tech tree, standings or an
event-choice panel silently ended the turn. Fixed with a `modalOpen()` guard on the
hotkey — and critically registered in the **capture phase**, because the confirm
dialog removes itself on Enter during the bubble phase, so a bubble-phase guard
would check for the overlay *after* it was already gone. Capture evaluates the guard
first, before any modal mutates the DOM.

**Verify:** typecheck ✓, **338 tests ✓**, build ✓ (0 `fetch`, deps `{}`). Browser
(Playwright) proves all three: (A) tutorial + Enter keeps the turn put, (B) plain
Enter still advances, (C) confirm + Enter closes the dialog **without** double-
advancing the turn; no page errors.

**Phase A complete.** Onboarding (A1 tutorial), safety (A2 confirm dialogs),
orientation (A3 capital jump) and this bug-bash (A4) land the project at a genuine
**~75 — testing-ready**. **Next:** Phase B opens with **B1 procedural audio**
(Web Audio API — synthesised SFX, no asset files, deps stay `{}`).

---

## 2026-07-14 — ROADMAP A3: First-run UX sweep — orient the newcomer

Third Phase-A item of `docs/roadmap-to-ready.md`: a browser-driven sweep of the
resting first-run HUD (fresh session, tutorial dismissed) to find where a newcomer
stalls. The layout held up — every control carries a tooltip, the region panel has
a clear empty state ("Click a region to inspect…"), and the turn log opens with a
narrative hook naming the player's home region. The one real gap: a brand-new
player doesn't immediately know *which* dot on the map is theirs.

**Fix:** the empty region panel now offers a **👑 Show your capital** button that
selects and highlights the player's seat of power in one click (only shown while
the player still holds their capital). It's a zero-risk orientation aid — pure
intent through the existing `onSelectRegion` callback, no sim change.

**Verify:** typecheck ✓, **338 tests ✓**, build ✓ (0 `fetch`, deps `{}`). Browser
(Playwright, fresh session): the button appears in the unselected panel, clicking
it selects the capital (region title flips to "Ironreach") and the button gives way
to the region detail; no page errors. Screenshotted the resting HUD to confirm the
overall first-run frame reads cleanly.

**Next (roadmap order):** A4 UI fuzz/bug-bash closes the Phase-A gate
(**~75 testing-ready**); then Phase B opens with **procedural audio** (Web Audio,
no assets/deps).

---

## 2026-07-14 — ROADMAP A2: Confirmation dialogs for irreversible actions

Second Phase-A item of `docs/roadmap-to-ready.md`: guard the handful of clicks a
player can't take back. A reusable modal (`ui/confirm.ts`, `confirmAction()` →
`Promise<boolean>`) now sits in front of three actions:

- **Declare war** — a red "Declare war on {rival}?" prompt noting it severs trade
  and treaties and can't be undone this turn.
- **Clear save slot** — confirms only when the slot actually holds a checkpoint
  (empty slots clear silently), naming the turn it will delete.
- **New game** — confirms only when a game is genuinely in progress (turn > 1 and
  still playing); a fresh session or a finished game starts immediately. Warns the
  autosave is replaced and suggests saving to a slot first.

The dialog is pure DOM over the HUD: centred panel over a dimmed backdrop, **Enter**
confirms / **Esc** or backdrop cancels, focus lands on the confirm button, and one
dialog shows at a time. Body text is set as text nodes (never innerHTML). Danger
actions get a red confirm button; benign ones the accent colour.

**Verify:** typecheck ✓, **338 tests ✓** (confirm.ts is pure DOM, browser-verified
rather than unit-tested — the suite runs in the `node` env by design), build ✓
(0 `fetch`, deps `{}`). Browser-driven (Playwright): declaring war opens the dialog
with the right title, **Cancel** closes it without acting, **Confirm** declares the
war (the panel flips to "Sue for peace"), danger styling present, no page errors.

**Next (roadmap order):** A3 first-run UX sweep, then A4 UI fuzz/bug-bash close the
Phase-A gate (**~75 testing-ready**); then Phase B opens with **procedural audio**
(Web Audio, no assets/deps).

---

## 2026-07-14 — ROADMAP A1: Interactive tutorial (the gate to testing-ready)

First item of `docs/roadmap-to-ready.md` Phase A — the single highest-leverage
step toward *testing-ready (75)*: onboarding. A systems-heavy 4X with only a
hints box is hard to hand to a newcomer; now there's a **coached first-game tour**.

**What it does** (`ui/tutorial.ts`, pure DOM over the live HUD, no sim touch):
a skippable 7-step walkthrough that spotlights each key area — resources bar, tax
slider, the map, research menu, diplomacy panel, end-turn — with a one-line
explanation and a highlight ring. **Next / → / Enter** advance, **Skip / Esc**
end it; a step counter shows progress. It **auto-starts once** on a first-ever
session (persisted `tutorialSeen` flag) and is **re-openable any time** via a new
**🎓 Tutorial** top-bar button. On that first run it retires the legacy hints box
(still on 💡 Help) so newcomers get *one* welcome flow, not two. Step text is set
as text nodes (never innerHTML) so content can't inject markup.

**Verify:** typecheck ✓, **338 tests ✓** (+2: the step list is well-formed and
non-empty; it opens with a centred welcome and every targeted step names a real
CSS selector), build ✓ (0 `fetch`, deps `{}`). Browser-driven (fresh session):
the tour auto-starts ("Step 1 of 7 — Welcome, ruler 👑"), steps through all seven,
marks seen, does **not** re-auto-start on reload, and the 🎓 button replays it;
the legacy hints box no longer co-appears on the first run; screenshot confirms
the dimmed spotlight + card; no console/page errors.

**Roadmap position:** with onboarding in place, the remaining Phase-A gate items
are small (A2 confirm dialogs, A3 first-run UX sweep, A4 UI fuzz/bug-bash). After
those, the project should sit at a genuine **~75 (testing-ready)**.

**Next (roadmap order):** A2 confirm dialogs for war / new-game / clear-slot; then
A3–A4; then Phase B opens with **procedural audio** (Web Audio, no assets/deps).

---

## 2026-07-14 — BIG DEV 2/2: Up to 5 rival powers (a fuller world)

The world was always a 4-way contest at most (3 rivals). Now it scales to **6
realms — up to 5 rivals** — so the diplomacy / war / trade web (Dev 1) has far
more players in it: more coalitions, more fronts, more trade partners, a genuinely
crowded late game.

**Change:** two new powers on the roster — **Emberhold** and **Korrath
Hegemony**, each with a distinct colour (coral, teal) — bringing `RIVAL_NAMES` /
`RIVAL_COLORS` to five. `createGame` now caps rivals by *both* the roster and the
map: `Math.floor(regions / 3)` nations, so a **small map silently seats fewer
rivals** (Small→up to 4) rather than cramming capitals on top of each other, while
Medium/Large host the full five. The rivals selector offers 1–5 (its choice is
already remembered across sessions).

**Verify:** typecheck ✓, **336 tests ✓** (+1: 5 rivals seat on a large map, a
small map caps below 5 but ≥1, and every seated realm is actually placed), build ✓
(0 `fetch`, deps `{}`). Node robustness sweep (deleted): every {16,22,30} ×
{4,5 rivals} combo places all nations, runs 5 turns crash-free, stays
deterministic; Small(16) caps to 4, Medium/Large seat 5. Browser (Large + 5
rivals): the diplomacy panel shows all five — Valdheim, Suzerain of Kael, Sundered
League, Emberhold, Korrath Hegemony — no console/page errors.

**Balance (temp probe, 100 seeds × 4 archetypes, 5 rivals, medium, deleted):** no
crashes; a very **tight, fair spread** (warlord 11 / merchant 12 / builder 12 /
opportunist 10 — six-way games naturally lower every win rate). Domination is rare
(33) — 60% of the map is a long march with six realms — so games resolve mostly by
prestige (144) or Great Works (152); pacing runs longer (medians 133–139, still
inside the 150-turn window), a fitting "big crowded game" feel. Players wanting
room can pair 5 rivals with a Large map (the selector + persistence make that a
one-time choice).

**Next ideas:** scale the *default* rival count / barbarian density with map size;
a mini standings sparkline in the diplomacy header for six-way games; team/bloc
victory when allied blocs dominate.

---

## 2026-07-14 — BIG DEV 1/2: Trade routes (economic diplomacy)

A whole new diplomatic layer: **trade routes**. Two nations at peace can open a
route that pays *both* partners gold every turn — and **any war between them
severs it**. Peace is now profitable, and aggression carries an opportunity cost
(the trade income you forfeit), which deepens the war-or-wealth decision at the
heart of a 4X.

**Model & flow (all pure/deterministic):**
- New `state.trades` (pairKey → true; optional, legacy-safe). Income
  `TRADE_INCOME_BASE + TRADE_INCOME_PER_REGION × (smaller partner's regions)`,
  capped at `TRADE_INCOME_MAX` (tuned to **1 / 0.3 / 5** — up to +5g/turn each) —
  trading with a big neighbour pays more, but bounded by your own size.
- `diplomacy.ts`: `establishTrade` / `severTrade` / `hasTrade` / `tradeIncome` /
  `tradePartners`; `declareWar` now severs the route; `wouldAccept` gains a
  "trade" case (accept unless hostile or at war; economic realms keener);
  `addOffer` / `acceptOffer` / `playerPropose` handle "trade".
- `turn.ts`: a new `applyTradeIncome` pipeline step (1.6) pays every active route.
- `ai.ts`: economic-ish AIs propose trade to peaceful, non-hostile neighbours
  (an offer to the player, a direct handshake between AIs).
- `hud.ts`: each rival card shows an **⇄ Trading +Ng** badge with the income when
  a route is live, or an **Open trade** button (tooltip states the gold and
  whether they'd accept) otherwise; `main.ts` wires `onProposeTrade`.

**Verify:** typecheck ✓, **335 tests ✓** (+6: establish warms relations & sets the
route, war severs it, income scales with the smaller partner and caps, a rival
accepts at decent relations but never at war, `tradePartners` lists partners,
and `applyTradeIncome` pays both sides), build ✓ (0 `fetch`, deps `{}`).
Browser-driven: clicked **Open trade** on a rival card → the **⇄ Trading +1.9g**
badge appeared (1 + 0.3·3 regions) and the log read "Trade routes earned +1.9g"
after a few turns; no console/page errors.

**Balance (temp probe, 120 seeds × 4 archetypes, normal, rivals 3, deleted):**
trade income lifts the whole field (peaceful nations all bank it), which
*compresses* the win spread — from last cycle's [warlord 15 / opp 18 / merch 27 /
build 27] to **[warlord 14 / opp 12 / merch 21 / build 21]**: the economic
ceiling drops (27 → 21, no dominant archetype) while the aggressive floor dips a
touch below the 15% target. Tuning the magnitude down didn't lift the floor (it's
structural — trade is a peaceful-play boon), so I picked the value that keeps
trade *meaningful* rather than negligible. Pacing stays in-window (medians
100–117 turns), all victory types reached, ~2.7 routes live per game. A tight,
healthy profile with a small, thematically-honest tilt toward commerce.

**Next ideas (BIG DEV 2 next):** more rival powers (up to 5) so the trade/war web
is richer; a total-trade-income line in the top bar; let a betrayal (declaring
war on a trade partner) carry an extra reputation hit.

---

## 2026-07-14 — Remember new-game settings + map-size balance check

Two things in one small cycle: **verified** last cycle's map-size feature is
balanced, and shipped a QoL follow-up it suggested.

**Balance check (temp probe, 100 seeds × 4 archetypes, normal, rivals 3, deleted):**
both new sizes are healthy — no degeneracy, and each shifts the *dominant
strategy* in a nice, legible way:
- **Small (16):** archetype wins 14–21% (all in band), median 87–100 turns;
  victory mix led by **domination** (185) — a tight world makes conquest (60% of
  16 ≈ 10 regions) the readiest path.
- **Large (30):** wins 10–28%, median 95–111 turns; led by **Great Works** (187)
  — 60% of 30 = 18 regions is a long march, so the builder/wonder path shines.
Pacing stayed in the 60–150 window at both ends; the default (Medium/22) is
unchanged. So map size is a real strategic dial, not a balance hole — nothing to
tune.

**QoL change** (`ui/hud.ts`): the new-game panel now **remembers your
difficulty / rivals / map-size** across sessions (localStorage, `try/catch` so a
blocked store just falls back to defaults; the seed stays fresh each game). A
returning player — or anyone starting game after game — keeps their preferred
setup instead of re-picking three selectors every time.

**Verify:** typecheck ✓, 329 tests ✓ (unchanged — pure UI), build ✓ (0 `fetch`,
deps `{}`). Browser-driven: set hard / 3 rivals / Small, started a game, reloaded
the page → the selectors restored to hard/3/16; no console/page errors.

**Next ideas:** persist the map layout (Nodes/Territory) toggle too; a "same
settings, new seed" quick-restart button; scale rival-count options with map size.

---

## 2026-07-14 — Map-size selector (replayability)

Backlog **C/F**, a fresh surface (game setup) after several balance cycles. The
engine has always supported a variable region count (`MapGenOptions.regionCount`,
default 22, up to the 30 region names), but the new-game panel only let you pick
seed / difficulty / rivals — every world was the same 22-region size. Now a
**Small (16) / Medium (22) / Large (30)** selector sits beside the others: a small
world plays tight and quick, a large one gives room to expand. Real replay
variety for one selector.

**Change:** `NewGameConfig` gains an optional `map`; the HUD's new-game panel adds
a size `<select>` and passes `{ ...DEFAULT_MAP_OPTIONS, regionCount }` through —
`main.ts` already forwards the whole config to `createGame`, which already reads
`options.map`, so the plumbing was one field. Default stays Medium/22, so the
out-of-the-box game (and its balance) is unchanged.

**Verify:** typecheck ✓, **329 tests ✓** (+1: `createGame` respects a custom map
size — 16 and 30 regions — and still seats all four realms on the smaller map;
the full-tsc build also caught my test's partial `MapGenOptions`, fixed to spread
the default — build-as-final-gate again), build ✓ (0 `fetch`, deps `{}`). Node
robustness sweep (deleted): every {16,22,30} × {1,2,3 rivals} combo places all
nations, runs 5 turns without crashing, and stays deterministic. Browser: the
selector shows Small/Medium/Large and starting both a 16- and a 30-region game
raises no console/page errors. Default unchanged → no balance probe.

**Next ideas:** re-probe balance per map size (a big map may lengthen games / favour
builders); scale starting `RIVAL_COUNT` options or barbarian density with map
size; remember the last-used size across sessions.

---

## 2026-07-14 — Balance: ease conquest unrest so aggression pays (archetype fairness)

Backlog **A**, finishing the archetype-fairness thread the `WONDER_GOAL` change
started. Aggressive archetypes still trailed — a fresh probe (120 seeds ×
4 archetypes, rivals 3, normal) put **warlord 12% / opportunist 15%** against
**merchant/builder 33%**. Root cause on the *conquest* side: a captured region
took a **+40 unrest** slap (`CONQUEST_UNREST`), so freshly-won land produced
little and flirted with secession — the aggressive path was expensive to hold.
With `WONDER_GOAL 5` and secession now braking the snowball, that slap could ease.

**Change:** `CONQUEST_UNREST` 40 → **30** (`systems/state.ts`). Conquered regions
recover faster, so conquest is more rewarding without removing the brake (fresh
land still spikes and can still secede if left ungarrisoned/overtaxed).

**Probe, before → after (normal, 120 seeds/archetype):**
- warlord **12% → 15%**, opportunist **15% → 18%**, merchant/builder **33% →
  27%** — **all four now sit inside the ~15–30% fair band**; the spread narrows
  from 21 to 12 points.
- Pacing holds: avg length 106–110 → 97–112 turns, no fast-game spike, and
  domination did *not* snowball (147 → 125) — the secession/wonder brakes hold.
- Hard stays punishing for aggression (warlord/opportunist ~5–6%), as designed —
  economically-boosted rivals make reckless war costly; that's the difficulty
  doing its job, unchanged in character from prior cycles.

**Verify:** typecheck ✓, 328 tests ✓ (unchanged — `military.test` checks conquest
unrest is *raised*, not a hard-coded 40, so it tracks the constant), build ✓
(0 `fetch`, deps `{}`). Browser smoke (15 turns): no console/page errors.
Data-only change → the probe is the verification.

**Next ideas:** if aggression still wants a nudge, a small tempo/score reward for
holding conquered land a while; re-probe after any further war-cost change
(war-weariness, upkeep).

---

## 2026-07-14 — Tech effects shown inline in the research menu (legibility)

Backlog **D**, a fresh surface (the research panel). The research menu's tech
buttons showed only *name · cost · branch* — what each tech actually *does* (its
blurb: "+20% food", "Unlock Cavalry", "Unlock the Aqueduct") was hidden in a hover
tooltip. So choosing research meant either hovering each option or already knowing
the tree. The blurbs are short and punchy, so there's no reason to hide them.

**Change** (`ui/hud.ts` `renderResearch` + CSS): each frontier tech button now
shows its effect inline as a middle line (name → **effect** → cost·branch), in a
lightly-muted, width-capped, wrapping style so the menu stays tidy. The hover
tooltip stays as a redundant backup. Pure presentation reading the existing
`TECHS[id].blurb`.

**Verify:** typecheck ✓, 328 tests ✓ (unchanged — presentation only), build ✓
(0 `fetch`, deps `{}`). Browser-driven (default game, turn 1): the four tier-0
frontier techs render their effects inline — "+20% food.", "Unlock Ranged units.",
"+15% gold.", "+25% knowledge." — in the name→effect→cost layout; no console/page
errors.

**Next ideas:** a tiny branch-coloured icon per tech; show what a tech leads to
(its unlocks-chain) in the full tech-tree overlay tooltips; a recommended-next
hint by the player's trait/personality.

---

## 2026-07-14 — Battle casualties in the log (combat feedback)

Backlog **D**, a fresh surface (combat feedback) after several economy/event
cycles. The combat log said who *won*, *was repelled*, or *captured* a region —
but never the **cost**. You'd attack, read "won at Northgate," and have no idea
whether it cost you one militia or half your stack, which makes it hard to judge
whether a fight was worth it or to plan the next move. `resolveCombat` already
computes both sides' losses; they were just thrown away at the log line.

**Change** (`systems/military.ts`): the battle log entry now ends with
"(losses N vs M)" — your casualties vs the enemy's — for every resolved fight.
One line, reusing the already-computed `attackerLosses`/`defenderLosses` totals;
no combat-maths or balance change.

**Verify:** typecheck ✓, **328 tests ✓** (+1: a defended battle logs a
"(losses N vs M)" line), build ✓ (0 `fetch`, deps `{}`). Browser-driven (hard, 3
rivals, ~40 turns of idle end-turns): a real rival battle logged "…captured!
(losses 2 vs 1)"; no console/page errors. Logging-only → no balance probe.

**Next ideas:** colour the casualty numbers (green when you come out ahead, red
when you bleed); a compact per-unit-type loss breakdown in a tooltip; surface a
big battle in the alerts strip / turn summary.

---

## 2026-07-14 — New event: sap an enemy's walls (offensive siege-prep)

The offensive counterpart to `reinforce_walls`, and a small nudge for the
aggressive play the balance probe keeps showing trails. When a fortified hostile
stronghold (a barbarian hold, or a rival you're at war with) borders your land,
**sappers offer to undermine it for 25 gold → −1 fortification** on the toughest
such fort — softening it before an assault. Fortification is a stiff defensive
multiplier (`FORT_PER_LEVEL` +20%/level), so shaving a level off a wall you're
about to storm is a real, affordable edge.

New `sap_the_walls` choice event, gated by a new pure `hostileFortNeighbour`
helper (returns the most-fortified hostile bordering region, or null) so it's only
offered when there's actually a fort to break. A funded AI (gold ≥ 45) with such a
neighbour hires. (I first spent the cycle on the residual archetype gap from the
Great Works fix, but re-probing showed reweighting `nationScore` — wonders 40→28,
regions 10→18 — flipped *no* games: the economic score lead is too structural for
a tiebreak tweak. Reverted, and shipped this instead.)

**Verify:** typecheck ✓, **327 tests ✓** (+3: hiring spends 25 gold and drops the
target fort by 1 with the log line; too little gold is a safe no-op; the event
stays ineligible — never fires — when no fortified hostile fort borders you),
build ✓ (0 `fetch`, deps `{}`). Browser-driven (seed 153, rivals 2): the modal
renders at turn 2 with the prompt and both numbered options, and clears cleanly on
pick; no console/page errors.

**Balance (temp probe: 40 seeds × 3 difficulties × {2,3} rivals = 240 games,
deleted):** no crashes; medians **83–118** turns, diverse victory mix, fair win
rates; sap/game 0.03–0.23 (a rare texture pick). The probe also confirms last
cycle's `WONDER_GOAL` fix landing — domination is now the common plurality and
Great Works has receded — so conquest has real room.

**Next ideas:** let the AI hire sappers specifically when it's massing to assault
that fort; a companion "storm the breach" bonus the turn after a fort is sapped;
show a besieged/sapped region briefly tinted on the map.

---

## 2026-07-14 — Balance: rein in the Great Works runaway (archetype fairness)

Backlog **A**, the dedicated balance pass the playbook says is always worth
doing. A broad probe (150 seeds × 4 archetypes × {normal,hard}, rivals 3) exposed
a real skew: driving the player by each archetype, **aggressive realms won ~9%
while economic ones won ~36%** — a 27-point gap, well outside the fair ~15–30%
band. Root cause: the **Great Works (wonder) victory dominated** (327/600 games),
and warlords/opportunists are gated out of pursuing wonders (`pursuesWonders =
economy ≥ 0.6`), so a peaceful rival wonder-rush routinely ended the game before
an aggressive player could conquer.

**Change:** `WONDER_GOAL` 4 → **5** (`systems/state.ts`) — one more Great Work to
win. That's a national project built one-at-a-time, so it meaningfully slows the
wonder path and gives the conquest/prestige paths room to matter. One constant, no
code change. (Probed and rejected two other levers first: `DOMINATION_FRACTION`
0.6→0.55 barely moved the spread since it eases *everyone's* conquest equally, and
bumping region weight in `nationScore` did nothing because wonder/tech score
dominance never let a region tweak flip a prestige tiebreak — reverted both.)

**Probe, before → after (normal, 120 seeds/archetype):**
- warlord **9% → 13%**, opportunist **9% → 14%**, merchant/builder **36% → 31%** —
  the gap narrows from 27 to ~18 points, aggressive play climbs toward the band,
  economic eases below the ceiling.
- Victory mix rebalances: Great Works 220 → 154, prestige 45 → 123, domination/
  elimination steady — no path unreachable, none dominant.
- Pacing stays in-window: avg length ~95 → ~106–113 turns, too-fast games *down*
  (13 → 4–13). No crashes across the runs.

**Verify:** typecheck ✓, **324 tests ✓** (updated one alerts test that hard-coded
"3/4 = 75%" to derive `WONDER_GOAL − 1` from the constant, so it tracks the goal),
build ✓ (0 `fetch`, deps `{}`). Browser: the victory bar reads "⭐ 0/5"; no
console/page errors.

**Next ideas:** if aggressive archetypes still trail, give conquest a score/tempo
edge (region-weight lever needs wonders' score dominance trimmed first); revisit
after any further AI-aggression changes.

---

## 2026-07-14 — Fortification marker on the map (legibility)

Follow-on to the wall-reinforcement event (and a step into the renderer, a fresh
surface). Fortification strongly shapes combat — a defended region is much harder
to take, and the new event lets you raise it — but it was invisible on the map:
you had to click each region to learn its fort level. Now a **🛡N marker** sits at
the bottom-centre of any region with fortification > 0, so you can read the whole
board's defensive picture at a glance when planning an attack or shoring up a
front.

Drawn in the shared `drawMarkers` (`systems/renderer.ts`), so it appears in **both**
the node+edge and Voronoi layouts; placed bottom-centre, the one free corner (the
crown sits bottom-left, the army badge bottom-right, the unrest dot top-right). A
matching legend row ("🛡 Fortification level — harder to capture; siege strips it")
keeps the map key complete.

**Verify:** typecheck ✓, 324 tests ✓ (unchanged — pure rendering), build ✓
(0 `fetch`, deps `{}`). Browser-driven (default game, seed 12345): screenshots of
both layouts show the 🛡 marker with its level on fortified regions (barbarian
holds and the fort-1 capitals), distinct from the red army badge; the legend lists
the fort row; no console/page errors. No sim change → no balance probe.

**Next ideas:** a companion "raze the walls" event on capturing a fort; have the AI
prefer siege units against high-fort targets it wants; a subtle ring thickness for
fort level as an alternative to the glyph.

---

## 2026-07-14 — New event: reinforce your frontier walls (content)

A deliberate step out of the AI/instability cluster (many cycles deep) into
backlog **C**. Fortification is a real combat lever — `FORT_PER_LEVEL` gives a
defender +20% strength per level — but the *only* way to raise it was the
Fortress building, gated behind the Engineering tech. Now a bounded **choice
event** offers to reinforce your most exposed frontier for **20 materials → +1
fortification**, giving even an early or non-military realm a way to shore up a
threatened border, and a fresh materials-spending decision.

New `reinforce_walls` choice event in `events.ts` (general, not trait-gated), plus
a pure `frontierRegion(state, nationId)` helper that finds the owned region
bordering foreign land with the *lowest* fortification (ties by id) — so the
reinforcement lands where it's most exposed. A materials-rich AI (≥35) with a
frontier funds it.

**Verify:** typecheck ✓, **323 tests ✓** (+2: funding spends 20 materials and adds
exactly +1 fortification to a genuine border region; too few materials is a safe
no-op), build ✓ (0 `fetch`, deps `{}`). Browser-driven (seed 153, rivals 2): the
event modal renders at turn 2 with the prompt and both numbered options ("+1
fortification on your most exposed border region"), and clears cleanly on pick; no
console/page errors.

**Balance (temp probe: 40 seeds × 3 difficulties × {2,3} rivals = 240 games,
deleted):** no crashes; medians **66–99** turns, diverse victory mix (all four
kinds), fair win rates. The event fires occasionally for rivals (walls/game
0.0–0.35, rising with more rivals/materials) — a low-frequency texture pick, not a
staple. Adding it to the event pool reshuffles event-selection RNG so trajectories
differ from prior probes (expected), but every aggregate stays in the healthy
band; a +1 fort here and there doesn't bend conquest pacing.

**Next ideas:** a companion "raze the walls" event when you capture a fort; let the
AI value a target's fortification more when choosing what to besiege; show a
region's fort level with a small shield marker on the map.

## 2026-07-14 — Allies pile onto a reeling enemy (call to arms)

Completes the "reeling" arc from both ends. The AI already strikes a reeling
rival, and the player can now *see* who's reeling; this makes a called ally
**answer at worse odds when the target is reeling**. A famine-struck, bankrupt,
or revolt-gripped foe is distracted and easy to pile onto — exactly the moment
you most want help finishing it off — so an ally that would normally judge itself
too weak to join now does. Reactive, and symmetric with the AI's own opportunism.

**Change** (`systems/diplomacy.ts` `wouldJoinWar`): the "won't suicide against a
far-stronger foe" power floor drops from **0.4× → 0.25×** of the enemy's power
when `nationInstability(state, enemy).reeling` (the same shared helper the AI's
opportunist war and the diplomacy-panel badge use — one signal, three consumers).
`wouldJoinWar` gates both the player's call to arms (the button's willingness
tooltip updates for free) and the AI's own ally calls, so this deepens AI-vs-AI
war dynamics too. Pure, deterministic.

**Verify:** typecheck ✓, **322 tests ✓** (+1: an ally refuses a *stable* enemy at
~0.33× power odds but joins the *same* enemy once it's reeling), build ✓ (0
`fetch`, deps `{}`).

**Balance (temp probe, deleted: 120 games = 30 seeds × {2,3} rivals ×
{normal,hard}, symmetric self-play driving the player too):** before **and** after
are **identical** — 0 crashes, 0 unfinished, median **86** turns (min 17, max
150), victory mix domination 50 / great works 41 / prestige 13 / elimination 16,
player win **16%** (healthy 15–30% band). The easing fires only in a rare
confluence (an AI's normally-too-weak ally + an enemy reeling at that exact
moment), so aggregate balance is untouched while the behaviour is richer when it
does fire. **No regression.**

**Next ideas:** mirror the reeling badge into the Standings overlay rows; let the
AI *time* a call to arms for when a shared enemy tips into reeling; a brief
"piling on" log flavour when an ally joins against a crumbling foe.

## 2026-07-14 — "Reeling" read: show the player the weakness the AI exploits

Last cycle taught the AI to **strike a reeling rival** — one gripped by famine,
bankruptcy, or an open provincial revolt — by lowering its required power edge
against such a target. But that read was invisible to the human: the AI would
pounce on your neighbour's crisis while you had no in-game signal that the moment
was ripe. This closes the asymmetry. The diplomacy panel now shows a small amber
**⚠ Reeling** badge on any rival that is famine-struck, bankrupt, or holding a
province in full revolt, with a tooltip naming the crises — *"…a tempting moment
to strike (rivals read this on you too)."* The player now shares exactly the
opportunist signal the AI acts on, and it doubles as a warning that the same
weakness on *your* borders invites aggression.

**Change.** Extracted the AI's inline instability test into one pure, shared
helper `nationInstability(state, nationId)` in `systems/state.ts` (returns
`{famine, bankrupt, revolt, reeling}`); `ai.ts` `doDiplomacy` now calls it
instead of re-deriving the same booleans (DRY — one source of truth for the
signal). `ui/hud.ts` `renderDiplomacy` reads the helper and appends the badge to
each rival card's strategic-read row next to the power chip; new CSS
`.hud-diplo-reeling`. Pure read, no sim/behaviour change — the AI decides
identically, the player just sees more.

**Verify:** typecheck ✓, **321 tests ✓** (+8: a new `state.test.ts` covering
`nationInstability` — stable vs. famine/bankrupt/revolt, the ≥`UNREST_REVOLT`
threshold, ignoring other nations' revolts, and a missing-nation legacy guard),
build ✓ (0 `fetch`, deps `{}`). Browser (Playwright, seed 16 → 3 rivals): drove
to turn 15 where a rival (Sundered League) has a province in revolt — the amber
**⚠ Reeling** badge appears on exactly that card with the right tooltip, the two
stable rivals show none, no console/page errors. No balance probe (no sim logic
changed).

**Next ideas:** have an ally called to arms prefer joining the war against a
reeling enemy; mirror the badge into the Standings overlay rows; a matching
self-warning when *your own* realm is reeling (you're the tempting target now).

## 2026-07-14 — AI opportunism: strike a rival that's already reeling

The offensive complement to last cycle's restraint — together they give the AI a
coherent opportunist brain: *don't compound your own instability; do exploit the
enemy's.* A rival that is internally weak — a province in open revolt, or gripped
by famine or bankruptcy — is distracted and poorly placed to defend, so it's a
tempting moment to pounce. The AI now **lowers its required power edge by 0.3
against such a target**, so it will open a war it would otherwise judge too close
when the enemy is reeling. Rivals therefore actively press *your* weak moments,
which turns all the unrest/secession machinery into a threat the AI leans on.

**Change** (`systems/ai.ts` `doDiplomacy`): a `targetUnstable` test
(famine / bankrupt / any owned region in full revolt) shaves the opportunistic-war
threshold. Small, deterministic, pure.

**Verify:** typecheck ✓, **313 tests ✓** (+3: a cautious realm won't open an
even-odds war against a *stable* rival, but strikes when that rival has a province
in revolt, and likewise strikes a *bankrupt* rival — isolated with no armies so
only the diplomacy decision is under test), build ✓ (0 `fetch`, deps `{}`).
Browser smoke (15 turns): no console/page errors.

**Balance (temp probe: 40 seeds × 3 difficulties × {2,3} rivals = 240 games,
deleted):** no crashes; medians **77–94** turns, diverse victory mix, secessions
/game steady at **~0.025** — unchanged, **no regression**. Target instability is
uncommon at the moment a war is weighed, so the easing fires occasionally, not
constantly; the AI is smarter without games ending faster.

**Next ideas:** surface a rival's instability (famine/bankruptcy/revolt) in the
diplomacy panel so the player gets the same opportunist read; have an ally the AI
calls to arms prefer joining against a reeling enemy; a small "reeling" badge on
the rival card.

---

## 2026-07-14 — AI restraint: quell revolt before conquering more

Backlog **B**. The AI would happily open a *new* war of conquest even while one of
its own provinces was in open revolt and about to secede — grabbing more land it
couldn't hold, straight into a death spiral. Now a nation that has any region in
full revolt (`unrest ≥ UNREST_REVOLT`) **holds off from new opportunistic wars
until it restores order.** Defensive wars, suing for peace, and coalitions against
a runaway leader are all unaffected — only unprovoked aggression pauses.

**Change** (`systems/ai.ts` `doDiplomacy`): a one-line `overstretched` guard on
the opportunistic-war branch. Tiny, deterministic, pure.

**Verify:** typecheck ✓, **310 tests ✓** (+2: a stable warlord opens the
opportunistic war it should; the same warlord with a province in revolt holds off
— isolated with no armies so only the diplomacy decision is under test), build ✓
(0 `fetch`, deps `{}`). Browser smoke (15 turns): no console/page errors.

**Balance (temp probe: 40 seeds × 3 difficulties × {2,3} rivals = 240 games,
deleted):** no crashes; medians **69–97** turns, diverse victory mix (all four
kinds), secessions/game steady at **~0.025** — unchanged, i.e. **no regression**.
The AI still wars plenty (domination and elimination stay common); it just stops
compounding instability by biting off more while a province is in revolt. A
coherence win, same healthy balance.

**Next ideas:** also pause aggression when badly overstretched (high *average*
unrest, not only full revolt); factor a target's instability into how tempting it
is to attack (revolting rivals are softer); show rival famine/bankruptcy flags in
the diplomacy panel.

---

## 2026-07-14 — Power balance on the diplomacy cards (strategic intel)

Backlog **D**, a deliberate step out of the unrest/secession subsystem after
several cycles there. The diplomacy panel showed each rival's relation and treaty
but never how *strong* they are — yet relative power is the single biggest read
for whether a rival is a soft target or a threat you should appease. The AI has
always scored this (`nationPower` = army + territory + treasury); now the player
sees it too.

**Change** (`ui/hud.ts` `renderDiplomacy` + CSS): each rival card gains a colour-
coded **⚔ power chip** — "Much weaker / Weaker / Evenly matched / Stronger / Much
stronger" — from the ratio of the rival's `nationPower` to the player's, green
when they trail you (an opportunity), red when they lead (a threat). Its tooltip
gives the exact percentage and names the inputs (army + territory + treasury). A
small pure `powerAssessment(ratio)` maps the ratio to a label + class, alongside
the existing `relationLabel`/`relationColor` presentation helpers.

**Verify:** typecheck ✓, 308 tests ✓ (unchanged — presentation only, reusing the
already-tested `nationPower`), build ✓ (0 `fetch`, deps `{}`). Browser-driven
(default game, turn 1): both rival cards show "⚔ Evenly matched" (correct — all
realms start equal) with the tooltip "…strength is 100% of yours (army +
territory + treasury)…"; no console/page errors.

**Next ideas:** show each rival's tax rate / famine / bankruptcy flags for deeper
intel; a threat arrow on the map from a much-stronger neighbour; let the AI weigh
garrison-for-calm vs. upkeep when its treasury is thin.

---

## 2026-07-14 — Garrison-calm made legible in the region panel

Follow-on to last cycle's garrison-calm mechanic — closing the legibility loop
(the same "mechanic → make it visible" pattern the secession work followed). A
stationed army now lowers a region's unrest, but the panel gave no hint *why* the
number was lower, which quietly breaks the "legible complexity" design pillar.

**Change** (`ui/hud.ts` `renderOwnedRegion` + a little CSS): when a friendly
garrison stands in the selected region, the unrest row shows a subtle cyan chip
**"⚑ −N"** beside the unrest number (N = the garrison's calming contribution from
the shared, unit-tested `garrisonCalm`), and the unrest tooltip gains a line —
*"Your garrison of N units polices this region, calming it by N unrest."* — plus
"a stationed garrison" is now named among the calming factors in the general
tooltip text. Relaid the unrest label (number+chip grouped left, the state tag
pinned right) so three items don't scatter. Pure presentation; reuses the hoisted
garrison lookup the secession warning already needed (removed a duplicate
`armyAt` call).

**Verify:** typecheck ✓, 308 tests ✓ (unchanged — presentation only), build ✓
(0 `fetch`, deps `{}`). Browser-driven (default game): selecting a garrisoned
region shows the "⚑ −N" chip beside the unrest number and the tooltip names the
garrison's calming effect; the label layout holds with the chip present; no
console/page errors.

**Next ideas:** let the AI weigh garrison-for-calm vs. army upkeep when its
treasury is thin; factor secession risk into how far the AI pushes conquest; a
small map marker for a garrison holding a restless province.

---

## 2026-07-14 — Garrisons calm their region (design §3.3)

Design §3.3 lists garrisons among the things that *lower unrest*, but they never
did — a stationed army only reset the secession countdown, it didn't actually
calm the province. Now **a friendly garrison lowers its region's unrest target**
by `GARRISON_CALM_PER_UNIT` (2) per unit, capped at `GARRISON_CALM_MAX` (12). This
gives armies a real *peacetime* purpose — policing restless or freshly-conquered
land — and makes the advice we already give the player ("station an army here")
genuinely fix the province, not just pause its countdown. Because armies cost gold
upkeep, holding the peace by force is an ongoing trade-off, not a free fix — and
overexpansion unrest still scales with region count, so it doesn't unleash the
territorial snowball.

New pure `garrisonCalm(size)` in `stability.ts`; `unrestTarget`/`nextUnrest` gain
an optional trailing `garrisonSize` term (existing callers unaffected); `turn.ts`
sums each region's friendly garrison and threads it in.

**Verify:** typecheck ✓, **308 tests ✓** (+3: `garrisonCalm` scales and caps and
never goes negative; `unrestTarget` drops by exactly the per-unit calm; end-to-end
over 8 turns a garrisoned region settles lower-unrest than an ungarrisoned one),
build ✓ (0 `fetch`, deps `{}`). Browser smoke (15 turns): no console/page errors.

**Balance (temp probe: 40 seeds × 3 difficulties × {2,3} rivals = 240 games,
deleted):** no crashes; medians **70–104** turns, diverse victory mix, and
secessions/game steady at **~0.025** — identical to the prior pass, i.e. **no
regression**: the upkeep cost and overexpansion unrest keep garrison-calm from
easing the snowball. The effect is subtle in symmetric self-play (neither side
parks policing garrisons much) but is a real new lever for a human player holding
a restless conquest.

**Next ideas:** show the garrison's calming contribution in the region unrest
tooltip (legibility — the number drops but the panel doesn't say why); let the AI
weigh garrison-for-calm vs. army upkeep when its treasury is thin; factor
secession risk into how far the AI pushes conquest.

---

## 2026-07-14 — AI eases taxes to save a province from revolt

Backlog **B** follow-on — the cheaper half of the AI's secession defence. The AI
could already *garrison* a province tipping into revolt, but marching an army is
expensive and slow; the obvious first move (the same one we tell the player to
make) is to **cut taxes**. Its tax logic keyed only on *average* unrest, so one
province at 90 hidden among calm neighbours never moved the dial — and quietly
seceded.

**Change** (`systems/ai.ts`): extracted the inline tax heuristic into a pure,
tested `desiredTaxRate(nation, owned)` that now also reacts to the realm's
**worst** province: a province in revolt (`unrest ≥ UNREST_REVOLT`) pulls tax down
hard (−0.10), one merely trending toward it (`≥ 60`) a little (−0.05), on top of
the existing average-unrest and treasury easing. So a single crisis province — the
one about to break away — actually bends national policy toward calming it.

**Verify:** typecheck ✓, **305 tests ✓** (+3: a lone revolting province cuts tax
below the calm baseline despite a low average; a merely-nearing province cuts less
than a revolting one; the rate stays in the legal band), build ✓ (0 `fetch`, deps
`{}`; the full-tsc build caught an unused test-helper param that vitest's esbuild
missed — ran build as the final gate). Browser smoke (15 turns): no console/page
errors.

**Balance (temp probe: 40 seeds × 3 difficulties × {2,3} rivals = 240 games,
deleted):** no crashes; medians **70–104** turns and a diverse victory mix (all
four kinds appear) — pacing and variety unchanged. **Secessions/game fell to
~0.025**, down from ~0.05–0.07 with garrison-only defence (and ~0.10 before any
defence): the AI now heads off roughly half the remaining own-goal break-aways by
easing tax rather than spending an army. Smarter economic self-defence, same
healthy balance.

**Next ideas:** factor secession risk into how far the AI pushes conquest (stop
expanding when it can't hold what it has); a small map countdown marker on a
secession-imminent region; let the player see each rival's tax rate in the
diplomacy panel.

---

## 2026-07-14 — Secession warning in the region panel (legibility)

Backlog **D** follow-on completing the secession arc (mechanic → AI response →
now player legibility). A revolting region breaks away to rebels, but the panel
only said "in revolt — produces nothing"; it never warned that the province was
about to be *lost*, so the mechanic could feel like it came out of nowhere. That
breaks the "legible complexity" design pillar.

**Change** (`ui/hud.ts` `renderOwnedRegion` + a little CSS): when a player region
is in revolt (`unrest ≥ UNREST_REVOLT`), the panel now shows, right under the
unrest bar, either a red **"⚠ Secedes to rebels in N turns — station an army here
or cut taxes to calm it."** countdown (from `SECESSION_REVOLT_TURNS − revoltTurns`)
or, if a garrison is present, a calmer **"⚑ Revolt held down by your garrison"**.
So the two ways to save the province (garrison it, or ease unrest) are stated at
the exact moment they matter. Pure presentation — reads state, no sim change.

**Verify:** typecheck ✓, 302 tests ✓ (unchanged — presentation only), build ✓
(0 `fetch`, deps `{}`). Browser-verified by importing a crafted save with a
revolting region (Millbrook, unrest 90, revoltTurns 1) and selecting it via its
topbar revolt alert: the panel showed "Unrest 90 · REVOLT" and the red warning
"Secedes to rebels in 2 turns — station an army here or cut taxes to calm it."
(3 − 1 = 2, correct), no console errors. Screenshot eyeballed.

**Next ideas:** a small map marker on secession-imminent regions (the unrest dot
already flags revolt, but not the countdown); and have the AI ease national tax
when several of its provinces tip toward revolt.

---

## 2026-07-14 — AI defends against revolt (garrisons secession-risk regions)

Backlog **B** follow-on to the secession mechanic. The AI already fights well —
concentration of force on offence, plus retreat / garrison-the-threatened-front
on defence — but all of that defensive logic keyed on *enemy* armies. It had no
answer to the *internal* threat secession introduced: a rival could sit and
watch an over-taxed, over-extended province rise up and break away for free.

**Change** (`systems/ai.ts`): a new pure `secessionRiskRegion(state, nationId)`
finds the nation's own region nearest to seceding — in full revolt
(`unrest ≥ UNREST_REVOLT`), ungarrisoned, and within a turn or two of breaking
away (`revoltTurns ≥ SECESSION_REVOLT_TURNS − 2`) — preferring the one closest to
seceding, then the most populous. In `doMilitary`'s repositioning phase an idle
army (no winnable attack, not retreating, not needed at the offensive muster)
first **holds a revolting region it already stands in** (a garrison resets the
secession counter), and otherwise **marches to quell the most at-risk province**
before drifting to the front — losing land to revolt is a free loss worth
pre-empting. Deterministic and pure; no capital special-case needed — the AI
simply garrisons an at-risk capital like any other region.

**Verify:** typecheck ✓, **302 tests ✓** (+4: `secessionRiskRegion` flags an
ungarrisoned sustained revolt, ignores it once garrisoned, ignores calm or
just-started revolts, and prefers the region closest to seceding), build ✓
(0 `fetch`, deps `{}`). Browser smoke: boots and plays 15 turns, zero console
errors. Balance re-probed (480 self-play games, then deleted): **no crashes**,
secessions/game fell ~**0.10 → 0.05–0.07** (nations now defend ~a third to a
half of would-be break-aways), pacing stayed in-target (medians **68–109**
turns), and victory types stayed well spread — so smarter defence, same healthy
balance.

**Next ideas:** have the AI ease taxes in a province tipping into revolt (a
cheaper fix than marching an army), and factor secession risk into how far it
pushes conquest (stop expanding when it can't hold what it has).

---

## 2026-07-14 — Secession: revolt can cost you territory (design §3.3)

Implemented the previously-missing half of the unrest brake. Until now unrest was
purely *economic* — a revolting region only stopped producing, it never changed
hands. Now a region held in **full revolt (unrest ≥ 75) for 3 consecutive turns
with no friendly garrison secedes to the barbarians**, resetting its unrest,
dropping construction, and spawning a `REBEL_GARRISON` militia you must reconquer.
A friendly army in the region (or unrest easing below the revolt line) resets the
countdown — so **stationing troops or lowering tax is the counterplay**. This is a
*territorial* anti-snowball (design §3.3): an empire that conquers or overtaxes
faster than it can keep order sheds the land it can't hold.

New pure `applySecession(state)` runs as pipeline step 1.5 (after the economy sets
unrest, before AI turns so rivals can react to a region that just broke away). New
`Region.revoltTurns` counter (optional — legacy saves default to 0) and constants
`SECESSION_REVOLT_TURNS` / `REBEL_GARRISON` in `state.ts`.

**Verify:** typecheck ✓, 298 tests ✓ (+5: counts up without seceding before the
threshold; secedes + spawns rebels + logs at it; a garrison holds the region
indefinitely; calm resets the countdown; barbarian regions are ignored), build ✓
(0 `fetch`, deps `{}`). Browser smoke (25 turns): no console/page errors.

**Balance (temp probe: 40 seeds × 3 difficulties × {2,3} rivals = 240 games,
deleted):** no crashes; medians 78–96 turns and a diverse victory mix
(domination / great works / elimination / prestige all appear) — unchanged from
the prior balance pass, i.e. **no regression**. Secession fired in ~1/40 balanced
games: it only bites *sustained* full revolt, which needs overexpansion stacking
(many freshly-conquered regions past the free-region cap + high tax), not tax
alone (tax tops unrest out ~33 on a small realm). So it's a **targeted, rare
safety valve** for the runaway-conqueror case — precisely design §3.3's intent —
and stays out of the way of normal play. Because it's this rare, **kept
`DOMINATION_FRACTION` at 0.6** rather than relaxing it as earlier speculated.

**Next ideas:** if we want secession to bite harder, raise overexpansion/conquest
unrest so a rampant conqueror reaches the revolt line sooner (then re-probe and
possibly relax `DOMINATION_FRACTION` toward 0.55); tint a seceding region on the
map in its final revolt turn as a warning; let the AI prioritise garrisoning a
region on the brink.

---

## 2026-07-14 — Balance: domination pacing (anti-snowball)

Backlog item **A** after the three handoff developments landed — re-probed
balance (the concentration-of-force AI from dev #1 is a balance-affecting change)
and fixed the biggest problem it surfaced: **games ended far too fast, almost
always by domination.**

A temporary symmetric self-play probe (player driven by `runNationTurn`, 40
seeds × 3 difficulties × {2,3} rivals; deleted before commit) showed the map's
only real victory path was racing to hold half the regions. Unrest is purely an
*economic* brake — a region at revolt only stops producing, it never changes
hands — so nothing slowed the *territorial* snowball, and one nation hit the 50%
bar long before the intended ~60–150-turn arc (design §1).

**Change:** `DOMINATION_FRACTION` 0.5 → **0.6** (`systems/state.ts`) — a nation
now needs 60% of the map to win by conquest, giving the economy/tech/wonder and
prestige paths room to matter. One constant, no code change.

**Probe, before → after (median game length · too-fast games <40t · victory-kind
mix):**
- 2 rivals, normal: median **35 → 68** turns · too-fast **24 → 11** of 40 ·
  domination 36/40 → a spread of domination 21, great works 13, elimination 5,
  prestige 1.
- 2 rivals (easy/hard): medians 41/33 → **74/74**; too-fast 20/22 → 11/10.
- 3 rivals (easy/normal/hard): medians 55/53/49 → **102/93/88**; great works and
  prestige now regularly appear.
- No crashes in any of the 480 games; symmetric-player win rate stayed in a fair
  band (8–25%; the neutral-personality player trails archetyped rivals, and hard
  gives rivals an economy bonus by design). Domination is still reachable, just
  no longer the only outcome.

**Verify:** typecheck ✓, 293 tests ✓ (unchanged; `victory.test.ts` derives its
setup from the constant, so it tracks the new bar), build ✓ (0 `fetch`, deps
`{}`). Data-only balance change → probe was the verification (then deleted); no
browser check needed.

**Next ideas:** implement design §3.3 *secession* (a region stuck in revolt
flips to barbarians) so unrest brakes territory too, a true anti-snowball; then
re-probe and possibly relax `DOMINATION_FRACTION` back toward 0.55.

---

## 2026-07-14 — Voronoi-polygon map renderer (handoff dev #3)

Third of the three "further the game a lot" developments. The map can now be
drawn as **filled territory polygons** instead of only nodes + edges — the
biggest presentation lever left — **behind a toggle, with the node+edge view
kept as the default fallback** so nothing regresses.

- New pure module `systems/voronoi.ts`: `computeVoronoiCells(sites)` builds each
  region's Voronoi cell as the intersection of the perpendicular-bisector
  half-planes against **every** other site (the k-nearest adjacency is not the
  Delaunay graph, so a subset would leave cells too big), clipped to the map box.
  Each cell edge is labelled with the neighbouring site that created it (or -1
  for a box edge), so shared borders — including **war fronts** — render exactly.
  Plus `pointInPolygon` for hit-testing. Deterministic and unit-tested.
- `renderer.ts` gains a `layout` mode (`"node"` | `"voronoi"`) via `setLayout`.
  The Voronoi pass fills each cell with terrain colour + an owner tint, strokes
  cell borders, overlays **red war-front edges** on shared borders between
  warring non-barbarian owners, and draws selection/target-highlight outlines.
  **Every marker** (population — now with a legibility halo so it reads over any
  fill — strategic resource, capital crown/ring, unrest dot, construction hammer,
  region name, army badges) is shared between both layouts. Cells are cached and
  recomputed only when the map geometry changes, never per animation frame; the
  renderer stays read-only over state.
- HUD: a "🗺 Map: Nodes/Territory" top-bar toggle (shortcut **M**) calls the new
  `onSetMapLayout` callback; `main.ts` flips the renderer layout (view-only).

**Verify:** typecheck ✓, 293 tests ✓ (+4: `computeVoronoiCells` is
deterministic, every site lies in its own cell, a grid of points hit-tests to its
nearest site — proving the partition is correct — and cells stay within the box),
build ✓ (0 `fetch`, deps `{}`). Browser-driven both ways: toggled node → territory
→ back, the territory view fills the map with owner-tinted terrain cells and all
markers, click-to-select hit the right cell ("Kelmoor") and populated the region
panel with a gold selection outline, and the node+edge fallback still renders
unchanged. No console/page errors. No sim change, so no balance probe.

**Next ideas:** war-front polish (thicker/animated fronts, coastline styling);
per-terrain cell textures; a subtle sea/hull backdrop behind the polygons.

---

## 2026-07-14 — End-game summary screen (handoff dev #2)

Second of the three "further the game a lot" developments. Winning or losing used
to just flip a small banner; now the decided game raises a **full modal recap**:
- A headline (**Victory!** / **Defeat**) tinted by outcome, with a subline naming
  who prevailed, by which path, on what turn, and your finishing rank.
- A **large prestige-history line graph** (one line per nation over the whole
  game, player emphasised) — the existing `buildSparkline` made size-configurable
  and blown up to 520×170, so the arc of the game reads at a glance.
- A **superlative** line: your peak prestige and the turn you peaked, plus final
  regions/wonders/techs.
- The final **scoreboard** (reusing `renderStandings`, its mini-sparkline
  suppressed since the big graph sits above it).
- **New game** and **Keep viewing the map** actions (the latter dismisses the
  recap for the current finished game; it re-arms on the next new game).

The recap is fed by a new **pure** `endGameSummary(state)` in `victory.ts` —
outcome, winner (the player on a win, else the leading living rival), per-nation
final + peak-prestige rows sorted by score, and the player's rank — so the UI
just renders it. Replaced the old outcome banner (its dead `.hud-banner` CSS is
left in place, harmless).

**Verify:** typecheck ✓, 289 tests ✓ (+3: `endGameSummary` ranks by prestige and
tags the player rank + names the winner; a rival wins on the player's defeat; peak
prestige/turn are read from the score history), build ✓ (0 `fetch`, deps `{}`).
Browser-driven (default game, ended by a rival's turn-29 domination): the overlay
shows "Defeat — Suzerain of Kael prevails by Domination on turn 29 — you finished
#3 of 3", a 170px-tall three-line prestige graph, the peak-prestige superlative, a
3-row scoreboard, and both buttons; "Keep viewing the map" dismisses it. No
console/page errors. No sim change, so no balance probe.

**Next ideas (handoff dev #3 next):** the Voronoi-polygon map renderer behind a
toggle. Also: track wars-fought / largest-empire-reached for richer end-screen
superlatives; a shareable end-game seed line.

---

## 2026-07-14 — AI concentration of force (handoff dev #1)

First of the three "further the game a lot" developments (see
`docs/next-3-developments.md`). **The AI now masses armies instead of attacking
piecemeal.** Before, each rival stack independently took its own winnable target
and idle armies dribbled onto the front; a region or capital too strong for any
single stack was effectively safe, so wars went toothless once someone forted up.

Now, when a high-value bordering enemy region can't be cracked by any single
adjacent army (`focusTarget`), idle armies route to a shared **anvil** — the
owned frontier region already holding the most friendly force (`musterRegion`) —
and *merge* there over successive turns (the military layer already merges
friendly stacks) until the combined force wins, then strike. Prize weighting
mirrors `bestTarget` (population, resource, an enemy capital), archetype-scaled,
so warlords mass on capitals while economic realms mass on resources.

Safety is preserved by ordering in `doMilitary`: an outmatched army still
**retreats** first (never masses into death), and an army **holding a threatened
capital never leaves it** — concentration only overrides a *passive* garrison,
since the anvil sits on the same front. Refactored the three own-land marchers
(defend / advance / muster) onto one shared BFS (`firstStepTowards`), trimming
two duplicate loops.

**Verify:** typecheck ✓, 286 tests ✓ (+4: `focusTarget` flags an uncrackable
target and ignores a solo-winnable one; `musterRegion` gathers on the
strongest-held neighbour; an end-to-end test where two 5-inf stacks — each of
which loses alone — merge to 10 and capture a region neither beats), build ✓ (0
`fetch`, deps `{}`). Browser smoke (25 turns, seed 12345): no console/page errors.

**Balance (200-seed × 4-archetype self-play probe, rivals 3, deleted before
commit):** with vs. without the change — win spread 18/18/18/20% (was
22/22/22/20%): rivals are now *tougher* (they mass too), so the symmetric-AI
player wins a touch less, but no archetype collapses or dominates. Avg game length
58.8 turns (baseline 61.3) and games ending before turn 40 were 262 vs a baseline
250 — statistically flat, so concentration makes wars *more decisive* without
ending games too fast. All victory kinds still reached.

**Next ideas (handoff dev #2 next):** the end-game summary screen with the
prestige-history graph; then the Voronoi map renderer. Also: let a massing AI
also *recruit* toward the anvil, and abandon a stale focus if the target is taken
or reinforced beyond reach.

---

## 2026-07-14 — Unrest's cost, made concrete in the region panel

Unrest silently throttles a region's whole output, but the panel only stated the
general rule. Now it shows the *current* penalty for the selected region: the
unrest-bar tooltip appends "…produces 60% of its output (−40%)", or "calm — full
output" / "in revolt — produces nothing" at the extremes. And because the unrest
throttle is already baked into every flow figure, the per-resource breakdown
tooltips now name it too ("… · Unrest ×0.60"), completing last cycle's multiplier
attribution — the listed factors now account for the number in full.

Pure presentation reusing the already-tested `unrestPenalty`; no sim/logic touch,
no new pure logic to test.

**Verify:** typecheck ✓, 282 tests ✓ (unchanged — UI only), build ✓ (0 `fetch`,
deps `{}`). Browser-driven (default game): a calm region reads "calm — full
output"; after cranking tax to max and ending ~22 turns a region tips into revolt
and reads "in revolt — produces nothing", with its flow tooltips showing "Unrest
×0.00". No console/page errors.

**Next ideas:** surface the same attribution on the top resource-bar /turn
totals; a combat-odds line for the *defender* too; a Mercantile/Industrious
lasting modifier for axis symmetry.

---

## 2026-07-14 — Yield breakdown tells you *why*: multiplier attribution tooltips

The region panel showed each resource's per-turn flow but never *why* it was
boosted or dented. Now every row of the production breakdown carries a tooltip
that, on top of the base explanation, names the multipliers folded into that
resource — e.g. "Multipliers: Tech ×1.20 · Mercantile ×1.20 · ✨ Prosperity
×1.25." A player running a modifier or a strong trait can finally see the maths
behind the number instead of guessing.

To feed it honestly I refactored the modifier maths into a single source of
truth: a new pure `singleModifierMult(m)` returns one modifier's per-resource
effect, and `modifierMultipliers` now just folds those — so the UI's
per-modifier attribution and the sim's economy can never disagree about what a
modifier does. A companion `yieldFactors(nation)` exposes the three multiplier
sources (tech / trait / modifiers) that `nationYieldMult` had been collapsing.
Behaviour is unchanged — `nationYieldMult` returns exactly what it did — so no
balance shift (confirmed by the untouched economy suite still passing).

**Verify:** typecheck ✓, 282 tests ✓ (+2: `singleModifierMult` isolates one
modifier and the fold equals the product of the singles; `yieldFactors` keeps
tech/trait/modifier apart), build ✓ (0 `fetch`, deps `{}`). Browser-driven (seed
5, Mercantile player, rivals 2): selecting an owned region shows the Gold row's
tooltip ending "Multipliers: Mercantile ×1.20."; no console/page errors.

**Next ideas:** surface the same attribution on the top resource-bar /turn
figures; show a region's unrest production penalty in its tooltip too; a
Mercantile/Industrious lasting modifier for axis symmetry.

---

## 2026-07-14 — Map legend: a key for the border edges

The legend explained every node marker (terrain, owner ring, unrest dots, crown,
army badge) but said nothing about the *edges* — including last cycle's red
war-front line, which had no key at all. Added a **Borders (edges)** section with
two rows: the faint grey **adjacency** edge (regions connected, armies may march)
and the red **war front** (a border between two nations at war). The swatches now
pull their colours from the renderer itself — `EDGE_COLOR` and `WAR_EDGE_COLOR`
are exported and imported by the legend, so the key can never drift from what the
canvas actually draws (previously the legend re-typed every colour by hand).

UI/content only, no sim touch: a new `.hud-legend-line` swatch style and one
section in `buildLegend()`.

**Verify:** typecheck ✓, 280 tests ✓ (unchanged — no logic touched), build ✓ (0
`fetch`, deps `{}`). Browser-driven: pressing **L** opens the legend; the new
"Borders (edges)" section renders both rows, the line swatches computed-style to
exactly `rgba(230,233,239,0.14)` and `rgba(232,119,107,0.6)` (the renderer
constants); screenshot confirms the red front line reads clearly and the grey
adjacency line is subtly visible, matching the map. No console/page errors.

**Next ideas:** dash the war-front line on the map for extra emphasis; a legend
row for the modifier HUD chips; group the legend into collapsible sections if it
grows.

---

## 2026-07-14 — Research surge: a Scholarly academy that quickens learning

First modifier on a **new effect axis** — knowledge, not gold. A Scholarly realm
can now be offered a **grand academy** (a trait-gated choice event): endow it with
30 materials for a **research surge**, +40% knowledge for 4 turns. It converts a
stockpile into research *tempo* over several turns, which is distinct from the
existing one-shot Scholarly events (`scholarly_breakthrough`, `forbidden_lore`)
and from `forbidden_lore`'s power-at-a-cost — this one has no downside beyond the
materials, a pure investment decision. A materials-rich AI (≥45) endows; others
decline.

Small and framework-shaped: `modifierMultipliers` now also accumulates a
knowledge factor (`RESEARCH_SURGE_KNOWLEDGE_MULT`), a new `research_surge`
ModifierId + label ("📚 Research surge"), and one choice event reusing the
`addModifier` helper. The HUD chip and save round-trip come free from the modifier
framework; no new UI code. Pure/deterministic.

**Balance (200-seed × 4-archetype self-play probe, rivals 3, deleted before
commit):** warlord 22% / merchant 22% / builder 22% / opportunist 20% — a 2-point
spread, unchanged from the prior probe; avg game length 61 turns (design window
60–150); domination 120 / great works 49 reached. The event is trait-gated,
event-gated, and costs materials, so its footprint is modest.

**Verify:** typecheck ✓, 280 tests ✓ (+3: research surge multiplies only
knowledge; the academy spends 30 materials for the modifier; it's a safe no-op
when materials are short), build ✓ (0 `fetch`, deps `{}`). Browser-driven (seed
1146, Scholarly player, rivals 2): the academy modal renders at turn 2 with both
numbered options and the "+40% knowledge for 4 turns" detail, and clears cleanly
on pick; no console/page errors.

**Next ideas:** a Mercantile/Industrious lasting modifier on the materials or gold
axis for symmetry; show modifier effects in the region-yield breakdown tooltip;
let the AI weigh research-surge value by whether it has a tech in progress.

---

## 2026-07-14 — War-weariness scales with simultaneous wars

A two-front war should hurt more than one. War-weariness was a flat −15% gold no
matter how many enemies you fought; now it **compounds per simultaneous war**,
capped at 3 stacks — one war ×0.85, two ×0.72, three-plus ×0.61 gold. The cap
keeps a wide coalition from zeroing an economy while still making over-extension
into many wars a real, escalating drag (design §3.4 anti-snowball spirit).

Small, entirely inside the modifier framework: `NationModifier` gained an
optional `stacks` field (absent = 1, so legacy saves are unaffected),
`modifierMultipliers` raises the war-weary factor to the `stacks` power, and
`applyWarWeariness` now counts a nation's live wars and sets `stacks`. The HUD
chip shows the intensity ("⚔ War-weariness ×2 (3)") only when it exceeds one.
Pure/deterministic; round-trips through the generic save.

**Balance (200-seed × 4-archetype self-play probe, rivals 3, deleted before
commit):** warlord 24% / merchant 22% / builder 22% / opportunist 19% — a tight
5-point spread, no archetype dominating or collapsing; all three victory kinds
reached (domination 118, great works 51, prestige 2). Aggressive archetypes that
fight several wars pay the new escalating cost but still win at the top of the
pack, so the mechanic bites without punishing warmongering out of viability.

**Verify:** typecheck ✓, 277 tests ✓ (+2: war-weariness stacks per war and caps
at 3; the gold multiplier compounds multiplicatively), build ✓ (0 `fetch`, deps
none). Browser-driven smoke (seed 12345, 12 turns): the map renders and turns
resolve with no console/page errors.

**Next ideas:** taper the stack instead of a hard cap; a HUD tooltip spelling out
the gold penalty; scale unrest (not just gold) with prolonged war.

---

## 2026-07-13 — War fronts on the map (red border edges) + a typecheck fix

**Front lines at a glance.** The map drew every adjacency edge the same faint
grey, so who was fighting whom was invisible without opening the diplomacy panel.
Now a border between two different, non-barbarian owners **at war** is drawn as a
thicker red edge (`WAR_EDGE_COLOR`); everything else stays grey. You can read the
whole war map instantly — the fronts radiate between the belligerents. Renderer
reads state only (imports the pure `atWar`); no sim/balance impact.

**Also fixed a latent typecheck error** I let slip into last cycle's commit: a
war-weariness test typed `s` by an `as const` treaty literal, so a later
`treaties: {}` reassignment failed `tsc` — but `npm test` (vitest/esbuild)
doesn't run `tsc`, so it passed tests while `npm run build` would have caught it.
Annotated `s: GameState`. Lesson: run `npm run build`/`tsc` *after* editing tests,
as the final gate — which is how this cycle caught it.

**Verify:** typecheck ✓ (now clean again), 275 tests ✓, build ✓ (0 `fetch`, deps
`{}`). Browser-driven (seed 2, turn 15): red war-front edges render between the
warring rivals while neutral borders stay grey (~1.7k red pixels sampled); no
console/page errors.

**Next ideas:** dash or animate the war edge; tint a besieged region; a legend
row for the red front line.

---

## 2026-07-13 — War-weariness: a lingering cost of prolonged war

Second use of the modifier framework, and the first *systemic* one (applied by
the pipeline, not a choice). A nation at war now carries a **war-weariness**
modifier — **−15% gold income** — refreshed to 3 turns each turn any war
continues, so it bites throughout a conflict and lingers a couple of turns after
peace. A real strategic cost that discourages endless war and rewards knowing
when to sue for peace (design §3.4 anti-snowball spirit).

Tiny, reusing everything already built: a new `war_weary` ModifierId + gold
multiplier (state.ts/economy.ts) and one `applyWarWeariness` step in
`resolveTurn` that refreshes the modifier on every nation `isAtWarWithAnyone`.
The HUD chip ("⚔ War-weariness (N)") and save round-trip come for free from the
modifier framework. Pure/deterministic.

**Balance (200-seed × 4-archetype self-play probe, deleted before commit):**
warlord 32 / opportunist 26 / builder 24 / merchant 24 — a 24–32% spread, still
healthy (the peaceful economic archetypes dip a touch when dragged into war and
lose their gold edge; aggressive ones, already warring, are unaffected relative to
each other). All victory kinds reached.

**Verify:** typecheck ✓, 275 tests ✓ (+2: war-weariness dents gold and stacks
multiplicatively with prosperity; it accrues to 3 turns while at war, then decays
and expires after peace), build ✓ (0 `fetch`, deps `{}`). Browser-driven (seed 2
hard): once the player was dragged into war the badge showed "⚔ War-weariness
(3)" at turn 15. No console/page errors.

**Next ideas:** a research-surge modifier from a Scholarly event; scale
war-weariness by number of simultaneous wars; a modifier that also nudges unrest.

---

## 2026-07-13 — Lasting modifiers: temporary national effects (Prosperity)

A new state dimension that unlocks a whole class of future content: **timed
national modifiers**. `Nation.modifiers?: NationModifier[]` holds effects that
tick down each turn and expire — the first being **prosperity** (+25% gold
income). It threads cleanly through the existing pipeline: `nationYieldMult`
folds in a `modifierMultipliers` factor (economy.ts); `advanceNationEconomy`
counts each modifier down one turn and drops the expired (turn.ts); the top-bar
badge shows an "✨ Prosperity (N)" chip; and the optional field round-trips through
the generic JSON save (legacy saves simply have none).

Surfaced via a new generic choice event — **golden jubilee**: invest 20 gold now
for 5 turns of +25% gold (a spend-to-earn timing bet; the AI proclaims it when
funded and economy-minded). Pure/deterministic throughout.

**Balance (200-seed × 4-archetype self-play probe, deleted before commit):**
warlord 32 / opportunist 26 / builder 27 / merchant 26 — a tight 26–32% spread,
unchanged; all victory kinds reached.

**Verify:** typecheck ✓, 273 tests ✓ (+5: modifierMultipliers boosts only gold /
is inert once expired, national gold output rises while active, modifiers tick
down and expire over resolveTurn, the jubilee proclaim pays 20g & grants a 5-turn
prosperity, passing is a no-op), build ✓ (0 `fetch`, deps `{}`). Browser-driven
(seed 260 easy): proclaiming via the "1" key put "✨ Prosperity (5)" in the badge
and raised gold income from +10.5 to +14/turn. No console/page errors.

**Next ideas:** more modifier kinds (a war-weariness debuff, a research surge); a
modifier that decays gracefully; a trait event granting a lasting buff.

---

## 2026-07-13 — Number-key shortcuts for choice decisions

Small UX polish that finishes the choice-event feature. A pending decision's
options are now numbered ("1 · Hire", "2 · Decline") and the matching key resolves
one directly — no reach for the mouse mid-turn. While a decision is up the modal
is truly modal to the keyboard: number keys pick an option and *nothing else*
fires (L/H/S/Esc are suppressed until you decide), so a stray shortcut can't act
behind the blocking prompt.

Implementation: `renderChoice` prefixes each label with its index; a closure
`currentChoice` (set whenever the modal shows) lets the keydown handler map a
digit to an option id and call `onResolveChoice`. UI-only — no sim/state change.

**Verify:** typecheck ✓, 268 tests ✓, build ✓ (0 `fetch`, deps `{}`). Browser-
driven (seed 2, one End turn): the modal showed "1 · Settle families (−14 food)"
and "2 · Store the surplus"; pressing **2** resolved the decision (modal closed)
and End turn then advanced to turn 3. No console/page errors.

**Next ideas:** a choice with a lasting per-nation modifier; a rare multi-turn
quest event; keyboard hint chips on the option buttons.

---

## 2026-07-13 — Player can demand tribute too (symmetric extortion)

Last cycle gave the AI tribute demands; this gives the player the same lever. A
new **Demand 30g** button on each rival's diplomacy card (beside Gift 30g)
extorts a weaker rival. The AI's answer reuses the existing `wouldAccept(...,
"tribute")` — it yields only when the player out-powers it ≥1.6× and it isn't too
proud — so the button's tooltip tells you in advance whether it would pay or
scorn. Yielding transfers the gold *and* dips relations (a coerced payment breeds
resentment, unlike a gift); scorning just dips relations (an affront).

Self-contained: `playerDemandTribute` in diplomacy.ts + an `onDemandTribute`
intent wired through hud.ts/main.ts. Pure/deterministic. It's a player-only
action (the AI never calls it), so self-play balance is unchanged — no probe
needed.

**Verify:** typecheck ✓, 268 tests ✓ (+2: a much weaker non-proud rival yields
30g and its relation drops; a roughly-even rival scorns — no transfer, relation
still dips), build ✓ (0 `fetch`, deps `{}`). Browser-driven: both rival cards
show "Demand 30g" with an accurate tooltip ("would scorn… needs to be far
weaker"); clicking it early logged "Valdheim scorns your demand for tribute." with
no gold change. No console/page errors. (The yield path is unit-tested; it needs a
1.6× power lead that's impractical to reach in a quick idle browser run.)

**Next ideas:** AI escalates to war a few turns after a refused demand; a
"Demand" that scales with the power gap; number-key shortcuts for choice options.

---

## 2026-07-13 — AI tribute demands (activating a dead diplomacy mechanic)

The `tribute` offer type was fully wired — `acceptOffer` makes the player pay,
`rejectOffer` sours relations, the HUD renders "X demands Ng tribute" with
Accept/Reject — but **no AI ever generated one**, so the whole extortion path was
dead. Now a strong, bordering rival that is unfriendly (`rel < 0`) but not yet
hostile enough to invade (that case already wars at `rel < −25`) and clearly
out-powers the player (`ratio > 1.35`) **demands tribute** (18–50 gold, scaled by
its edge) instead of sitting idle. Pay up, or refuse and let the relation hit push
toward the war it foreshadows. One demand stands at a time (dedup); ignoring it
never itself triggers war — the teeth are the souring relations.

Self-contained: a new branch + `demandTribute` helper in `doDiplomacy` (ai.ts),
reusing the existing `addOffer` and the already-built accept/reject + HUD. No new
UI. The demand only ever targets the player, so self-play is untouched.

**Balance (200-seed × 4-archetype self-play probe, deleted before commit):**
warlord 34 / opportunist 27 / builder 26 / merchant 25 — identical to before (the
offer only affects the human; in self-play it sits unresolved). All victory kinds
reached.

**Verify:** typecheck ✓, 266 tests ✓ (+3: a strong unfriendly bordering rival
demands tribute + logs it, no demand while friendly, no second demand while one
stands), build ✓ (0 `fetch`, deps `{}`). Browser-driven (seed 4): at turn 18 both
rivals demanded tribute ("Valdheim demands 31g", "Suzerain of Kael demands 50g")
with Accept/Reject; accepting Valdheim's paid exactly 31 gold (111.1 → 80.1). No
console/page errors.

**Next ideas:** the AI escalates to war a few turns after a refused demand; a
player-initiated tribute *demand* on a weaker rival; number-key shortcuts for
choice options.

---

## 2026-07-13 — Completing the trait-choice set (Mercantile, Fertile, Industrious)

Finished the "every trait has a signature decision" arc begun with the Martial
levy and Scholarly lore. The three remaining traits each get a choice keyed to
their strength, with distinct resource tradeoffs (not all the same shape):
- **Mercantile — monopoly charter:** +40 gold now, but +6 unrest realm-wide (a
  gain-at-a-cost, like Martial/Scholarly).
- **Fertile — settling season:** spend 14 food to add +2 population to up to three
  regions (growth, a wholly different lever).
- **Industrious — public works:** spend 24 materials to ease unrest 8 realm-wide
  (a spend-for-relief).

Each is trait-gated (`eligible: hasTrait(...)`), pure/deterministic, and rides the
existing choice plumbing (player → modal; AI auto-resolves via `aiPick`). Zero
framework change; all five traits now have their own decision.

**Balance (200-seed × 4-archetype self-play probe, deleted before commit):**
warlord 34 / opportunist 27 / builder 26 / merchant 25 — a 25–34% spread,
unchanged; all victory kinds reached.

**Verify:** typecheck ✓, 263 tests ✓ (+4: each option's effect — gold+unrest,
food→population×≤3, materials→unrest relief — plus a guard that none of the three
fire for a trait-less nation), build ✓ (0 `fetch`, deps `{}`). Browser-driven
(seed 2 easy, a Fertile player, one End turn): the settling-season modal rendered
with both options; "Settle families" logged "families settle…" and the turn
advanced. No console/page errors.

**Next ideas:** number-key shortcuts to pick a choice option; a choice with a
lasting modifier (needs a per-nation modifier field); a rare multi-turn quest.

---

## 2026-07-13 — Trait-gated choice event: Scholarly "forbidden lore"

Gave the **Scholarly** trait its signature "power at a cost" decision, matching
the Martial levy so each trait has a parallel identity. A Scholarly nation (only,
via `eligible: hasTrait("scholarly")`) is offered forbidden lore from a wandering
sage: **study it** to speed the current research by 30 (else +25 knowledge) at
**+6 unrest realm-wide**, or **burn the scrolls** and keep the peace — knowledge
against order, the mirror of the Martial troops-against-order trade.

Zero framework change — same choice plumbing (player → modal; AI auto-resolves
via `aiPick`: a calm scholarly realm studies, a restless one burns). Pure and
deterministic, entirely in events.ts.

**Balance (200-seed × 4-archetype self-play probe, deleted before commit):**
warlord 34 / opportunist 27 / builder 26 / merchant 25 — a 25–34% spread,
unchanged; all victory kinds reached.

**Verify:** typecheck ✓, 259 tests ✓ (+3: fires only for Scholarly nations,
studying advances current research by 30 and raises unrest to +6, burning is a
no-op), build ✓ (0 `fetch`, deps `{}`). Note: idle self-play players are
conquered too fast to trigger this naturally in-browser (an artifact, not a bug —
it fires correctly via the same `fireEvent` path in the unit tests). Browser
smoke instead confirmed the unchanged choice modal still renders and resolves
(seed 2 → a grain-aid decision) with zero console/page errors over ~27 turns.

**Next ideas:** a Mercantile / Fertile / Industrious trait choice to complete the
set; number-key shortcuts to pick a choice option; a choice with a lasting
modifier.

---

## 2026-07-13 — Trait-gated choice event: Martial "call the banners"

First **trait-flavoured decision** — proof the choice framework and the trait
system compose. A Martial nation (and only a Martial nation, via the existing
`eligible: hasTrait("martial")` gate) is periodically offered to *call the
banners*: **+3 militia at the capital but +8 unrest realm-wide**, or stand down.
A real martial tradeoff — muscle now against contentment — that non-martial
realms never see, deepening each trait's distinct feel.

Zero framework change: it plugs into the existing choice plumbing (player →
`pendingChoice` modal; AI auto-resolves via `aiPick` — a calm, aggressive martial
AI musters, a restless one holds). Pure/deterministic, entirely in events.ts.

**Balance (200-seed × 4-archetype self-play probe, deleted before commit):**
warlord 34 / opportunist 28 / builder 26 / merchant 25 — a 25–34% spread,
unchanged; all victory kinds reached. The trait-gated levy is neutral texture.

**Verify:** typecheck ✓, 256 tests ✓ (+3: fires only for Martial nations,
mustering adds 3 militia & raises unrest to +8, standing down is a no-op), build
✓ (0 `fetch`, deps `{}`). Browser-driven (seed 15, a Martial player, one End
turn): the modal showed the prompt and both options; "Call the banners" logged
"banners are called…" and the turn advanced. No console/page errors.

**Next ideas:** more trait choices (Mercantile trade pact, Scholarly sage);
number-key shortcuts to pick a choice option; a choice with a lasting modifier.

---

## 2026-07-13 — Per-slot save clear (✕) — and a control-row overflow fix

The most-requested next-idea of the last four cycles: each checkpoint slot can
now be emptied. A compact **✕** beside Save/Load clears the *selected* slot —
guarded both ways (toast says "Cleared Slot 2." or "Slot 2 is already empty.";
the live game and autosave are never touched), and the picker label flips back
to "· empty" immediately. New `clearLocalSave(slot)` in save.ts returns whether
anything was actually removed, so the toast can tell the difference.

**The browser check caught a real layout bug:** the extra button pushed the
control row wider than its panel and the ✕ landed *under the research strip*,
which swallowed its clicks (Playwright's "element intercepts pointer events" —
a click a human also couldn't make). `.hud-newgame` rows now `flex-wrap`, so
overflow drops to a new line instead of sliding beneath neighbouring panels —
Load, previously half-clipped at this width, is fully visible too.

**Verify:** typecheck ✓, 253 tests ✓ (+1: clearLocalSave empties once, then
reports already-empty, against a stubbed localStorage), build ✓ (0 `fetch`,
deps `{}`). Browser-driven end-to-end: save → "Slot 2 · T1" → ✕ → "Slot 2 ·
empty" + "Cleared Slot 2." toast → second press → "already empty". Screenshot
confirms the wrapped row sits inside its panel. No console/page errors.

**Next ideas:** number-key shortcuts for choice-event options; trait-dependent
choice options; show wall-clock save time on slot hover.

---

## 2026-07-13 — Capitals read at a glance: double ring + region-panel line

Two sibling next-ideas in one small UI cycle. The map's 👑 crown glyph is tiny at
full-board zoom, so capitals now also get a **second concentric ring** in the
owner's colour — a double ring reads at any size, and it uses the same live
"still holds its own capital" set as the crown, so it falls with the seat. And
the region detail panel now says so in words: the meta line reads
"Plains · 👑 capital of your realm · …" (or the rival's name), using the same
held-capital check. Legend row updated to name both marks. Pure presentation —
no sim/state/balance change.

**Verify:** typecheck ✓, 252 tests ✓, build ✓ (0 `fetch`, deps `{}`).
Browser-driven: clicked the player capital — panel shows "👑 capital of your
realm"; the map shows double rings on each held capital (rival's in its own
colour). No console/page errors.

**Next ideas:** per-slot save clear (✕); number-key shortcuts for choice-event
options; trait-dependent choice options.

---

## 2026-07-13 — New building: the Mine (mountains + Masonry)

Fast follow on the terrain-gating mechanic: the **Mine** (cost 22, +4 materials,
+2 gold), the first building to compose BOTH gates — `requiresTerrain:
"mountains"` and `requiresTech: "masonry"`. Masonry (military tier 1) was the
last building-less mid-tree tech, so this also finishes the "every mid tech
unlocks something buildable" sweep begun with the Guildhall and Forum. Mountains
(the poorest, rarest terrain) now have an economic reason to hold. Both gate
halves set together (tech.unlockBuilding + building.requiresTech). AI: Mine in
`BASE_BUILD_ORDER` (after workshop) and the industrious trait's priorities.

The two gates interact correctly in the UI: on mountains without Masonry the
Mine shows 🔒 (actionable — research it); off-mountains it is hidden entirely
(no tech moves a mountain).

**Balance (500-seed × 4-archetype probe, deleted):** warlord 41.0 → 41.2%,
builder 28.0 → 28.3%, merchant 28.1 → 27.8%, opportunist 36.3 → 36.2% — noise;
all victory kinds reached; avg 43.6 → 43.6 turns; 0 incomplete.

**Verify:** typecheck ✓, 252 tests ✓ (+2: gates compose in `chooseBuilding` —
mountains+Masonry yes, either alone no; `canQueueBuilding` needs both), build ✓
(0 `fetch`, deps `{}`). Browser-driven: forced an owned region to mountains via
the autosave; its menu lists "Mine 🔒" pre-Masonry. No console/page errors.

**Next ideas:** capital ★ marker on map + region panel; per-slot saved-turn
labels in the save picker.

---

## 2026-07-13 — Terrain-gated buildings + the Harbor (coast only)

Buildings could differ by tech but not by *place* — every region offered the
same menu, so terrain was only a yield table. Added `requiresTerrain` to
`BuildingDef` and the first user of it: the **Harbor** (cost 20, +3 gold,
+2 food, +2 pop capacity), buildable **only on coast** regions. Coastal land now
has a development identity, not just a colour.

Gating is enforced at every layer: `canQueueBuilding` + `queueBuilding` (player
path, so a stale intent can't sneak one inland), `chooseBuilding` (AI path — its
region param grew a `terrain` field), and the HUD build menu, which *hides*
off-terrain buildings rather than showing them locked — a 🔒 invites research,
but no tech turns plains into coast. AI symmetry: Harbor sits in
`BASE_BUILD_ORDER` (after market) and the mercantile trait priority, and the
terrain filter keeps rivals from wasting picks on it inland. No tech
requirement — the gate is the geography.

**Balance (500-seed × 4-archetype self-play probe, deleted before commit):**
warlord 42.6 → 41.0%, opportunist 34.9 → 36.3%, builder 27.3 → 28.0%, merchant
28.7 → 28.1% — within noise, top-end marginally flatter; all victory kinds
reached (domination 1691 / great works 294 / prestige 10 / elimination 5 of
2000); avg length 44.1 → 43.6 turns; 0 incomplete. (The BEFORE run reproduced
the previous cycle's AFTER numbers exactly — the sim's determinism doubles as a
probe sanity check.)

**Verify:** typecheck ✓, 250 tests ✓ (+3: canQueueBuilding gates the Harbor to
coast; queueBuilding refuses it off-terrain and queues it on coast; the AI
builds it on coast and skips it on plains), build ✓ (0 `fetch`, deps `{}`).
Browser-driven both sides: a coast region's menu lists the Harbor; a plains
region's menu omits it entirely. No console/page errors.

**Next ideas:** trait-dependent choice-event options; a second terrain-bound
building (Mine on mountains?) now that the gating exists; show the region's
terrain-exclusive building in the map legend.

---

## 2026-07-13 — New building: the Forum (Philosophy)

The civics twin of last cycle's Guildhall. `philosophy` (civics tier 2) gave
only passive bonuses and unlocked nothing — the civics branch's build dead-end.
Added the **Forum** (cost 26, +2 knowledge, −6 unrest), gated behind Philosophy:
a library-and-temple in one, matching the civics identity of knowledge + order.
It complements rather than obsoletes the Temple (−12 unrest, cheap, unlocked
from turn 1) — the Forum is the researched, yield-carrying upgrade path.

Both halves of the gate were set from the start this time (`requiresTech` on the
building **and** `unlockBuilding: "forum"` on the tech — the exact pair last
cycle's bug taught us), and the browser check confirmed the 🔒. AI symmetry:
Forum joins `BASE_BUILD_ORDER` (after university) and the scholarly trait's
priority list, so rivals build it too.

**Balance (500-seed × 4-archetype self-play probe, deleted before commit):**
warlord 43.0 → 42.6%, opportunist 34.9 → 34.9%, builder 28.4 → 27.3%, merchant
27.2 → 28.7% — all within noise; all victory kinds reached (domination 1686 /
great works 296 / prestige 12 / elimination 6 of 2000); avg length 44.3 → 44.1
turns; 0 incomplete. Neutral content.

**Verify:** typecheck ✓, 247 tests ✓ (+2: Forum locked without Philosophy /
chosen with it; a Scholarly realm reaches for it after its knowledge buildings),
build ✓ (0 `fetch`, deps `{}`). Browser-driven: clicked a player region (via the
renderer's margin transform); the build menu lists 12 buildings and the Forum
shows 🔒 at turn 2. No console/page errors.

**Next ideas:** the coast-terrain building (Harbor) — the region panel already
labels Coast terrain, so add `requiresTerrain` gating to `BuildingDef` and hide
non-matching buildings from menu+AI; trait-dependent choice-event options.

---

## 2026-07-13 — New building: the Guildhall (Economics)

Content for the economy branch. The `economics` tech (tier 2) previously gave only
a yield multiplier and unlocked no building — a build dead-end. Added the
**Guildhall** (cost 30, +3 gold +3 materials), gated behind Economics: a
combined workshop-and-market that rewards teching deep into economy. The AI
builds it too — added to `BASE_BUILD_ORDER` (after bank) and to the mercantile /
industrious trait priorities, so rivals use it and the content stays symmetric.

**Caught a gating bug via browser verification** (why we always drive the UI):
building unlocks are keyed off the *tech's* `unlockBuilding` field, not the
building's `requiresTech`. I'd set `requiresTech` on the Guildhall but forgotten
`unlockBuilding: "guildhall"` on the Economics tech, so `isBuildingUnlockedFor`
found no gating tech and reported it **unlocked from turn 1**. Added the tech
side and strengthened the AI test to assert the Guildhall is *skipped while
locked* (so the bug can't recur).

**Balance (200-seed × 4-archetype self-play probe, deleted before commit):**
warlord 35 / opportunist 28 / builder 26 / merchant 23 — a 23–35% spread,
unchanged from before; economic archetypes did not jump; all victory kinds
reached. Symmetric content at neutral balance.

**Verify:** typecheck ✓, 245 tests ✓ (+1: Guildhall locked without Economics,
built with it), build ✓ (0 `fetch`, deps `{}`). Browser-driven: at turn 1 the
build menu lists 11 buildings; the Guildhall shows "🔒 · Locked — research
economics" (correctly gated after the fix). No console/page errors.

**Next ideas:** a civics-branch building for an under-used tech; a coast-terrain
building (needs terrain gating first); trait-dependent choice options.

---

## 2026-07-13 — Two more choice events (expedition, grain aid)

Put last cycle's choice-event framework to work — proof it generalises with zero
new plumbing, just data. Two decisions with different resource tradeoffs:
**expedition** ("Fund it −30g" → +25 materials +15 knowledge, or Ignore) turns
gold into research/build power; **grain aid** ("Share grain −12 food" → −6 unrest
across all regions, or Refuse) trades a food surplus for stability. Each carries
its own `aiPick` — economy-minded funded AIs run the expedition; food-rich AIs
share grain; others pass.

Both are pure and deterministic (no RNG in the option effects), reusing the
existing `addStock` helper and the same modal/`resolveChoice` path as the
mercenary offer.

**Balance (200-seed × 4-archetype self-play probe, deleted before commit):**
warlord 33 / opportunist 29 / builder 28 / merchant 22 — a 22–33% spread,
unchanged; all victory kinds reached, games complete. Neutral texture.

**Verify:** typecheck ✓, 244 tests ✓ (+2: expedition trades 30g for
materials+knowledge; grain aid spends 12 food to ease unrest by 6 without
underflow — plus the mercenary tests retargeted to an event-specific seed
finder now that three choice events share the pool), build ✓ (0 `fetch`, deps
`{}`). Browser-driven (seed 41, one End turn): the expedition modal showed its
prompt and both options with detail text; "Fund it" logged "expedition returns…"
and the turn advanced. No console/page errors.

**Next ideas:** a choice whose options depend on national trait; a rare
multi-turn quest event; number-key shortcuts to pick an option.

---

## 2026-07-13 — Player-choice events (a decision, not just a happening)

Every event so far *happened to* you. Added the first **choice event**: when a
mercenary company's offer fires for the player, a modal asks — **Hire (−40g)** for
2 infantry at your capital, or **Decline** — instead of auto-resolving. It's real
agency: events can now pose decisions.

The plumbing is built to generalise. `GameState` gained an optional, fully
serialisable `pendingChoice` (event id + prompt + option labels — no functions,
so it round-trips through save/load and legacy saves simply have none). An
`EventDef` may carry a `choice { prompt, options[], aiPick }`: for the player,
`fireEvent` raises `pendingChoice` (no effect yet); for an AI it calls `aiPick`
and auto-resolves deterministically (funded, aggressive AIs hire; others
decline). The player resolves via a new `resolveChoice(state, optionId)` intent
that applies the chosen option's effect and clears the prompt. `main.ts` blocks
End turn while a decision pends (with a toast); the HUD shows a non-dismissable
modal. Determinism holds — the AI path is seed-driven; the player's pick is an
input like any move.

**Balance (200-seed × 4-archetype self-play probe, deleted before commit):** win
rates warlord 34 / opportunist 28 / builder 29 / merchant 24 — a 24–34% spread,
unchanged from before; all victory kinds reached, games complete. The AI's
occasional 2-infantry hire is neutral.

**Verify:** typecheck ✓, 242 tests ✓ (+5: player prompt raised without effect,
hire pays 40g & adds 2 infantry & clears, decline clears at no cost, no-op when
nothing pends, AI never leaves a decision pending), build ✓ (0 `fetch`, deps
`{}`). Browser-driven (seed 2, one End turn): the modal showed the prompt and
both options; End turn was blocked ("Resolve the pending decision first.");
clicking Hire logged "Mercenaries hired" and let the turn advance. No console/page
errors.

**Next ideas:** more choice events (a defector noble, a risky expedition); let a
choice depend on national trait; a keyboard shortcut to pick an option.

---

## 2026-07-13 — Three more bounded events (gold, knowledge, unrest relief)

The random-event pool had windfalls for food, materials, population and troops,
but nothing for the other three levers — so gold, research and unrest never got a
lucky break (or, for unrest, any positive event to counter plague/uprising).
Added three generic bounded events (design §6 — texture, never game-swinging):
**market_boom** (+18 gold, weight 3), **wandering_scholars** (advances the
current tech by 14, else banks +12 knowledge, weight 2), and **festival** (eases
every owned region's unrest by 8, floored at 0, weight 2). Pure and deterministic
over the seeded RNG, same shape as the existing events.

**Balance (200-seed × 4-archetype self-play probe, deleted before commit):** win
rates warlord 32% / opportunist 28% / builder 28% / merchant 25% — a tight 25–32%
spread, all victory kinds reached (domination 671 / great works 128 of 800),
games complete. The extra positive events are symmetric texture at neutral
balance.

**Verify:** typecheck ✓, 237 tests ✓ (+3: market boom adds gold, festival eases
unrest without underflowing past 0, scholars advance current research — each
found by scanning seeds), build ✓ (0 `fetch`, deps `{}`). Browser smoke: 80 turns
driven, zero console/page errors.

**Next ideas:** a rare two-outcome event (a choice popup); event weights that
lean on national trait; a small negative gold event for symmetry.

---

## 2026-07-13 — Alarm when a rival nears victory

The victory gauge (last entry) let you *check* the threat, but only if you opened
the Standings. Now the alerts strip raises a standing **danger** chip the moment
any living rival crosses 75% toward its nearest win — "Suzerain of Kael nears a
domination victory (82%)" — so you can't lose without warning, even if you never
open a panel. It's state-derived (not a one-turn diff), so it persists every turn
the threat stands and clears itself if the rival is pushed back.

`deriveAlerts` now folds in `victoryProgress` for each non-player nation, reusing
the same 75% threshold the gauge paints red — one source of truth for "danger".
Pure/read-only as before; sorted with the other dangers so the scariest thing
stays first.

**Verify:** typecheck ✓, 234 tests ✓ (+3: fires at a rival's 3/4-wonder 75%,
stays silent for a rival comfortably short, and never alarms on the *player's*
own lead), build ✓ (0 `fetch`, deps `{}`). Browser-driven: idle-played to turn 20
and the strip showed "Suzerain of Kael nears a domination victory (82%)" as a red
chip. No console/page errors.

**Next ideas:** pulse/animate the chip the first turn it appears; a matching
in-log line; per-slot save "clear" (✕).

---

## 2026-07-13 — Victory-progress threat gauge in the Standings

The Standings showed raw counts (regions ⬢, wonders ★) but not the thing that
actually matters: *how close is each nation to winning?* Added a colour-coded
gauge pill per row showing progress toward that nation's **nearest** victory —
green (calm) < 50% ≤ amber (warn) < 75% ≤ red (danger). At a glance you can see
"the leader is 55% of the way to a domination win" and react before it's too
late.

New pure `victoryProgress(state, id)` in victory.ts compares a nation's territory
share (toward `DOMINATION_FRACTION`) against its wonders (toward `WONDER_GOAL`)
and reports whichever is closer as `{ kind, label, fraction }`, clamped to 1. The
chip shows the fraction% (matching its colour); the tooltip names the path and
the concrete stat, e.g. "55% toward a domination victory (27%⬢)". Shows in both
the mid-game overlay and the end-game banner. Pure/deterministic — no sim/balance
change (a read-only projection of existing state).

**Verify:** typecheck ✓, 231 tests ✓ (+3: default domination path hitting 1.0 at
the threshold, switching to Great Works when wonders are closer, fraction clamped
to 1), build ✓ (0 `fetch`, deps `{}`). Browser-driven at turn 13: gauges read
55% (amber) / 45% / 27% (green) matching the leader's territory lead, tooltips
correct, readable on the dark overlay. No console/page errors.

**Next ideas:** flash the top-bar victory readout when any rival crosses 75%; a
per-slot save "clear" (✕); tint the capital node for full-board zoom.

---

## 2026-07-13 — Standings rows show capitals and jump to them

Tied the mid-game Standings panel to the map and the capital work. Each nation
row now shows a 👑 while it still holds its own capital (same live ownership check
as the map crown — it disappears the turn the seat falls), and in the mid-game
overlay every row is clickable: it selects that nation's capital on the map and
closes the modal, so "where is the leader's heart?" is one click from the
rankings. The end-game banner keeps static rows (no capital to jump to once the
game's decided) — `renderStandings` gained an optional `onPick`, present only for
the overlay.

Reuses the existing `onSelectRegion` intent and `capitalRegionId`; pure
presentation, no sim/state/balance change.

**Verify:** typecheck ✓, 228 tests ✓, build ✓ (0 `fetch`, deps `{}`). Browser-
driven at turn 6: all three rows showed 👑 (all capitals held) and were pickable
with correct tooltips ("Show Valdheim’s capital on the map" / "Show your capital
on the map"); clicking a row closed the overlay and selected the right capital
(the region panel showed Ironreach for the player). No console/page errors.

**Next ideas:** a per-slot save "clear" (✕); tint/ring the capital node so it
reads at full-board zoom; show each nation's leading victory condition in the row.

---

## 2026-07-13 — Save-slot picker shows each slot's saved turn

The 3-slot save picker gave no hint what was *in* each slot — you had to load one
to find out, clobbering the live game to peek. Now each option reads "Slot 1 · T9"
or "Slot 2 · empty", so you can pick the right checkpoint at a glance. New
`slotInfo(slot)` in save.ts reads the envelope and returns `{ turn, savedAt }` (or
null) with the same guarded parse as `deserializeGame`; the HUD relabels the
options from it — on build, immediately after a Save, and each `update()` so the
autosave/load path stays current. Labels survive a page reload since they're read
straight from localStorage.

Storage/UI only — no sim/state/balance change, still fully offline. Widened the
`.hud-slot` select so "Slot N · T##" fits.

**Verify:** typecheck ✓, 228 tests ✓, build ✓ (0 `fetch`, deps `{}`). Browser-
driven: fresh game showed all three "· empty"; saving at turn 5 → "Slot 2 · T5",
saving at turn 9 → "Slot 1 · T9"; a page reload preserved both labels from
localStorage. No console/page errors.

**Next ideas:** a per-slot "clear" (✕) action; show the wall-clock save time on
hover; a "jump to my capital" control.

---

## 2026-07-13 — Capitals shown on the map (a crown that falls when captured)

Now that capitals carry strategic weight (the AI drives at them and weights loot
by archetype), the player needs to *see* where they are. The renderer draws a 👑
at the bottom-left of each capital node — but only while that nation still holds
it: the crown is computed from `nation.capitalRegionId` **and** a live ownership
check (`region.ownerId === nation.id`), so the moment a seat of power is taken
its crown vanishes (and doesn't transfer to the conqueror's captured tile). At a
glance you can read the map's power centres and watch a rival get decapitated.

Reads state only, never mutates it (renderer guardrail); no new RNG. A matching
legend row ("👑 Capital — a nation's seat of power") was added under the map key.

**Verify:** typecheck ✓, 228 tests ✓, build ✓ (0 `fetch`, deps `{}`). Browser-
driven: the legend shows the new Capital row; a zoomed crop confirmed the crown
renders at the player capital (Ironreach) while a neutral barbarian region
(Eastmarch) has none. No console/page errors. (Pure renderer/legend change — no
sim/balance impact, so no self-play probe needed.)

**Next ideas:** tint or ring a capital node so it reads at full-board zoom too;
a "jump to my capital" control; mark each nation's capital in the Standings rows.

---

## 2026-07-13 — AI aims crippling strikes at enemy capitals, weighted by archetype

The follow-up the last entry asked for: rivals now *covet enemy capitals*, and
what "valuable" means now depends on who's asking. `Nation` gained an optional
`capitalRegionId` (recorded at `createGame`; optional, so legacy saves load
unchanged and simply grant no capital bonus). In `bestTarget`, a winnable target
that is a living enemy's capital earns a `CAPITAL_VALUE` (10) bonus scaled by
the attacker's **aggression** (`× 0.5+aggr` → warlord 14, merchant 7), and the
existing strategic-resource bonus is now scaled by **economy** (`× 0.5+econ` →
merchant 8.4, warlord 4.8). Net effect: warlords drive at the enemy's heart,
merchants and builders peel off its resource regions — same scoring code,
personality decides the prize. Pure, deterministic, no new RNG.

Tests (+4): enemy capital preferred over an equal ordinary region; a warlord
picks the capital over a resource region while a merchant picks the resource
over the capital (the archetype split, both directions); `createGame` records
every non-barbarian nation's capital as an owned, fort-1 region.

**Balance (temporary self-play probe, deleted before commit):** drove the player
with `runNationTurn` for symmetric skill, 500 seeds × 4 player archetypes =
2000 games (probe methodology rebuilt this session — win attribution and RNG
derivation differ from last entry's probe, so compare only within this run).
Before → after: warlord 43.6 → 43.5%, opportunist 35.2 → 35.5%, builder
28.0 → 28.0%, merchant 26.6 → 26.4% — every delta ≤ 0.3 pp, pure noise. All
victory kinds still reached (domination 1686 / great works 286 / prestige 18 /
elimination 10 of 2000), avg game length 44.6 → 44.5 turns, 0 incomplete. The
change is behavioural flavour at neutral balance.

**Verify:** typecheck ✓, 228 tests ✓ (+4), build ✓ (0 `fetch`, deps `{}`).
Browser smoke: 30 turns driven, zero console/page errors; the log showed the
rival visibly overrunning the idle smoke-player's realm capital-first.

**Next ideas:** mass force before a hard assault (don't trickle single armies at
a fortified capital); show a ★/keep marker on capital regions in the map + region
panel so the player can read the new AI behaviour.

---

## 2026-07-13 — AI targets *valuable* regions (and it tightens balance)

`bestTarget` (the rival AI's attack picker) claimed in its comment to "prefer
richer regions" but the code only rewarded softer targets — so rivals would grab
whatever was easiest, ignoring what was worth taking. Added the missing half: among
winnable targets the AI now weighs the prize — `population × 1.5` (economic worth)
plus a flat `+6` for a strategic-resource region (iron/horses unlock units) — on
top of the existing win-margin and enemy-over-barbarian preference. Rivals now go
for meaningful ground, so they feel purposeful rather than opportunistic.

Deterministic and pure (no new RNG, no DOM); `bestTarget` is now exported for
direct unit testing. Tests: it prefers the higher-population target among equal
undefended options, prefers a resource region over an equal-population one, and
still refuses a fight it can't win.

**Balance (200-seed self-play probe, deleted before commit):** the change didn't
just leave balance intact — it *tightened* it. Archetype win rates went from
18–34% (builder the weak outlier) to **26–35%** (warlord 35, opportunist 31,
builder 29, merchant 26), the flattest spread yet; all victory paths still reach
(domination 666 / great works 131 / prestige 2 of 800 games) and games still
complete. Smarter, more purposeful AI *and* fairer archetypes.

**Verify:** typecheck ✓, 224 tests ✓ (+3 targeting), build ✓ (0 `fetch`, deps
`{}`). 200-seed probe as above (deleted). Browser smoke: 30 turns played, log
populated, zero console/page errors.

**Next ideas:** let the AI value an enemy *capital* (crippling strike) and mass
force before a hard assault; per-archetype target weighting (warlords chase
capitals, merchants chase resources).

---

## 2026-07-13 — Mid-game Standings panel (rankings + live score race)

Rankings only appeared on the end screen, so mid-game you couldn't tell whether
you were ahead or losing without eyeballing the map. Added a **📊 Standings**
toggle (top bar, next to Legend/Help; shortcut **S**) that opens a modal with the
ranked table — each nation's regions ⬢, wonders ★, techs 📖, and prestige score —
plus the per-nation score-race sparkline, all for the *current* turn. Strategic
awareness ("I'm 3rd, 57 behind the leader") is now one tap away.

Pure reuse: it calls the same `renderStandings` (table + multi-line sparkline)
the end-game banner uses, dropped into the existing tech-tree modal chrome
(backdrop-click / ✕ / Esc to close), and re-renders live from `update()` so the
numbers and graph track each resolved turn while it's open. `S` joins L/H/Esc in
the one keyboard handler; a narrower `.hud-standings-panel` width keeps the modal
from stretching to the tech-grid's 960px. UI-only — no sim/state/balance change.

**Verify:** typecheck ✓, 221 tests ✓, build ✓ (0 `fetch`, deps `{}`).
Browser-driven: after 8 turns the button opened one overlay titled "Standings —
turn 9" with 3 ranked rows and a 3-line score sparkline; Esc closed it; the S key
reopened it. No console errors.

**Next ideas:** highlight the leading victory-condition per nation in the panel;
click a standings row to focus that nation; per-slot saved-turn labels.

---

## 2026-07-13 — Three named save slots with a picker

The manual checkpoint was a single slot — saving overwrote your only backup, so
you couldn't keep, say, a pre-war position alongside an experiment. Added a
**Slot 1/2/3** picker beside Save/Load; Save writes to the chosen slot and Load
reads from it, each independent (plus the continuous autosave, untouched). Toasts
name the slot ("Saved to Slot 2.", "Slot 1 is empty.", "Loaded Slot 2.").

`SaveSlot` grew from `auto | manual` to `auto | slot1 | slot2 | slot3`, with
`slot1` deliberately keeping the *legacy* localStorage key so anyone's existing
checkpoint still loads. `MANUAL_SLOTS` drives the picker so the list stays in one
place. `onSave`/`onLoad` now carry the slot; `main.ts` maps it and labels the
toast. Storage-only change — no sim/state/balance impact; still fully offline
(localStorage, no network).

**Verify:** typecheck ✓, 221 tests ✓, build ✓ (0 `fetch`, deps `{}`).
Browser-driven the isolation: saved at turn 6 to Slot 2, advanced to turn 12,
loading Slot 1 reported "empty" (turn unchanged), loading Slot 2 restored turn 6.
Picker label renders ("Slot 1"). No console errors.

**Next ideas:** show each slot's saved turn/timestamp in the picker; a per-slot
"clear" action; also link nation names in the log to diplomacy.

---

## 2026-07-13 — Click a log entry to find that region on the map

The turn log names places ("Suzerain of Kael won at Wyrmholt — Wyrmholt
captured!", "Lost Millbrook"), but on a 20-node map you had to hunt for where
that was. Now any log line that mentions a region is clickable: it selects that
region — highlighting it on the map and opening its detail panel — so "who took
what where" is one tap away. Linked lines get a pointer cursor, a hover
underline, and a "Show <region> on the map" tooltip.

Region names are distinct proper nouns, so matching is a plain substring scan
(`regionMentionedIn`) that picks the *longest* matching name (so "Kelmoor" wins
over a stray "Kel"). The click reuses the existing selection path via a new
`onSelectRegion` HUD intent wired in `main.ts` — same code as clicking the node,
so the map highlight and region panel already do the right thing. UI-only; no
sim/state/balance change.

**Verify:** typecheck ✓, 221 tests ✓, build ✓ (0 `fetch`, deps `{}`).
Browser-driven: advanced turns until conquest lines appeared (3 linked lines);
clicking "…won at Wyrmholt — Wyrmholt captured!" selected Wyrmholt — the region
panel showed "Wyrmholt · Hills · Suzerain of Kael · pop 3/7 · fort 1" and the
node highlighted on the map. No console errors.

**Next ideas:** also link nation names in the log to the diplomacy panel; a "Copy
seed" button; a named save-slot picker.

---

## 2026-07-13 — Export / import a save as a file (backup & sharing)

Saves lived only in `localStorage` (auto + one manual slot), so a game couldn't
leave the browser — no backups, no sharing, and a cleared cache lost everything.
Added **⬇ Export** and **⬆ Import** buttons under New game / Save / Load. Export
downloads the current game as `gaime2-turn<N>-seed<seed>.json`; Import reads an
uploaded save file and adopts it as the live game (and autosave). The whole thing
is fully local — a `Blob` + object-URL download and a `FileReader` upload, no
network — and reuses the existing `serializeGame`/`deserializeGame`, so every
state field (including the per-nation `scoreHistory`) round-trips and a foreign or
corrupt file is rejected with a toast rather than corrupting the session.

Layering kept clean: the HUD owns the file-input/`FileReader` DOM and emits
`onExport` / `onImport(json)` intents; `main.ts` (the composition root) does the
serialize + `Blob` download and the deserialize + state swap. The sim is
untouched — `Date`/DOM stay out of `systems/`.

**Verify:** typecheck ✓, 221 tests ✓ (+1: score-history export/import round-trip
contract), build ✓ (0 `fetch`, deps `{}`). Browser-driven the real flow: at
turn 5 Export downloaded `gaime2-turn5-seed12345.json` (with `scoreHistory`);
advanced to turn 10; importing that file reverted to turn 5 ("Imported game —
turn 5."); a garbage file left the game at turn 5 with "Import failed — not a
valid Gaime2 save." No console errors.

**Next ideas:** a third named/manual save slot or a slot picker; a "Copy seed"
button for quick sharing; drag-and-drop a save file onto the map to import.

---

## 2026-07-13 — Numbered, scrollable full turn log (+ a balance non-change)

**Shipped — full turn log.** The log panel showed only the last 8 entries, plain
and unnumbered. It now renders the whole retained buffer (~50 entries) newest
first, each with a right-aligned muted line number, the latest entry brightened,
in a scrollable box (the heading shows the count, "Turn log (50)"). You can
scroll back through the recent history instead of losing it after eight lines.
Pure presentation — no sim/state change; the log buffer cap is unchanged.

**Verify:** typecheck ✓, 220 tests ✓, build ✓ (0 `fetch`, deps `{}`).
Browser-driven 20 turns: heading read "Turn log (50)", 50 numbered lines
rendered, newest (#50) highlighted, the body genuinely scrollable
(scrollHeight > clientHeight), no console errors.

**Investigated but deliberately did NOT ship — a balance change.** Following last
cycle's note ("economy archetypes win ~40% vs aggression ~21%"), I probed two
levers (conquest plunder gold; easing `CONQUEST_UNREST`) with self-play. Two
findings killed the change:
- *Plunder is the wrong lever.* Gold-on-conquest is symmetric — every nation
  loots — so it nets out; rival-only plunder even *widened* the gap by handing a
  windfall to whoever was already crushing a rival (merchant 40→46%).
- *The imbalance was mostly seed-set noise.* At 48 seeds the "economic
  dominance" flipped sign when I changed the seed multiplier (×7 → ×13). A robust
  **200-seed** baseline shows the opposite of last cycle's read: warlord **34%**,
  opportunist 28%, merchant 22%, builder 18% — aggression already *leads*, and
  the spread (18–34%) is within acceptable bounds. Easing `CONQUEST_UNREST` would
  have pushed the already-strongest archetype higher.

So no tuning shipped: the game is acceptably balanced within sampling noise, and
last cycle's DEVLOG claim was an artefact of a too-small sample. Lesson recorded:
**balance probes need ≥150–200 seeds** before a constant is touched. (Probe was
temporary and deleted, per the guardrail.)

**Next ideas:** if revisiting balance, lift the pure-turtle *builder* (weakest at
18%) rather than nerf economy, and always confirm on ≥200 seeds; a compact
mid-game score trend in the top bar; click a log line to recentre the map on the
region it mentions.

---

## 2026-07-13 — Per-nation score lines on the end-game sparkline

The end-game sparkline showed only the player's prestige curve; now it draws one
line per non-barbarian nation in its own colour, so the final screen shows how
you compared to every rival across the whole game — not just your own arc. On a
domination defeat you can literally watch the winner's line rocket away while
yours flatlines.

`GameState.history: number[]` (player-only) became
`scoreHistory: Record<number, number[]>` (nation id → per-turn series). It's
sampled for every non-barbarian nation each turn — dead nations included, so all
series stay equal length and turns line up by index. `appendScores()` in turn.ts
seeds it in `createGame` and appends in `resolveTurn` (still frozen once the game
is decided). Being optional it round-trips through the generic JSON save
untouched; pre-existing saves (which carry the old `history`) simply draw no
chart. The HUD renders rivals first (thin, 65% opacity) and the player last (on
top, thicker, with an end dot) over a shared y-scale so heights compare.

**Verify:** typecheck ✓, 220 tests ✓ (the 4 score-history tests updated to the
per-nation shape: seeds one series per non-barbarian nation, all series grow
together, deterministic per seed, frozen once decided), build ✓ (0 `fetch`, deps
`{}`). Browser-driven a game to a turn-24 domination defeat — the SVG held 3
polylines (2 rivals + player) in the right colours, one end dot, caption
"Prestige score, turn 1 → 24", no console errors.

Test count: 220 green.

**Balance note (for a future dedicated pass):** a 48-seed × 4-archetype self-play
probe (symmetric skill, deleted before commit) shows economy archetypes winning
~40% (merchant/builder) vs ~21–23% for aggressive ones (warlord/opportunist) —
economy is roughly 2× stronger and the spread breaches the ~15–30% band. Halving
the Great Work's yield was a **no-op** on outcomes, so wonders aren't the driver;
the root cause is that **war doesn't pay** (aggressive archetypes bleed
casualties/upkeep/conquest-unrest fighting wars that don't convert to a lead).
Fixing that means combat/AI tuning, not a data tweak — worth its own cycle.

**Next ideas:** make aggression competitive (make war pay — e.g. plunder gold on
conquest, or ease conquest-unrest for martial nations) and re-probe; a legend
mapping sparkline colours to nation names; a compact mid-game score trend.

---

## 2026-07-13 — Keyboard shortcuts for the overlays (L / H / Esc)

Reaching for the mouse to peek at the legend or the tips breaks the flow of a
turn-based game (backlog: "keyboard shortcut to toggle Help/Legend"). Added
`L` to toggle the map legend, `H` to toggle the getting-started tips, and `Esc`
to close whatever's open (tech tree, legend, or tips) in one press.

The handler lives in the HUD next to the overlay elements it drives and mirrors
main.ts's convention: it ignores keys while a form control (tax slider, seed,
difficulty/rival selects) is focused, so those keep their own input, and it
leaves Enter/Space (end turn) to main.ts. The "Got it" dismiss logic was pulled
into a shared `dismissHints()` so the button, the `H` toggle, and `Esc` all take
the same path (and persist the "seen" flag identically). The Legend/Help button
tooltips now advertise their shortcut, and the turn-1 tip line mentions both
keys.

**Verify:** typecheck ✓, 220 tests ✓, build ✓ (0 `fetch`, deps `{}`).
Browser-driven: `L` toggles the legend on then off, `H` opens the tips, `Esc`
closes them, and typing into a focused input does **not** fire the shortcut
(legend unchanged) — no console errors.

Test count: 220 green (UI-only interaction, browser-verified).

**Next ideas:** per-nation score lines on the end-game sparkline; a compact
mid-game score trend in the top bar; a one-line shortcut hint in the legend
footer.

---

## 2026-07-13 — "Help" button to reopen the getting-started tips

The first-time hints card only appeared once, on turn 1, and vanished forever
after "Got it" (backlog: "a '?' to reopen hints"). New players who dismissed it
too early — or returning players — had no way back to the basics. Added a
"💡 Help" toggle in the top bar beside "❔ Legend" that reopens the tips on
demand, any turn.

A `hintsForced` flag keeps the reopened card up past turn 1 until dismissed
again, without disturbing the localStorage-backed "seen it" state used for the
automatic turn-1 show. Both paths funnel through one visibility rule: tips show
when `outcome === "playing"` and either the auto-condition (unseen + turn 1) or
`hintsForced` holds — so the card never draws over the end-game banner.

**Verify:** typecheck ✓, 220 tests ✓, build ✓ (0 `fetch`, deps `{}`).
Browser-driven state machine: turn-1 auto-show → "Got it" hides → stays hidden
across turns → Help reopens (turn 5) → persists through End turn → "Got it"
hides again; two `.hud-legend-toggle` buttons present, no console errors.

Test count: 220 green (UI-only interaction, browser-verified).

**Next ideas:** per-nation score lines on the end-game sparkline; a compact
mid-game score trend in the top bar; keyboard shortcut to toggle Help/Legend.

---

## 2026-07-13 — End-game score-history sparkline

The end-game standings now carry a small line chart of the player's prestige
score across the whole game (backlog: "score-history sparkline on the end
screen"). It turns the final banner from a single snapshot into a story — you
can see the run climb, plateau, and (on a defeat) collapse.

The sim samples the player's `nationScore` once per resolved turn into a new
optional `history: number[]` on `GameState`, seeded with the opening position in
`createGame` and appended in `resolveTurn` after the outcome step (so a decided
game stops growing it). Being optional, it round-trips through the generic JSON
save/load untouched and old saves simply render no chart. The HUD draws it as a
hand-built inline `<svg>` polyline (no deps, fully offline) below the standings
table, coloured with the player's nation colour and dotted at the latest point.

**Verify:** typecheck ✓, 220 tests ✓ (216 + 4: history seeded, grows per turn,
deterministic per seed, frozen once decided), build ✓ (0 `fetch`, deps `{}`).
Browser-driven: played a game to a turn-24 domination defeat — the sparkline
rendered with 24 points, caption "Your score, turn 1 → 24", no console errors.

Test count: 220 green.

**Next ideas:** a "?" button to reopen the first-time hints; per-nation score
lines on the sparkline; a compact mid-game score trend in the top bar.

---

## 2026-07-13 — Explanatory stat tooltips

Complements the map legend + first-time hints with hover tooltips that explain the
numbers a new player is staring at (backlog D). The four top-bar resources now
carry `title` tooltips describing what each does and what the `/turn` figure means
(gold = income minus upkeep, negative risks bankruptcy; food = growth vs. famine;
materials = build/recruit; knowledge = research investment). The tax slider
explains the gold↔unrest trade-off, and the region unrest bar spells out the
thresholds (calm below the penalty start, output suffers above it, revolt at the
cap) and what raises/calms it.

Change (UI only, `title` attributes; no sim/balance impact): `tip` added to
`RESOURCE_META` and set on each resource cell; titles on the tax slider and the
region unrest bar.

**Verify:** typecheck ✓, 216 tests ✓, build ✓ (0 `fetch`). Browser-driven: all
four resource-cell tooltips, the tax-slider tooltip, and the unrest-bar tooltip
(after selecting an owned region) are present and correct, no console errors.

Test count: 216 green (unchanged — presentational tooltips, browser-verified).

**Next ideas:** score-history sparkline on the end screen; a "?" to reopen hints;
Voronoi map renderer; trait-aware AI tax/diplomacy.

---

## 2026-07-13 — Trait-flavoured events

The random-events pool was trait-blind. Added five **trait-gated events**, one per
national trait, each a modest windfall along that realm's strength (design §6):
Fertile → *bountiful season* (+food), Industrious → *master craftsmen*
(+materials), Mercantile → *trade caravan* (+gold, the first gold event),
Scholarly → *breakthrough* (research progress, else banked knowledge), Martial →
*veteran volunteers* (a couple of militia). `EventDef` gained an optional
`eligible` gate; `fireEvent` now filters the pool to the nation's eligible events
before the weighted pick, so a trait event can only fire for a nation carrying
that trait.

**Balance check (temporary self-play probe, deleted before commit):** the first
cut fired too often and swung warlord 13→29% — events must be texture, not
game-swinging — so I halved their weight (2→1) and made the Martial windfall
defensive militia instead of infantry. Re-probe: a **tight, even 17–21% across all
archetypes** (warlord back to a healthy 21% from an anomalous 13%; median length
26→31, toward the 60–150 target). Modest, even rebalancing — no game-swinging.
96 probe games ran clean; browser-smoked three games with events in the pool, no
console errors.

Two new unit tests: a trait event fires only for a nation with that trait (a
Mercantile realm can get the trade caravan, a Fertile one never does), and the
windfall applies its effect (gold rises when the caravan fires).

Test count: 216 green (was 214; +2). Build network-free (0 `fetch`).

**Next ideas:** score-history sparkline; tooltips for every stat; a "?" to reopen
hints; Voronoi map renderer; more trait synergies (trait-aware AI tax/diplomacy).

---

## 2026-07-13 — First-time hints

New players had no onboarding. A dismissible **"Welcome, ruler 👑"** card now
appears on turn 1 of a fresh game with five one-line tips (set tax, develop
regions, move/attack to expand, end turn + watch victory progress, use the
legend). "Got it" hides it and records a `gaime2:hintsSeen` flag in localStorage,
so returning players never see it again; it only reappears if that flag is
cleared. Shown strictly on turn 1 of a live game (never mid-game or after a game
ends).

Change (UI only, no sim/balance impact): a `hud-hints` card built in `createHud`,
toggled from the update loop on `turn === 1 && outcome === "playing" &&
!dismissed`; localStorage access is wrapped in try/catch (falls back to
session-only dismissal). New `.hud-hints*` styles.

**Verify:** typecheck ✓, 214 tests ✓, build ✓ (0 `fetch`). Browser-driven: on a
fresh context the card shows with all 5 tips on turn 1; "Got it" hides it and sets
the flag; a subsequent New Game keeps it hidden; no console errors.

Test count: 214 green (unchanged — presentational/localStorage UI, browser-verified).

**Next ideas:** score-history sparkline; tooltips for every stat; a "?" to reopen
hints; Voronoi map renderer; trait-flavoured events.

---

## 2026-07-13 — Per-enemy call to arms

The "Call to arms" button only offered an ally the *first* war the player was
fighting. Now an allied realm's diplomacy card shows **one button per open front**
— every enemy the player is at war with that the ally isn't already fighting — so
in a multi-war game you can rally an ally into a specific conflict.

Change: new pure, tested `warTargetsFor(state, requester, ally)` in
`diplomacy.ts` returns that list (excludes the player, barbarians, dead nations,
and the two parties); the HUD loops it to render the buttons and drops the old
single-target `callableEnemy` helper. Four new unit tests (lists a joinable
enemy, excludes one the ally already fights, empty at peace, excludes the dead).
No sim/balance impact — it's the same `callToArms` intent, just per front.

**Verify:** typecheck ✓, 214 tests ✓ (was 210; +4), build ✓ (0 `fetch`).
Browser-smoked a 15-turn game — the diplomacy panel renders the (now list-driven)
call-to-arms path every turn with no console errors.

**Next ideas:** first-time hints; score-history sparkline; tooltips for every
stat; Voronoi map renderer; trait-flavoured events.

---

## 2026-07-13 — Victory-progress readout

There was no in-game sense of how close anyone was to winning — you found out only
when the game ended. Added a compact readout to the top bar:
`🏆 <leading realm> <share>%  ·  ⭐ <your wonders>/4  ·  ⏳ <turn>/150`. It names
the realm holding the most territory and its share of all owned regions (the
domination math mirrors `checkVictory` exactly, barbarians included, so the % is
the real win-condition number), your Great Works progress, and the turn vs. the
prestige deadline. When a **rival** nears domination the whole readout turns red
as a threat cue.

Change (UI only, reads existing state + `DOMINATION_FRACTION`/`WONDER_GOAL`/
`TURN_LIMIT`; no sim or balance impact): `renderVictoryProgress(el, state)` in the
HUD update loop; new `.hud-victory` styles.

**Verify:** typecheck ✓, 210 tests ✓, build ✓ (0 `fetch`). Browser-driven (seed 7):
turn 1 showed "You 14%", by turn 11 "Suzerain of Kael 45%" with the red threat
highlight active as the rival approached the 50% threshold, no console errors.

Test count: 210 green (unchanged — presentational UI mirroring tested victory math,
browser-verified).

**Next ideas:** first-time hints; per-enemy call-to-arms; score-history sparkline;
tooltips for every stat; Voronoi map renderer; trait-flavoured events.

---

## 2026-07-13 — End-game standings screen

The game-over banner only said "Victory/Defeat (kind)" — no sense of how the game
actually shook out. It now shows a **final standings table**: every non-barbarian
nation ranked by prestige score (`nationScore`), each row a colour swatch, name
(the player shown as "You" and highlighted; eliminated nations dimmed with a ✗),
a compact `regions⬢ · wonders★ · techs📖` breakdown, and the score. The banner is
now a vertical card (title → standings → New game).

Change (UI only, reads existing `nationScore` from `@/systems/victory`; no sim or
balance impact): `renderStandings(container, state)` builds the ranked table on
game end; new `.hud-standings*` styles.

**Verify:** typecheck ✓, 210 tests ✓, build ✓ (0 `fetch`). Browser-driven: played
seed 7 to its end (Defeat by domination at turn 12) and confirmed the standings
list all three nations sorted by score (Suzerain of Kael 263 · Valdheim 157 · You
68), with the player row highlighted, no console errors.

Test count: 210 green (unchanged — presentational UI over tested scoring,
browser-verified).

**Next ideas:** first-time hints; per-enemy call-to-arms; a small score-history
sparkline on the end screen; Voronoi map renderer; trait-flavoured events.

---

## 2026-07-13 — Map legend

The canvas map draws a lot of vocabulary — terrain-coloured fills, owner-colour
rings, a population number, amber/red unrest dots, ⚒/🐎 strategic-resource icons,
a 🔨 construction marker, army badges, and gold/cyan selection rings — with no
key. Added a **❔ Legend** toggle in the top bar that opens a static legend panel
explaining every marker, grouped into Terrain / Region markers / Selection. The
swatch colours mirror the renderer constants (terrain from the `TERRAIN` table;
unrest amber `#e0b74a` / red `#e8776b`; selection gold `#f4d27a`; target cyan
`#63c7d6`) so the key matches the map exactly.

Change (UI only, no sim/balance impact): `buildLegend()` constructs the panel once
in `createHud`; a top-bar button toggles its visibility; new `.hud-legend*` styles.

**Verify:** typecheck ✓, 210 tests ✓, build ✓ (0 `fetch`). Browser-driven: the
panel is hidden at start, the toggle opens it with all 15 rows (5 terrain + 8
markers + 2 selection, colours matching the live nodes) and closes it again, no
console errors.

Test count: 210 green (unchanged — static presentational UI, browser-verified).

**Next ideas:** first-time hints; per-enemy call-to-arms; end-game score screen;
Voronoi map renderer; trait-flavoured events.

---

## 2026-07-13 — Three features via parallel agents (alerts · tech rush · call-to-arms)

Fanned out three sub-agents in isolated git worktrees on disjoint file sets, each
implementing + self-verifying one feature, then integrated them (cherry-pick, zero
conflicts) and did the shared UI wiring, balance probe, and browser checks here.

1. **Critical-events alert strip** (`src/ui/alerts.ts`, pure + 12 tests): a compact
   strip below the resource bar surfacing what a scrolling log buries — regions
   lost, wars, famine, bankruptcy (danger), active revolts (warn), captures,
   eliminations, techs (good), ordered danger→warn→good, capped at 6. Wired into
   the HUD (`renderAlerts` in the update loop) with colour-coded chips.
2. **Trait-aware tech rush** (`ai.ts` + 7 tests): new pure `preferredTechBranch`
   biases `pickTech` by national trait (Scholarly→civics, Martial→military,
   economic traits→economy), falling back to the personality branch — nations now
   research along their strength.
3. **Call to arms** (`diplomacy.ts` + 10 tests): `wouldJoinWar` / `callToArms` let
   an ally join your war against a common enemy. Wired a player button on allied
   diplomacy cards (main.ts `onCallToArms`), plus a conservative AI reciprocity —
   an AI rallies an ally only into a war it's *losing* (enemy out-powers it), so
   it's a cry for help, not an automatic dogpile.

**Balance check (temporary probe, deleted before commit):** win rates stay spread
and every archetype viable — warlord 13%, merchant 25%, builder 25%, opportunist
21%; the aggressor trends a touch lower and games shorten in-probe (median 36→26)
as smarter tech targeting speeds the AI. No degeneracy, 96 games clean. Alerts
strip browser-verified (war/revolt/bankruptcy chips render, no console errors);
call-to-arms covered by unit tests + typecheck.

Test count: **210 green** (was 181; +12 +7 +10). Build network-free (0 `fetch`).

**Next ideas:** Voronoi map renderer; per-enemy call-to-arms; trait-flavoured
events; a proper end-game score screen.

---

## 2026-07-13 — Tech-tree screen (the whole branching tree)

The research bar only showed the current tech + the immediate frontier, so the
branching structure and what each path leads to were invisible. New **Tech tree**
button (in the research bar) opens a full-screen modal of all 16 techs laid out by
branch (Economy/Military/Civics/Wonders rows) and tier, each node marked **done**
(✓, green), **in progress** (glowing), **available** (bright, clickable to set
research), or **locked** (dimmed, with missing prerequisites in its tooltip).
Clicking an available tech selects it and closes the modal; backdrop or ✕ closes.

Change (UI only, no sim/balance impact): `renderTechTree` builds the overlay from
`TECHS`/`TECH_IDS`; `createHud` owns open/close and keeps an open tree synced with
the latest research state. Caught and fixed a pointer-events gotcha — `#hud` is
`pointer-events:none` with panels opting in, so the modal needed
`pointer-events:auto` to receive clicks.

**Verify:** typecheck ✓, 181 tests ✓, build ✓ (0 `fetch`). Browser-driven: the
overlay opens with 4 branch rows / 16 nodes (4 available, 12 locked at game
start), clicking Agriculture set "Researching: Agriculture (0/20)" and closed the
modal, no console errors.

Test count: 181 green (unchanged — pure UI, covered by browser verification).

**Next ideas:** alerts strip for critical events; trait-aware tech rush; allies
join your wars on request; Voronoi map renderer.

---

## 2026-07-13 — Shared-enemy warmth (coalitions that hold)

Follow-up to the coalition-war change: co-belligerents had no reason to stay
friendly, so border friction eroded their relations even while they fought a
common foe, and coalitions fell apart. Now `driftRelations` adds a small warmth
(+2 per shared enemy) between any two nations at war with the same third power —
"the enemy of my enemy." New exported `sharedEnemies(state, a, b)`; three tests
(count, self-exclusion, warmth vs. the no-shared-enemy baseline).

**Balance check (temporary symmetric probe, deleted before commit):** a mild
positive nudge for economic archetypes as coalitions hold together — merchant and
builder 21→25%, warlord/opportunist steady (17%/25%), median length unchanged
(36). Spread stays a tight 17–25%. No regression; 96 probe games clean.

Test count: 181 green (was 178). Build network-free (0 `fetch`).

**Next ideas:** allies join *your* wars on request; tech-tree screen; trait-aware
tech rush; alerts strip for critical events.

---

## 2026-07-13 — Gang up on a runaway leader (coalition wars)

Nothing checked a snowballing nation: rivals fought their own 1v1s while one
power ran away with the game. Now the AI forms convenient coalitions against a
runaway leader (design §5).

Change (`ai.ts`, pure/deterministic): `doDiplomacy` first computes
`runawayLeader(state)` — a nation that both out-powers the second-place nation by
≥1.6× **and** holds ≥40% of the owned map (needs ≥3 living nations, so there's a
coalition to form). A non-leader that borders the leader, is at peace with it, and
isn't friendly will **declare war once the coalition already fighting the leader,
plus itself, collectively reaches ≥85% of the leader's power** — piling on even at
unfavourable 1v1 odds. NAPs/alliances and the player's early grace are respected,
and a coalition member won't sue for a cheap white peace with the leader. New
exported helpers `runawayLeader` / `coalitionPowerAgainst`; five new tests
(detection, no-runaway-when-balanced, coalition sum, a member joining the war, and
grace-period restraint).

**Balance check (temporary symmetric probe, deleted before commit):** the runaway
aggressor is curbed and games run longer — warlord 21→17%, opportunist 21→25%,
merchant/builder steady at 21%; **median length 31→36** (toward the 60–150 target).
A healthy anti-snowball nudge, distribution still tight (17–25%). 96 probe games
ran clean; browser-smoked, no console errors.

Test count: 178 green (was 173). Build network-free (0 `fetch`).

**Next ideas:** allies actively join *your* wars when asked; shared-enemy relation
warmth between co-belligerents; tech-tree screen; trait-aware tech rush.

---

## 2026-07-13 — Session summary (9 cycles: AI depth + traits + UX)

Nine verified cycles this session, each typecheck+test+build green, browser-checked
where UI/gameplay, balance-probed where the AI changed (probe deleted each time),
and pushed to `claude/milestone-1-playable-r0hjxb` + `main`. Tests 130 → **181**.

1. **Composition-aware AI recruiting** — rivals bring siege vs. forts and counter
   the enemy's actual unit mix instead of always defaulting to infantry.
2. **AI home defence** — garrison threatened frontier regions; retreat badly
   outmatched armies instead of feeding them in.
3. **Combat-odds preview (UI)** — attacker/defender strength + win chance for each
   target in Move/Attack mode, from the same maths the sim resolves with.
4. **National traits** — Fertile/Industrious/Martial/Mercantile/Scholarly drawn
   per game for player and rivals; production + unit-cost effects; shown in the HUD.
5. **Trait-aware AI openings** — rivals open along their trait's strength. Headline
   result: committed-player win rate **converged to ~21% across all four
   archetypes** (from a 13–42% spread), squarely in the healthy 21–29% band.
6. **Turn-summary panel** — a "Last turn" readout of the strategic deltas
   (regions, wars, eliminations, tech, treasury) above the log.
7. **Gang up on a runaway leader** — the AI forms coalitions against a snowballing
   power; anti-snowball nudge that lengthens games (median 31→36 in-probe).
8. **Shared-enemy warmth** — co-belligerents warm toward each other so coalitions
   hold together instead of eroding under border friction.
9. **Tech-tree screen** — a full modal of the whole branching tree, nodes marked
   done / in-progress / available / locked; click an available tech to research it.

Guardrails held throughout: 100% local/offline, `dependencies: {}`, 0 `fetch` in
the bundle, deterministic seeded RNG, pure turn pipeline.

**Best next tasks:** alerts strip for critical events (attacked/region lost/famine/
revolt/tech done); trait-aware tech rush (Scholarly researches faster); allies join
your wars on request; Voronoi map renderer over the identical graph logic.

---

## 2026-07-13 — Turn-summary panel ("what changed last turn")

Strategic changes were easy to miss in the scrolling log. A new **Last turn**
panel (above the log) now surfaces the deltas after each end-turn: treasury swing,
regions gained/lost, wars declared / peace made, rivals eliminated, techs
completed, and famine/bankruptcy flags — green for gains, red for setbacks, or
"A quiet turn." when nothing notable happened.

Change:
- `systems/summary.ts` (new, pure): `summarizeTurn(before, after)` diffs two
  states from the player's perspective. No sim/balance impact — read-only.
- `main.ts`: snapshots state before `resolveTurn`, computes the summary, and
  passes it to the HUD (cleared on new game / load). Single `advanceTurn` helper
  now backs both the button and the Enter/Space shortcut.
- `hud.ts`: `renderSummary` renders the panel; `.hud-summary` styles.

Six new unit tests (quiet turn, treasury swing, regions gained/lost, war/peace
transitions, tech completed, no-mutation purity).

**Verify:** typecheck ✓, 173 tests ✓, build ✓ (0 `fetch`). Browser-driven: the
panel is hidden at game start and appears after ending a turn with the right
deltas (e.g. "+7.2g treasury", "A quiet turn."), no console errors.

Test count: 173 green (was 167).

**Next ideas:** tech-tree screen (whole branching tree, not just the frontier);
alerts strip for critical events; ask allies to join wars; map legend.

---

## 2026-07-13 — Trait-aware AI openings (balances the archetypes)

Traits gave every nation an economic edge but rivals didn't *play* to it. Now the
AI opens along its trait's strength:
- **Build order** — each trait rushes its synergy buildings first
  (`TRAIT_BUILD_PRIORITY`): Fertile→farm/aqueduct, Industrious→workshop/fortress,
  Mercantile→market/bank, Scholarly→library/university, Martial→fortress/workshop
  — then falls back to the generalist order. High-unrest temples and one-at-a-time
  wonders still take precedence.
- **Standing army** — a Martial realm (cheaper units) keeps a larger host
  (`wanted += 3`), leaning on its discount.

`chooseBuilding` is now exported and takes an optional `trait`; six new unit tests
cover each trait's opening, the Martial fortress rush + fallback, the no-trait
generalist path, the unrest-temple override, and skipping an already-built choice.

**Balance check (temporary symmetric probe, deleted before commit):** this is the
headline result — win rates **converged to ~21% across all four archetypes**
(warlord 42→21, merchant 13→21, builder 13→21, opportunist 25→21), landing
squarely in the healthy 21–29% band. Playing to your trait matters more than your
archetype now, so every personality is equally viable. Median length ~31–39.
Browser-smoked, 96 probe games ran clean, no console errors.

Test count: 167 green (was 162). Build network-free (0 `fetch`).

**Next ideas:** turn-summary panel (income/events/wars/losses last turn); tech-tree
screen; ask allies to join wars / gang up on the leader; trait-aware tech rush
(Scholarly picks tech faster).

---

## 2026-07-13 — National traits for opening variety

Each nation (player + rivals) now draws one of five national traits per game
(design §6), nudging different openings: **Fertile** +25% food, **Industrious**
+25% materials, **Mercantile** +20% gold, **Scholarly** +30% knowledge, and
**Martial** −20% unit cost.

Change:
- `data/traits.ts` (new): pure trait table with per-resource yield multipliers
  and a unit-cost multiplier, plus `traitYield`/`traitUnitCostMult` accessors.
- `state.ts`: optional `trait` on `Nation` (barbarians get none).
- `turn.ts` `createGame`: draws distinct traits from a seeded shuffle — done
  *after* all other setup RNG so existing seeded map/capital layouts are
  unchanged.
- `economy.ts`: new `nationYieldMult(nation)` folds the trait multiplier into the
  research multiplier; `nationalProduction` and the HUD region breakdown both use
  it, so display and sim agree.
- `military.ts`: `unitCost(nation, unit)` applies the Martial discount; wired into
  `canRaiseUnit`, `raiseUnit`, and the HUD raise menu.
- `hud.ts`: player trait in the turn badge, rival traits on the diplomacy cards
  (with blurb tooltips).

**Balance check (temporary symmetric probe, deleted before commit):** traits
*lift the weakest archetypes* and narrow the spread — merchant/builder 4→13%,
opportunist 13→25%, warlord 38→42% (win rates), i.e. healthier variety, no
runaway. Median length dips modestly in-probe (44→36). Browser-verified: player
badge shows its trait, rivals show archetype · trait, no console errors.

**Note:** the added trait RNG shifted the global stream, so the "wars break out"
test's five pinned seeds no longer all war within 60 turns; rewrote it to scan a
dozen seeds (war still erupts in ~40% of seeds within 80 turns — no regression).

Test count: 162 green (was 153). Build network-free (0 `fetch`).

**Next ideas:** trait-aware AI openings (Martial → earlier army, Scholarly →
tech rush); turn-summary panel; tech-tree screen; ask allies to join wars.

---

## 2026-07-13 — Combat-odds preview in the UI

Attacking was a blind commit: the player picked a highlighted target with no idea
of the odds until the fight resolved. Now, in Move/Attack mode, the army panel
shows an **Attack odds** list — one row per reachable hostile neighbour with the
attacker vs. defender strength and a rough win chance, colour-coded (green ≥65%,
amber ≥40%, red below), plus "capture" for undefended targets.

Change:
- `combat.ts` (pure): factored the strength maths out of `resolveCombat` into a
  shared `combatStrengths(attacker, defender, ctx)` (counter loop + terrain +
  fort net of siege) so the preview and the real fight can't drift apart. Added
  `winChance(atk, def)` — the exact probability implied by the ratio and the
  bounded uniform combat swing (±`COMBAT_VARIANCE`), matching `resolveCombat`'s
  win condition — and `previewCombat(...)` returning strengths + win chance +
  an `undefended` flag. Seven new unit tests (0–1 bounds, 50% at parity,
  monotonic in attacker strength, fort/terrain/siege effects, undefended = 100%).
- `hud.ts` (view only): `renderCombatOdds` renders the list from `previewCombat`
  for each `reachableRegions` target that isn't ours; new `.hud-odds` styles.

**Verify:** typecheck ✓, 153 tests ✓, build ✓ (0 `fetch`). Browser-driven: opened
Move/Attack on a starting army and confirmed the odds panel lists every adjacent
target with strengths and win% (e.g. undefended→capture, ⚔12/🛡4→100%,
⚔11/🛡29→0%), no console errors. Pure-sim balance untouched (display only).

Test count: 153 green (was 146).

**Next ideas:** national traits (design §6) drawn per game for opening variety;
turn-summary panel (what changed last turn); tech-tree screen; ask allies to join
wars / gang up on the leader.

---

## 2026-07-13 — AI home defence: garrison the frontier, retreat when outmatched

Rival armies had no defensive instinct. With no winnable adjacent target an army
just marched toward the *offensive* frontier — so a threatened home region got no
garrison, and a badly outmatched stack would keep walking into stronger enemies
instead of pulling back.

Change (`ai.ts`, pure/deterministic): the "reposition idle armies" phase now
reasons about defence before offence. For each idle army (no winnable attack this
turn):
1. **Retreat when badly outmatched** — if a bordering enemy's attack exceeds our
   defence here (terrain + fort included) by `RETREAT_RATIO` (1.35), fall back to
   the safest adjacent owned region rather than feeding the army in. If nowhere is
   safer, hold and sell it dearly.
2. **Garrison a defensible threatened region** — if an enemy stack borders the
   region we're standing on and we're *not* outmatched, stay put and defend it
   instead of marching away.
3. **Reinforce** — otherwise march through friendly land toward the nearest
   threatened owned region (BFS), converging where enemies are massing.
4. **Concentrate** — with nothing to defend, fall back to the previous offensive
   staging toward the attack frontier.

New pure helpers `regionIsThreatened`, `isBadlyOutmatched`, `retreatStep`,
`defendStep`; eight new unit tests (threat detection excludes immobile barbarian
garrisons; outmatch judgement; retreat picks the safest owned neighbour or holds;
reinforce marches toward the threatened region or holds when already there).

**Balance check (temporary symmetric probe, deleted before commit):** with every
nation now defending competently, aggressive archetypes win a bit less in
self-play (warlord 46→38%, opportunist 25→13%; merchant/builder unchanged at 4%),
median length steady (44). That's the intended anti-snowball effect — reckless
aggression is punished when targets retreat and garrison. Against a human the win
is clear-cut: rivals stop suiciding armies and hold their land. Browser-smoked, no
console errors.

Test count: 146 green (was 138). Build network-free (0 `fetch`).

**Next ideas:** combat-odds preview in the UI (attacker vs. defender strength +
rough win chance for each highlighted target before committing); national traits
(design §6) for opening variety; ask allies to join wars; gang up on the leader.

---

## 2026-07-13 — Composition-aware AI recruiting

Rival recruiting used a fixed preference (`infantry → ranged → militia`, cavalry
first if horses), so armies always defaulted to infantry regardless of who they
were about to fight or how well the target was fortified. The counter loop and
siege existed in combat but the AI never *chose* around them.

Change (`ai.ts`, pure/deterministic): recruiting now reads the threat picture and
builds to it via a new pure `planRecruitment(state, nationId)`:
1. **Siege vs. forts** — if a fortified attackable target borders us and we lack
   enough siege to strip it (`ceil(maxFort / siegePower)`), lead with siege — but
   only up to what's needed, so stacks never go all-siege (weak in the open).
2. **Counter the enemy's mix** — assess hostile armies on/next to our border, find
   their dominant field unit, and build the counter-loop unit that beats it
   (cavalry↔ranged, ranged↔infantry, infantry↔militia, militia↔cavalry).
3. **Generalist fallback** — with no intel, cavalry (if horses) then
   infantry/ranged/militia, matching the previous safe default.

`recruit()` picks the first *affordable/available* unit from that ordered plan, so
tech/resource/gold gating still applies. Eight new unit tests cover the siege
lead, the siege cap, each counter mapping, siege+counter ordering, and the
no-intel fallback.

**Balance check (temporary self-play probe, deleted before commit):** symmetric
probe (24 seeds × 4 committed archetypes, player driven by `runNationTurn`) shows
**no regression** — win rates identical before/after the change (all nations share
the logic, so it's symmetric), median length steady (~44–45 in this probe's
methodology). The win comes against a human/passive opponent, where responsive
composition matters. Browser-smoked: a full game runs with rivals actively
recruiting and conquering, no console errors.

Test count: 138 green (was 130). Build network-free (0 `fetch`).

**Next ideas:** AI home defence (keep/return a garrison to a threatened frontier
region; retreat a badly outmatched army instead of feeding it in); combat-odds
preview in the UI before the player commits an attack; national traits (design §6)
for opening variety.

---

## 2026-07-13 — AI force concentration → military path now competitive

Addressed the open item from 2026-07-12: the military/domination path badly
underperformed the economic one (committed-player win rate ~15% vs ~50%).

Root cause: rival armies fought **piecemeal**. An army with no winnable adjacent
target just sat still, so forces never gathered — scattered 2-unit stacks lost
where one concentrated stack would have won.

Change (`ai.ts`, pure/deterministic): the military turn is now two phases.
1. **Attack** — strongest armies first take their best winnable adjacent target.
2. **Concentrate** — idle armies march *through friendly territory only* (BFS to
   the nearest frontier region) and converge, merging into one stack strong
   enough to break defences a split force can't. The march never blunders into a
   losing fight (own-land pathing), so it's safe.

Self-play probe (24 seeds × 4 committed archetypes) — win rates went from a wide
**12–50%** spread to a tight **21–29%** across all archetypes (Warlord now the
strongest at 29%; fair 3-way baseline ≈ 33% with nation-0 first-mover edge).
Domination now decides ~half of games (was a rare ~1/6). Median length 69–108
turns, still in the 60–150 target. Every strategy is viable and roughly equal.

Test count: 130 green. Build network-free (0 `fetch`). Browser-smoked: a game
runs cleanly with rivals actively conquering, no console errors.

**Next ideas:** composition-aware AI recruiting (bring siege vs forts, counters
vs the enemy's mix); AI defends threatened home regions / retreats losing armies;
combat-odds preview in the UI before the player commits an attack; national
traits (design §6) for more opening variety.

---

## 2026-07-12 — Balance pass: game length + victory diversity

Self-play probe (symmetric AI skill, 24 seeds, normal) found two problems:
**games ended too fast** (median 48 turns vs the 60–150 target) and **Great
Works dominated** (won 92% of games — everyone raced wonders).

Changes:
- Wonders are now a slower **national project**: cost 60 → 100, `WONDER_GOAL`
  3 → 4, and the AI builds **only one wonder at a time** (no parallel spam).
  → median game length 48 → ~103 turns.
- **Personality-driven endgame**: only economy-minded nations (Builder/Merchant,
  economy ≥ 0.6) chase wonders; aggressive nations spend on military and seek
  domination. → victory mix broadened from 92% great-works to a spread of
  great-works / domination / prestige; median ~120 turns.
- **Domination threshold 60% → 50%** so conquest is a more reachable win.

Committed-player viability (24 seeds each): Builder/Merchant ~50% wins,
Warlord/Opportunist ~12–17%. Length healthy (median ~116) across all.

Test count: 130 green. Build network-free (0 `fetch`).

**Known imbalance for a future cycle:** the **military/domination path still
underperforms the economic path** (~15% vs ~50% win rate for a committed
player). Next: give aggression more teeth — cheaper/stronger military via
tech, better AI force-concentration and siege use, or a small conquest economic
reward — then re-probe until the paths are within ~15–20 points of each other.

---

## Baseline — v1 complete (Milestones 1–6)

The full game loop is shipped and playable end-to-end:

- **M1** seeded procedural region-graph map, terrain economy, taxes, treasury,
  pure deterministic turn pipeline.
- **M2** population growth/famine, unrest (the anti-snowball brake), buildings.
- **M3** five-unit counter loop, armies + movement, abstract combat, strategic
  resources, upkeep/bankruptcy, conquest, barbarian regions.
- **M4** 1–3 rule-based AI rivals with personality archetypes; relations +
  diplomacy (war/peace/pact/alliance/gift/tribute). 100% local AI.
- **M5** 16-tech branching tree, three victory paths (domination / Great Works /
  prestige score), bounded random events.
- **M6** difficulty settings, save/load (autosave + manual checkpoint), keyboard
  end-turn, victory/defeat screen, balance pass, network-free build.

**State:** 130 unit tests green; `typecheck`, `test`, `build` all pass; built
bundle makes zero network calls; `dependencies: {}`.

**Good next tasks:** balance self-play probes (target 60–150 turn games, fair
win distribution); AI army defence/retreat logic; national traits; combat-odds
preview; tech-tree screen; Voronoi renderer.
