/**
 * New-game setup form — shared by the HUD's Game menu and the main menu
 * (ui/title.ts), so both surfaces offer the identical configuration: scenario
 * presets, seed, difficulty, rival count and map size, with the last-used
 * choices remembered across sessions.
 *
 * Every field is labelled, and the three fixed-choice options (difficulty /
 * rivals / world size) render as segmented button rows — all values visible
 * at once and readable, instead of native dropdowns. The seed field always
 * holds the real seed the next game will use: it is rolled on build, re-rolled
 * whenever a setup surface opens (`refreshSeed`), and re-rollable by hand via
 * the dice button. Typing over it (numbers or words) still works.
 *
 * The builder returns the form rows plus `readConfig()`; the caller supplies
 * its own Start button (the HUD wraps it in a discard-confirm guard, the menu
 * arms an inline confirm).
 */

import { SCENARIOS } from "@/data/scenarios";
import type { TraitId } from "@/data/traits";
import { DEFAULT_MAP_OPTIONS, type MapGenOptions } from "@/systems/mapgen";
import type { Difficulty } from "@/systems/state";

export interface NewGameConfig {
  seed: number;
  difficulty: Difficulty;
  rivals: number;
  /** Map generation options (region count etc.); omitted = engine default. */
  map?: MapGenOptions;
  /** Scenario twist: force the player's opening trait. */
  playerTrait?: TraitId;
}

export interface NewGameForm {
  /** Scenario row, scenario blurb, then the labelled seed/difficulty/rivals/size fields. */
  rows: HTMLElement[];
  /** Snapshot the current selections (also persists them as the new prefs). */
  readConfig(): NewGameConfig;
  /** Roll a fresh random seed into the seed field (call when a setup surface opens). */
  refreshSeed(): void;
}

/** Remembered new-game selector choices (not the seed — that stays fresh each game). */
interface NewGamePrefs {
  difficulty?: string;
  rivals?: string;
  mapSize?: string;
}

const NEWGAME_PREFS_KEY = "gaime2:newgame-prefs";

export function loadNewGamePrefs(): NewGamePrefs {
  try {
    const raw = localStorage.getItem(NEWGAME_PREFS_KEY);
    const p = raw ? (JSON.parse(raw) as unknown) : null;
    return p && typeof p === "object" ? (p as NewGamePrefs) : {};
  } catch {
    return {}; // storage unavailable / malformed — fall back to defaults
  }
}

