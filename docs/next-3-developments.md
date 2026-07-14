# Next 3 developments — handoff brief

This brief scopes the next **three substantial** developments for Gaime2, chosen
to advance the game *a lot* (not incremental tooltips). Work them **in the order
below**, one complete verified cycle each. Read `docs/autonomous-dev-prompt.md`
(the playbook) and the newest `docs/DEVLOG.md` entries first — they define the
sync procedure, guardrails, and verification recipe you must follow.

**Non-negotiable guardrails (repeated for emphasis):** 100% local/offline,
`package.json` `dependencies` stays `{}`, deterministic seeded RNG only (no
`Math.random`/`Date` in the sim), pure `GameState → GameState` turn pipeline,
`systems/` never touch the DOM, `ui/` never mutate the sim, `data/` stays
serialisable. Never commit red. Never force-push. No PRs. Commit messages in
Estonian. After each cycle: `npm run typecheck && npm test && npm run build`,
confirm `grep -c 'fetch(' dist/assets/*.js` is `0`, browser-verify UI with the
Playwright recipe, run a temporary self-play probe for any AI/balance change
(then delete it), push `main` + fast-forward the mirrors
`claude/milestone-1-playable-r0hjxb` and `claude/gaime2-autonomous-dev-y0q733`,
and append a dated DEVLOG entry.

Each of these is bigger than one small cycle — it's fine to land a development
across a few commits, but **every commit must leave `main` green, built, and
pushed**, and the feature should be shipped behind a fallback/toggle if a
partial state would regress the playable game.

---

## 1. Smarter opponent: AI concentration of force (highest impact on fun)

**Problem.** The AI attacks piecemeal. In `doMilitary` (`src/systems/ai.ts`) each
army independently takes its own `bestTarget`; idle armies drift toward the
frontier but never *mass* before striking. So a well-defended region or a
fortified capital that no single rival stack can crack is effectively safe, and
wars feel toothless once the player forts up. The military layer already supports
merging (`moveArmy` onto a friendly stack merges — `src/systems/military.ts`),
so this is purely an AI *decision* gap.

**Build.**
- A planning pass that picks a **focus target** (a high-value enemy region /
  capital the nation is at war with and borders) and, when no single army can win
  there, **stages and merges** multiple armies into one adjacent owned region
  over successive turns, then attacks once the combined stack has winnable odds
  (reuse `previewCombat`/`combatStrengths` from `src/systems/combat.ts` for the
  odds maths — don't re-derive them).
- Keep it personality-weighted: warlords/opportunists commit harder and at worse
  odds; economic archetypes only mass when the prize is big or they're threatened.
- Preserve the existing defensive brain (retreat when outmatched, garrison
  threatened regions, coalition gang-up) — concentration is for *offense* and
  must not strip frontier defense so the AI leaves its capital open.
- Pure + deterministic; drive all randomness through the passed-in `Rng`.

**Acceptance.** New unit tests for the staging/merge decision (a 2-army mass beats
a defender neither army beats alone; the AI doesn't mass into a losing fight; it
doesn't abandon a threatened home region to do so). A temporary self-play probe
(200 seeds × 4 archetypes, `rivals: 3`, then **deleted**) shows the archetype win
spread stays healthy (~15–30%, no archetype collapsing/dominating) and average
game length stays in the 60–150 turn window — concentration should make wars more
decisive without ending games too fast. Record before/after numbers in the DEVLOG.

---

## 2. End-game summary screen with the prestige-history graph

**Problem.** Winning or losing currently just flips a small banner
(`hud-banner`). There's no payoff, no story of the game, nothing that pulls a
replay. The data already exists — `state.scoreHistory` is collected every turn and
there's a `buildSparkline` helper used in Standings (`src/ui/hud.ts`).

**Build.** A proper post-game overlay (reuse the `hud-techtree-overlay` modal
pattern) shown when `state.outcome !== "playing"`:
- Headline: victory/defeat + the victory kind, in the winner's colour.
- A **large prestige-history line graph** over the whole game (one line per
  nation, dead nations included, player emphasised) — promote/scale up the
  existing sparkline rather than inventing a new renderer.
- A final scoreboard: each nation's prestige, regions, wonders, techs, and
  wars fought, sorted by score, player row highlighted.
- A few "story" superlatives if cheap (peak turn, largest empire reached).
- Clear **"New game"** and **"Keep viewing the map"** actions.

**Acceptance.** Pure helpers for any new aggregation (e.g. per-nation end stats)
get unit tests. Browser-verify with the Playwright recipe on a game driven to an
actual victory *and* a defeat (find seeds via a short Node sim, as prior cycles
did) — the overlay renders, the graph draws the right number of series, the
scoreboard sorts correctly, and both buttons work; no console/page errors. No sim
logic changes, so no balance probe needed.

---

## 3. Voronoi-polygon map renderer (transformative visuals, behind a fallback)

**Problem.** The map is still abstract nodes + edges. Design §4 sanctions a
**Voronoi-polygon map over the identical adjacency graph** — regions as filled
territory polygons, borders as polygon edges — which makes the game *look* like a
real 4X map. This is the biggest presentation lever left.

**Build.**
- Compute a Voronoi/region-polygon layout from the **same** region coordinates
  and adjacency the current renderer uses — do **not** change the sim, map
  generation, or the adjacency graph. The polygons are a view over existing data.
- Fill each polygon with terrain colour, tint by owner, and draw borders; keep
  every existing marker (population, unrest dots, resource icons, capital
  crown/ring, army badges, **war-front red edges**, selection/target highlights)
  and the map legend correct on the new view.
- **Ship it behind a toggle**, with the current node+edge renderer kept as the
  default fallback. Never regress the playable node+edge view. If the polygon
  math is heavy, keep it deterministic and off the hot per-frame path (compute on
  state change, not every rAF).
- Renderer stays read-only over state; no DOM work in `systems/`.

**Acceptance.** Any pure geometry (polygon computation, point-in-polygon hit
testing) lives in a testable module with unit tests (determinism: same graph →
same polygons; hit-testing maps clicks to the right region). Browser-verify both
renderers via the toggle: markers, ownership tints, war fronts, selection, and
click-to-select all work on the Voronoi view and the node+edge fallback still
works. Screenshot both. No console/page errors, `fetch` count still 0, deps still
`{}`.

---

### Working style
- One development at a time, top to bottom. Don't start #2 until #1 is committed,
  pushed, and DEVLOG'd.
- Decide implementation details independently (per `CLAUDE.md` autonomy). Only
  surface work at a genuinely playable milestone.
- If something proves impractical, adjust and note what changed and why in the
  DEVLOG — then keep going.
