# Sea of Coin Game Design

## Direction

Sea of Coin is a compact browser strategy game about trade power around the
Baltic and North Sea. The centre of the game is not "paint the whole map"; it is
building routes, controlling Kontore, steering or resisting the League, taxing
through the Sound, embargoing rivals, and using war when trade politics fails.

The game uses one authored world: `data/maps/hansa.ts`, a fixed real-geography
board with 74 provinces and 16 historical realms.

## Design Pillars

1. **Trade first.** Routes, goods, Kontore, tolls and embargoes must be the most
   interesting economic layer.
2. **Politics around commerce.** Diplomacy is strongest when it affects trade:
   pacts, league membership, boycotts, access and war pressure.
3. **Readable board state.** The player should know who controls land, routes,
   ports and league influence at a glance.
4. **Short strategic arc.** A session should produce a distinct story without
   needing a grand-strategy campaign's bookkeeping.

## Current Core Loop

1. Set tax and production priorities.
2. Build regional economy, ports, civic buildings and military support.
3. Open Hansa trade routes from goods-producing regions to demanding Kontore.
4. Use league actions, tolls, boycotts, gifts, treaties and war to protect or
   disrupt trade.
5. Research technologies that strengthen economy, arms, stability and trade.
6. Win by domination or by leading the end-game prestige score.

## Removed Directions

The old bilateral trade button, extra map modes, setup presets and monument-race
victory have been retired. They pulled the design toward a broad 4X instead of a
Hansa-specific trade conflict.

## Victory

- **Domination:** control enough of the authored Hansa world to become the
  decisive territorial power.
- **Prestige score:** if the game reaches its turn limit, the strongest realm by
  regions, economy, tech and prestige wins.

Future victory work should make a Hansa-control race more explicit: Kontor
coverage, sea-lane value, league leadership and trade share should matter more
than raw land count.

## Characters

Characters should stay light. They are there to make politics memorable, not to
turn the game into a dynasty simulator.

Good fit:

- named rulers with epithets, traits and chronicle flavour;
- commanders attached to armies, with martial value and loyalty risk;
- one or two office-holder roles such as alderman, bailiff or burgomaster for
  city/trade bonuses;
- event text that remembers rulers, commanders, rebellions and league decisions.

Bad fit:

- family trees, marriages, fertility, inheritances and claim webs;
- inventories, XP builds or RPG equipment;
- dozens of minor courtiers with tiny modifiers.

The right target is "I remember who betrayed me at Riga", not "I manage a royal
household".

## Market Read

The idea has a sharper market angle than a broad browser 4X. "Hanseatic trade
war around the Baltic" is specific, ownable and easier to pitch visually: ports,
ships, Kontore, cloth, salt, amber, tolls and boycotts.

The risk is that players expect either a rich grand-strategy sandbox or a tight
economic board game. Hansa should choose the second lane: fast turns, readable
systems, hard trade-offs, and a strong map. If the game keeps land conquest
as the main fun, it competes badly with much larger games. If trade control is
the main pressure, it has a real niche.

## Resources — the Wares economy (v0.85 overhaul)

The abstract **"Materials"** resource is retired. In its place the game runs a
single, unified layer of **era wares** — the real commodities of the Hanseatic
trade (grounded in `hansa times.md` §5/§13). This *unifies* the two former
layers: the four-resource economy and the parallel trade-goods system become one.
A ware is now produced regionally, **stockpiled per nation**, and either
**consumed** to meet a need or **traded** to a Kontor for gold. What you can build
and whom you can arm now depends on which land you hold and what it yields.

### Three kinds of resource

1. **Gold** — the universal medium (treasury). Taxes + trade + tolls in; recruitment,
   upkeep and diplomacy out. Unchanged role.
2. **Knowledge** — research points toward techs. Abstract, not a physical ware. Unchanged.
3. **Wares (~16 physical commodities)** — the unified physical economy. Each has one
   or more **roles**:
   - **food** — feeds population (grain, herring, stockfish, beer).
   - **build** — construction & shipbuilding (timber, iron, brick, naval stores).
   - **arms** — recruitment beyond gold (iron, copper).
   - **luxury** — high-value export, little domestic use (furs, wax, amber, cloth, wine).
   Most wares are multi-role: iron builds *and* arms *and* trades; grain feeds *and*
   trades; timber builds *and* trades.

### The ware table (design targets; live numbers in `data/goods.ts`)

| Ware | Glyph | Roles | Sourced from | Trades to (Kontor) |
|------|-------|-------|--------------|--------------------|
| Grain | 🌾 | food, trade | plains | Bergen, Bruges |
| Herring | 🐟 | food, trade | coast | Bruges, London |
| Stockfish | 🐠 | food, trade | coast (north) / fishery | Bruges, London |
| Beer | 🍺 | food, luxury | plains + brewery | Bergen, Novgorod |
| Timber | 🪵 | build, trade | forest | Novgorod |
| Iron | ⚒️ | build, arms, trade | iron resource / hills / mountains | Bruges, London |
| Brick | 🧱 | build | hills / mountains + kiln | — (local) |
| Naval stores | 🛢️ | build, trade | forest / coast | London |
| Copper | 🟤 | arms, luxury | mountains + mine | Bruges |
| Salt | 🧂 | industry, trade | salt resource | Bergen, Bruges |
| Furs | 🦫 | luxury | forest | Novgorod, London |
| Wax | 🕯️ | luxury | forest | Bruges, London |
| Amber | 🟠 | luxury | amber resource | London, Bruges |
| Cloth | 🧵 | luxury, civic | weaving works | Bergen, Novgorod |
| Wine | 🍷 | luxury | vineyard works | Novgorod, Bergen |
| Honey | 🍯 | food, trade | forest | Bruges |

