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

Work continues on `claude/milestone-1-playable-r0hjxb`. After each green push,
keep `main` current too:

```
git add -A && git commit -m "<msg>"
git push origin claude/milestone-1-playable-r0hjxb
git branch -f main claude/milestone-1-playable-r0hjxb
git push origin main
```

If a push is rejected (a concurrent run pushed first): `git pull --rebase`,
re-run `npm test`, then push again.

## Browser verification recipe

Chromium is preinstalled. Install the driver, script the interaction, screenshot,
then clean up (don't commit the driver or images):

```bash
npm install -D playwright-core >/dev/null 2>&1
# dev server: npm run dev & (or reuse a running one on :5173)
# executablePath: /opt/pw-browsers/chromium-1194/chrome-linux/chrome  (args: --no-sandbox)
# ... goto http://localhost:5173, drive the UI, page.screenshot(...), read it ...
npm uninstall playwright-core >/dev/null 2>&1   # keep dependencies: {}
rm -f _*.mjs _*.png                              # keep the tree clean
```
Confirm the built bundle stays network-free:
`npm run build && grep -c "fetch(" dist/assets/*.js` should be `0`.

---

## Backlog (roughly priority order — pick the highest-value tractable item)

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
