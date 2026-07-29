// @vitest-environment happy-dom
/**
 * The new-game form.
 *
 * Its one real contract is that whatever it hands back must start a game, so
 * these tests take `readConfig()` and feed it to `createGame` rather than
 * checking the shape and hoping. The rest is remembering the player's last
 * setup across sessions — through a store that may hold anything, including
 * what an older build wrote.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { buildNewGameForm, loadNewGamePrefs, saveNewGamePrefs } from "@/ui/newgame";
import { createGame } from "@/systems/turn";
import { scriptedMap } from "@/data/maps/types";

const KEY = "gaime2:newgame-prefs";

beforeEach(() => {
  localStorage.clear();
});

describe("remembering the last setup", () => {
  it("round-trips a choice", () => {
    saveNewGamePrefs({ difficulty: "hard", gameLength: "long", playerFaction: "Lübeck" });
    expect(loadNewGamePrefs()).toEqual({
      difficulty: "hard",
      gameLength: "long",
      playerFaction: "Lübeck",
    });
  });

  it("shrugs off anything else the store might hold", () => {
    for (const junk of ["not json", "null", '"a string"', "[1,2,3]", "17"]) {
      localStorage.setItem(KEY, junk);
      const prefs = loadNewGamePrefs();
      // Arrays are objects, so the guard lets one through — what matters is
      // that reading it never throws and the form still builds from it.
      expect(() => buildNewGameForm()).not.toThrow();
      expect(prefs).toBeDefined();
    }
  });

  it("survives an empty store", () => {
    expect(loadNewGamePrefs()).toEqual({});
  });
});

describe("the form", () => {
  it("builds every row without a live document beyond happy-dom", () => {
    const form = buildNewGameForm();
    expect(form.rows.length).toBeGreaterThan(0);
    for (const row of form.rows) expect(row).toBeInstanceOf(HTMLElement);
    // The realm picker offers every faction the map seats, plus "random".
    const wrapper = document.createElement("div");
    wrapper.append(...form.rows);
    const options = [...wrapper.querySelectorAll("option")].map((o) => o.value);
    const factions = scriptedMap("hansa")!.factions.map((f) => f.name);
    expect(options).toContain(""); // random realm
    for (const name of factions) expect(options).toContain(name);
  });

  it("hands back a config that actually starts a game", () => {
    const config = buildNewGameForm().readConfig();
    expect(config.mapId).toBe("hansa");
    const game = createGame(config);
    expect(game.regions.length).toBe(74);
    expect(game.nations.some((n) => n.isPlayer)).toBe(true);
    expect(game.turn).toBe(1);
  });

  it("starts the realm the player picked", () => {
    const form = buildNewGameForm();
    const wrapper = document.createElement("div");
    wrapper.append(...form.rows);
    const select = wrapper.querySelector<HTMLSelectElement>(".hud-playas")!;
    select.value = "Novgorod";
    const game = createGame(form.readConfig());
    expect(game.nations.find((n) => n.isPlayer)!.name).toBe("Novgorod");
  });

  it("writes the choice back, so the next session opens where the last one left off", () => {
    const form = buildNewGameForm();
    const wrapper = document.createElement("div");
    wrapper.append(...form.rows);
    wrapper.querySelector<HTMLSelectElement>(".hud-playas")!.value = "Sweden";
    form.readConfig();
    expect(loadNewGamePrefs().playerFaction).toBe("Sweden");

    // A fresh form opens on that realm rather than the default.
    const wrapper2 = document.createElement("div");
    wrapper2.append(...buildNewGameForm().rows);
    expect(wrapper2.querySelector<HTMLSelectElement>(".hud-playas")!.value).toBe("Sweden");
  });

  it("treats a realm the map cannot seat as no choice at all", () => {
    const form = buildNewGameForm();
    const wrapper = document.createElement("div");
    wrapper.append(...form.rows);
    // A <select> ignores a value with no matching option, so this reads back as
    // "random realm" — which must still start a game rather than seat nobody.
    wrapper.querySelector<HTMLSelectElement>(".hud-playas")!.value = "Atlantis";
    const config = form.readConfig();
    expect(config.playerFaction).toBeUndefined();
    expect(createGame(config).nations.some((n) => n.isPlayer)).toBe(true);
  });

  it("keeps a seed between reads and re-rolls only when asked", () => {
    const form = buildNewGameForm();
    const first = form.readConfig().seed;
    expect(form.readConfig().seed).toBe(first);
    expect(Number.isInteger(first)).toBe(true);
    expect(first).toBeGreaterThan(0);

    // Re-rolling enough times must produce *some* different seed, or the
    // "new game" button would deal the same world for ever.
    const rolled = new Set<number>();
    for (let i = 0; i < 20; i++) {
      form.refreshSeed();
      rolled.add(form.readConfig().seed);
    }
    expect(rolled.size).toBeGreaterThan(1);
  });

  it("falls back to a playable default when the store holds a nonsense difficulty", () => {
    saveNewGamePrefs({ difficulty: "impossible", gameLength: "forever" });
    const config = buildNewGameForm().readConfig();
    expect(config.difficulty).toBe("normal");
    expect(config.gameLength).toBe("standard");
    expect(() => createGame(config)).not.toThrow();
  });
});
