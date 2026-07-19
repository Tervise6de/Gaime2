# Petty Kingdoms — master TODO (the full list)

One consolidated backlog. It merges every open item from:

- `roadmap-to-ready.md` — the product roadmap (phases A–D, unchanged there);
- `next-3-developments.md` — the three-development brief (now **in flight**);
- `game-design.md` §9.8 — the open design-decision queue;
- `press/steam-store.md` §7–9 — the Steam asset/build checklist;
- **new:** the game-design-advisor review (2026-07-18) — the X-factor items
  (section E below), previously nowhere in the backlog.

**Parallel development is active.** Before picking an item, check
`git branch -a`, the newest `DEVLOG.md` entries, and section 0 below — an item
already on an unmerged branch must not be started again from `main`. The
detailed specs stay in the source docs above; this file is the index of *what*
remains, not a second copy of *how*.

Status marks: ✅ done on `main` · 🔀 in flight on a branch · ⬜ open ·
**[RESOURCE]** needs a human/artist, not code.

---

## 0. In flight right now (land these first)

| Item | Where | Status |
|---|---|---|
| AI concentration of force (mass armies before striking) | `claude/three-developments-cycle-4ybhv1` | 🔀 committed, unmerged |
| End-game summary screen + prestige-history graph | `claude/three-developments-cycle-4ybhv1` | 🔀 committed, unmerged |
| Voronoi-polygon map renderer (behind toggle, node+edge fallback) | `claude/three-developments-cycle-4ybhv1` | 🔀 committed, unmerged |
| Player legibility: trades, turn text, victory progress | `claude/player-visibility-info-llagsz` | 🔀 committed, unmerged |

First action for any integration cycle: review + merge these into `main`
(resolve against each other — both touch the HUD), re-run the full verify
recipe, then delete/retire the branches and `next-3-developments.md`.

## A. Testing-ready — onboarding (specs: `roadmap-to-ready.md` Phase A)

- ⬜ A1. Interactive tutorial / first-game walkthrough (highest leverage)
- ⬜ A2. Confirm dialogs for irreversible actions (war, new game, clear save)
- ⬜ A3. First-run UX pass: tooltips everywhere + "controls & goals" card
- ⬜ A4. Bug-bash: scripted Playwright fuzz run, fix every throw

## B. Feel & platform (specs: `roadmap-to-ready.md` Phase B)

