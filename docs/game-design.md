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
6. Win by becoming the Hansa — its Kontore, wares, League and lanes — or, the
   slower way, by domination or the end-game prestige score.

## Removed Directions

The old bilateral trade button, extra map modes, setup presets and monument-race
victory have been retired. They pulled the design toward a broad 4X instead of a
Hansa-specific trade conflict.

## Victory

- **Hansa control (v0.110):** hold 60% of the trading world for six running
  turns. Control is four strands, weighted (`systems/hansa.ts`): the **Kontore**
  (0.35 — hold the town outright, or trade there for a third of the credit),
  your share of everything the network **carries** (0.30, by income, not route
  count), your **League** standing (0.20 — outside it, in it, or Alderman), and
  the **sea lanes** (0.15 — the coasts you hold and the water your hulls can
  deny). The hold is the point: a Kontor stormed or a lane blockaded resets the
  clock, so the race rewards keeping a network, not touching a number once.
- **Domination:** control enough of the authored Hansa world to become the
  decisive territorial power.
- **Prestige score:** if the game reaches its turn limit, the strongest realm by
  regions, economy, tech and prestige wins.

Trade is checked first, so a merchant who has held the network is not beaten to
the post by a conqueror crossing the land threshold on the same turn. Measured
over five 120-turn autoplays, no AI realm reached the threshold by incidental
play (they peak at 43–51%), so the trade win is a deliberate path rather than an
accident — but rivals now covet Kontor towns (`KONTOR_VALUE` in `ai.ts`), so the
race is contested.

## Rival AI — temperament and plan (v0.111)

A rival has two separate things, and conflating them is why every game used to
play the same way.

**Temperament** (`data/personalities.ts`) is what a realm is *like*: how readily
it wars, how far it trusts, how much it builds. It is fixed and historical —
Sweden's kings are warlike in every game, Lübeck's council mercantile.

**Strategy** (`systems/strategy.ts`) is what it is *playing for* — one of the
three victories: `conquest`, `commerce` or `prestige`. It is rolled fresh at the
start of every game, weighted by temperament but never locked by it, so a
warlord Sweden can spend this game building and a builder Estonia can go for the
throat. And it is re-read every turn: a merchant boxed out of the Kontore with a
big army will turn conqueror; a warlord whose host is spent but whose ports are
rich will turn to trade. Switching is sticky on purpose — a challenger must beat
the incumbent plan by `SWITCH_MARGIN` and a fresh plan gets `MIN_DWELL` turns of
grace — except for a realm at war and losing, which is allowed to panic.

A plan is play, not a label. It scales the standing-army target, the appetite
for opening a war, what a Kontor town is worth as a conquest prize, how many
trade routes the realm works toward, how many hulls it floats, and whether it
wants a League seat before it has trade to protect. The Diplomacy screen reports
each court's aim ("Our factors report: Lübeck is playing for the Hansa…"), since
a realm's intentions are read from its conduct.

## The trade race, rebalanced (v0.114)

v0.113 closed with a measurement: rivals peaked at ~40% of the trade race
whatever their armies did, because the two strands conquest cannot touch were
pinned near zero. This is the fix, and it starts with the instrument.

### The yardstick: a scripted player (`systems/scripted.ts`)

Every autoplay until now left the player's realm inert, so no number described
what a realm *played well* can reach — which is the only thing that can set a
victory threshold. `playScriptedTurn` is a competent, trade-first player as one
pure turn of intents: beeline the League charter, raise the Hanse Hall, keep the
route book full and pruned, found or join the League, end every war (one open
war with a member bars you from the League for good), keep a hull in every sea
it has a coast on, garrison and no more. It ships because it is unit-tested and
every future balance question wants a yardstick.

### What it measured

Twelve 160-turn autoplays, scripted player against the live rival AI:

| strand | weight | perfect trade play | why |
| --- | --- | --- | --- |
| Kontore | 0.35 | 0.35 | route access to all four; holding a town needs an army |
| Wares | 0.30 | **0.07** | share of *everyone's* route income, split fifteen ways |
| League | 0.20 | 0.55 | a seat; the Alderman's chair wants the most Kontore held |
| Sea lanes | 0.15 | **0.13** | averaged over all six seas, including ones it cannot reach |

