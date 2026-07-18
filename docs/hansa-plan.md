# The Merchant Sea — Hansa Pivot Plan (working title)

> Status: **DRAFT for review.** No code written, nothing committed. This records
> the agreed direction from the design conversation (2026-07-18) so the build is
> "execute the plan," not "invent while coding." Supersedes nothing yet — once
> signed off, the relevant parts fold into `docs/game-design.md`.

---

## 1. Vision & positioning

The game pivots from a generic Baltic feudal 4X ("Petty Kingdoms") to a game with
a **distinct identity: the Hanseatic sea.** You play the **rise of a merchant
league** on a contested sea — winning by mastering trade and the water, not only
by conquering land.

The market gap this fills:

- **CK3** = feudal characters & dynasty. **EU4** = mercantilist nation-painting.
  **Civ** = tech & wonders. **Us** = the only grand-strategy game where the
  **Hansa is the identity** — you *found, grow, join, or break* a merchant league.
- The Hansa has been done as a **trade tycoon** (Patrician, Port Royale, Hanse)
  but **never as a grand-strategy identity**. That is the opening.
- It reuses this project's real strengths: economy sim, the Baltic map, the
  trade-route seed, the merchant realms (Gotland, Denmark, Curonia), naval nodes.

**One-line pitch:** *Found the Hansa, grow it as far as you can, and hold it
together as the whole sea turns envious.*

**Deliberately NOT:** a CK3 clone (we don't chase characters/dynasty as the
X-factor — that's Paradox's home turf), and NOT a dry trade tycoon (the core is
economic **warfare** on a contested sea — blockades, tolls, Denmark-vs-League —
not price curves).

---

## 2. What we keep, reframe, and build new

**This is a pivot built ON the existing base, not a rewrite.**

**Keep as-is (the good base):**
- Region adjacency graph, terrain, procedural + scripted (Baltic) maps.
- Economy sim, population & **unrest anti-snowball**, buildings.
- Combat resolver (phased volley→melee, counter loop, forts) — reused for naval.
- Diplomacy + opinion log, casus belli, treaties, coalitions.
- AI utility-scoring framework, personalities.
- **Named rulers + commanders + chronicle** (leaders stay — see §8).
- HUD, map lenses, tooltips, turn report, save/load, determinism, Vitest suite.

**Reframe:**
- **Victory:** add a **Hansa-control** race + a **"how big can you get it"** score;
  the old domination/conquest path becomes the **"Break" / feudal-kingdom** stance.
- **Trade:** thin bilateral gold deal → a **deep trade layer** (§6).
- **Calendar:** stretch years-per-turn to span the Hansa lifecycle (§3).
- **Faith / culture:** demoted from headline to **flavour** (still worth doing —
  pagan-vs-crusader friction is great texture — but no longer the differentiator).

**Build new:**
- **Naval layer** — sea zones as nodes, fleets, naval combat, blockade (§7).
- **Trade depth** — goods, routes-over-lanes, Kontore, tolls, privileges (§6).
- **The League institution** — Form / Join / Break, internal politics (§4–5).
- **AI** for all three stances (§11).
- **Map expansion** for the Wendish/German coast + Kontor nodes (§9).
- **Rebrand** (§9).

---

## 3. Time, calendar & game length

- **Start ~867–900** (Viking / Gotlandic trade dawn — Visby is the pre-Hansa hub).
  This is essentially CK3's beloved Viking-Age anchor; keep it.
- **Stretch years-per-turn** (~2.5–3 yrs/turn) so ~220 turns span **~900 → ~1500**,
  covering the full Hansa lifecycle: **rise (1150) → peak (1350–1450) →
  twilight (1500s)**. Presentation-only change (`data/eras.ts`) — the sim doesn't
  care about the year.
- **Decouple turn-count from history.** Turn count = session length; years/turn =
  span. Add a **Game Length setting**: Short / Standard / Long / **Endless**.
  - *Endless / Sandbox* drops the score tiebreak: play until a decisive victory or
    you stop — this is the home of the **"how big can you get it"** fantasy.
- Re-space and re-name the eras to the Hansa arc (Trade Dawn → League Rises →
  Peak of the Hansa → The Turning → Twilight, illustrative).
- **Future DLC hook:** the **Dutch/Atlantic competition** that historically broke
  the Hansa becomes a post-launch *decline expansion* (external late-game
  counterforce). Noted, not built now.

---

## 4. The three stances: Form / Join / Break

The core loop gives **asymmetric goals by map position** — a merchant island leans
Form, a mid city leans Join, a feudal kingdom leans Break. This is the identity.
Each stance has a known failure mode; the design must answer it:

