# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

## Project

**Gaime2** — a browser-based **Kingdom Management / 4X-lite** strategy game.
Depth comes from interacting systems (economy, population, military, diplomacy,
tech), not from art. Turn-based, deterministic, low-art, runs in any browser.

- **Stack:** TypeScript + Canvas 2D (map) + DOM/CSS (UI) + Vite; Vitest for
  tests; seeded RNG (mulberry32-style) — **no `Math.random()` in game logic**;
  turn resolution is **pure functions over `GameState`**.
- **Architecture guardrails:**
  - `src/systems/` — logic; mutates state; **never touches the DOM**.
  - `src/ui/` — observes state, emits intents; **never mutates the sim**.
  - `src/data/` — plain, serializable content (buildings, resources, tech…);
    **balancing is editing tables, not code**.
- **Hard constraint:** rival-nation AI is **local rule-based TypeScript** that
  runs 100% in the browser — **no LLM/API calls, no API key, no credits at
  runtime**. Claude is used only at development time.
- **Status:** early infrastructure (M0 done — blank canvas + render loop). Build
  plan: M1 economy → M2 population/unrest → M3 military → M4 AI/diplomacy →
  M5 tech/victory → M6 polish.

### Commands

```bash
npm install      # install dependencies
npm run dev      # dev server (http://localhost:5173)
npm run build    # type-check (tsc --noEmit) + production build
npm run preview  # serve the production build
npm run typecheck
```

### Key docs

- `README.md` — overview & project structure.
- `docs/design.md` — design vision & roadmap.
- `docs/game-design.md` — full design spec (systems, numbers, build plan).
- **`hansa times.md`** — historical reference (see below).

---

## Historical setting reference: the Hanseatic League ("Hansa times")

The game draws on the **Hanseatic League era** for its economy/trade/diplomacy
flavour. A **full, fact-checked, sourced reference** lives in **[`hansa times.md`](./hansa%20times.md)**
— covering roughly **1150–1700** (the League's life plus ~100 years either side),
focus on **c. 1250–1550**. Everything there is sourced; legendary material (esp.
Klaus Störtebeker) is flagged as such; game-design interpretation is quarantined
to that file's final "Game-Design Hooks" section.

**Condensed facts (use `hansa times.md` for detail + sources):**

- **What it was.** A **network of North German merchant guilds and market towns**
  dominating Baltic & North Sea trade — with **no state, no standing
  army/navy, no treasury, no constitution**. Held together by shared law and
  privilege. Its disunity was both its nature and its downfall.
- **Origins.** Grew from Baltic trade (Gotland/**Visby**; Novgorod post c. 1080).
  **Lübeck** founded 1143, rebuilt by **Henry the Lion** 1158/59, imperial city
  1226 — the League's "capital." First formal **Hansetag (Diet) at Lübeck 1356**
  shifted it from "Hanse of the Merchants" to "Hanse of the Towns." ~200 towns at
  peak.
- **Kontore (foreign posts):** **Novgorod (Peterhof** — furs/wax; closed by
  Moscow 1494), **Bergen (Bryggen** — stockfish; timber buildings survive),
  **London (Steelyard** — cloth; expelled 1597/98), **Bruges** (western hub).
- **Trade goods / resources:** **salt** ("white gold," Lüneburg), **herring &
  stockfish**, **grain** (Prussia/Poland), **timber & naval stores**, **furs**,
  **wax**, **amber**, **wool/cloth**, **hopped beer**. Salt gates the fish trade.
- **Buildings:** **Brick Gothic (Backsteingotik)** — St. Mary's Lübeck,
  **Holstentor** (~1464/1478), **Rathaus**, **Salzspeicher** warehouses,
  **Bremen Roland (1404)**, Kontor compounds, city walls/gates. Stecknitz Canal
  (1391–98, first summit-level canal in Europe).
- **People:** **Henry the Lion** (founder-patron); **Valdemar IV of Denmark**
  (1361 conquered Gotland — war trigger); **Margaret I** (Kalmar Union 1397);
  **Klaus Störtebeker** (pirate — *legend*, executed 1400/1401); **Jürgen
  Wullenwever** (Lübeck mayor whose 1534–36 overreach broke the city).
- **Ships:** **Cog (Kogge)** — clinker, single square sail, 30–200 tons (the
  **Bremen Cog c. 1380** is the reference wreck). Then **hulk**, then carvel
  three-masted gun-armed **carrack**; Dutch **fluyt** later undercut Hansa
  shipping. Transitions: *clinker→carvel*, *one mast→three masts + guns*.
- **Wars:** **Danish–Hanseatic War 1361–70 → Peace of Stralsund 1370** (Hansa
  peak, Baltic fish monopoly); **Grunwald 1410** & **Thirteen Years' War
  1454–66** (Teutonic Order broken, Danzig to Poland); **Anglo-Hanseatic War
  1469–74 → Treaty of Utrecht** (Hansa keeps Steelyard); **Novgorod closed 1494**;
  **Count's Feud 1534–36** (Lübeck's fatal overreach). Decline via Dutch/English
  competition, nation-states, and the **Thirty Years' War**; **last Hansetag
  1669**.
- **Military transitions (the era's backdrop):** mail→plate armour; crossbow/
  longbow; Swiss **pike**; **hand cannon (c.1415) → arquebus/matchlock (c.1470s)
  → pike-and-shot**; **bombards vs. walls → bastion fort / trace italienne**
  (mid-15th c.). Wider world for contrast: **Ottoman siege artillery
  (Constantinople 1453)**, gun-heavy **Ming China**, the "gunpowder empires."
- **Economy/society:** **Lübeck Mark** & the **Wendish Coinage Union (1379)**
  (silver **Witten**); **Lübeck Law** / **Magdeburg Law** municipal self-rule;
  **staple rights** & monopolies; **Black Death reached the ports in 1350** —
  ~half of Hamburg and Bremen died (documented).

**Game mapping (short):** Gold/Food/Materials/Knowledge + strategic **Salt** and
**Furs/Amber**; buildings = Church/Rathaus/Speicher/Kontor/Walls/Roland/Brewery/
Canal; unit tech ladder militia→plate→crossbow→pike→arquebus→pike-and-shot with
star-fort defensive tech; factions = Hansa/Denmark/Teutonic Order/Muscovy/Dutch-
English; events = plague, Kontor seizure, pirate raid, monopoly windfall,
overreach war. Full rationale in `hansa times.md` §13.

---

## Conventions

- Keep game logic **deterministic and pure**; no DOM in `systems/`, no sim
  mutation in `ui/`, content as data in `data/`.
- Use the seeded RNG for anything random in game logic.
- Match the surrounding code's style; keep the core small and transparent.