Total: **25%** against a 60% threshold. The trade victory could not be won by
trading. Both weak strands were "share of the whole world" measures in a
sixteen-realm game, so they described how many rivals existed rather than how
well anyone traded.

### The two reshaped strands

**Wares** is now measured against the single strongest rival merchant:
`mine / (mine + best)`. Level with them is half the strand, twice their income
two thirds, sole survivor all of it. Adding more small merchants to the board no
longer dilutes a leading trader, and the bar stays exactly as hard however many
realms there are.

**Sea lanes** are now judged over a realm's *home waters* — the seas it has a
coast on — averaged over `max(seas, LANE_MIN_SEAS=3)`. The old all-six average
punished geography rather than play: a Baltic power holding every port it could
physically reach was capped near two sixths. The floor of three keeps the top
end honest — total command of one water is a third of the strand, not all of it.

Kontore and League are unchanged: they are absolute measures and they worked.

### Threshold and hold

`HANSA_VICTORY` stays at 60%; `HANSA_HOLD_TURNS` goes 6 → **12**. With the
strands fixed, six turns let a realm that founded the League while holding two
Kontore close the game at turn 26. Twelve is a window the board can answer in —
storm a Kontor, blockade a lane, boycott the leader, and the count resets.

### Where that leaves the race

Twelve seeds, threshold 60% / hold 12:

- scripted trade player peaks at **43%** (k31 w38 l59 s24) — good trade play is
  most of the way, and still needs a Kontor town or the Alderman's chair
- best single rival peaks at **53%**, and passes 60% in some seeds
- the race now **decides 3 of 12 games**, average turn 45, and both sides win
  it — one player Hansa victory and two rival ones across the twelve

Before this change it decided none, ever.

### Reading it

The Politics panel's Hansa card now breaks into its four strands, each showing
what it contributes against what it could (`Kontore 12 / 35`), with a hover line
on what would move it. One percentage says you are losing; four strands with
their weights say whether to buy a hull, open a route, raise a Hall or storm a
town.

## Campaigns — a rival's war aim (v0.113)

A rival's offensive horizon used to be one province deep: both target scorers
only weighed regions *adjacent to land it already held*, so a merchant playing
for the Hansa took a Kontor town if and only if it happened to border one. The
four Kontore are each a rival capital and three of them are nowhere near most
realms, so realms could want the network and have no way to go and get it.

A campaign (`systems/campaign.ts`) gives one realm one distant prize and a road
to it. The objective is chosen by prize ÷ distance — a Kontor town for a realm
playing commerce, a rival seat as well for one playing conquest, and nothing at
all for one playing prestige, which builds rather than marches. The road is a
Dijkstra path priced by what each province costs to cross: own ground 1,
barbarian 3, a realm already at war 4, a plain peace 9, a non-aggression pact
15, a sworn truce 22, an alliance 26 — so the planner prefers the long way round
to a betrayal, and will not draw a line over a truce it has already promised not
to break. Roads dearer than `MAX_ROAD_COST` are refused as fantasies.

The first province on the road the realm does not own is that turn's war aim.
It gets a prize weight in `bestTarget` and `focusTarget` that outranks the
ordinary terms, so the existing concentration machinery masses against it — the
staging is what makes this a campaign rather than a teleport. Idle armies march
toward it instead of the nearest border. And a realm will open a **war of
passage** on the peace standing in its way, at a wider power edge than a war of
hatred needs (`CAMPAIGN_WAR_CAUTION`), never against a truce or a pact. An aim
survives a change of plan for `CAMPAIGN_DWELL` turns — the levy is raised and
the host is on the road — and is dropped the moment the prize is taken. The
Diplomacy card reports it: "Their host is marching on the Kontor at Novgorod,
by way of Riga."

**Measured, over twelve 160-turn autoplays.** Campaigns work: Novgorod fell to
Finland, Lithuania, Estonia and Poland across the seeds, Bergen to Denmark, and
half again as many Kontor towns change hands (46 against 31). The board is
livelier — realms at war on about 2.0% of realm-pairs an average turn against
1.1% without campaigns — and the trade leader's ceiling is unchanged at ~40%.