### Form (the founder fantasy)
- You grow a merchant power until you can **convene the first Diet and found the
  League under your leadership.**
- **Forming is an *earned midgame pivot*, NOT the victory.** Reached by a control
  threshold (Kontore held + sea-lane trade share + a hub set), not a button.
- **Interim goals so the pre-Hansa game isn't dead time:** the early game is about
  *positioning* — seize the hubs that will matter (Visby, the Sound, the Novgorod
  route), build ports, get rich, raid coasts. The naval/trade layer works from
  turn 1.
- After forming, the real game begins: **hold a fragile, envied thing** the
  Breakers attack and the climbers try to steal.

### Join (must be "join *and climb*")
- **Failure mode:** joining reads as "you lost the race, tag along." Fatal if left
  as a consolation prize.
- **Fix:** joining puts you *inside the League's politics* (the historical Diets /
  Tagfahrten — Lübeck vs Visby vs Danzig rivalries). Contribute, win Kontore,
  gain Diet influence, and **seize leadership from within.** "Join" = "infiltrate
  and take over" — arguably a better fantasy than founding it clean.
- Membership gives protection + shared trade income; costs obligations (contribute
  to blockades/wars, honour embargoes).

### Break (must be *economic warfare*, not generic conquest)
- **Failure mode:** if Break = "conquer the trade cities," it duplicates the
  existing domination path and is boring.
- **Fix:** Break = **dismantle the network.** Blockade the blockaders, seize/expel
  Kontore, choke sea lanes, revoke privileges — make membership *unprofitable and
  unsafe* until cities defect and the League fractures. The **Sound/Øresund toll**
  is the built-in weapon; **Denmark-vs-Hansa (1361–70)** is the built-in rivalry.
- You win by shattering the web, not painting the map.

---

## 5. The League as an on-map institution

- **The Hansa is a single, dynamic institution** — one League, everyone relates to
  it (Form/Join/Break). If nobody forms it, the game stays a normal feudal 4X (a
  valid outcome).
- **Built up over time, CK3-dynasty style (confirmed).** The League is a persistent
  institution you *grow*, not a one-shot toggle — it accumulates a **standing /
  renown** (from Kontore, trade volume, members, victories) that *is* the score and
  the win pressure. Like a dynasty it has a **head**, **members** spread across
  realms, and internal prestige politics; you build its power across the whole game.
- **Dynamic head (the seat):** **Lübeck** is the historical default seat if
  AI-run, but **any qualifying city can become the head** by forming/holding the
  League. → *Tallinn/Reval can become THE Hansa city if the player earns it.*
- **Membership** is dynamic: cities join/leave based on **protection, profit, and
  pressure.** A Breaker's job is to flip those.
- **Internal politics:** a lightweight Diet — members hold influence (from Kontore,
  trade contribution, fleet), the head sets League policy (which blockade/embargo,
  which Kontor to open), and influence can **unseat the head** (the Join-and-climb
  path).
- **Defection dynamics** are the tension: a big League breeds envy (**Hansneid**),
  so the League is always one crisis from fracturing — the thematic anti-snowball.

---

## 6. Trade depth — the biggest new system ("a lot more trading stuff")

Abstract, not a full tycoon — but real enough to *fight over*.

- **Trade goods (~6–8), tied to terrain/resource we already have:**
  - Grain (plains/farmland — Prussia/Poland), Timber (forest — Sweden/Finland/Rus),
    Furs & Wax (forest/east — the Novgorod route), **Amber** (Curonia/Prussia coast
    — signature Baltic luxury), **Herring** (Scanian/Danish coasts — the staple),
    **Salt** (a Lüneburg-ish node — preserves herring, high value), Iron/Copper
    (hills/mountains + iron — Sweden), Cloth (imported via the Bruges Kontor).
- **Trade routes as first-class objects** that run **over the sea lanes/zones**:
  carry goods from producer → market/Kontor for profit that scales with
  distance/monopoly. Because routes run over zones, they can be **protected,
  taxed, blockaded, or rerouted** — this is where naval and trade fuse.
- **Kontore** (the great trading posts): **Novgorod** (on-map), **Bergen**,
  **Bruges**, **London** (edge/off-map nodes). Kontore generate League trade
  income and **are the network** — what Breakers seize/expel and founders extend.
- **Tolls & privileges:** whoever controls a chokepoint zone **taxes traffic**
  through it (the Sound). Kontore grant **monopoly-ish privileges**; Breakers
  revoke them.
- **Blockade / embargo** as the League's economic weapons (from §7).