Consumption rules (targets): a building costs a small basket of **build** wares
(e.g. City Walls = brick + iron; a Shipyard = timber + naval stores); a unit costs
gold + **arms** wares (militia = a little iron; knights = iron + copper). Food is
reviewed below.

### Reviewing "Food" (landed, R3)

Food is no longer an abstract terrain scalar. It now comes from the **food wares**
a realm produces — grain (the staple), salted herring and stockfish, beer and honey
— each with a `foodValue` (data/goods.ts). Terrain gives only a little subsistence;
population eats from the food produced, and a shortfall drives famine/unrest exactly
as before. The historical hook is real and live: **fish only feeds a town if you
hold salt to preserve it** (`FISH_UNSALTED_MULT`), so the salt→fish chain gates a
fishery's food. The effect is a real **food geography** — plains feed themselves on
grain, a salted coast is a breadbasket, and forest/hill/mountain realms must trade
for grain or build farms. (Making famine bite harder is a future balance lever; the
model currently runs with ample headroom.)

## Research — the Doctrines system (v0.97 overhaul)

The old linear "collect every tech across five ages" tree is retired. Research is
now a run of **permanent identity choices**, grounded in the Hanseatic setting.

**Model.** Six **categories** — Commerce, Maritime, Production, Governance,
Military, Scholarship — each offer two or three **doctrine paths** that are
*mutually exclusive*. Committing to one path (completing any node in it) rejects
the siblings in that category for the rest of the game. Each path is a short
ladder of tier nodes unlocked in order (tier 0 from turn 1; tier 1 in the Age of
Crowns; tier 2 later), bought with knowledge. So a realm makes ~6 grand
decisions — "Open Markets *or* Balanced Control *or* Strong Monopoly", "Knightly
Orders *or* Town Levies" — each buying a distinct bundle and denying the rest.
That opportunity cost *is* the game; you cannot have everything.

**Effects** are declarative data (`data/techs.ts`), aggregated over a nation's
completed-node list so every consumer (economy, unrest, unlocks) is unchanged:
gold/food/knowledge yield %, ware-output %, a flat unrest change (negative on the
monopoly/absolutist paths — wealth breeds resentment), building/unit unlocks, and
a **trade-route income %** (`tradeMult`, wired into `systems/trade.ts`) — the one
new lever, central to a trade game. Prestige already rides on gold + trade + node
count, so the wealth doctrines feed the score without a bespoke hook.

**What doctrines gate.** Only the ~dozen *advanced* buildings (Counting House,
Guildhall, Hanse Hall, University, Printing House, Dom, City Walls, …) and the
five *premium* units (Knights, Siege, Pikemen, Swordsmen, Handgunners). The core
a realm always needs — the militia/infantry/ranged/cavalry loop, the everyday
buildings, the resource works and focus capstones — is **ungated** (buildable
from the start where terrain/resource/focus allow). This fixes the old
"can't raise an army until I research it" trap and keeps early play open.

**Commitment is on completion, not selection:** you may re-pick which opener you
study until one actually finishes, then that category locks. Factions that begin
with a free doctrine (e.g. Novgorod's Monastic Orders) are pre-committed to it.

**UI** (`ui/hud.ts renderTechTree`): a category sidebar, the chosen category's
paths as commitment columns, and a detail panel with the path's KEY EFFECTS and a
Start/Continue button — matching the mockup in `docs/`.

## Build plan — resource overhaul (R-series)

Each R-milestone leaves the game runnable, tested and playable end-to-end.

- **R1 — Wares foundation & Materials removal.** Ship the ~16-ware catalog, per-nation
  ware stockpiles, regional ware production, and rewire construction + recruitment
  onto build/arms wares. Remove `materials` from the core economy. HUD gains a wares
  ledger; build/unit costs show ware glyphs. Trade automatically enriches from the
  bigger catalog. Food stays abstract for now.
- **R2 — Trade & market depth (partly landed).** The AI now **produces to need** —
  it plants food buildings when its larder is low and develops ware industry when
  short of build wares (systems/ai.ts `chooseBuilding` hints). The Goods Ledger shows
  true (multiplier-scaled) per-ware output and income. *Still open:* deeper Kontor
  price/scarcity tuning and teaching the AI to open routes toward the richest demand.
- **R3 — Food review (landed).** Food now flows from the food-ware pool with the
  salt→fish preservation chain (see "Reviewing Food" above); population/famine ride on it.
- **R4 — Production chains & luxuries (landed).** **Hopped beer** and **wool→cloth**
  are manufactured wares: the Export Brewery now yields beer and a new **Weaving Works**
  (Guilds) spins upland **wool** into cloth. **Salted herring** — herring/stockfish
  routes pay a premium when the realm holds salt. **Luxury trade → prestige**: routes
  carrying furs/wax/amber/cloth/copper/honey/wool add to the score victory. Food values
  were tightened. *Adjusted from plan:* reliable "occasional famine" proved impractical
  without risking mass starvation — population is capacity-limited, so food stays a
  *geographic* constraint (hold food land or trade/farm for it) rather than a famine
  lever; the anti-snowball brake remains unrest, by design.

Guardrails unchanged: deterministic seeded RNG only, pure `GameState → GameState`
turn pipeline, `systems/` never touch the DOM, `data/` stays serialisable, tests
stay green, minor version bumps on every user-visible batch.
