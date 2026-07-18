import { describe, it, expect } from "vitest";
import { FACTIONS, FACTION_NAMES, factionByName } from "@/data/factions";
import { ARCHETYPES, personalityByArchetype } from "@/data/personalities";
import { FOCUS_IDS } from "@/data/focuses";
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
  it("seats eleven roster realms, each carrying its faction trait", () => {
    expect(BALTIC_MAP.factions.length).toBe(11);
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

describe("faction AI disposition (per-faction temperament)", () => {
  it("every faction declares a valid AI disposition", () => {
    const valid = new Set(ARCHETYPES.map((a) => a.archetype));
    for (const f of FACTIONS) {
      expect(f.disposition, `${f.name} has a disposition`).toBeDefined();
      expect(valid.has(f.disposition!), `${f.name}'s disposition is a real archetype`).toBe(true);
    }
  });

  it("personalityByArchetype maps an archetype to its weights", () => {
    expect(personalityByArchetype("warlord").aggression).toBe(0.9);
    expect(personalityByArchetype("merchant").economy).toBe(0.9);
    expect(personalityByArchetype("builder").aggression).toBe(0.2);
  });

  it("seats each AI realm with its faction's signature disposition (random game)", () => {
    const g = createGame({ seed: 7, rivals: 5 });
    for (const n of g.nations) {
      if (n.isPlayer || n.isBarbarian) continue;
      const def = factionByName(n.name);
      if (def?.disposition) expect(n.personality?.archetype).toBe(def.disposition);
    }
  });

  it("seats dispositions on the scripted Baltic map too", () => {
    const g = createGame({ seed: 5, mapId: "baltic", playerFaction: "Lithuania" });
    const sweden = g.nations.find((n) => n.name === "Sweden");
    if (sweden) expect(sweden.personality?.archetype).toBe("warlord");
  });

  it("the roster keeps a balanced spread (not everyone a warlord)", () => {
    const warlords = FACTIONS.filter((f) => f.disposition === "warlord").length;
    // A handful of aggressors at most, so the world isn't perpetual war.
    expect(warlords).toBeLessThanOrEqual(4);
    expect(new Set(FACTIONS.map((f) => f.disposition)).size).toBeGreaterThanOrEqual(3); // variety
  });
});

describe("faction home focus (capital opens specialised)", () => {
  it("every faction declares a valid home focus", () => {
    const valid = new Set(FOCUS_IDS);
    for (const f of FACTIONS) {
      expect(f.homeFocus, `${f.name} has a home focus`).toBeDefined();
      expect(valid.has(f.homeFocus!), `${f.name}'s home focus is a real focus`).toBe(true);
    }
  });

  it("the player's capital opens with its faction's home focus (random game)", () => {
    const g = createGame({ seed: 3, rivals: 3, playerFaction: "Gotland" });
    const cap = g.regions[playerNation(g).capitalRegionId!]!;
    expect(cap.focus).toBe(factionByName("Gotland")!.homeFocus); // market
  });

  it("seats every AI realm's home focus at its capital too", () => {
    const g = createGame({ seed: 7, rivals: 5 });
    for (const n of g.nations) {
      if (n.isBarbarian || n.capitalRegionId === undefined) continue;
      const def = factionByName(n.name);
      if (def?.homeFocus) expect(g.regions[n.capitalRegionId]!.focus).toBe(def.homeFocus);
    }
  });

  it("seats home focuses on the scripted Baltic map", () => {
    const g = createGame({ seed: 5, mapId: "baltic", playerFaction: "Lithuania" });
    const p = playerNation(g);
    expect(g.regions[p.capitalRegionId!]!.focus).toBe(factionByName(p.name)!.homeFocus);
  });
});

import { TECHS } from "@/data/techs";
import { armySize } from "@/systems/state";

describe("faction opening bonuses", () => {
  it("every faction has a distinct bonus, and free techs are Age-of-Founding", () => {
    for (const f of FACTIONS) {
      expect(f.bonus.label.length).toBeGreaterThan(0);
      expect(f.bonus.detail.length).toBeGreaterThan(0);
      if (f.bonus.startTech) expect(TECHS[f.bonus.startTech].era).toBe(0); // researchable at turn 1
    }
  });

  it("applies a gold bonus at game start", () => {
    const g = createGame({ seed: 4, playerFaction: "Gotland" }); // +55 gold
    // Base opening treasury is 60; Gotland's Hansa heart adds 55.
    expect(playerNation(g).stocks.gold).toBe(60 + 55);
  });

  it("applies a free opening tech", () => {
    const g = createGame({ seed: 4, playerFaction: "Novgorod" }); // Writing
    expect(playerNation(g).research.done).toContain("writing");
  });

  it("applies extra starting regiments to the capital army", () => {
    const plain = createGame({ seed: 4, playerFaction: "Denmark" }); // gold bonus, no units
    const viking = createGame({ seed: 4, playerFaction: "Sweden" }); // +1 infantry
    const armyOf = (g: typeof plain) => g.armies.find((a) => a.ownerId === PLAYER_ID)!;
    expect(armySize(armyOf(viking).units)).toBeGreaterThan(armySize(armyOf(plain).units));
    expect(armyOf(viking).units.infantry).toBe(2); // base 1 + bonus 1
  });
});
