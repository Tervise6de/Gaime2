# Hansa Game Design

## Direction

Hansa is a compact browser strategy game about trade power around the Baltic and
North Sea. The centre of the game is not "paint the whole map"; it is building
routes, controlling Kontore, steering or resisting the League, taxing through
the Sound, embargoing rivals, and using war when trade politics fails.

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
