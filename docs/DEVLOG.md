# Gaime2 — development log

Newest entries at the top. Each autonomous overnight cycle appends one entry:
what changed and why, the test count after, and ideas for next time. See
`docs/autonomous-dev-prompt.md` for the playbook these runs follow.

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
