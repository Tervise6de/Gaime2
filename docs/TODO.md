# Sea of Coin TODO

## Keep

- Hansa trade routes, Kontore, Sound tolls, embargoes and League politics.
- Authored Hansa map only.
- Focused diplomacy: war, peace, pacts, alliances, gifts, tribute and trade
  pressure.
- Light rulers and commanders for memory, flavour and a few real decisions.

## Remove / Do Not Rebuild

- Random world modes.
- Generic scenario presets.
- Bilateral "open trade for passive income" diplomacy.
- Monument-race victory or monument-only tech branch.
- Deep dynasty simulation.

## Next Features Worth Adding

- **Hansa-control meter:** Kontor coverage, route value, league leadership and
  sea-lane control as a visible race.
- **Route conflict:** piracy, escorting, blockade, toll avoidance and contested
  ports.
- **League offices:** a small election/leadership layer with concrete trade
  powers.
- **Character-light politics:** rulers, commanders and one civic office-holder
  slot that can create memorable events without heavy bookkeeping.
- **Better onboarding:** explain why trade matters before conquest feels like
  the default answer.

## Character Scope

Characters should be few and legible:

- Rulers: name, epithet, archetype, legitimacy/support. Mostly diplomacy,
  events and chronicle.
- Commanders: army attachment, martial score, loyalty risk. Already aligned
  with war and revolt systems.
- Office-holders: optional single-role appointments such as alderman or bailiff
  for city/trade bonuses with political downsides.

Do not add families, marriages, inheritance webs, inventories or large court
lists. Those systems would steal attention from the Hansa trade game.

---

## Playtest feedback — 2026-07-20 (test game, to triage)

Raw notes from a full test game (two screenshots referenced: a "Turn 36
resolved" summary and a "A Great Fire — 1444 AD" event). Each item keeps its
original number `[n]` so nothing is lost; the sub-note after each is the
suggested fix / question to resolve. Fold the tractable ones into
`roadmap-to-ready.md` as they're picked up.

### Bugs & jank
- **[1] Treasury changes "tick" down instead of applying immediately.** Spending
  gold animates the number counting down rather than snapping to the new value.
  → Make the value update immediate (or keep the tween but resolve state at once;
  don't gate anything on the animation finishing).
  **✓ Fixed v0.94.0** — resource tween sped up (~40%/frame, snaps within 1 unit)
  so a spend reads as immediate.
- **[7] Game feels laggy / not smooth.** General performance/feel pass — profile
  the render and turn hot paths, find what's dropping frames.
- **[4c] Selecting a research seems to refresh the whole page.** Picking a tech
  causes a jarring full re-render/"refresh". → Should be a local state update, not
  a page reload. **✓ Fixed v0.94.0** — a live tech-tree re-render no longer
  replays the panel's rise animation or resets scroll (only a fresh open animates).
- **[17] Event log is capped at ~50 entries and is confusing.** Only ~50 logs show
  at the bottom, older ones never drop off (or they do, and the leading numbers are
  **not** turn numbers but a 1–50 running order, which reads as if they were turns).
  → Clarify what the leading number means (turn vs. index), decide on retention,
  and make old-vs-new obvious. **◑ Partly fixed v0.94.0** — the misleading leading
  index (rolling 1–50 position that read as a turn number) is gone; the newest
  line stays highlighted. *Still open:* larger retention and real per-entry turn
  numbers (needs the log to carry a turn, which touches the sim).
- **[18] Knowledge spend doesn't add up.** Had 200+ knowledge stockpiled; added a
  research; it finished in 1 turn and knowledge dropped to 0 — but it clearly didn't
  cost the full 200+. → Audit how knowledge is spent vs. banked; the cost math and
  the displayed stockpile disagree. **✓ Fixed v0.94.0** — completing a tech now
  rolls the *surplus* over as banked head-start (it was reset to 0, silently
  burning the excess); the research panel names the banked amount and no longer
  claims idle knowledge is "wasted" (it banks into progress).
- **[11] War AI walks armies in circles.** Estonian regions' armies went "around and
  around"; Novgorod had all-but-one region annexed yet the AI kept circling instead
  of taking the last one. → Fix the AI's siege/finish logic so it commits to the last
  region and doesn't loop.

### War & diplomacy system (needs full analysis)
- **[3] War → peace → war in 3 turns is possible.** No cooldown/commitment. → Add
  minimum peace duration, war-weariness, or a cost/penalty so rapid flip-flopping
  isn't optimal or free.
- **[6] Countries demand money with no context.** Why are they demanding? What
  happens if I pay vs. refuse? → Surface the reason, the stakes, and the consequence
  of each choice in the demand UI.

### Research — full overhaul
- **[4a] Tech content is anachronistic for the start date.** In 1227 the tree still
  offers Pottery, Writing, etc. — things that would already be done. → Rebuild the
  tree around the Hansa era (see `hansa times.md` military-tech ladder & economy),
  drop pre-medieval basics.
- **[4b] Can't build an army / core things due to missing research.** Being gated
  out of basic actions at the start feels wrong. → Re-gate so the player can do the
  fundamentals immediately; research should *improve*, not *unlock the obvious*.

### Buildings — redo
- **[5] Buildings (e.g. "houses") are opaque and feel out of era.** Hard to tell what
  they do without hovering; some don't fit the Hansa setting. → Make effects legible
  on the card (not hover-only) and re-theme to era-appropriate buildings.
- **[12] Buildings should produce goods, and I can't collect any.** There's no path
  from a building to actually generating/collecting wares. → Wire buildings to ware
  production so the goods economy is reachable in play.

### Economy, goods & trade
- **[9] Lots of new goods exist but are never seen, mentioned, or needed.** The ~16
  wares are in the data but invisible in a real game. → Make them show up, matter,
  and be demanded during normal play.
- **[13] Can't see resources on the map.** No on-map indication of what a region
  yields. → Add a resource/ware overlay or per-region markers.
- **[16] No trade yet, and no clear way to set it up.** Can't find how to open a
  route; the whole trade flow needs to be designed and surfaced. → Design + build the
  trade-route setup UX (this is the core pillar — routes, Kontore, tolls).

### Events & notifications
- **[2] Run ~5 autoplays and catalogue the most-common (too-common?) notifications.**
  E.g. turn 2 is always army-leader stuff — does that need a notice at all? And
  "Grain filled well due to good yield" fires even when the producing country is far
  away — how would the player even know that, and is it realistic? → Audit
  notification frequency/relevance and cut/merge the noisy ones.
- **[8] Big events need more context (see "Turn 36 resolved" screenshot).** For
  major things (elimination, research completed, war declared) tell me *who* attacked
  and *why* war was declared. Also: why is my treasury growth shown in this summary?
  → Enrich big-event text with actors/causes; reconsider mixing routine treasury
  deltas into the same summary.
- **[10] Need many more random events.** (Already started.) Keep expanding the pool.
- **[14] Event effects are invisible + remove the corner icon (see "A Great Fire"
  screenshot).** The fire fired, but nothing visibly changed — what did it damage,
  what's different now? → Give events real, visible mechanical consequences. Also
  **remove the icon badge in the top-left corner of event cards** (all of them).
  **◑ Partly fixed v0.94.0** — the top-left corner glyph is removed from the epoch
  event card (the illustration carries identity). *Still open (bigger):* giving
  events real, visible mechanical consequences.
- **[15] Add more time/season-driven events.** E.g. winter hits and travel/trade is
  delayed because of it. Tie events to the calendar/seasons.
