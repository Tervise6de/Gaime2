# Working agreement (Gaime2)

## Autonomy
- **Decide, don't ask.** Make design and implementation calls independently.
  Do not stop to have the user choose between options or approve choices
  along the way. Briefly record the reasoning in the commit message (or in
  `docs/game-design.md` when it's a design-level decision).
- **Only surface fully-playable milestones.** Stop and show the user work when
  a milestone from the build plan (`docs/game-design.md` §8) is *complete and
  playable end-to-end* — not for mid-milestone feedback. When adjusting the
  plan because something proved impractical, just note what changed and why,
  and keep going.

## Build order
Follow the milestone sequence in `docs/game-design.md` §8 (M1 → M6). Do not
skip ahead. Each milestone must leave the game runnable and testable.

## Engineering guardrails (from the design doc)
- **Determinism:** all game logic derives from the seeded RNG
  (`src/systems/rng.ts`). Never use `Math.random()` in the sim.
- **Pure turn pipeline:** turn resolution is `GameState -> GameState` pure
  functions (`src/systems/turn.ts`). No DOM, no wall-clock, no globals in sim.
- **Layering:** `systems/` hold logic (never touch the DOM); `ui/` observes
  state and emits intents (never mutates the sim); `data/` is serialisable
  content so balancing is editing tables, not code.
- **Tests:** systems are unit-tested with Vitest (`npm test`). Keep them green.

## Releases
- **Bump `package.json` minor version with every user-visible batch pushed to
  main.** The title screen and the legend's "This world" card display it —
  a stale number means the bump was forgotten.

## Commands
- `npm run dev` — dev server at http://localhost:5173
- `npm test` — unit suite
- `npm run typecheck` / `npm run build` — types / production build

## Historical setting reference: the Hanseatic League ("Hansa times")
The game's economy/trade/diplomacy flavour draws on the **Hanseatic League era**.
A full, fact-checked, **sourced** reference lives in
**[`hansa times.md`](./hansa%20times.md)** — covering roughly **1150–1700**
(the League's life plus ~100 years either side), focus on **c. 1250–1550**.

Use it for content and balancing: origins & organisation (no state/navy/treasury),
the Kontore (Novgorod/Bergen/London/Bruges), trade goods (salt, herring/stockfish,
grain, furs, wax, amber, cloth, hopped beer), Brick-Gothic buildings, real people
(Henry the Lion, Valdemar IV, Margaret I, Störtebeker — *flagged as legend*,
Wullenwever), ships (cog → hulk → carrack → fluyt), wars (Stralsund 1370, Grunwald,
Anglo-Hanseatic, Count's Feud), the military-tech ladder (mail→plate→crossbow→pike→
arquebus→pike-and-shot; star forts), and economy/society (Lübeck Mark, Wendish
Coinage Union, town law, the 1350 plague). Every historical claim is cited; the
final **§13 Game-Design Hooks** section (and only that section) maps the facts onto
this game's resources, buildings, units, factions, and events — keep interpretation
there, not mixed into the history.
