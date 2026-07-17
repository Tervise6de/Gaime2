import { describe, it, expect } from "vitest";
import { serializeGame, deserializeGame, saveToLocal, clearLocalSave, slotInfo } from "@/systems/save";
import { createGame, resolveTurn } from "@/systems/turn";

describe("save / load", () => {
  it("round-trips a game exactly", () => {
    let g = createGame({ seed: 12345, rivals: 2, difficulty: "hard" });
    for (let i = 0; i < 12; i++) g = resolveTurn(g);
    const restored = deserializeGame(serializeGame(g, 0));
    // `battles` is a transient per-turn UI cache and is deliberately not
    // persisted; everything durable must round-trip identically.
    const { battles: _b, ...durable } = g;
    expect(restored).toEqual(durable);
  });

  it("a restored game continues deterministically", () => {
    let g = createGame({ seed: 7, rivals: 2 });
    for (let i = 0; i < 10; i++) g = resolveTurn(g);
    const restored = deserializeGame(serializeGame(g, 0))!;
    // Continuing from the restore matches continuing from the original.
    let a = g;
    let b = restored;
    for (let i = 0; i < 10; i++) {
      a = resolveTurn(a);
      b = resolveTurn(b);
    }
    expect(b.regions.map((r) => r.ownerId)).toEqual(a.regions.map((r) => r.ownerId));
    expect(b.nations[0]!.stocks.gold).toBe(a.nations[0]!.stocks.gold);
  });

  it("rejects malformed or foreign JSON", () => {
    expect(deserializeGame("not json")).toBeNull();
    expect(deserializeGame(JSON.stringify({ hello: "world" }))).toBeNull();
    expect(deserializeGame(JSON.stringify({ version: 999, state: {} }))).toBeNull();
  });

  it("preserves the chosen difficulty", () => {
    const g = createGame({ seed: 1, difficulty: "easy" });
    expect(deserializeGame(serializeGame(g, 0))!.difficulty).toBe("easy");
  });

  it("round-trips the score-history graph (export/import contract)", () => {
    let g = createGame({ seed: 3, rivals: 2 });
    for (let i = 0; i < 6; i++) g = resolveTurn(g);
    const restored = deserializeGame(serializeGame(g, 0))!;
    expect(restored.scoreHistory).toEqual(g.scoreHistory);
    expect(restored.scoreHistory![0]!.length).toBe(g.turn);
  });

  it("clearLocalSave empties a slot once and reports already-empty after", () => {
    // Node has no localStorage — stub the three calls the save layer makes.
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    try {
      const g = createGame({ seed: 5 });
      expect(clearLocalSave("slot2")).toBe(false); // nothing there yet
      expect(saveToLocal(g, 0, "slot2")).toBe(true);
      expect(slotInfo("slot2")?.turn).toBe(g.turn);
      expect(clearLocalSave("slot2")).toBe(true); // cleared it
      expect(slotInfo("slot2")).toBeNull();
      expect(clearLocalSave("slot2")).toBe(false); // second press is a no-op
    } finally {
      delete (globalThis as Record<string, unknown>).localStorage;
    }
  });
});