export function saveNewGamePrefs(prefs: NewGamePrefs): void {
  try {
    localStorage.setItem(NEWGAME_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — preferences simply won't persist */
  }
}

/** Numeric seeds pass through; anything else hashes (FNV-1a) so words work too. */
export function parseSeed(raw: string): number {
  const n = Number(raw);
  if (Number.isFinite(n)) return Math.abs(Math.trunc(n)) >>> 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A fresh 6-digit world seed — short enough to read out or retype, and it IS
 * the seed the sim receives (readConfig parses this exact field). UI-layer
 * randomness only; the sim itself never calls Math.random.
 */
function freshSeed(): number {
  return 100000 + Math.floor(Math.random() * 900000);
}

export function buildNewGameForm(): NewGameForm {
  const prefs = loadNewGamePrefs();

  // Seed: always a concrete value, with a dice button to re-roll it.
  const seedInput = document.createElement("input");
  seedInput.type = "text";
  seedInput.className = "hud-seed";
  seedInput.value = String(freshSeed());
  seedInput.title = "The world seed — the same seed and settings rebuild the same world. Type your own (numbers or words) or roll the dice.";
  seedInput.setAttribute("aria-label", "World seed");
  const seedNew = document.createElement("button");
  seedNew.type = "button";
  seedNew.className = "hud-seed-new";
  seedNew.textContent = "🎲";
  seedNew.title = "Roll a new seed";
  seedNew.setAttribute("aria-label", "Roll a new seed");
  seedNew.addEventListener("click", () => {
    seedInput.value = String(freshSeed());
  });
  const seedRow = div("hud-seed-row");
  seedRow.append(seedInput, seedNew);

  const difficultySeg = segmented(
    [
      ["easy", "Easy"],
      ["normal", "Normal"],
      ["hard", "Hard"],
    ],
    prefs.difficulty ?? "normal",
    "normal",
    () => dropToCustom(),
  );
  const rivalsSeg = segmented(
    [
      ["1", "1"],
      ["2", "2"],
      ["3", "3"],
      ["4", "4"],
      ["5", "5"],
      ["6", "6"],
    ],
    prefs.rivals ?? "3",
    "3",
    () => dropToCustom(),
  );
  const mapSizeSeg = segmented(
    [
      ["18", "Small"],
      ["30", "Medium"],
      ["40", "Large"],
      ["48", "Grand"],
    ],
    prefs.mapSize ?? String(DEFAULT_MAP_OPTIONS.regionCount),
    String(DEFAULT_MAP_OPTIONS.regionCount),
    () => dropToCustom(),
  );
  mapSizeSeg.root.title =
    "World size: fewer regions play tight and quick; more regions give room to expand.";

  // Scenarios: hand-set openings. Picking one fills the config below (and may pin
  // an opening trait); editing the config by hand drops back to "Custom".
  let scenarioTrait: TraitId | undefined;
  const scenarioSel = select(
    [["custom", "Custom setup"], ...SCENARIOS.map((s) => [s.id, s.name] as [string, string])],
    "custom",
    "hud-select hud-scenario",
  );
  scenarioSel.title = "Pick a hand-set opening, or build your own with the options below.";
  const scenarioBlurb = div("hud-hint hud-scenario-blurb", "p");
  scenarioSel.addEventListener("change", () => {
    const sc = SCENARIOS.find((s) => s.id === scenarioSel.value);
    if (!sc) {
      scenarioTrait = undefined;
      scenarioBlurb.textContent = "";
      return;
    }
    difficultySeg.set(sc.difficulty);
    rivalsSeg.set(String(sc.rivals));
    mapSizeSeg.set(String(sc.regionCount));
    scenarioTrait = sc.playerTrait;
    scenarioBlurb.textContent = sc.blurb;
  });
  // Any manual edit means it's no longer the chosen scenario.
  function dropToCustom(): void {
    if (scenarioSel.value !== "custom") {
      scenarioSel.value = "custom";
      scenarioTrait = undefined;
      scenarioBlurb.textContent = "";
    }
  }

  return {
    rows: [
      field("Scenario", scenarioSel),
      scenarioBlurb,
      field("World seed", seedRow),
      field("Difficulty", difficultySeg.root),
      field("Rivals", rivalsSeg.root),
      field("World size", mapSizeSeg.root),
    ],
    readConfig(): NewGameConfig {
      const raw = seedInput.value.trim();
      saveNewGamePrefs({ difficulty: difficultySeg.get(), rivals: rivalsSeg.get(), mapSize: mapSizeSeg.get() });
      const rivals = Number(rivalsSeg.get()) || 2;
      const regionCount = Number(mapSizeSeg.get()) || DEFAULT_MAP_OPTIONS.regionCount;
      return {
        // The field always shows a real seed; an emptied field still gets one.
        seed: raw === "" ? freshSeed() : parseSeed(raw),
        difficulty: (difficultySeg.get() || "normal") as Difficulty,
        rivals,
        map: { ...DEFAULT_MAP_OPTIONS, regionCount },
        playerTrait: scenarioTrait,
      };
    },
    refreshSeed(): void {
      seedInput.value = String(freshSeed());
    },
  };
}

/** A labelled form field: small-caps label above its control. */
function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = div("hud-field");
  const l = div("hud-field-label");
  l.textContent = label;
  wrap.append(l, control);
  return wrap;
}

interface Segmented {
  root: HTMLElement;
  get(): string;
  set(value: string): void;
}

/**
 * A segmented button row — every choice visible and readable at once. Falls
 * back to `fallback` when the initial value (a possibly-stale persisted pref)
 * matches no option. `onUserPick` fires only on clicks, not programmatic sets.
 */
function segmented(
  options: [string, string][],
  initial: string,
  fallback: string,
  onUserPick: () => void,
): Segmented {
  const root = div("hud-seg");
  root.setAttribute("role", "group");
  let value = options.some(([v]) => v === initial) ? initial : fallback;
  const buttons = new Map<string, HTMLButtonElement>();
  const apply = (): void => {
    for (const [v, b] of buttons) {
      b.classList.toggle("active", v === value);
      b.setAttribute("aria-pressed", v === value ? "true" : "false");
    }
  };
  for (const [v, label] of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hud-seg-btn";
    b.textContent = label;
    b.addEventListener("click", () => {
      if (value === v) return;
      value = v;
      apply();
      onUserPick();
    });
    buttons.set(v, b);
    root.append(b);
  }
  apply();
  return {
    root,
    get: () => value,
    set(v: string): void {
      if (!buttons.has(v)) return;
      value = v;
      apply();
    },
  };
}

function div(className: string, tag = "div"): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function select(options: [string, string][], value: string, className = "hud-select"): HTMLSelectElement {
  const sel = document.createElement("select");
  sel.className = className;
  for (const [v, label] of options) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = label;
    sel.append(opt);
  }
  sel.value = value;
  return sel;
}
