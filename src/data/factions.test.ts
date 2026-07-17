import { describe, it, expect } from "vitest";
import { FACTIONS, FACTION_NAMES, factionByName } from "@/data/factions";
import { TRAIT_IDS } from "@/data/traits";
import { createGame } from "@/systems/turn";
import { BALTIC_MAP } from "@/data/maps/baltic";
import { PLAYER_ID, playerNation } from "@/systems/state";

describe("faction roster", () => {
  it("offers a dozen realms with unique names, colours, valid traits and flavour", () => {
    expect(FACTIONS.length).toBeGreaterThanOrEqual(10);
    expect(FACTIONS.length).toBeLessThanOrEqual(14);
    expect(new Set(FACTION_NAMES).size).toBe(FACTIONS.length); // unique names
    expect(new Set(FACTIONS.map((f) => f.color)).size).toBe(FACTIONS.length); // unique colours
    for (const f of FACTIONS) {
      expect(TRAIT_IDS).toContain(f.trait);
      expect(f.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(f.blurb.length).toBeGreaterThan(0);
    }
  });

  it("spreads traits so no single trait dominates the roster", () => {
    const counts = new Map<string, number>();
    for (const f of FACTIONS) counts.set(f.trait, (counts.get(f.trait) ?? 0) + 1);
    expect(counts.size).toBeGreaterThanOrEqual(4); // at least 4 of the 5 traits used
    for (const c of counts.values()) expect(c).toBeLessThanOrEqual(4);
  });

  it("looks up by name (and misses cleanly)", () => {
    expect(factionByName("Sweden")?.trait).toBeDefined();
    expect(factionByName("Atlantis")).toBeUndefined();
    expect(factionByName(undefined)).toBeUndefined();
  });
});

describe("faction selection in random games", () => {
  it("gives the player their chosen realm's name and signature trait", () => {
    const def = factionByName("Novgorod")!;
    const g = createGame({ seed: 3, rivals: 3, playerFaction: "Novgorod" });
    const p = playerNation(g);
    expect(p.name).toBe("Novgorod");
    expect(p.trait).toBe(def.trait);
    expect(p.color).toBe("#d8a24a"); // player is always gold, whatever the realm
  });

  it("seats the player and rivals as distinct realms from the roster", () => {
    const g = createGame({ seed: 11, rivals: 4, playerFaction: "Sweden" });
    const realms = g.nations.filter((n) => !n.isBarbarian);
    const names = realms.map((n) => n.name);
    expect(new Set(names).size).toBe(names.length); // no duplicate realms
    for (const n of realms) expect(FACTION_NAMES).toContain(n.name); // all from the roster
    expect(names).toContain("Sweden");
  });

  it("picks the player's realm from the seed when none is chosen (deterministic)", () => {
    const a = createGame({ seed: 20, rivals: 2 });
    const b = createGame({ seed: 20, rivals: 2 });
    expect(a.nations[PLAYER_ID]!.name).toBe(b.nations[PLAYER_ID]!.name);
    expect(FACTION_NAMES).toContain(a.nations[PLAYER_ID]!.name);
  });
});

describe("faction identity on the scripted Baltic map", () => {
  it("seats ten roster realms, each carrying its faction trait", () => {
    expect(BALTIC_MAP.factions.length).toBe(10);
    for (const f of BALTIC_MAP.factions) {
      const def = factionByName(f.name);
      expect(def, `${f.name} is in the roster`).toBeDefined();
    }
    const g = createGame({ seed: 5, mapId: "baltic", playerFaction: "Lithuania" });
    const p = playerNation(g);
    expect(p.name).toBe("Lithuania");
    expect(p.trait).toBe(factionByName("Lithuania")!.trait);
  });
});
