# Roadmap to ready — testing-ready (75) → market-ready (100)

> **Index:** the consolidated backlog across *all* docs (this roadmap, the
> design queue, the Steam checklist, in-flight branches, and the advisor's
> X-factor items) lives in [`TODO.md`](TODO.md). This file keeps the detailed
> Phase A–D specs.

**Where we are (assessment, 2026-07-14):** the *game systems* are essentially
complete and well-tested (~336 tests, deterministic, deep AI, three balanced
victory paths, diplomacy incl. trade, save/load, Voronoi renderer, 1–5 rivals,
map sizes). On a scale where **75 = testing-ready** and **100 = market-ready**,
the project sits ≈ **68** — held there not by missing *gameplay* but by missing
*product*: onboarding, audio, feel/juice, platform reach, accessibility, content
volume, meta-progression, and real human playtesting.

**Guardrails still bind everything below** (see `CLAUDE.md`, `game-design.md`):
100% local/offline, `package.json` dependencies stays `{}`, deterministic seeded
RNG in the sim, pure `GameState → GameState` turn pipeline, `systems/` never touch
the DOM, tests stay green and grow. Almost every item here is achievable **in
code within these guardrails** — audio is *synthesised procedurally* via the Web
Audio API (no asset files, no deps); "juice" is canvas/CSS animation. The only
genuinely resource-gated items (need an artist / real humans, not code) are
flagged **[RESOURCE]**.

Work **top-to-bottom**; each numbered item is one tractable autonomous cycle
(sometimes two). Re-probe balance (backlog A) after any change that touches the
sim. Keep `main` green and pushed; append a DEVLOG entry per cycle.

---

## Phase A — Testing-ready (→ 75). The gate is onboarding.

A1. **Interactive tutorial / first-game walkthrough.** A skippable, re-openable
    coached sequence that spotlights each key UI area (resources, tax, a region,
    build/raise, end turn, diplomacy, victory bar) with a one-line explanation.
    Persisted "seen" flag; a "Tutorial" button to replay. *This is the single
    highest-leverage item — it flips the game from "great for us to test" to
    testable by anyone.*
A2. **Confirm dialogs for irreversible/heavy actions** (declare war, new game
    mid-session, clear a save slot) — a small reusable modal.
A3. **First-run UX pass:** ensure every panel/control has a hint or tooltip a
    newcomer can follow; a compact "controls & goals" card reachable from Help.
A4. **Bug-bash / hardening cycle:** fuzz the UI with a scripted Playwright run
    (rapid clicking, edge states — 0 rivals, tiny map, game-over interactions),
    fix anything that throws.

*Exit criteria for 75:* a first-time player can start, understand the loop, and
finish a game without external help; no console errors under the fuzz run.

## Phase B — Feel & platform (→ ~85).

B1. **Procedural audio — SFX.** A tiny Web Audio synth module (`ui/audio.ts`, no
    deps) that plays short cues on key events: end turn, build complete, battle
    win/lose, region captured/lost, tech done, alert/danger. Master **mute
    toggle** persisted; respects a first-gesture unlock (autoplay policy).
B2. **Procedural audio — ambient.** An optional low bed / periodic motif, off by
    default, behind the same toggle.
B3. **Options panel:** volume + mute, colourblind palette toggle (feeds B4),
    reduce-motion toggle (feeds B5), map layout default. Persisted.
B4. **Accessibility — colour & input.** A colourblind-safe owner/relation palette
    behind the toggle; full keyboard navigation of the HUD; ARIA labels on
    controls; visible focus rings.
B5. **Visual juice.** Canvas/CSS feedback that respects reduce-motion: a flash +
    shake on a battle at a region, a capture ripple, animated resource-count
    tweening, smooth panel transitions. No art assets — pure motion.
B6. **Responsive / touch layout.** `@media` breakpoints so panels reflow on
    narrow screens; pointer/touch handlers for select/move; larger tap targets.
    (Full mobile UX may spill to a later pass.)

## Phase C — Depth & meta (→ ~95).

C1. **Meta-progression.** Per-profile stats (games, wins by victory type/archetype,
    fastest win, longest game) and **achievements** in localStorage; a stats/awards
    screen. No gameplay change — reads outcomes.
C2. **Content depth.** A few more carefully-balanced techs / buildings / units and
    more single-beat + trait events, each probed (backlog A) so no archetype or
    victory path dominates. Bias to additions that add a *decision*, not just
    numbers (the design's discipline).
C3. **Scenario / challenge starts.** Preset seeds + configs with a goal
    ("survive the horde", "wonder race") surfaced in the new-game panel — cheap
    replayability on top of the existing engine.
C4. **Diplomacy/AI depth II.** Treaty-breaking with a reputation cost (low-trust
    AIs betray NAPs for a tempting strike; breaking deals damages standing with
    *all* nations), and richer alliance behaviour. Probe.

## Phase D — Market polish (→ 100). Partly resource-gated.

D1. **[RESOURCE] Art direction.** Real visual identity — region/terrain art, unit
    iconography, UI theme, title screen. Needs an artist; code side is swapping
    the placeholder palette/emoji for supplied assets (keep bundle local).
D2. **[RESOURCE] Human playtesting + rebalance.** Structured playtests with real
    people; fold findings back into the data tables and UX. AI self-play probes
    have carried balance this far but can't replace humans.
D3. **[RESOURCE] Store/marketing.** Screenshots pipeline, trailer, store page,
    build/packaging for target platforms.
D4. **Performance profiling** at the largest configs (30 regions × 6 nations ×
    150 turns); optimise render/turn hot paths only if measured slow.
D5. **Localisation scaffolding** (extract UI strings) if targeting non-English.

---

### How to run this (autonomous loop)
- Pick the **lowest-numbered unfinished item**; do one complete verified cycle
  (implement → typecheck/test/build → 0 `fetch` → browser-verify UI → probe if
  sim/balance touched → commit in Estonian → push `main` + mirrors → DEVLOG).
- If an item is bigger than one cycle, split it and note the split in the DEVLOG.
- **[RESOURCE]** items can't be finished by the loop alone — do the *code-side*
  scaffolding (asset-swap points, string extraction, profiling harness) and
  surface to the human what external input is needed.
- Re-assess the 75/100 position in the DEVLOG at each phase boundary.
