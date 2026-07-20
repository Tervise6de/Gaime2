/**
 * New-game setup for the Hansa-only board.
 */

import { TRAITS } from "@/data/traits";
import { factionByName } from "@/data/factions";
import { ARCHETYPE_LABEL, ARCHETYPE_BLURB } from "@/data/personalities";
import { scriptedMap } from "@/data/maps/types";
import type { Difficulty, GameLength } from "@/systems/state";

export interface NewGameConfig {
  seed: number;
  difficulty: Difficulty;
  gameLength: GameLength;
  mapId: "hansa";
  playerFaction?: string;
}

export interface NewGameForm {
  rows: HTMLElement[];
  readConfig(): NewGameConfig;
  refreshSeed(): void;
}

interface NewGamePrefs {
  difficulty?: string;
  gameLength?: string;
  playerFaction?: string;
}

const NEWGAME_PREFS_KEY = "gaime2:newgame-prefs";

export function loadNewGamePrefs(): NewGamePrefs {
  try {
    const raw = localStorage.getItem(NEWGAME_PREFS_KEY);
    const p = raw ? (JSON.parse(raw) as unknown) : null;
    return p && typeof p === "object" ? (p as NewGamePrefs) : {};
  } catch {
    return {};
  }
}

export function saveNewGamePrefs(prefs: NewGamePrefs): void {
  try {
    localStorage.setItem(NEWGAME_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable */
  }
}

function freshSeed(): number {
  return 100000 + Math.floor(Math.random() * 900000);
}

export function buildNewGameForm(): NewGameForm {
  const prefs = loadNewGamePrefs();
  let seed = freshSeed();

  const difficultySeg = segmented(
    [
      ["easy", "Easy"],
      ["normal", "Normal"],
      ["hard", "Hard"],
    ],
    prefs.difficulty ?? "normal",
    "normal",
  );

  const gameLengthSeg = segmented(
    [
      ["short", "Short"],
      ["standard", "Standard"],
      ["long", "Long"],
      ["endless", "Endless"],
    ],
    prefs.gameLength ?? "standard",
    "standard",
  );
  gameLengthSeg.root.title =
    "Game length: turns before prestige decides it. Endless has no score deadline.";

  const world = div("hud-static-choice");
  world.textContent = "Hanseatic World";
  world.title = "The North Sea and Baltic trading world, c. 1228-1550.";

  const startYear = div("hud-static-choice hud-start-year");
  startYear.textContent = "1228";
  startYear.title = "The campaign begins just after Bornhöved, before the League has fully formed.";

  const hansa = scriptedMap("hansa");
  const names = hansa?.factions.map((f) => f.name) ?? [];
  const defaultFaction = names.includes("Lübeck") ? "Lübeck" : "";
  const playAsSel = select(
    [["", "Random realm"], ...names.map((n) => [n, optionLabel(n)] as [string, string])],
    prefs.playerFaction && names.includes(prefs.playerFaction) ? prefs.playerFaction : defaultFaction,
    "hud-select hud-playas",
  );
  playAsSel.title = "Which realm you rule.";
  const playAsBlurb = div("hud-hint hud-playas-blurb", "p");
  const updatePlayAsBlurb = (): void => {
    const def = factionByName(playAsSel.value);
    if (!def) {
      playAsBlurb.textContent = "A realm is picked for you.";
      return;
    }
    const disp = def.disposition
      ? `  ·  Temperament — ${ARCHETYPE_LABEL[def.disposition]}: ${ARCHETYPE_BLURB[def.disposition]} (when AI-led)`
      : "";
    playAsBlurb.textContent =
      `${def.blurb}  ·  Trait — ${TRAITS[def.trait].label}: ${TRAITS[def.trait].blurb}` +
      `  ·  Bonus — ${def.bonus.label}: ${def.bonus.detail}${disp}`;
  };
  playAsSel.addEventListener("change", updatePlayAsBlurb);
  updatePlayAsBlurb();

  return {
    rows: [
      field("World", world),
      field("Start year", startYear),
      field("Play as", playAsSel),
      playAsBlurb,
      field("Difficulty", difficultySeg.root),
      field("Game length", gameLengthSeg.root),
    ],
    readConfig(): NewGameConfig {
      saveNewGamePrefs({
        difficulty: difficultySeg.get(),
        gameLength: gameLengthSeg.get(),
        playerFaction: playAsSel.value || undefined,
      });
      return {
        seed,
        difficulty: (difficultySeg.get() || "normal") as Difficulty,
        gameLength: (gameLengthSeg.get() || "standard") as GameLength,
        mapId: "hansa",
        playerFaction: playAsSel.value || undefined,
      };
    },
    refreshSeed(): void {
      seed = freshSeed();
    },
  };
}

function optionLabel(name: string): string {
  const def = factionByName(name);
  return def ? `${name} — ${TRAITS[def.trait].label}` : name;
}

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

function segmented(
  options: [string, string][],
  value: string,
  fallback: string,
): Segmented {
  const root = div("hud-segmented");
  const buttons: HTMLButtonElement[] = [];
  let current = options.some(([v]) => v === value) ? value : fallback;
  const sync = (): void => {
    for (const b of buttons) b.classList.toggle("active", b.dataset.value === current);
  };
  for (const [v, label] of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.value = v;
    b.textContent = label;
    b.addEventListener("click", () => {
      current = v;
      sync();
    });
    buttons.push(b);
    root.append(b);
  }
  sync();
  return {
    root,
    get: () => current,
    set(next: string) {
      current = options.some(([v]) => v === next) ? next : fallback;
      sync();
    },
  };
}

function select(options: [string, string][], value: string, className: string): HTMLSelectElement {
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

function div(className: string, tag: "div" | "p" = "div"): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}
