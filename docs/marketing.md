# Marketing & positioning

Working messaging for launch. The game is a browser-based **Kingdom Management /
4X-lite** strategy game (working title *Gaime2* — a placeholder; see §7). This
doc is the source of truth for how we talk about it.

> **The one-line pitch:** *A whole 4X in a browser tab — no install, no account,
> no network. The empire, the rivals, and the AI all run on your machine.*

---

## 1. What actually makes it different

Three stories, and every one of them is literally true (not aspirational):

1. **Zero friction.** Click a link and you're ruling a kingdom in under a
   second. No download, no launcher, no sign-up. Runs on a locked-down
   school/work laptop, a Chromebook, or a phone — anywhere with a browser.
2. **Genuinely offline & private.** The rival AI, the economy, the entire
   simulation run *locally in the tab*. The built bundle makes **zero network
   calls** (we assert it in CI: `grep -c 'fetch(' dist/…` must be 0). No
   telemetry, no ads, no accounts, nothing phones home. Play on a plane.
3. **Systems over spectacle.** Deterministic, seeded worlds you can *share*;
   interacting economy, population, unrest, a military counter-loop, diplomacy
   and a branching tech tree; three balanced victory paths; an anti-snowball
   unrest brake; colour-blind and reduce-motion accessibility built in.

Supporting proof points:
- **Tiny & dependency-free:** ~54 KB of gzipped JS, `dependencies: {}`. Loads
  instantly, installs as a PWA, works offline after first visit.
- **Short, replayable sessions:** a game runs ~60–150 turns (median ~100),
  ~1–2 hours — a satisfying arc in one sitting, not a 12-hour campaign.
- **Shareable seeds:** same seed → identical world and AI. Screenshot a brutal
  opening and challenge a friend to the same war.

## 2. Positioning statement

For strategy players who want real 4X depth without the install, the account,
or the all-nighter, *[Game]* is a browser 4X you can start in one click and
finish in an evening — with a rival AI that runs entirely on your own machine,
so it works offline and shares nothing. Unlike big-box 4X titles (heavy
installs, online launchers) or most web games (thin, ad-supported), *[Game]* is
deep, private, deterministic, and free.

## 3. Taglines (to A/B test)

- Spreadsheets with a crown.
- No install. No account. No network. Just the throne.
- Share a seed. Settle the score.
- The empire, the rivals, and the AI — all in your tab.
- Explore, expand, exploit, exterminate. Offline.
- A 4X that fits in a browser tab.

## 4. Audiences & channels

| Audience | Where | Angle |
|---|---|---|
| 4X / grand-strategy fans wanting a short fix | r/4Xgaming, r/civ, indie-strategy Discords | "Civ depth, one-evening length, one-click start" |
| Web-games / casual-desktop players | itch.io, r/WebGames, r/playmygame | "Full strategy game, no download, plays on your phone" |
| Engineers / privacy crowd | **Show HN**, Lobsters, Mastodon fedi | "Offline, deterministic, zero-dependency, in-browser AI opponent — no network calls, ever" |
| Accessibility community | a11y gaming spaces | "Colour-blind-safe palette + reduce-motion, keyboard-playable" |

**Growth loop:** shareable seeds are built-in virality — a seed string is a
challenge you can post anywhere. Lead art = the crest/wordmark title screen +
a Voronoi territory-map screenshot (the most legible, "designed" view).

**Show HN framing** (highest-leverage single post): title along the lines of
*"Show HN: A browser 4X whose AI opponent runs locally — no server, no network
calls."* Lead with the engineering constraints (deterministic seeded RNG, pure
`GameState → GameState` turn pipeline, rule-based AI, `dependencies: {}`), link
straight to a playable build, mention the offline/privacy guarantee up front.

## 5. Launch checklist (marketing side)

- [ ] Final name + wordmark locked (blocks everything — see §7).
- [ ] One-click playable build on a stable URL (itch.io embed + direct link).
- [ ] 3–5 screenshots: title screen, territory (Voronoi) map, region panel,
      diplomacy, end-game standings. All in dark theme; one colour-blind variant.
- [ ] A 20–30s silent screen-capture GIF/clip of a turn resolving (map ripples,
      resource counters ticking, an event card).
- [ ] Store/PWA icons at required sizes (192/512 exist; add platform sizes).
- [ ] Short store blurb (see §6) + the Show HN post drafted.

## 6. Store blurb (draft, ~100 words)

> Rule a kingdom in a browser tab. *[Game]* is a compact 4X strategy game —
> explore a procedurally generated realm, grow your economy, keep your people
> from revolting, raise armies through a rock-paper-scissors counter-loop, and
> outmanoeuvre rival powers by war, wonders, or sheer prestige. Every world is
> seeded and shareable; every rival is a local AI that needs no server, no
> account, and no network — the whole game runs on your machine and works
> offline. No install, no ads, no tracking. One click to start, one evening to
> win. Free.

## 7. The blocker: the name

*"Gaime2"* is a placeholder and no marketing survives it — a real name +
wordmark is the single gating decision before any launch push. It should evoke
rule/realm/strategy, be short, and be a clean domain/handle. Directions to
explore (not final): **Realmspan, Suzerain, Crownfall, Thronework, Kelmoor,
Marchlands, Regnum, Overreach, Petty Kingdoms, Tessera** (nods to the Voronoi
map). Once chosen, it's a one-line copy edit in the title screen (the wordmark
renders as DOM text by design) — no art rework needed.
