# Autonomous overnight development — playbook

You are an autonomous engineer continuing development of **Gaime2**, a
browser-based Kingdom-Management / 4X-lite strategy game. The owner is asleep
and has delegated **all decisions to you**. Your job: keep making the game
better, in small verified increments, until your budget runs out — and leave
the repository green and pushed at every step.

**Do not wait for input. Do not ask questions. Decide, act, verify, commit, push.**
Read `CLAUDE.md` (the working agreement) and `docs/game-design.md` (the design
bible) before you start; they bind you.

---

## One development cycle (repeat until out of budget)

1. **Orient (cheap).** `git log --oneline -15`, read the newest entry in
   `docs/DEVLOG.md`, skim `README.md`. Figure out what's already done and what's
   in flight.
2. **Pick ONE high-value task** from the backlog below (or a better one you
   identify). Prefer a small, shippable vertical slice over a big rewrite.
3. **Implement it.** Match the surrounding code style. Keep the engineering
   guardrails (below) inviolate.
4. **Verify — all four must pass before you commit:**
   - `npm run typecheck`
   - `npm test` (add/extend tests for new logic)
   - `npm run build`
   - For any UI/gameplay change, **drive it in a real browser** (recipe below)
     and eyeball a screenshot. Tests alone are not enough for UI.
5. **Commit** with a concise message (Estonian subject + short body, matching
   the existing history) and **push** (see "Branches").
6. **Append a DEVLOG entry** (`docs/DEVLOG.md`): date, what you did & why, test
   count, and 1–2 ideas for next time.
7. Loop to step 1. Keep cycles well under an hour so each finishes and commits.

If a change won't pan out or breaks something you can't fix quickly:
`git reset --hard HEAD` (or revert to the last green commit) and move on. **Never
leave the tree red or the build broken. Never commit failing tests.**

---

## Engineering guardrails (do not violate)

- **100% local, offline, free to play.** No runtime network/API/LLM calls, no
  new runtime dependencies (`dependencies` in package.json stays `{}`). The
  rival AI is plain local TypeScript. The built bundle must contain **no
  `fetch`** and no external URLs. This is a hard design rule (§5).
- **Determinism.** All game logic derives from the seeded RNG
  (`src/systems/rng.ts`). Never `Math.random()`/`Date.now()`/`new Date()` in the
  sim. Combat/AI/events consume the state's `rngState` stream.
- **Pure turn pipeline.** Turn resolution is `GameState -> GameState` pure
  functions. `systems/` hold logic and never touch the DOM; `ui/` observes state
  and emits intents, never mutates the sim; `data/` is serialisable content so
  balancing is editing tables, not code.
- **Tests stay green and grow.** New pure logic gets unit tests. Determinism and
  no-mutation invariants are worth testing.
- **Don't open PRs. Don't touch other repos. Don't exfiltrate anything.**

## Branches

**`main` is the trunk — commit and push there.** After each green push, keep the
two `claude/*` mirror branches in sync so nothing diverges:

```
git add -A && git commit -m "<msg>"           # concise Estonian subject + body
git push origin main
git branch -f claude/milestone-1-playable-r0hjxb main
git branch -f claude/gaime2-autonomous-dev-y0q733 main
git push origin claude/milestone-1-playable-r0hjxb
git push origin claude/gaime2-autonomous-dev-y0q733
```

If a push is rejected (a concurrent run pushed first): `git pull --rebase origin
main`, re-run `npm test`, then push again. Never force-push `main`.

## Current state (keep this fresh)

Baseline as of the last cycle: **210 Vitest tests green** across 18 files;
`typecheck`, `test`, `build` all pass; built bundle makes **zero** network calls
(`grep -c 'fetch(' dist/assets/*.js` → 0); `package.json` `dependencies` is `{}`.
The full v1 loop plus these extras are shipped (see `docs/DEVLOG.md` for details):
composition-aware AI recruiting, AI home defence, combat-odds preview,
national traits + trait-aware AI openings & tech rush, turn-summary panel,
runaway-leader coalition wars + shared-enemy warmth, tech-tree screen, a
critical-events alert strip, and "call to arms" (allies join your wars).
Read the newest DEVLOG entries first — they list the live backlog and any
balance numbers to preserve.

## Browser verification recipe

Playwright + Chromium are preinstalled globally — do NOT add them as deps. Build,
serve the built bundle with `vite preview`, drive it from a scratch script that
imports Playwright by absolute path, screenshot, read the screenshot, then clean
up (keep the driver/images out of the repo — put them in the scratchpad):

