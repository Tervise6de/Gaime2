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
   upkeep, diplomacy and — since R5 — the **town market** (buying wares) out. A
   treasury is now working capital, not just a war chest (see R5 below).
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
model currently runs with ample headroom.) **R5** adds a granary *reserve*: on a
shortfall the food-ware stockpile is consumed (grain first; the salt→fish chain still
applies) to cover the gap before famine strikes — so a stocked or market-bought larder
rides out a lean turn, and food wares in store are genuinely consumed, not inert.

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
- **R5 — Goods that content, gold that works (landed).** Closes the two dead-ends
  that made most wares "just a thing to trade" and the treasury "just a pile":
  - **Burgher contentment** (`systems/prosperity.ts`): a realm's towns crave the
    *pure* luxuries — furs, wax, amber, cloth, wool (`contentmentWares()`) — in
    proportion to the population they govern (`LUXURY_DEMAND_PER_POP`). Each turn the
    craving is met from the ware stockpile; the fraction met eases unrest **realm-wide**
    (`LUXURY_CONTENT_UNREST`, folded into `nextUnrest`). A carrot, never a punishment —
    unmet demand only forgoes the easing, so it never worsens famine. Luxuries finally
    have a home use, and the decision is real: **sell them for coin, or keep them to
    calm your towns.** The demand scales with the empire, so a large realm must invest
    in luxury industry (a Weaving Works) or import.
  - **The town market** (`systems/market.ts`): gold buys or sells any ware instantly at
    a spread deliberately worse than a Kontor route (`MARKET_BUY_MULT` 2× / `MARKET_SELL_MULT`
    ½× the good's value). The treasury becomes working capital — import grain against a
    lean turn, buy brick to rush a wall, muster arms in a hurry, or liquidate a glut —
    while the great Kontor trade stays the profit engine (routes pay far more). The rival
    AI uses it too (`manageMarket`), so a rival's gold has a job beyond armies.
  - **The food reserve** (`systems/turn.ts` + `drawFoodReserve`): a food shortfall now
    taps the food-ware stockpile (grain, salted fish, beer, honey — the salt→fish chain
    still applies) *before* it bites as famine. Food wares are genuinely consumed, and a
    stocked or market-bought larder rides out a bad turn. It only ever *reduces* famine.
  - HUD: the Goods Ledger shows each ware's stock and per-ware Buy/Sell controls, plus a
    burgher-contentment readout; the stability breakdown folds in the contentment easing.
- **R5.1 — Make it bite (landed, from balance sims).** Headless full-game runs showed
  R5's carrots were near-inert: unrest sat so low (~4) that contentment's only reward
  (−unrest) did nothing, the market was never exercised in healthy play, and the AI
  hoarded tens of thousands of gold with nothing to spend it on. Three fixes, each
  re-validated by the sims:
  - **Contentment → prestige** (`systems/victory.ts`, `CONTENT_PRESTIGE_PER_POP`): a
    realm that keeps its towns supplied with luxuries flaunts that comfort as renown, so
    luxuries matter for *winning* even when unrest is already low. Bounded (capped at full
    contentment), so it is a gold→luxuries→prestige sink, not a money pump.
  - **The AI plays its treasury** (`systems/ai.ts` `manageMarket`): a rival now spends
    gold like a player — buying luxuries to keep its burghers content, arms (iron) when
    war-minded and flush, a grain reserve or build wares on a shortfall, and dumping a
    glut when near-broke. It also builds a **Weaving Works** when short of contentment
    (`needLuxury` build hint). Rival contentment rose from ~70–90% to ~100%.
  - **Wealth → military** (`recruit` `wealthLevies`): a rich, aggressive realm turns its
    treasury into a bigger standing host (bought arms + ongoing upkeep), so gold buys
    power instead of piling up. Capped and aggression-scaled — a peaceful realm's hoard
    does not militarise. Sims confirmed warlike realms drain their hoards, rivals stay
    diverse (no snowball), and a wealth-using player ranks higher.
  *Open (a macro-economy question, not R5's):* a peaceful merchant realm can still
  accumulate gold — a rich trade republic has genuinely few sinks — a candidate for a
  future economy pass (gold-rushed construction, higher upkeep, or tax-income scaling).

Guardrails unchanged: deterministic seeded RNG only, pure `GameState → GameState`
turn pipeline, `systems/` never touch the DOM, `data/` stays serialisable, tests
stay green, minor version bumps on every user-visible batch.