*Guardrail:* the fun is **economic conflict**, not optimization — every trade
mechanic must be something an opponent can contest.

---

## 7. Naval layer (decided: sea zones as **nodes**)

- **Sea zones as nodes:** a handful of named waters (Gulf of Finland, Gulf of Riga,
  Baltic Proper, the Sound, Gulf of Bothnia, Gotland waters). Fleets **occupy and
  fight over** zones — you *see* a fleet in the gulf blockading Reval.
- **Fleets:** a small counter loop, era-gated — **Longship/Raider** → **Cog**
  (the Hansa line/escort) → **Hulk/Carrack** (late, coastal bombard). A
  **Transport** role carries land armies. Mustered at a new **Shipyard** (coast),
  cost materials (timber) + upkeep.
- **Sea as a barrier:** water crossings go port-to-port and cost the move; **islands
  become defensible** (amphibious-landing penalty) — fixes the "walk onto Gotland
  for free" problem immediately.
- **Naval combat** reuses the existing resolver with naval stats.
- **Control & blockade:** a fleet controls a zone → **blockades adjacent enemy
  coasts** (cuts their sea/trade income, blocks their crossings) and **escorts**
  yours and your trade routes.
- **Coastal raids** (the Viking action): a raider fleet pillages an undefended
  shore for gold/materials + unrest.

---

## 8. Leaders & wars (kept — this is not only a trade game)

- **Leaders stay.** Named rulers (per realm) and commanders (leading stacks and
  fleets) already exist and continue — they speak in diplomacy and the chronicle.
- **Wars stay.** The land 4X — armies, unrest, conquest, forts — is fully retained.
  It becomes the **pressure** and the **Break** stance. The Hansa era was warlike
  (Danish–Hanseatic War, the Crusades, Grunwald 1410); the League fought and hired
  mercenaries. War in service of / opposition to trade is the whole point.

---

## 9. Map, cities & rebrand

- **Add the Wendish/German coast** (Lübeck, Rostock, Wismar, Stralsund, a
  Hamburg-adjacent node) so the League's historical heartland exists to contest.
- **Kontor cities:** Novgorod (on-map already); Bergen / Bruges / London as
  edge/off-map trade nodes.
- **Dynamic head** (§5): Lübeck default, but Tallinn/Visby/Danzig/etc. can seize it.
- **Rebrand** away from "Petty Kingdoms." Working directions: *The Merchant Sea*,
  *Kontor*, *Salt & Amber*, *League of the Sound*. Decide LAST, after mechanics
  prove out; do a Steam/trademark scan (avoid bare "Hansa" — collides with
  existing titles).

---

## 10. Endgame, scoring & victory

- **Primary framing: "how big can you get it."** The score = League size × your
  share of control × how long you hold it. The **Endless/Sandbox** length setting
  is its home.
- **Never solitaire:** the world actively resists a growing League — **Hansneid**
  (envy → coalitions), rivals racing to Form/Break, and (future DLC) Dutch
  competition. Growth *generates its own antagonists* — the anti-snowball as
  emotional core.
- **Competitive victory = a tug-of-war over the League**, shown as a visible
  **Hansa-control meter** (Kontore + sea-lane trade + leadership): the Founder
  pushes it up, Breakers drag it down, climbers flip its leadership. Reuses the
  existing legible victory-race UI.
- Old paths remain as flavoured routes: **Domination** = the Break/kingdom win;
  **Prestige/score** = the how-big fallback at the length limit.

---

## 11. AI (must play all three stances)

- Rivals must **Form / Join / climb / Break** per personality and position:
  merchants form/climb, warlords/kingdoms break, mid powers join.
- Reuse the utility framework: score fleet-building, zone control, blockades,
  Kontor attack/defence, and amphibious assaults via the **real combat forecast**.
- The **AI running a competent League** is essential — the player must be able to
  Join or Break an AI-formed Hansa and have it be fun. Difficulty-scaled.

---

## 12. Milestone roadmap (each a playable, testable, green slice)

Same discipline as M1–M6: every phase leaves the game runnable, unit-tested, and
version-bumped. Ordered so value lands early and the base is reused throughout.

- **H0 · Calendar & length (tiny, first).** Stretch years/turn, re-space/rename
  eras to the Hansa arc, add the Game Length setting incl. Endless. Config +
  presentation only. Ships value immediately.
- **H1 · Map expansion & Hansa geography (pulled early — confirmed).** Add the
  Wendish/German coast (Lübeck, Rostock, Wismar, Stralsund) + Kontor edge-nodes
  (Bergen/Bruges/London), author the sea-zone geography, seed trade-good regions —
  so all naval/trade/League work is built on the *final* map, not re-authored later.
  *Playable: the fuller Hansa board.*
