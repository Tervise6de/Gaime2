# Gaime2 — development log

Newest entries at the top. Each autonomous overnight cycle appends one entry:
what changed and why, the test count after, and ideas for next time. See
`docs/autonomous-dev-prompt.md` for the playbook these runs follow.

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