**What this does not do, and why.** It does not make the Hansa race winnable for
a rival, and the reason is not the marching. The leader's control breaks down
the same way in every seed: Kontore ~43, League 100, **wares ~11, lanes ~0**.
The two strands conquest cannot touch are worth 0.45 of the 0.6 threshold —
ware share is one realm's slice of route income split fifteen ways, and lane
control wants held coasts and uncontested hulls across six seas. Holding all
four Kontore and leading the League comes to about 0.55. So the trade victory as
weighted today is, for anyone, a Kontor-conquest victory with a trade veneer;
the next real work on it is the strand weights or the threshold, not the AI.

## Diplomacy — a word is worth something (v0.112)

Two things made the diplomacy layer read as arbitrary, and both are about the
game withholding information or consequence rather than about the numbers.

**A peace binds for a term.** Ending a war swears a truce of `TRUCE_TURNS` (10)
turns, held in `GameState.truceUntil` per realm pair. Inside it the AI will not
open a fresh war — checked both in `wouldBreakTreaty` and, crucially, at the
`mayStrike` gate in `systems/ai.ts`, which on a plain peace never consulted the
treaty test at all. The player *may* break it, and is charged for it: −12 with
the injured realm and −14 with every third court, which is the steepest
third-party mark in `TREATY_BREAK` — a broken truce is a public act. The
diplomacy card shows the turns remaining and the declare-war dialog quotes the
exact costs before the player commits. Measured over three 120-turn autoplays
war is still ordinary business: 0.4–2.4% of realm pairs at war on an average
turn, 0.8–1.5% cooling under truce, 3–5 concurrent wars at the peak.

**A demand states its case.** A tribute demand used to be one line and two
buttons, so paying or refusing was a coin-flip. `tributeStakes()` now returns
the reason (their power edge, the shared border, their regard for you), what
paying does, and what refusing does — every figure computed from the same
mechanics the buttons run, so the card cannot promise what the sim will not do.
The war warning is shown only when refusing would really put the demanding realm
past its own war test (border + hostility + a power ratio over `1.5 −
aggression`). Buttons read "Pay" / "Refuse", not "Accept" / "Reject".

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

## Military — time-true land & sea (v0.98–v0.100)

The army roster is drawn from the era's own land warfare (`hansa times.md` §10) —
the mail→plate, crossbow, pike and gunpowder-shot ladder — and now aligns with
the two Military doctrines:

- **Core (ungated):** Town Militia (spear levy) → Men-at-Arms (armoured foot) →
  Crossbowmen (windlass crossbow) → Mounted Sergeants (light horse). A realm
  always has a working four-unit counter loop.