- **H2 · Naval nodes & fleets.** Sea zones as nodes; fleets (hull types,
  era-gated); Shipyard; embark/disembark; sea-as-barrier; islands defensible.
  *Playable: project power across the sea.*
- **H3 · Naval combat & blockade.** Fleets fight in zones; zone control →
  blockade/escort; coastal raids. *Playable: the sea is a contested front.*
- **H4 · Trade goods & routes.** ~6–8 goods on existing terrain/resource; routes as
  objects over the lanes; blockade/toll interferes. *Playable: trade you build and
  fight over.*
- **H5 · Kontore, tolls & privileges.** Kontore (Novgorod on-map + Bergen/Bruges/
  London edge nodes); chokepoint tolls (the Sound); privileges/monopolies.
  *Playable: the merchant-network layer.*
- **H6 · The League (Form / Join / Break).** Joinable institution built up
  CK3-dynasty style; forming threshold + first Diet; **dynamic head** (Tallinn can
  seize it); membership + internal politics (climb); defection; Break via blockade/
  expel/war. *Playable: the three stances are real — the identity payoff.*
- **H7 · Endgame, scoring & anti-snowball.** Hansa-control/renown meter; "how big"
  score; Hansneid (envy → coalitions); Endless/Sandbox polish; League-control
  victory. *Playable: the Hansa endgame.*
- **H8 · AI for all stances.** Rivals form/join/climb/break, blockade, contest
  zones, defend/attack Kontore, run amphibious assaults.
- **H9 · Balance, polish & rebrand.** Sweeps, naval/trade lenses, tooltips, reports,
  save/load migration, the rename/re-art. *Dutch competition DLC flagged as
  post-launch.*

Note: H2–H3 deliver the naval slice; after H3 we can feel whether "economic warfare
on a contested sea" is fun *before* the heavier League build (H6+). Reassess there.

---

## 13. Engineering guardrails (unchanged)

- **Determinism:** all naval/trade/League logic from the seeded RNG. No `Math.random`.
- **Pure turn pipeline:** new systems are pure `GameState → GameState` functions
  (`systems/naval.ts`, `systems/trade.ts`, `systems/league.ts`).
- **Layering:** systems hold logic (no DOM); ui observes/emits intents; data is
  serialisable content (`data/ships.ts`, `data/goods.ts`, `data/seazones` /
  authored in maps, `data/kontore.ts`).
- **Tests:** every system unit-tested; keep `npm test` green each slice.
- **Save/load:** additive optional fields + back-fill on deserialize (as done for
  the new unit types), so older saves load.
- **Reuse:** naval combat reuses the combat resolver; the League reuses the
  bloc/coalition and opinion machinery; UI reuses army panels/lenses/victory-race.

---

## 14. Open decisions to confirm (before/at each phase)

1. **Exact trade-goods list** and how demand/price is modelled (fixed demand nodes
   vs. simple supply/demand). Recommend: fixed Kontor/market demand, abstract price.
2. **League representation depth — RESOLVED:** the **joinable institution (model b)**,
   built up CK3-dynasty style (§5) — not a fully-separate "you ARE the League"
   faction (model c) for v1.
3. **Map expansion timing — RESOLVED:** pulled **early (H1)**, so all naval/trade/
   League work is authored on the final Hansa geography (Lübeck/Wendish coast +
   Kontor nodes present from the start).
4. **How much faith survives** as flavour (pagan-vs-crusader) vs. cut for focus.
5. **Fleet micromanagement budget** — reuse army merge/split/forecast UX 1:1 to
   avoid doubling end-turn busywork (strongly recommended).
6. **Rebrand name** (decide last).

---

## 15. Risks (eyes open)

- **Scope:** this is a multi-phase pivot to a new identity, not a feature. Mitigated
  by the H0–H2 validation slice and by reusing the base heavily.
- **Market:** trade-network games are a narrower audience than "conquer the map."
  Mitigated by keeping the conflict legible and dramatic (blockades, Denmark-vs-
  League, wars) — not spreadsheets.
- **"Join" boredom** and **"Break" = generic conquest** — designed against in §4;
  must be honoured in implementation.
- **AI complexity:** teaching the AI three stances + naval + trade is the hardest
  lift (H7). Budget for it; lean on the real forecast, not new heuristics.
- **"How big" solitaire risk:** mitigated by Hansneid/rivals so growth always has
  antagonists (§10).
