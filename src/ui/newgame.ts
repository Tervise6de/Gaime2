/**
 * New-game setup form — shared by the HUD's left panel and the main menu
 * (ui/title.ts), so both surfaces offer the identical configuration: scenario
 * presets, seed, difficulty, rival count and map size, with the last-used
 * choices remembered across sessions.
 *
 * The builder returns the form rows plus `readConfig()`; the caller supplies
 * its own Start button (the HUD wraps it in a discard-confirm guard, the menu
 * starts immediately).
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
  /** Scenario row, scenario blurb, and the seed/difficulty/rivals/size row. */
  rows: HTMLElement[];
  /** Snapshot the current selections (also persists them as the new prefs). */
  readConfig(): NewGameConfig;
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

export function buildNewGameForm(): NewGameForm {
  const prefs = loadNewGamePrefs();

  const cfgRow = div("hud-newgame");
  const seedInput = document.createElement("input");
  seedInput.type = "text";
  seedInput.className = "hud-seed";
  seedInput.placeholder = "seed";
  const difficultySel = select([
    ["easy", "Easy"],
    ["normal", "Normal"],
    ["hard", "Hard"],
  ], prefs.difficulty ?? "normal");
  const rivalsSel = select([
    ["1", "1 rival"],
    ["2", "2 rivals"],
    ["3", "3 rivals"],
    ["4", "4 rivals"],
    ["5", "5 rivals"],
  ], prefs.rivals ?? "2");
  // Map size — a smaller world plays tight and fast, a larger one expansive.
  const mapSizeSel = select([
    ["16", "Small map"],
    ["22", "Medium map"],
    ["30", "Large map"],
  ], prefs.mapSize ?? String(DEFAULT_MAP_OPTIONS.regionCount));
  mapSizeSel.title = "World size: fewer regions play tight and quick; more regions give room to expand.";
  cfgRow.append(seedInput, difficultySel, rivalsSel, mapSizeSel);

  // Scenarios: hand-set openings. Picking one fills the config below (and may pin
  // an opening trait); editing the config by hand drops back to "Custom".
  let scenarioTrait: TraitId | undefined;
  const scenarioRow = div("hud-newgame");
  const scenarioSel = select(
    [["custom", "Custom setup"], ...SCENARIOS.map((s) => [s.id, s.name] as [string, string])],
    "custom",
    "hud-select hud-scenario",
  );
  scenarioSel.title = "Pick a hand-set opening, or build your own with the options below.";
  const scenarioBlurb = div("hud-hint hud-scenario-blurb", "p");
  scenarioRow.append(scenarioSel);
  scenarioSel.addEventListener("change", () => {
    const sc = SCENARIOS.find((s) => s.id === scenarioSel.value);
    if (!sc) {
      scenarioTrait = undefined;
      scenarioBlurb.textContent = "";
      return;
    }
    difficultySel.value = sc.difficulty;
    rivalsSel.value = String(sc.rivals);
    mapSizeSel.value = String(sc.regionCount);
    scenarioTrait = sc.playerTrait;
    scenarioBlurb.textContent = sc.blurb;
  });
  // Any manual edit means it's no longer the chosen scenario.
  const dropToCustom = (): void => {
    if (scenarioSel.value !== "custom") {
      scenarioSel.value = "custom";
      scenarioTrait = undefined;
      scenarioBlurb.textContent = "";
    }
  };
  difficultySel.addEventListener("change", dropToCustom);
  rivalsSel.addEventListener("change", dropToCustom);
  mapSizeSel.addEventListener("change", dropToCustom);

  return {
    rows: [scenarioRow, scenarioBlurb, cfgRow],
    readConfig(): NewGameConfig {
      const raw = seedInput.value.trim();
      saveNewGamePrefs({ difficulty: difficultySel.value, rivals: rivalsSel.value, mapSize: mapSizeSel.value });
      return {
        seed: raw === "" ? (Date.now() >>> 0) : parseSeed(raw),
        difficulty: difficultySel.value as Difficulty,
        rivals: Number(rivalsSel.value),
        map: { ...DEFAULT_MAP_OPTIONS, regionCount: Number(mapSizeSel.value) },
        playerTrait: scenarioTrait,
      };
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