```js
// scratch .mjs — run with: node scratch.mjs
import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
// newPage → goto http://localhost:4173 → drive the HUD → page.screenshot(...)
// collect console/pageerror; assert errors is empty.
```
```bash
npm run build && (npx vite preview --port 4173 >/dev/null 2>&1 &) && sleep 2
node scratch.mjs                 # then Read the screenshot to eyeball it
grep -c "fetch(" dist/assets/*.js   # must print 0
# kill the preview server and delete the scratch driver+png afterwards
```
Note `#hud` is `pointer-events:none` (children opt in) — new full-screen overlays
need `pointer-events:auto` to receive clicks. New-game state persists via
localStorage autosave; a fresh Playwright context starts clean.

---

## Backlog (roughly priority order — pick the highest-value tractable item)

> **PRIMARY DIRECTIVE (2026-07-14 onward): follow `docs/roadmap-to-ready.md`.**
> The v1 game systems are complete; the project is now pushing from ~68 toward
> testing-ready (75) and market-ready (100). Each cycle, pick the **lowest-numbered
> unfinished roadmap item** (Phase A first — onboarding is the gate to 75) and do
> one complete verified cycle. The lettered backlog below (A balance … G code
> health) still applies as the *method* — especially **A (re-probe balance after
> any sim change)** — but the *what to build next* now comes from the roadmap.
> `[RESOURCE]`-tagged items need an artist/humans; do their code-side scaffolding
> and flag what external input is needed.

**Fresh next-ideas (from the latest DEVLOG — good starting points):** end-game
score/summary screen with a simple history graph; Voronoi-polygon map renderer
over the *identical* graph logic (kept behind a fallback); trait-flavoured random
events; per-enemy "call to arms" (choose which war to rally an ally into);
tooltips/legend for every stat and map marker; a numbered, scrollable full log.
When in doubt, do **A (balance)** — re-probe and keep committed-player win rate
fair across archetypes (~15–30%) and games out of the too-fast zone.

**A. Balance & anti-degeneracy (do this first, repeatedly).**
Write a *temporary* vitest probe that self-plays many seeds × difficulties
(drive the player with `runNationTurn` for symmetric skill, as prior sessions
did). Detect: crashes, runaway snowball, games ending too fast/slow (target
session length ~60–150 turns, design §1), a single dominant strategy, unreachable
victory types. Tune the data tables (`src/data/*`, and the constants in
`src/systems/state.ts`) to fix what you find. Re-probe. **Delete the probe before
committing.** Record the before/after numbers in the DEVLOG.

**B. AI depth (makes rivals feel alive).**
Smarter army use: defend threatened regions, concentrate force, retreat when
losing, garrison the frontier. Better targeting (weakest reachable, richest,
capital). Threat assessment and gang-up-on-the-leader behaviour. Honour
NAPs/alliances; break deals only with the trustworthiness penalty; ask allies to
join wars. Per-archetype tech/build priorities. Keep it pure + deterministic +
tested.

**C. Content & replayability.**
National traits drawn per game (Fertile/Industrious/Martial/Mercantile/Scholarly,
design §6) affecting player and rivals. More bounded events. A few more
techs/buildings/units — each carefully balanced (revisit A after adding).

**D. UX polish.**
Tooltips explaining every stat/resource/unrest state. A **combat-odds preview**
when you pick an attack target. A **turn-summary** (what changed last turn:
income, events, wars, losses). An alerts strip for critical events (attacked,
region lost, famine, revolt, tech complete). A **tech-tree screen** showing the
whole branching tree, not just the frontier. Map legend. First-time hints.
Numbered/scrollable log. Responsive layout.

**E. Rendering upgrade (bigger, do after A–D have momentum).**
The Voronoi-polygon map renderer over the *identical* graph logic (design §4),
with the current node+edge renderer kept as a fallback. Ship it behind a toggle
if risky; never regress the playable node+edge view.

**F. Systems & meta.**
Save/load export & import to a file (download/upload JSON), multiple save slots,
shareable seeds. An end-game summary / score screen with a simple history graph.

**G. Code health.**
Keep functions pure and small; split modules that grow unwieldy; keep the bundle
dependency-free and network-free; keep types tight.

Bias toward **breadth**: many solid, verified improvements beat one risky
mega-change. When in doubt, do A (balance) — it's always valuable and low-risk.

---

## When you're (nearly) out of budget

Finish the current cycle to a green, committed, pushed state (or reset to the
last green commit). Append a final DEVLOG entry summarising the night and listing
the best next tasks. Leave `main` and the feature branch in sync. Do not start a
new task you can't finish and verify.
