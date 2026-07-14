# Next 3 Developments

A living checklist for the current development cycle. Each item is one complete,
verified cycle (typecheck + tests + build + `fetch`-free bundle + browser
verification for UI + a temporary self-play probe for AI/balance changes),
committed and logged before the next begins.

Guardrails (every cycle): runtime `dependencies` stays `{}`; deterministic
seeded RNG (no `Math.random` in game logic); pure turn pipeline; `systems/`
never touch the DOM; never commit red; never force-push; no PRs.

1. **AI concentration of force** — the AI masses/merges armies to crack
   defenders no single stack can beat (biggest impact on challenge).
   *Status: ✅ done (2026-07-14).* Shipped alongside the game foundation it
   requires (map + economy + military + AI + prestige scoring + node+edge
   renderer), since none of that existed yet.

2. **End-game summary screen** — a real post-game overlay with the
   prestige-history graph and final scoreboard (data already exists in
   `state.scoreHistory`).
   *Status: ✅ done (2026-07-14).*

3. **Voronoi-polygon map renderer** — transformative visuals over the identical
   adjacency graph, shipped behind a toggle with the node+edge renderer as
   fallback.
   *Status: ⏳ pending.*
