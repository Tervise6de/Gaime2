# Hansa Alignment Plans

> **What this is.** Four focused, easy-to-read plans that measure what Gaime2 has
> **today** against the sourced history in **`hansa times.md`**, and say plainly
> **what to change**. Each item is tagged by effort:
> 🟢 = data-only (edit a table, low risk) · 🟡 = a system tweak · 🔴 = a new system.
>
> These are **proposals for sign-off**, not committed changes. They slot into the
> milestone roadmap already in `docs/hansa-plan.md` (H0–H9); where they do, it's noted.
>
> Compiled 2026-07-19 against `hansa times.md` and the current codebase.

---

## Plan 1 — Building list: what to correct

### Where we are
30 buildings in `src/data/buildings.ts`, almost all **generic 4X / Roman-ish**:

`farm · workshop · market · harbor · mine · library · temple · aqueduct ·
university · bank · guildhall · forum · fortress · wonder · granary · barracks ·
lighthouse · monastery · watchtower · courthouse · printing_house · cathedral`
plus resource works (`stable`, `bloomery`) and 5 focus capstones
(`manor, charter_fair, foundry, athenaeum, citadel`).

**Problem:** several are anachronistic for the Baltic 1250–1550 (aqueduct, forum,
athenaeum are Greco-Roman), and the set says nothing "Hansa." The history hands us
a ready-made, **all-attested** building vocabulary (`hansa times.md` §6).

