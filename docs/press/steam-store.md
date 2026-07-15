# Steam store-page package — Petty Kingdoms

Everything needed to stand up a **Coming Soon** page and start collecting
wishlists. Copy is ready to paste; assets are in `docs/press/` (real gameplay
screenshots + starter capsules). See the checklist (§7) for what's still needed
before a public push.

- **Game:** Petty Kingdoms
- **Developer / Publisher:** GAIME
- **Genre:** Strategy · 4X · Turn-Based
- **Players:** Single-player
- **Platforms:** Windows / macOS / Linux (webview-wrapped build — see §8) + the
  free browser version as the demo funnel.
- **Suggested price:** $6.99–$9.99, with the browser build as a free demo. (Your
  call — validate with wishlists first.)

---

## 1. Short description (≤ 300 chars — the blurb under the trailer)

> A whole 4X in one tab-sized game. Rule a realm, grow its economy, keep your
> people from revolting, and outwit rival powers by war, wonders, or prestige.
> Every world is seeded and shareable; every rival is a local AI. Deep, fast,
> deterministic — one evening to win.

## 2. About This Game (full description — paste into the rich-text editor)

**Petty Kingdoms is a compact 4X strategy game about small realms with big
grudges.** No sprawling all-nighter — a full game is a satisfying evening: you
explore a procedurally generated realm, build an economy, manage a restless
population, raise armies, and out-manoeuvre rival powers for the crown.

Depth comes from **interacting systems, not spectacle.** Every number on screen
is a lever you can reason about:

- **Economy & population** — terrain feeds a production web of gold, food,
  materials and knowledge. Grow your regions to their capacity, but watch
  food (famine bites) and gold (bankruptcy disbands your troops).
- **Unrest, the anti-snowball brake** — high taxes, over-expansion and fresh
  conquests raise unrest; a province left to seethe secedes to rebels. Temples,
  civics and a stationed garrison calm it. Runaway empires pay for their reach.
- **A five-unit counter loop** — militia, infantry, ranged, cavalry and siege
  form a rock-paper-scissors of composition. "Spam the strongest unit" never
  wins; siege alone cracks fortifications.
- **Diplomacy with teeth** — war, peace, non-aggression pacts, alliances, gifts,
  tribute and trade routes. Rivals have personalities and read your weakness —
  a realm in crisis is a tempting target, and they know it.
- **A branching tech tree & three paths to victory** — dominate the map,
  complete your Great Works, or lead on prestige when the clock runs out.
- **Bounded random events** — harvests, plagues, festivals, uprisings and
  hard choices that reward a resilient realm.

**Play it anywhere, keep it forever.**

- **Runs on your machine, offline.** The rival AI is plain local code — no
  server, no account, no LLM, no key. Nothing phones home.
- **Seeded & shareable.** The same seed produces the same world and the same
  rivals. Screenshot a brutal opening and challenge a friend to the exact war.
- **Fast & readable.** Loads instantly, plays with mouse or keyboard, and a
  colour-blind-safe palette and reduce-motion options are built in.

Rule well, or rule what's left.

## 3. Feature bullets (the "key features" list)

- Deep, interacting 4X systems — economy, population, unrest, military,
  diplomacy, tech — in a game you can finish in an evening.
- Local rule-based AI rivals with distinct personalities. 100% offline.
- Procedurally generated, **seeded & shareable** worlds.
- Five-unit tactical counter loop; abstract, fast combat.
- Branching 16-tech tree and three victory paths (domination / Great Works /
  prestige).
- An anti-snowball unrest system that keeps every game competitive.
- Colour-blind-safe palette, reduce-motion, keyboard play.
- Tiny, dependency-free, and privacy-respecting — no ads, no tracking.

## 4. Tags (pick ~15, most important first)

Strategy · 4X · Turn-Based Strategy · Grand Strategy · Indie · Singleplayer ·
Economy · Diplomacy · Procedural Generation · Political Sim · Minimalist ·
Replay Value · Offline · Historical · Management

## 5. System requirements (webview-wrapped build)

Trivial — it's a lightweight app:

