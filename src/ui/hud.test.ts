// @vitest-environment happy-dom
/**
 * The HUD, mounted.
 *
 * Every other test in this project stops at the systems boundary, which is how
 * v0.115 shipped a movement rule with no word of it in the interface: the sim
 * was covered, and the surface that has to *say* the rule was not tested at
 * all. These tests mount the real `createHud` against a real `GameState` and
 * read what the player would read.
 *
 * They are deliberately about the sentences that carry rules — not layout, not
 * styling, not exact wording — so they fail when the game stops explaining
 * itself, and stay quiet when someone rewrites a heading.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createHud, type Hud, type HudCallbacks } from "@/ui/hud";
import { createGame } from "@/systems/turn";
import { emptyUnits, type GameState } from "@/systems/state";

const VISBY = 39;
const SCANIA = 26;
const THURINGIA = 19;

/** Every callback a no-op: these tests read the HUD, they do not drive it. */
function callbacks(): HudCallbacks {
  return new Proxy({} as HudCallbacks, {
    get: (_t, prop) => {
      if (prop === "then") return undefined; // never mistake this for a thenable
      return () => undefined;
    },
  });
}

function mount(state: GameState, selected: number | null = null): { root: HTMLElement; hud: Hud } {
  const root = document.createElement("div");
  document.body.append(root);
  const hud = createHud(root, callbacks());
  hud.update(state, selected, null);
  return { root, hud };
}

/** The player's own realm, so the region panel shows an owned province. */
function playerBoard(): GameState {
  return createGame({ seed: 5 });
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("the HUD mounts and speaks", () => {
  it("renders the top bar and the turn without throwing", () => {
    const g = playerBoard();
    const { root } = mount(g);
    expect(root.querySelector(".hud-topbar")).not.toBeNull();
    expect(root.textContent).toContain("Turn");
    // The realm the player is actually playing is named.
    expect(root.textContent).toContain(g.nations.find((n) => n.isPlayer)!.name);
  });

  it("survives a mid-game state with wars, routes, armies and a League", () => {
    const g = playerBoard();
    const busy: GameState = {
      ...g,
      turn: 60,
      league: { members: [0, 2], foundedTurn: 20, boycotts: [] },
      armies: [
        { id: 900, ownerId: 0, regionId: g.regions.findIndex((r) => r.ownerId === 0), units: { ...emptyUnits(), infantry: 4, war_cog: 1 }, movesLeft: 1 },
      ],
    };
    expect(() => mount(busy)).not.toThrow();
  });
});

describe("the region screen explains the water", () => {
  /**
   * Open a province's screen and return only what that panel says — scoped, so
   * a failure prints the panel rather than the whole interface.
   */
  function regionText(state: GameState, regionId: number): string {
    const { root, hud } = mount(state, regionId);
    hud.openRegionScreen(regionId);
    // The HUD keeps two region bodies (the capital panel and the map-click
    // screen); read both, so the test does not depend on which one is live.
    const bodies = [...root.querySelectorAll(".hud-region-body")];
    const text = bodies.map((b) => b.textContent ?? "").join("\n");
    expect(text.length, "region panel rendered nothing").toBeGreaterThan(0);
    return text;
  }

  it("tells the player an island is an island", () => {
    const text = regionText(playerBoard(), VISBY);
    expect(text).toMatch(/An island/);
    expect(text).toMatch(/warships/);
  });

  it("warns about a water border on a province that also has land roads", () => {
    const text = regionText(playerBoard(), SCANIA);
    expect(text).toMatch(/Across water:/);
    expect(text).not.toMatch(/An island/);
  });

  it("says nothing about water on a landlocked province", () => {
    const text = regionText(playerBoard(), THURINGIA);
    expect(text).not.toMatch(/Across water:|An island/);
  });

  it("names the League towns and the staples a province carries", () => {
    // Bergen: a Kontor town, and the stockfish staple that is the reason for it.
    const text = regionText(playerBoard(), 30);
    expect(text).toContain("Bergen");
    expect(text).toMatch(/Stockfish/i);
  });
});

describe("the victory panel shows the race strand by strand", () => {
  it("breaks Hansa control into its four strands with what each is worth", () => {
    const { root } = mount(playerBoard());
    const strands = root.querySelectorAll(".hud-vrace-strand");
    expect(strands.length).toBe(4);
    const text = [...strands].map((s) => s.textContent ?? "").join(" | ");
    for (const label of ["Kontore", "Wares", "League", "Sea lanes"]) {
      expect(text).toContain(label);
    }
    // Each strand states its contribution against its ceiling ("12 / 35").
    expect(text).toMatch(/\d+ \/ \d+/);
    // ...and carries the line on what would move it.
    for (const s of strands) expect((s as HTMLElement).title.length).toBeGreaterThan(10);
  });
});

describe("the legend names what the map draws", () => {
  it("explains the sea-crossing line as a rule, not decoration", () => {
    const { root } = mount(playerBoard());
    const legend = root.querySelector(".hud-legend");
    expect(legend).not.toBeNull();
    const text = legend!.textContent ?? "";
    expect(text).toMatch(/Sea crossing/);
    expect(text).toMatch(/armies cannot/);
  });
});