### What history says (§6)
The signature style is **Brick Gothic**. Attested building types:
Brick-Gothic **Church** (Marienkirche — inspired 70+ daughter churches) · **Rathaus**
(town hall, merchant-council government) · **Speicher / Salzspeicher** (warehouse /
salt store) · **Kontor** compound (walled foreign trading post) · **City Gate & Walls**
(Holstentor) · **Roland statue** (civic-freedom / market-rights monument) · **Export
Brewery** (hopped beer) · **Canal** (Stecknitz, 1398 — Europe's first summit canal) ·
gabled **Merchant's House**.

### The plan — a single data-only pass, in three moves
**Move A — Reskin (🟢, keep every mechanic, just rename + reblurb).** Highest
flavour-per-effort. Mechanics/costs/yields stay; only `name`, `blurb`, icon change.

| Current | → Hansa name | Keeps (mechanic) |
|---|---|---|
| temple | **Brick-Gothic Church** | unrest ↓ + faith |
| cathedral | **Dom (Brick-Gothic Cathedral)** | prestige / faith |
| courthouse | **Rathaus (Town Hall)** | law / unrest ↓ |
| granary | **Speicher (Warehouse)** | storage / food |
| forum | **Marktplatz (Market Square)** | trade / gold |
| bank | **Counting House** | gold |
| guildhall | **Guildhall / Kontor-hall** | trade (already apt) |
| fortress / citadel | **City Walls & Gate (Holstentor)** | fortification |
| watchtower | **Coastal Beacon** | vision / fort |
| aqueduct | **Public Wells & Cistern** | pop capacity |
| university / athenaeum | **Latin School** | knowledge |
| charter_fair | **Chartered Fair** | trade (already apt) |

**Move B — Add the signature buildings we lack (🟡, new data rows + small hooks).**
| New building | Effect | Ties to |
|---|---|---|
| **Salzspeicher (Salt Store)** | storage + trade capacity; gated by salt | Trade (Plan 3), salt strategic |
| **Roland Statue** | civic-freedom monument: unrest ↓ + a stability/prestige buff | mini-wonder |
| **Export Brewery** | manufacturing: produces **hopped beer** (export good) | Trade (Plan 3) |
| **Stecknitz Canal** | logistics: trade-lane / adjacency bonus | Great-Works tier |
| **Kontor** (compound) | foreign-trade node / diplomacy reach | Kontore system (Plan 4) |
| **Shipyard** | builds cogs; coast-only, timber cost | Naval (Plan 3), roadmap H2 |

**Move C — Retire or fold the clearly off-theme (🟢).** Drop or merge `forum`,
`aqueduct`, `athenaeum` once Move A/B cover their role, so the menu stays tight.

**Sequencing.** Move A can ship immediately (pure rename, zero balance risk). Move B
lands with the trade/naval slices it feeds (roadmap H2/H4). **Recommendation:** do
Move A now as a "flavour pass," schedule Move B alongside Trade goods.

---

## Plan 2 — Populations & army sizes of the period

### Where we are
- **Population:** `POP_SCALE = 1000` (1 sim unit = 1,000 people). Hansa regions show
  ~**5,000–15,000** with capacities to ~15k. Roughly uniform across provinces.
- **Armies:** `SOLDIERS_PER_UNIT = 250` (1 unit = a ~250-man company). Each realm
  **starts with 1 stack** = militia×2 + infantry×1 = **750 soldiers**; garrisons
  ~250–1,250; field stacks grow to ~1k–3k.

### What history says (§11, §4, §10)
- **Towns were small.** Bremen **~12,000–15,000**; Hamburg **~12,000** (lost >6,000 —
  about half — to plague in **1350**). Lübeck, the "Queen," was the largest. The
  Bergen Kontor housed up to **~2,000** traders; Novgorod's Peterhof only **100+**
  German merchants at peak.
- **No standing army.** The League **never kept a standing army or navy** (§3, §12).
  It fought with **armed cogs, ad-hoc chartered town fleets, and hired mercenaries**.
  Land field armies of the era were **small** (hundreds to a few thousand); the giant
  hosts (Grunwald 1410; Constantinople 50–80k) were exceptional set-pieces, not norm.

### The plan
**Verdict: our *scales* are already historically sane — the fix is differentiation
and framing, not renumbering.** 250 men/company and 750–3,000-man armies sit right
in period; 5–15k towns match Bremen's ~12–15k.

1. **Differentiate town size (🟢 data).** Seed a **hierarchy** instead of a flat
   5–15k: hubs (Lübeck, Bruges, Novgorod, Bergen, Danzig, Visby) **15–20k**; ordinary
   ports **4–8k**; hinterland provinces **2–5k**. Capacity keyed to coastal/Kontor
   status. Anchor the top of the range to the sourced ~15k "big town."
2. **Black Death event (🟡 → real content).** A dated **1350 plague** that **halves
   a struck region's population** and dents its output for a few turns — the sources
   document ~50–60% mortality in Hamburg/Bremen. Dramatic, historical, and it uses
   the very trade network as the vector (arrived by ship). *(Roadmap: Events.)*
3. **Lean into "no standing army" (🟡 framing + tuning).** Keep armies small and
   **expensive to hold** (upkeep already does this); make the **fleet + economic
   coercion** the real muscle (blockade/boycott — Plan 3 & 4). Consider renaming
   national "soldiers" → **retinues / town levies / hired men** in the UI so a
   merchant league doesn't read like a nation-state army.
4. **Numbers to lock (design targets):** company = **250 men** (keep); typical field
   army **500–2,000** (2–8 units); rare doom-stack **~5,000**; town garrison
   **250–1,000**. All within the sourced envelope.

---

## Plan 3 — Naval vessels, Trade, and Army (three sub-plans)

### 3A — Naval vessels
**Where we are:** no naval units yet. We *do* now draw a **cog** on the map when an
army crosses water (shipped this week) — the visual seed of the layer.

**What history says (§8):** the **cog (Kogge)** is the workhorse — clinker oak, single
mast, single square sail, stern rudder, 15–25 m, 30–200 tons (the **Bremen Cog c.1380**
is the reference). It was succeeded by the **hulk**, then by the **carrack** (carvel,
three-masted, **high-sided, cannon-armed** — the military leap), while the Dutch
**fluyt** (cheap, huge hold) later **undercut Hanseatic shipping on cost**. Two clean
tech transitions: **clinker→carvel** and **one-mast → three-mast + guns**.

**The plan (🔴 new layer — roadmap H2/H3):**
- **Ship line, era-gated:** Longship/Raider → **Cog** (trade + escort) → **Hulk**
  (bigger cargo) → **Carrack** (carvel, carries cannon — the warship) → *Fluyt as a
  late **rival/economic** unit that erodes your trade edge* (a built-in external clock).
- **Roles:** Trader/Transport, Escort/Warship, Raider — mustered at a **Shipyard**
  (coast, timber cost), upkeep in gold.
- **Sea zones as nodes**, fleets occupy/**blockade**/escort; **naval combat reuses the
  existing combat resolver**; islands become defensible (fixes "walk onto Gotland").
- **Gate the two transitions as tech** (clinker→carvel, +guns) so the ship line tells
  the historical story.
- **Reuse the cog art we just built** as the Trader/Cog unit sprite.

### 3B — Trade
**Where we are:** 4 goods (`grain, timber, furs, iron`) in `data/goods.ts`; 4 Kontore
(London/Bruges/Bergen/Novgorod); routes pay flat gold each turn. No scarcity, tolls,
or chains. Note **iron is both a "good" and a strategic resource** — a conflict to reconcile.

**What history says (§5):** the real staples are **Salt** ("white gold," Lüneburg —
preserves fish), **Herring & Stockfish** (the staple; Stralsund 1370 gave a **Baltic
fish monopoly**), **Grain** (Prussia/Poland via Danzig), **Timber & naval stores**
(pitch/tar), **Furs & Wax** (Novgorod), **Amber** (Prussian coast), **Wool/Cloth**
(English — the flashpoint), **Hopped Beer** (Wendish breweries). Trade is **chains**,
not raw nodes.

**The plan (🟡→🔴 — roadmap H4/H5):**
- **Expand to ~6–8 goods:** add **salt, herring, amber, beer** (and later wax, cloth)
  to the existing 4. Keep them on terrain/resource we already have.
- **Model 3 signature chains:** `Salt + Herring → Salted Herring`; `Cod → (Bergen)
  Stockfish`; `Grain + Hops → Hopped Beer`. This creates real "deny-the-input" tension.
- **Salt as a strategic resource** that **gates the fish economy** (Lüneburg node).
- **Scarcity / monopoly pricing** (the Stralsund fish monopoly = a trade windfall event).
- **The Sound (Øresund) toll** — a chokepoint zone whose holder **taxes traffic** (the
  built-in Denmark-vs-League weapon).
- **Reconcile iron:** treat iron as a **good/strategic for units**, and let **salt &
  amber/furs** be the *luxury* strategics (Plan 4).

### 3C — Army (land)
**Where we are:** a sound counter-loop — `militia, infantry, ranged, cavalry, siege`
+ premium tier `pikeman, handgunner, swordsman, knight`; strategics iron/horses.

**What history says (§10):** the real arc is **Militia/Spear → Men-at-arms (mail→plate)
→ Crossbow/Longbow (cranequin crossbow counters plate) → Pike block (Swiss, anti-
cavalry) → Arquebus/Hand-gunner (gunpowder) → Pike-and-shot**; sieges evolve
**bombard vs. curtain wall → star fort (trace italienne)**.

**The plan (🟢→🟡 — mostly reskin, the loop already fits):**
- **Reskin to period names** (our roster already maps almost 1:1): militia→**Town
  Levy/Spearmen**, infantry→**Men-at-arms**, ranged→**Crossbowmen**, pikeman→**Pike
  Block**, handgunner→**Arquebusiers**, knight→**Men-at-arms (mounted)/Knights**,
  siege→**Bombard**.
- **Add the star fort** as a **late fortification tech** (trace italienne) — the
  defensive answer to bombards, extending the Holstentor→star-fort story.
- **Tie premium units to the right eras/techs** so the army visibly modernises
  (plate → gunpowder) across the game.
- **Keep it small** (Plan 2): the land army is *pressure*, the fleet + trade is the game.

---

## Plan 4 — Already-developed systems that need a relook

These are places where **what we built** quietly clashes with the Hansa identity.
Prioritised; several are already owned by `docs/hansa-plan.md`.

| # | System (today) | The tension vs history | Relook (effort) |
|---|---|---|---|
| 1 | **Strategic resources = iron/horses** | The signature Baltic strategics are **salt** (white gold) and **amber/furs** (luxury); horses are peripheral to a sea league. | Add **salt + amber** as strategics; keep iron for units; keep horses for the land/Teutonic factions. 🟡 |
| 2 | **Kontore are passive route endpoints** | Historically **extraterritorial corporations** with treasury/court/aldermen — and the prize Breakers **seize/expel** (London 1469, **Novgorod closed 1494**). | Make Kontore **contestable objects** (seize / expel / close events), not just lane ends. 🔴 (roadmap H5) |
| 3 | **Faith is a headline system** (temples/cathedrals/monasteries + faith mechanic) | `hansa-plan` demotes faith to **flavour**; the era's real religious beat is the **Reformation / Count's Feud (1534–36)**, late. | Trim religious-building prominence; keep pagan-vs-crusader as texture; add a late **Reformation** beat. 🟡 |
| 4 | **Victory = domination / wonder / score** (generic 4X) | The identity is the **League-control race** (Kontore + sea-lane share + leadership). | Add the **Hansa-control meter** as the primary race; old paths become "Break/kingdom" & "how-big" fallbacks. 🔴 (H6/H7) |
| 5 | **Plays as a territorial nation-state** (own regions, field national armies) | The Hansa's defining trait is **economic power without a state** (no army/navy/treasury). | Make **boycott/blockade** first-class weapons; build the **League-without-a-state** institution. 🔴 (H6) |
| 6 | **Branding: "Petty Kingdoms" / gaime2** | Placeholder identity; `hansa-plan §9` wants a rebrand (avoid bare "Hansa"). | **Rebrand last**, after mechanics prove out (candidates: *The Merchant Sea*, *Kontor*, *Salt & Amber*). 🟢 |
| 7 | **Combat "soldiers" wording** | A merchant league fields **hired men / town levies**, not a national army. | UI wording pass: retinues / levies / hired men. 🟢 |
| 8 | **Map lacks special nodes** | History pins wealth to **specific places** (Lüneburg salt, the amber coast, the Sound). | Seed **special resource nodes** (salt, amber) + the **Sound chokepoint**. 🟡 (H1) |

**Already done (so we don't re-plan it):** the **eras** are renamed to the Hansa arc
(Trade Dawn → Gotland Age → League Rises → Peak of the Hansa → The Turning) and the
**calendar stretch** (year-per-turn) is in — roadmap **H0 is complete**. The **cog map
sprite**, **marching/travel time**, and the **combat-forecast fix** shipped this week.

---

## Suggested order (if you want a single thread to pull)

1. **Plan 1 Move A** (building reskin) + **Plan 3C** (unit reskin) + **Plan 4 #6/#7**
   — one **🟢 flavour pass**, no balance risk, big identity win.
2. **Plan 2 #1** (town-size hierarchy) + **Plan 2 #2** (Plague event) + **Plan 4 #1**
   (salt/amber strategics) — grounds population & resources in the sources.
3. **Plan 3B → 3A** (Trade goods/chains, then the Naval layer) — the roadmap's
   H4→H2/H3 heart, where "economic warfare on a contested sea" becomes real.
4. **Plan 4 #2/#4/#5** (Kontore as objects, League-control victory, economic coercion)
   — the H6/H7 identity payoff.