- **OS:** Windows 10+, macOS 11+, or a modern Linux desktop.
- **Processor:** Any 64-bit CPU from the last decade.
- **Memory:** 512 MB RAM.
- **Graphics:** Any integrated GPU (2D canvas only).
- **Storage:** ~100 MB.
- **Additional:** No network connection required.

## 6. Screenshots (in `docs/press/screenshots/`, 1920×1080)

Upload order — lead with the territory map:

1. `02-territory.png` — **lead shot.** Voronoi territory map mid-game: war
   fronts, armies, terrain, and the full HUD (region development, diplomacy at
   war, tech, turn log). The "systems-heavy 4X" story in one frame.
2. `04-techtree.png` — the branching tech tree (economy / military / civics /
   wonders).
3. `05-standings.png` — rival standings + the prestige score race.
4. `03-nodes.png` — the alternate node/edge map view.
5. `06-records.png` — achievements & career stats (meta-progression).
6. `07-colourblind.png` — the colour-blind-safe palette (accessibility proof).
7. `01-title.png` — title screen / key art (optional; nicer as capsule art).

## 7. Asset checklist — Steam required sizes

Provided as **functional starters** in `docs/press/capsules/` (crest + wordmark
on the brand vignette). Replace with polished key art before a real launch push;
these are enough to pass store-page review and go live.

| Asset | Size | Status |
|---|---|---|
| Header capsule | 460×215 | ✅ `capsules/header-460x215.png` |
| Small capsule | 231×87 | ✅ `capsules/small-231x87.png` |
| Main capsule | 616×353 | ✅ `capsules/main-616x353.png` |
| Vertical capsule | 374×448 | ⬜ needs render (say the word) |
| Library capsule | 600×900 | ✅ `capsules/library-600x900.png` |
| Library hero | 3840×1240 | ⬜ needs key art (designer) |
| Library logo (transparent) | 1280×720 | ⬜ needs transparent wordmark |
| Community icon | 184×184 | ⬜ use `public/icon-512.png` downscaled |
| Screenshots (≥5) | 1920×1080 | ✅ 7 in `screenshots/` |
| Trailer | 1080p+ mp4 | ⬜ see §9 |

I can generate the vertical capsule, library logo, community icon and extra
screenshots on request. The library hero really wants a designer's key art.

## 8. Making the desktop (Steam) build

The game is a self-contained static web app, so wrap it:

- **Tauri (recommended)** — Rust webview, ~5 MB binaries, keeps the "tiny"
  ethos; point it at the `dist/` build. Cross-compiles Win/mac/Linux.
- **Electron** — simpler, ~100 MB; fine if you don't want a Rust toolchain.

Map the existing systems onto Steam features (cheap wins): the **achievements
system → Steam achievements**, **save/load → Steam Cloud**, **shareable seeds →
a light community hook**. Add fullscreen/resolution options for the desktop
build.

## 9. Trailer shot-list (20–40s, silent-friendly)

1. Title screen → wordmark (2s).
2. New game: a seeded map generating (2s).
3. Fast cuts of a turn resolving — resource counters ticking, a region captured
   (the map ripple), an event card (6s).
4. The tech tree, a war front lighting up red, an army marching (6s).
5. The prestige-race standings climbing (3s).
6. Victory end-card (2s).
7. End card: **Petty Kingdoms — play free in your browser · wishlist on Steam**
   (3s).

## 10. Stand-up-the-page steps

1. Pay the **$100 Steam Direct fee** (recoupable after ~$1k revenue).
2. Fill the store page from §1–§5; upload screenshots (§6) and capsules (§7).
3. Add the **free browser build link** ("play now, wishlist the full version").
4. Submit for Valve review (a few days).
5. Once live, drive wishlists: the free web version as funnel, a **Steam Next
   Fest** demo entry, and the Show HN / subreddit posts from `docs/marketing.md`.
6. Watch the free wishlist analytics in Steamworks; invest in the paid
   content/polish only if demand validates it.

> Reminder: wishlists are your free pre-launch demand gauge, and Steam notifies
> every wishlister at launch. Get the page up early, even while the game is only
> the free web version.
