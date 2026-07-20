# Sea of Coin — Design Notes

> Living design document. This file captures intent and direction; it is not a
> spec. Expect it to change often in early development.

## Vision

A compact browser strategy game about Hanseatic trade power. Depth comes from
interacting systems (routes, goods, Kontore, league politics, tolls, embargoes,
armies and diplomacy) rather than from art or spectacle. Think merchant ledger
with a sharp map:
low-art, high-decision-density, readable at a glance.

"4X-lite": the classic pillars — **eXplore, eXpand, eXploit, eXterminate** —
but trimmed to keep a single session short and the mental model manageable.

## Design pillars

1. **Systems over spectacle.** Every visual element maps to a number the
   player can reason about. No art asset exists purely for flavour.
2. **Legible complexity.** Many interacting systems, but each one is simple in
   isolation and clearly surfaced in the UI.
3. **Meaningful turns/ticks.** Each decision should visibly move the sim.
4. **Fast iteration.** Content lives as data; balancing is editing tables, not
   code.

## Intended systems (roadmap — not yet built)

- **Economy** — resources, production chains, storage, upkeep.
- **Population** — growth, happiness, jobs, food.
- **Territory** — tiles/regions, expansion, terrain modifiers.
- **Military** — units, recruitment, upkeep, combat resolution.
- **Diplomacy** — factions, relations, trade, war/peace.
- **Time** — turn or tick scheduler driving all of the above.

## Architecture

Plain TypeScript + Canvas 2D, bundled with Vite. Deliberately framework-free:
a systems-heavy sim benefits from a small, transparent core we fully control.

```
src/
  main.ts       entry point — boots the renderer
  systems/      simulation slices (renderer, economy, population, ...)
  ui/           HUD / panels (DOM+CSS over the canvas) + global styles
  data/         static content definitions (buildings, resources, tech, ...)
docs/           design + technical notes
assets/         minimal UI art (icons only)
```

Guiding separations:

- **Systems** hold logic and mutate game state; they don't touch the DOM.
- **UI** observes state and emits intents; it never mutates the sim directly.
- **Data** is plain, serialisable content consumed by systems.

## Current status

Infrastructure only. The app boots to a blank canvas with a working render
loop. No game systems are implemented yet.