- **Chivalric Orders doctrine:** Knights (the crusading orders' plated horse) and
  Bombards (cannon that batter walls).
- **Town Levies doctrine:** the burgher pike-and-shot — Pikemen → Swordsmen →
  Handgunners.

Every unit id, stat and the counter loop are unchanged from the abstract roster;
only the names, flavour and doctrine gates are era-true.

### Navy (v0.100)

The Hansa fought at sea with **armed cogs** and, later, **gun-armed carracks**
(§8, §10). Three warships build **only at a coastal port**:

- **War-Cog** — ungated coastal workhorse (any port).
- **Hulk** — the bigger castled carrier; **Maritime → Naval Power → War Cogs**.
- **Carrack** — the carvel gun platform (heavy bombard); **Naval Power → Ship
  Bombards** (needs iron for its guns).

So committing Maritime to **Naval Power** (over Merchant Marine) is what turns a
realm into a sea power — navy is wired straight into the doctrine tree. Any army
holding a warship is a **fleet**: it is **coast-locked** (it may only sail to
coastal regions, never march inland) and fights with the shared combat resolver —
ships bring a killing volley (naval gunnery) and siege power (bombarding a port's
walls), so a fleet can defend your coast, break an enemy fleet, or bombard-and-
assault a coastal province. A mixed stack (troops + ships) is an amphibious force
the fleet carries along the shore.

### Navigable sea areas (v0.102)

The open water is now drawn as named **sea areas** — the Norwegian Sea, the North
Sea, the Kattegat, the Baltic, Bothnia and the Gulf of Finland — and those labels
are backed by functional zones in `data/sea.ts`. Fleets keep their last port as
an anchor while sailing between adjacent zones. A mixed stack carries its land
units aboard, can fight an interception with the shared combat resolver, and can
land at any coastal region touched by its current zone. Rival AI realms recruit
war cogs, patrol their trade approaches and seek hostile sea lanes.

**Hulls cannot hold ground (v0.105).** A stack with no soldiers aboard may sail,
blockade, intercept and put in at its own ports, but it cannot enter — and so
cannot take — a region its realm does not already hold. Taking a shore needs
troops in the hold; otherwise a lone war cog would sweep up undefended ports.

**Ships support a landing, they do not storm it (v0.106).** In a land assault the
storming party is the stack's *soldiers*. Its hulls stand off: they strip the
walls with their guns (their siege power counts against the fortification) but
add no melee strength and take no casualties, and they are still there when the
assault is over. So an amphibious force is judged by the troops it lands, not by
the tonnage that carried them. On defence a fleet in port still fights — sailors
man their own walls; it is storming a hostile shore that needs soldiers.

**Drawing the sea (v0.107).** Each zone carries a `depth` (0 shoal → 1 blue
water, scaled from the real mean depths), and the renderer washes its water with
it — pale green shelf over the Kattegat and the Baltic basins, cold dark over the
Norwegian Sea — so the zones fleets sail between and blockades bite in are
visible rather than implied. A compass rose and its rhumb lines sit in the
western ocean, drawn under the landmass. All presentation: no rule reads `depth`.

**Rivers (v0.108).** Ten great rivers — Thames, Rhine, Weser, Elbe, Oder,
Vistula, Memel, Düna, Kymi, Volkhov — are drawn from `data/rivers.ts`, where each
is a chain of region ids rather than coordinates. Every link is a real map
adjacency (tested), so a course cannot wander into the sea, and the renderer
trims the mouth at the coastline. They are decoration today; if river trade ever
becomes a rule, the data already says which provinces a river connects.

**Blockade and escort (v0.106).** A hostile squadron on a route's sea does not
close the ocean, it throttles the traffic: the route pays 20% while it is hunted.
Sail your own hulls (or a formal ally's) into every threatened sea and the convoy
fights through for 60% — the answer to an enemy squadron is your own squadron,
not the loss of the trade. The route HUD names the sea and the state
("blockaded (Baltic Sea)" / "escorted"). Land-side severance — an enemy astride
the road, the Sound closed, a League shut-out — still pays nothing at all.

Trade routes derive the zones touched by their port/lane and stop paying when a
hostile fleet occupies one of them. The route HUD calls this out as a blockade;
the existing Sound and League disruptions remain separate reasons. Land armies
still cannot enter open water, and a fleet at sea is not counted as a regional
garrison or zone of control.

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
- **R6 — Renown: the treasury's endgame job (landed).** The R5.1 "open item" above,
  closed. Balance sims showed a dominant realm's tax income outruns every sink, so gold
  piled up inert (rivals hoarding 20k–51k). Now coin held beyond a **working reserve**
  (`TREASURY_RESERVE`) is reinvested each turn into **lasting renown** — civic works,
  patronage, endowments — at a bounded rate (`RENOWN_INVEST_MAX` gold → `renown` at
  `RENOWN_GOLD_COST` per point). Renown never decays and counts one-for-one toward the
  prestige score (`systems/victory.ts`), so a merchant republic's wealth becomes its
  renown — the "win by commerce" fantasy made concrete. The reserve stays liquid for the
  market, musters and gifts, so nothing is starved. Sims (160-turn runs): peak rival
  hoards fell from ~51k to ~5k, renown settled at ~28% (max 39%) of a rich realm's score
  — a real trade-victory path, not a dominant one — with no bankruptcies and rivals as
  diverse as before. Serialisable (`Nation.renown`, no back-fill needed); the HUD's "This
  world" card shows it once earned.

Guardrails unchanged: deterministic seeded RNG only, pure `GameState → GameState`
turn pipeline, `systems/` never touch the DOM, `data/` stays serialisable, tests
stay green, minor version bumps on every user-visible batch.
