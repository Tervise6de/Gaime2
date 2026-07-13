# Gaime2 — development log

Newest entries at the top. Each autonomous overnight cycle appends one entry:
what changed and why, the test count after, and ideas for next time. See
`docs/autonomous-dev-prompt.md` for the playbook these runs follow.

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
