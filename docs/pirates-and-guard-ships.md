# Pirates & Guard-Ships

> Feature design for the piracy layer. Implemented in `src/systems/piracy.ts`
> (+ `src/data/piracy.ts`), wired into the turn pipeline before `stepTrade`.
> Honours the repo guardrails (determinism, pure `GameState → GameState`, data-
> defined balance). History is **not re-derived here** — it lives, sourced and
> legend-flagged, in [`hansa times.md`](../hansa%20times.md) §7 (Störtebeker),
> §9 (the Vitalienbrüder), and §13's design hook: *"Pirate raid (Victual
> Brothers) — lose a trade convoy unless escorted."* This is that hook, built out.

## The goal

Trade and the war-fleet lived in separate worlds: trade was safe gold, ships
only mattered in a war. Piracy fuses them. **Trade routes become raidable**, and
**war-fleets get a peacetime job — guarding them.** Every rich route becomes a
recurring question: **guard it, or gamble?** Both answers cost something.

## The era model (dormant until history begins)

Piracy is an **age**, not a permanent tax. `state.piracy.pressure` (0..1) is the
one dial: it is **0 by default, so the whole system is a literal no-op** — the
game plays exactly as before. The existing `victual_brothers` **epoch event**
(c. 1395, `data/epochEvents.ts`) now *begins the age of piracy*: its `pirates`
effect raises `pressure` (and records a chronicle beat). Pressure then **eases
each turn**, and drops further when raids are repelled or a captain is taken — so
the troubles rise, peak, and pass, the way the real Victual Brothers did
(hired 1392 → suppressed at Hamburg 1400/1401). A future lever can add a low
persistent baseline; today the age is event-gated, which keeps it faithful and
keeps every existing test green.

## What happens each turn (`stepPiracy`, before `stepTrade`)

For every active trade route, in the turn pipeline *just before* trade pays out:

1. **Raid chance** = `raidCoeff × laneExposure × pressure × valueFactor`, capped.
   - `laneExposure` grows with the route's lane length (a longer sea-road is more
     exposed); `valueFactor` scales with the route's income (rich cargo draws
     raiders). Richer + longer + more lawless ⇒ likelier to be hit.
   - The **Naval Power doctrine** ("guarded lanes") deters raiders outright,
     cutting the chance (`committedPath(done, "maritime") === "naval_power"`).
2. **If a raid fires**, is the lane **guarded**? A route is guarded when the owner
   has a **war-fleet parked on any region of its lane** (`findGuardFleet`) — so
   guarding reuses ordinary fleet movement, *no new UI*: you station your cogs on
   the sea-road you want protected. **That is the fleet's peacetime job.**
   - **Unguarded** → the convoy is taken: the route is flagged `pirated`, so
     `stepTrade` pays it **nothing** this turn, and pressure ticks up.
   - **Guarded** → a **sea battle** (`resolveCombat`, open water) between the
     raider stack and the guard-fleet. Win → cargo safe, pressure eases, and a
     **named captain yields a gold bounty**; lose → the convoy is taken *and* the
     fleet takes losses. A weak escort against a strong raider can lose both.
3. **Pressure** is updated (successes embolden, repels/captures calm the seas) and
   eased by the per-turn decay.

Determinism: piracy draws from a **salted side-stream** off `state.rngState` and
never advances the main stream, so it cannot shift AI/event outcomes.

## Named captains (recurring antagonists)

`data/piracy.ts` carries the Likedeeler captains as stat-cards — **name + numbers,
no bespoke art**. The hotter the era, the more infamous the captain it summons; a
captain leads raids until a guard-fleet takes him (then he's in
`defeatedCaptains` and recurs no more). Grounded in `hansa times.md` §7:

| Captain | Signature | Appears at | Note |
|---|---|---|---|
| **Hennig Wichmann** | workhorse raider | low pressure | one of the four named leaders |
| **Magister Wigbold** *("the Learned")* | slippery | low–mid | the scholar-pirate |
| **Gödeke Michels** | escalates | mid–high | Störtebeker's co-captain — the "sequel" |
| **Klaus Störtebeker** *(marquee)* | strongest; a **hulk** flagship; big bounty; a chronicle beat on capture | height of the troubles | the emblem of the era — **biography largely legend** |

## Interactions

- **Economy** — a neglected rich route can hemorrhage a season's gold: real
  treasury pressure competing with everything else.
- **Military** — war-fleets gain a standing peacetime purpose; building/positioning
  escorts trades off against a land army and against savings (guns / butter /
  **guard**). Bounties reward hunting the raiders down.
- **Research** — the Maritime **Naval Power** doctrine literally means "guarded
  lanes": it deters raids, its `hulk`/`carrack` make stronger guard-fleets.
- **Chronicle** — a new `"piracy"` beat marks the era's opening and the capture of
  a marquee captain.

## Balance

All dials live in `PIRACY` (`src/data/piracy.ts`) — illustrative starting values.
The tuning goal: neither "guard every lane" nor "guard nothing" is ever the right
blanket policy. Balancing is editing that table, not the resolver.

## Shipped vs. future

**Shipped (this batch):** the era model; raidable routes + pressure; guard-ships
via stationed fleets; sea battles with bounties; named captains; the epoch kick-off;
Naval-Power deterrence; determinism; 15 unit tests.

**Future (documented, not built):**
- **Pirate havens & the Hunt** — raider bases (Visby / Marienhafe) that raise
  local pressure and can be assaulted to end the threat at its source (echoing the
  Teutonic expulsion from Gotland, 1398, and the Helgoland campaign, 1401).
- **Letters of marque (dual-use)** — license your own privateers against a rival's
  routes; rivals sponsor pirates against yours (Mecklenburg backed the Victual
  Brothers — deniable economic warfare via the relations model). See
  `hansa times.md` on Danzig privateering / the 1470 Lübeck ordinance.
- **A persistent low baseline** so trade is a live gamble outside the named era.
- **UI surfacing** — a raid alert / guard-status readout on the trade panel.
