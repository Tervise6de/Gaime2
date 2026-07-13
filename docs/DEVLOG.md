# Gaime2 — development log

Newest entries at the top. Each autonomous overnight cycle appends one entry:
what changed and why, the test count after, and ideas for next time. See
`docs/autonomous-dev-prompt.md` for the playbook these runs follow.

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