- ⬜ B1. Procedural audio — SFX (Web Audio synth, no assets, mute persisted)
- ⬜ B2. Procedural audio — ambient bed (off by default)
- ⬜ B3. Options panel (volume, colourblind, reduce-motion, map default)
- ⬜ B4. Accessibility: colourblind-safe palette, keyboard nav, ARIA, focus
- ⬜ B5. Visual juice: battle flash/shake, capture ripple, count tweening
- ✅ B6. Responsive/touch layout (pointer tap/drag/pinch already shipped; the
  map-lens strip now docks out of the corner panels' way below 1100px — v0.54)

## C. Depth & meta (specs: `roadmap-to-ready.md` Phase C)

- ⬜ C1. Meta-progression: per-profile stats + achievements screen
- ✅ C2. Content depth: strategic-resource works (Bloomery/Stable via a new
  requiresResource gate) + 3 events (hard_winter, ship_launch, royal_wedding);
  probe balance-neutral (v0.53)
- ⬜ C3. Scenario/challenge starts (preset seeds + goals in new-game panel)
- ✅ C4. Diplomacy/AI depth II: treaty-breaking with reputation cost — NAP/
  alliance betrayal, self-punished via a broad reputation hit (v0.52)

## D. Market polish (specs: `roadmap-to-ready.md` Phase D)

- ⬜ D1. **[RESOURCE]** Art direction / real visual identity
- ⬜ D2. **[RESOURCE]** Human playtesting + rebalance
- ⬜ D3. **[RESOURCE]** Store/marketing: trailer, packaging (see §F)
- ✅ D4. Performance profiling at largest configs (harness `systems/profile.ts`;
  ~1.3 ms/turn, AI-dominant, no superlinear growth — no optimisation warranted, v0.56)
- ✅ D5. Localisation scaffolding (`ui/i18n.ts` catalogue + `t()`; boot screen &
  nav rail extracted, live English/Estonian, Options language picker — v0.55)

## E. X-factor — characters & dynasty (advisor review, 2026-07-18)

The advisor assessment: the game is a disciplined 4X-lite, but its stated dream
mix (AoE2 + CK3 + Civ5) is missing the **CK3 ingredient entirely — people**.
Nothing in the sim has a name or a face; nothing generates *tellable stories*.
This is the differentiation gap on a crowded minimal-4X Steam shelf, and the
Baltic-crusades setting (literally CK3's most beloved sandbox era/region) makes
it a natural fit. Design intent: characters are **data rows with trait weights**
that plug into the existing unrest/economy/AI maths — systems, not art, per the
design pillars. Full write-up now queued as `game-design.md` §9.8 item 2.

Ordered by leverage-per-effort:

- ⬜ E1. **Named AI rulers.** Each rival realm gets a generated ruler name +
  epithet + tiny procedural portrait/crest tied to its archetype ("Visvaldis
  the Cruel" instead of "Lithuania"). Pure presentation over the existing
  personality AI — nearly free, large attachment gain. Diplomacy/log text
  speaks as the ruler.
- ⬜ E2. **Chronicle panel.** A run-long story log of beats (wars, betrayals,
  revolts, successions, wonders) in chronicle prose; feeds the end-game
  summary. This is the screenshot/share generator.
- ⬜ E3. **Governors with traits.** Each province gets a character (2–3 traits:
  Greedy/Loyal/Beloved/Ambitious/Brilliant…) whose traits are modifiers on the
  yields/unrest maths that already exist. Appoint/replace = a new decision.
- ⬜ E4. **Generals.** Armies led by characters; martial trait feeds the combat
  maths, loyalty makes your best commander a risk. Ties into E5.
- ⬜ E5. **Named pretender revolts.** High-unrest revolts spawn a *named*
  pretender (possibly a disloyal governor/general from E3/E4) instead of
  anonymous rebels — your own appointments become the threat.
- ⬜ E6. **Ruler & succession.** The player is a mortal ruler with an heir;
  succession mid-run shuffles ruler bonuses (a second anti-snowball beat, the
  compressed CK3 heartbeat). Gate behind a toggle until balance-probed.

Guardrails unchanged: deterministic (names/traits from the seeded RNG), data
in `src/data/`, pure sim, every character must add a **decision**, not lore.

## F. Steam launch (consolidates `press/steam-store.md` §7–9 + advisor)

- ⬜ F1. Stand up the **Coming Soon** page with existing copy/capsules; start
  collecting wishlists *before* polish is done (wishlists validate pricing).
- ⬜ F2. Desktop build: **Tauri** wrap of `dist/` (Win/mac/Linux), fullscreen/
  resolution options; keep the browser build as the free demo funnel.
- ⬜ F3. Map systems to Steam features: achievements → Steam achievements
  (needs C1), save/load → Steam Cloud, shareable seeds → community hook.
- ⬜ F4. **[RESOURCE]** Remaining store assets: vertical capsule, library
  hero (key art), transparent logo, community icon.
- ⬜ F5. **[RESOURCE]** Trailer (shot-list already in `steam-store.md` §9).
- ⬜ F6. **Next Fest** with the demo once Phase A (onboarding) is done — for a
  systems game with modest art, the demo *is* the marketing.

## G. Design decision queue (specs: `game-design.md` §9.8)

Larger design calls, none committed; rough priority order (post-advisor):

- ⬜ G1. Naval / sea power (the Baltic *is* a sea — biggest thematic gap)
- ⬜ G2. Characters & dynasty — **promoted to section E** (advisor: this is
  the X-factor; E1–E2 are cheap enough to start ahead of naval)
- ⬜ G3. Army stacking / combined battles
- ⬜ G4. Culture axis (assimilation, cultural unrest, maybe culture victory)
- ⬜ G5. Trade-bloc diplomacy — the old "religion blocs" idea is dropped with faith
  (removed v0.79); its coalition core shipped as the **Hanseatic League** (§9.10).
  Open: league wars, combined trade-victory pressure, rival leagues.
- ⬜ G6. Vassalage / deeper diplomacy (tributaries, pacts with teeth)
- ⬜ G7. Event chains / branching questlines
- ⬜ G8. Espionage (parked last deliberately)

---

## Suggested order of attack

1. **Land section 0** (merge the in-flight branches; keep `main` green).
2. **Phase A** — onboarding gates everything; the game must be testable by
   strangers before more depth is added.
3. **E1 + E2** — the two cheap X-factor wins; they transform how the game
   *reads* before any deep new system is built.
4. **F1** — Coming Soon page up, wishlists ticking while development continues.
5. Then interleave B (feel) with E3–E6 / G-queue picks, per the existing
   "one verified cycle at a time" playbook, re-probing balance on every sim
   change.
