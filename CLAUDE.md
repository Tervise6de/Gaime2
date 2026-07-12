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

## Commands
- `npm run dev` — dev server at http://localhost:5173
- `npm test` — unit suite
- `npm run typecheck` / `npm run build` — types / production build
